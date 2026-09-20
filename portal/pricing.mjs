import {randomUUID} from 'node:crypto';
import {PLAN_KINDS,UNIT_KINDS,PLAN_TERMS,COST_FIELDS,CHANNELS,calculatePlan,proposalFromPlan} from '../dist/assets/pricing-model.js';
import {providerUsageSummary} from './provider-usage.mjs';
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const text=(v,max=5000)=>{if(v===null||v===undefined)return '';if(typeof v!=='string'||v.trim().length>max)fail('Confira o texto informado (até '+max+' caracteres).');return v.trim();};
const number=(v,max,integer=false)=>{if(v===null||v===undefined||v==='')return null;if(typeof v!=='number'||!Number.isFinite(v)||v<0||v>max||integer&&!Number.isSafeInteger(v))fail('Confira os valores numéricos da simulação.');return v;};
const decode=r=>r?{...JSON.parse(r.data),id:r.id,orgId:r.org_id,version:r.version}:null;
function clean(input){const kind=input.kind;if(!Object.hasOwn(PLAN_KINDS,kind))fail('Escolha o tipo da oferta.');if(!Array.isArray(input.lines)||input.lines.length<1||input.lines.length>20)fail('Inclua de 1 a 20 itens de entrega ou custo.');
  const lines=input.lines.map(l=>{if(!l||!Object.hasOwn(UNIT_KINDS,l.unit))fail('Escolha a unidade de entrega.');if(!['unknown','estimate','measured'].includes(l.confidence))fail('Informe se o custo foi medido ou estimado.');return {unit:l.unit,quantity:number(l.quantity,100000,!['storage','support'].includes(l.unit)),specification:text(l.specification,500),unitCostCents:number(l.unitCostCents,100000000,true),minutes:number(l.minutes,100000),confidence:l.confidence,reference:text(l.reference,1000)};});
  const costs=Object.fromEntries(COST_FIELDS.map(([k,,type])=>[k,number(input.costs?.[k],type==='percent'?10000:type==='money'?100000000:100000,type!=='number')]));
  if(!Object.hasOwn(CHANNELS,input.selectedChannel)||!Array.isArray(input.channels)||input.channels.length!==2||new Set(input.channels.map(c=>c.id)).size!==2)fail('Confira os dois meios de pagamento.');
  const channels=input.channels.map(c=>{if(!Object.hasOwn(CHANNELS,c.id))fail('Meio de pagamento inválido.');return {id:c.id,percentBps:number(c.percentBps,10000,true),fixedCents:number(c.fixedCents,100000000,true),minutes:number(c.minutes,100000),reference:text(c.reference,1000)};});
  return {kind,name:text(input.name,120),terms:Object.fromEntries(PLAN_TERMS.map(([k])=>[k,text(input.terms?.[k])])),lines,costs,channels,selectedChannel:input.selectedChannel,costReference:text(input.costReference,3000),observedDate:text(input.observedDate,10),regularPriceCents:number(input.regularPriceCents,100000000,true),launchPriceCents:number(input.launchPriceCents,100000000,true),launchSlots:number(input.launchSlots,100000,true),launchUntil:text(input.launchUntil,10),launchConditions:text(input.launchConditions,1500)};
}
export function createPricing({db,operator,now=Date.now}){
  const allowed=user=>{if(!operator(user))fail('Acesso restrito à equipe autorizada.',403);};
  const row=id=>db.prepare("SELECT * FROM records WHERE kind='pricing_plan' AND id=?").get(id);
  const all=async()=> (await db.prepare("SELECT * FROM records WHERE kind='pricing_plan' ORDER BY updated_at DESC").all()).map(decode);
  async function transaction(fn){await db.exec('SAVEPOINT pricing_action');try{const r=await fn();await db.exec('RELEASE SAVEPOINT pricing_action');return r;}catch(e){await db.exec('ROLLBACK TO SAVEPOINT pricing_action');await db.exec('RELEASE SAVEPOINT pricing_action');throw e;}}
  async function listing(user,org){allowed(user);let usage=null;if(org){if(!await db.prepare('SELECT 1 FROM memberships WHERE org_id=? AND user_id=?').get(org,user.id))fail('Empresa não encontrada.',404);usage=await providerUsageSummary(db,org,now());}return {plans:(await all()).map(r=>({...r,calculation:calculatePlan(r.draft,now())})),technicalUsage:usage,asOf:now(),billingActivated:false};}
  async function write(org,id,data,old,user,action){const at=now(),next={...data,updatedAt:at,history:[...(old?JSON.parse(old.data).history||[]:[]),{at,actor:String(user.id),action,revision:data.revision}]};delete next.id;delete next.orgId;delete next.version;
    if(old){if(!await db.prepare('UPDATE records SET data=?,updated_at=?,version=version+1 WHERE id=? AND version=? RETURNING id').get(JSON.stringify(next),at,id,old.version))fail('A oferta mudou. Atualize a tela.',409);}else await db.prepare('INSERT INTO records(id,org_id,kind,data,external_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(id,org,'pricing_plan',JSON.stringify(next),id,at,at);
    await db.prepare('INSERT INTO audit VALUES(?,?,?,?,?,?,?)').run(randomUUID(),org,String(user.id),'Planos e custos: '+action,id,'',at);const r=decode(await row(id));return {...r,calculation:calculatePlan(r.draft,now())};
  }
  async function action(user,input){allowed(user);return transaction(async()=>{let old=input.id?await row(input.id):null,r=decode(old),id=r?.id,org=r?.orgId;
    if(!r){if(input.id||input.action!=='save')fail('Oferta não encontrada.',404);org=text(input.orgId,100);const m=await db.prepare('SELECT role FROM memberships WHERE org_id=? AND user_id=?').get(org,user.id);if(!['owner','admin'].includes(m?.role))fail('Escolha uma empresa administrada por você.',403);if(!/^[a-f\d-]{36}$/i.test(input.requestKey||''))fail('Identificador inválido.');id='pricing-plan:'+org+':'+input.requestKey;old=await row(id);if(old)return decode(old);r={createdAt:now(),revision:0,reviewed:null,versions:[],history:[]};}
    else if(!Number.isInteger(input.version)||r.version!==input.version)fail('A oferta mudou. Atualize a tela.',409);
    if(input.action==='save'){r.draft=clean(input.plan||{});r.revision++;r.reviewed=null;r.state='draft';}
    else if(input.action==='review'){if(r.state!=='draft')fail('Somente rascunhos podem ser revisados.',409);const result=calculatePlan(r.draft,now());if(!result.ready)fail('Complete a ficha e resolva as pendências antes de revisar: '+result.issues[0],409);if(input.confirmed!==true||input.capacityConfirmed!==true)fail('Confirme a cobertura de custos, capacidade e condições desta versão.');
      // Lock one stable company row so two operators cannot approve competing
      // main plans concurrently in PostgreSQL. No billing settings are changed.
      await db.prepare('UPDATE companies SET updated_at=updated_at WHERE id=?').run(org);
      if(r.draft.kind==='subscription'&&(await all()).some(x=>x.id!==r.id&&x.orgId===org&&x.state==='reviewed'&&x.reviewed?.plan.kind==='subscription'))fail('Já há um plano principal revisado nesta empresa. Arquive o anterior ou edite a própria ficha.',409);
      r.reviewed={number:r.revision,at:now(),actor:String(user.id),plan:r.draft,calculation:result,proposal:proposalFromPlan(r.draft)};r.versions.push(r.reviewed);r.state='reviewed';
    }else if(input.action==='archive'){r.state='archived';r.reviewed=null;}else fail('Ação inválida.');return write(org,id,r,old,user,input.action);
  });}
  async function proposalSources(user){allowed(user);return (await all()).filter(r=>r.state==='reviewed'&&r.reviewed).map(r=>({id:r.id,version:r.version,revision:r.reviewed.number,name:r.reviewed.plan.name,kind:r.reviewed.plan.kind,proposal:r.reviewed.proposal,hasLaunch:r.reviewed.plan.launchPriceCents!==null}));}
  async function proposalSource(user,id,version){allowed(user);const r=decode(await row(id));if(!r||r.state!=='reviewed'||!r.reviewed||version!==r.version)fail('A ficha de preço mudou ou não está revisada. Atualize antes de preparar a proposta.',409);return {id:r.id,version:r.version,revision:r.reviewed.number,name:r.reviewed.plan.name};}
  return {listing,action,proposalSources,proposalSource};
}
