import {randomUUID} from 'node:crypto';
import {CONSULTATION_TYPES,COMMON_BRIEF_FIELDS,BRIEF_REQUIRED,REPORT_FIELDS} from '../dist/assets/consultation-schema.js';

const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const text=(v,max=4000)=>{if(typeof v!=='string')return '';const result=v.trim();if(result.length>max)fail('Este texto excede '+max+' caracteres. Reduza o campo antes de salvar.');return result;};
const decode=r=>r?{...JSON.parse(r.data),id:r.id,orgId:r.org_id,version:r.version}:null;
const dateAt=ms=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(ms);
export function workingDate(start,days){const d=new Date(start+'T12:00:00Z');while(days>0){d.setUTCDate(d.getUTCDate()+1);if(![0,6].includes(d.getUTCDay()))days--;}return d.toISOString().slice(0,10);}
function pausedDays(start,end){let cursor=start,n=0;while(cursor<end){cursor=workingDate(cursor,1);if(cursor<=end)n++;}return n;}

export function createConsultations({db,operator,storeAsset,now=Date.now}){
  const row=id=>db.prepare("SELECT * FROM records WHERE id=? AND kind='consultation'").get(id);
  async function role(org,user,admin){if(admin){if(!operator(user))fail('Acesso restrito à equipe Helpu.',403);return;}
    const m=await db.prepare('SELECT role FROM memberships WHERE org_id=? AND user_id=?').get(org,user.id);if(!m)fail('Empresa não encontrada.',404);if(!['owner','admin'].includes(m.role))fail('Peça ao responsável pela empresa para alterar esta consultoria.',403);}
  async function transaction(fn){await db.exec('SAVEPOINT consultation_action');try{const r=await fn();await db.exec('RELEASE SAVEPOINT consultation_action');return r;}catch(e){await db.exec('ROLLBACK TO SAVEPOINT consultation_action');await db.exec('RELEASE SAVEPOINT consultation_action');throw e;}}
  async function files(org,ids){if(!Array.isArray(ids)||ids.length>20||new Set(ids).size!==ids.length)fail('Selecione até 20 arquivos diferentes.');const result=[];for(const id of ids){const a=await db.prepare('SELECT id,name,mime,size FROM assets WHERE id=? AND org_id=?').get(id,org);if(!a)fail('Arquivo indisponível nesta empresa.');result.push(a);}return result;}
  function brief(type,input){if(!Object.hasOwn(CONSULTATION_TYPES,type))fail('Escolha o serviço.');return Object.fromEntries([...COMMON_BRIEF_FIELDS,...CONSULTATION_TYPES[type].fields].map(([key])=>[key,text(input?.[key])]));}
  function completeBrief(r){if(BRIEF_REQUIRED.some(k=>!r.brief[k])||CONSULTATION_TYPES[r.type].fields.some(([k])=>!r.brief[k]))fail('Complete os campos essenciais e as perguntas do serviço antes de enviar.');}
  function version(r,input){if(!Number.isInteger(input.version)||input.version!==r?.version)fail('Este pedido mudou. Atualize e confira a versão atual.',409);}
  function requireState(r,states){if(!states.includes(r.state))fail('Esta ação não está disponível nesta etapa.',409);}
  async function write(org,id,data,old,user,action,admin){
    const at=now(),event={id:randomUUID(),action,at,actor:String(user.id),role:admin?'operator':'client',note:data.note||''};
    const next={...data,updatedAt:at,history:[...(old?JSON.parse(old.data).history||[]:[]),event]};delete next.id;delete next.orgId;delete next.version;
    if(old){if(!await db.prepare('UPDATE records SET data=?,updated_at=?,version=version+1 WHERE id=? AND version=? RETURNING id').get(JSON.stringify(next),at,id,old.version))fail('O pedido mudou. Atualize a tela.',409);}
    else await db.prepare('INSERT INTO records(id,org_id,kind,data,external_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(id,org,'consultation',JSON.stringify(next),id,at,at);
    await db.prepare('INSERT INTO audit VALUES(?,?,?,?,?,?,?)').run(event.id,org,String(user.id),'Consultoria: '+action,id,'',at);
    return decode(await row(id));
  }
  // The submitted record is both the order and the team's task. It is deliberately
  // separate from AI-managed tasks: moving a generic task must not accept a contract.
  async function listing(org,user,admin=false){
    let canManage=true;if(admin){if(!operator(user))fail('Acesso restrito à equipe Helpu.',403);}else{const m=await db.prepare('SELECT role FROM memberships WHERE org_id=? AND user_id=?').get(org,user.id);if(!m)fail('Empresa não encontrada.',404);canManage=['owner','admin'].includes(m.role);}
    let requests=(await db.prepare("SELECT * FROM records WHERE kind='consultation'"+(admin?'':' AND org_id=?')+' ORDER BY updated_at DESC').all(...(admin?[]:[org]))).map(decode);
    if(admin)requests=requests.filter(r=>r.submittedAt);
    else requests=requests.map(({reportDraft,deliveryAssets,...published})=>published);
    const clients=[];for(const id of new Set(requests.map(r=>r.orgId))){const c=await db.prepare('SELECT id,name FROM companies WHERE id=?').get(id);if(c)clients.push(c);}
    return {requests,clients,canManage,operatorId:admin?String(user.id):null,pendingCount:requests.filter(r=>['triage','revision'].includes(r.state)).length};
  }
  async function action(org,user,input,admin=false){await role(org,user,admin);return transaction(async()=>{
    const act=input.action;const adminActions=['assign','request_info','propose','payment','settle_website','brief_complete','start','pause','resume','report_draft','deliver'];const clientActions=['save','submit','answer','accept_proposal','decline','revise','complete','cancel'];
    if(!(admin?adminActions:clientActions).includes(act))fail('Ação não permitida para este acesso.',403);
    let old=input.id?await row(input.id):null,r=decode(old),id=r?.id;
    if(!r){if(input.id||act!=='save')fail('Pedido não encontrado.',404);if(!/^[a-f\d-]{36}$/i.test(input.requestKey||''))fail('Identificador de solicitação inválido.');id='consultation:'+org+':'+input.requestKey;old=await row(id);if(old){const previous=decode(old);delete previous.reportDraft;delete previous.deliveryAssets;return previous;}
      r={type:input.type,state:'draft',brief:{},assets:[],proposals:[],deliveries:[],answers:[],history:[],revisionsUsed:0,createdAt:now()};
    }else{if(r.orgId!==org||admin&&!r.submittedAt)fail('Pedido não encontrado.',404);version(r,input);}
    r.note='';
    if(act==='save'){if(r.acceptance)fail('Use Enviar complemento após contratar.',409);requireState(r,['draft','triage','needs_info']);r.brief=brief(input.type,input.brief);r.type=input.type;r.assets=await files(org,input.assetIds||[]);r.briefVerified=null;}
    if(act==='submit'){if(r.acceptance)fail('Use Enviar complemento após contratar.',409);requireState(r,['draft','triage','needs_info']);completeBrief(r);if(input.consent!==true)fail('Autorize a equipe a analisar os materiais para preparar a proposta.');r.submittedAt=r.submittedAt||now();r.consent={at:now(),actor:String(user.id),version:'consultation-2026-09-20'};r.state='triage';}
    if(act==='assign'){requireState(r,['triage','needs_info','proposed','accepted','working','paused','revision','delivered']);r.assignee=String(user.id);r.assigneeName=text(user.name,120);}
    if(act==='request_info'){requireState(r,['triage','needs_info','accepted']);r.note=text(input.note);if(!r.note)fail('Explique quais informações faltam.');r.returnState=r.state==='accepted'?'accepted':r.returnState||'triage';r.state='needs_info';r.briefVerified=null;}
    if(act==='answer'){requireState(r,['needs_info','paused']);const note=text(input.note);if(!note)fail('Informe o complemento.');const assets=await files(org,input.assetIds||[]);r.answers.push({at:now(),actor:String(user.id),note,assets});r.assets=[...new Map([...r.assets,...assets].map(a=>[a.id,a])).values()];if(r.assets.length>40)fail('Este pedido atingiu 40 anexos. Use links para materiais adicionais.');if(r.state==='needs_info')r.state=r.returnState||'triage';r.note=note;}
    if(act==='propose'){requireState(r,['triage','proposed']);const scope=text(input.scope,8000),deliverables=text(input.deliverables,8000),exclusions=text(input.exclusions),paymentInstructions=text(input.paymentInstructions),deadlineRule=text(input.deadlineRule);
      if(!scope||!deliverables||!exclusions||!paymentInstructions||!deadlineRule)fail('Informe escopo, entregas, exclusões, pagamento e regra de prazo.');
      if(!Number.isInteger(input.priceCents)||input.priceCents<=0||input.priceCents>100000000)fail('Informe o valor total em reais.');
      if(!Number.isInteger(input.businessDays)||input.businessDays<1||input.businessDays>180||!Number.isInteger(input.revisions)||input.revisions<0||input.revisions>10)fail('Confira prazo e quantidade de revisões.');
      if(!Number.isInteger(input.revisionBusinessDays)||input.revisionBusinessDays<1||input.revisionBusinessDays>90)fail('Informe o prazo de revisão em dias úteis.');
      r.proposals.push({number:r.proposals.length+1,at:now(),actor:String(user.id),scope,deliverables,exclusions,paymentInstructions,deadlineRule,priceCents:input.priceCents,businessDays:input.businessDays,revisions:input.revisions,revisionBusinessDays:input.revisionBusinessDays});r.state='proposed';r.acceptance=null;
    }
    if(act==='accept_proposal'){requireState(r,['proposed']);if(input.consent!==true)fail('Confirme o aceite do escopo, valor e condições apresentados.');r.acceptance={proposalNumber:r.proposals.at(-1).number,at:now(),actor:String(user.id)};r.state='accepted';}
    if(act==='decline'){requireState(r,['proposed']);r.note=text(input.note);if(!r.note)fail('Explique o ajuste desejado na proposta.');r.state='triage';}
    if(act==='payment'){requireState(r,['accepted']);if(input.confirmed!==true||!text(input.note))fail('Confirme a conferência do pagamento e registre a referência, sem dados bancários sensíveis.');r.payment={at:now(),actor:String(user.id),reference:text(input.note),source:'manual_operator',proposalNumber:r.acceptance.proposalNumber};}
    if(act==='brief_complete'){requireState(r,['accepted']);completeBrief(r);if(input.confirmed!==true)fail('Confirme que o briefing está completo.');r.briefVerified={at:now(),actor:String(user.id)};}
    if(act==='settle_website'){requireState(r,['working','revision','delivered']);if(r.type!=='website'||input.confirmed!==true||!text(input.note))fail('Confirme o saldo final do site e registre a referência bancária.');r.finalPayment={at:now(),actor:String(user.id),reference:text(input.note),proposalNumber:r.acceptance.proposalNumber};}
    if(act==='start'){requireState(r,['accepted']);if(!r.payment||!r.briefVerified)fail('Confirme o pagamento e o briefing antes de iniciar o prazo.',409);r.state='working';r.assignee=String(user.id);r.assigneeName=text(user.name,120);r.startedAt=now();r.dueDate=workingDate(dateAt(now()),r.proposals.at(-1).businessDays);}
    if(act==='pause'){requireState(r,['working','revision']);r.note=text(input.note);if(!r.note)fail('Informe o motivo da pausa e o que falta receber.');r.paused={at:now(),state:r.state,reason:r.note};r.state='paused';}
    if(act==='resume'){requireState(r,['paused']);if(input.confirmed!==true)fail('Confirme que as informações necessárias foram recebidas.');r.dueDate=workingDate(r.dueDate,pausedDays(dateAt(r.paused.at),dateAt(now())));r.state=r.paused.state;r.paused=null;}
    if(['report_draft','deliver'].includes(act)){requireState(r,['working','revision']);const report=Object.fromEntries(REPORT_FIELDS.map(([k])=>[k,text(input.report?.[k],12000)]));if(act==='deliver'&&['summary','evidence','facts','hypotheses','priorities','roadmap'].some(k=>!report[k]))fail('Preencha resumo, evidências, fatos, hipóteses, prioridades e plano de ação.');const ids=input.assetIds||[];if(!Array.isArray(ids)||ids.some(id=>!r.deliveryAssets?.some(a=>a.id===id)))fail('Use somente arquivos anexados a esta entrega.');const assets=await files(org,ids);
      if(act==='report_draft')r.reportDraft={at:now(),report,assets};
      else{r.deliveries.push({number:r.deliveries.length+1,at:now(),actor:String(user.id),report,assets,proposalNumber:r.acceptance.proposalNumber});r.reportDraft=null;r.state='delivered';}
    }
    if(act==='revise'){requireState(r,['delivered']);if(r.revisionsUsed>=r.proposals.at(-1).revisions)fail('As revisões incluídas foram utilizadas. Combine um novo escopo com a equipe.',409);r.note=text(input.note);if(!r.note)fail('Consolide os ajustes desejados.');r.revisionsUsed++;r.state='revision';r.dueDate=workingDate(dateAt(now()),r.proposals.at(-1).revisionBusinessDays);}
    if(act==='complete'){if(r.type==='website'&&!r.finalPayment)fail('A equipe precisa confirmar o saldo final antes de encerrar o projeto.',409);requireState(r,['delivered']);if(input.consent!==true)fail('Confirme que revisou e aceita esta entrega.');r.finalAcceptance={at:now(),actor:String(user.id),deliveryNumber:r.deliveries.at(-1).number};r.state='completed';}
    if(act==='cancel'){requireState(r,['draft','triage','needs_info','proposed']);if(r.acceptance)fail('Após contratar, combine o encerramento com a equipe.',409);r.state='canceled';}
    const result=await write(org,id,r,old,user,act,admin);
    if(!admin){delete result.reportDraft;delete result.deliveryAssets;}
    return result;
  });}
  async function upload(org,user,input,name,buffer){await role(org,user,true);return transaction(async()=>{const old=await row(input.id),r=decode(old);if(!r||r.orgId!==org||!r.submittedAt)fail('Pedido não encontrado.',404);version(r,input);requireState(r,['working','revision']);if((r.deliveryAssets||[]).length>=20)fail('Limite de 20 arquivos de entrega por pedido.');if(buffer.length>3*1024*1024)fail('Envie anexos de entrega de até 3 MB.',413);const a=await storeAsset(org,name,buffer);r.deliveryAssets=[...(r.deliveryAssets||[]),a];return write(org,r.id,r,old,user,'upload',true);});}
  async function canReadAsset(user,a){if(!operator(user))return false;const requests=(await db.prepare("SELECT * FROM records WHERE org_id=? AND kind='consultation'").all(a.org_id)).map(decode);return requests.some(r=>r.submittedAt&&r.state!=='canceled'&&[...r.assets,...(r.deliveryAssets||[])].some(x=>x.id===a.id));}
  return {listing,action,upload,canReadAsset};
}
