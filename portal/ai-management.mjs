import {randomUUID,createHash} from 'node:crypto';
import {AI_TASKS,ROUTE_MODELS,aiModel} from './ai-routing.mjs';
import {PRICE_DATE,PRICE_SOURCE} from './ai-costs.mjs';
import {EVAL_CASES,runEvaluation} from './ai-evals.mjs';
import {recordProviderUsage} from './provider-usage.mjs';
import {requestOpenAIResponse} from './providers.mjs';
const parse=v=>{try{return JSON.parse(v||'{}');}catch{return {};}};
const fail=(message,status=409)=>{throw Object.assign(new Error(message),{status});};
const uuid=v=>typeof v==='string'&&/^[a-f0-9-]{36}$/i.test(v);
export function createAIManagement({db,operator,integration,now=Date.now,respond=(config,body)=>requestOpenAIResponse(config,body,{fetcher:(url,options)=>fetch(url,{...options,signal:AbortSignal.timeout(45000)})})}){
 const rows=async(org,kind)=>(await db.prepare('SELECT id,data,version,created_at FROM records WHERE org_id=? AND kind=? ORDER BY created_at DESC').all(org,kind)).map(r=>({...parse(r.data),id:r.id,version:r.version}));
 async function access(org,user){if(!operator(user))fail('Acesso restrito à equipe autorizada.',403);if(!await db.prepare('SELECT id FROM companies WHERE id=?').get(org))fail('Empresa não encontrada.',404);}
 async function policy(org){const r=await db.prepare("SELECT data,version FROM records WHERE org_id=? AND kind='ai_routing' AND id=?").get(org,'ai-routing:'+org);return r?{...parse(r.data),version:r.version}:{routes:{},version:0};}
 async function report(org){
  const until=now(),since=until-30*86400000,ledger=(await db.prepare("SELECT data FROM records WHERE org_id=? AND kind='provider_usage' AND created_at>=? AND created_at<=?").all(org,since,until)).map(r=>parse(r.data));
  const jobs=await db.prepare('SELECT id,kind,state,payload,attempts,created_at FROM jobs WHERE org_id=?').all(org),byId=new Map(jobs.map(j=>[j.id,j]));
  const reviews=(await db.prepare("SELECT external_id,data FROM records WHERE org_id=? AND kind='connection_validation' AND external_id LIKE 'creation-review:%'").all(org)).filter(r=>parse(r.data).status==='approved');
  const groups=new Map(),requests=new Map();let knownUsd=0,priced=0,latency=0,timed=0;
  for(const r of ledger){const cost=typeof r.estimatedCost?.usd==='number'&&Number.isFinite(r.estimatedCost.usd)?r.estimatedCost.usd:null,key=JSON.stringify([r.operation,r.model]);const g=groups.get(key)||{operation:r.operation,model:r.model,calls:0,priced:0,knownUsd:0,tokens:{input:null,cachedInput:null,output:null},tokenCoverage:0};g.calls++;if(['input','cachedInput','output'].every(k=>Number.isSafeInteger(r.tokens?.[k])&&r.tokens[k]>=0)){g.tokenCoverage++;for(const k of Object.keys(g.tokens))g.tokens[k]=(g.tokens[k]??0)+r.tokens[k];};if(cost!==null){knownUsd+=cost;priced++;g.priced++;g.knownUsd+=cost;}groups.set(key,g);if(Number.isFinite(r.latencyMs)){latency+=r.latencyMs;timed++;}
   if(r.jobId){const j=byId.get(r.jobId),root=j?.kind==='creation'?j.id:parse(j?.payload).creationId||r.jobId;const q=requests.get(root)||{id:root,calls:0,priced:0,knownUsd:0,state:byId.get(root)?.state||'unknown'};q.calls++;if(cost!==null){q.priced++;q.knownUsd+=cost;}requests.set(root,q);}}
  const approved=reviews.map(r=>requests.get(r.external_id.slice('creation-review:'.length))).filter(Boolean);const complete=approved.filter(r=>r.priced===r.calls&&byId.get(r.id)?.created_at>=since);return {since,until,calls:ledger.length,priced,unpriced:ledger.length-priced,knownUsd,averageLatencyMs:timed?latency/timed:null,timedCalls:timed,groups:[...groups.values()],requests:[...requests.values()].sort((a,b)=>b.calls-a.calls).slice(0,50),approvedMeasured:complete.length,approvedWithUsage:approved.length,averageApprovedProductionUsd:complete.length?complete.reduce((n,r)=>n+r.knownUsd,0)/complete.length:null,failedJobs:jobs.filter(j=>['failed','blocked','uncertain'].includes(j.state)&&j.created_at>=since&&j.created_at<=until).length,retriedJobs:jobs.filter(j=>j.attempts>1&&requests.has(j.id)).length};
 }
 async function listing(org,user){await access(org,user);const config=await integration(org,'openai');return {clients:await db.prepare('SELECT id,name FROM companies ORDER BY name').all(),policy:await policy(org),effective:Object.fromEntries(Object.keys(AI_TASKS).map(t=>[t,aiModel(config,t)])),tasks:AI_TASKS,models:ROUTE_MODELS,hasKey:!!config.apiKey,report:await report(org),evaluations:await rows(org,'ai_evaluation'),history:(await rows(org,'ai_routing_history')).slice(0,20),cases:EVAL_CASES.map(({id,name})=>({id,name})),priceDate:PRICE_DATE,priceSource:PRICE_SOURCE};}
 async function action(org,user,d){await access(org,user);
  if(d.action==='evaluate'){
   const c=EVAL_CASES.find(c=>c.id===d.caseId);if(!c||!ROUTE_MODELS.includes(d.model)||!uuid(d.batch)||d.confirmed!==true)fail('Confirme a comparação paga e escolha um caso válido.');const config=await integration(org,'openai');if(!config.apiKey)fail('Configure a chave OpenAI antes da avaliação.');
   const id='ai-eval:'+createHash('sha256').update(JSON.stringify([org,d.batch,c.id,d.model])).digest('hex');const existing=await db.prepare("SELECT data FROM records WHERE id=? AND org_id=? AND kind='ai_evaluation'").get(id,org);if(existing)return parse(existing.data);
   const startedAt=now(),value={batch:d.batch,caseId:c.id,model:d.model,state:'running',createdAt:startedAt,actor:user.id};
   const claimed=await db.prepare("INSERT INTO records(id,org_id,kind,data,created_at,updated_at) VALUES(?,?,'ai_evaluation',?,?,?) ON CONFLICT(id) DO NOTHING RETURNING id").get(id,org,JSON.stringify(value),startedAt,startedAt);if(!claimed)fail('Esta avaliação já está em andamento.');
   let result;try{const evaluated=await runEvaluation(d.model,c,async body=>{const callStart=now(),response=await respond(config,body);await recordProviderUsage(db,{org_id:org,operationId:id},response,{operation:'model_evaluation',model:d.model,startedAt:callStart,observedAt:now(),serviceTier:'default'});return response;});const {response}=evaluated;result={...value,state:'complete',completedAt:now(),...evaluated.grade,calls:evaluated.responses.length,output:evaluated.responses.flatMap(r=>(r.output||[]).filter(x=>['function_call','message'].includes(x.type)).map(x=>x.type==='function_call'?{tool:x.name,arguments:String(x.arguments||'').slice(0,6000)}:{text:(x.content||[]).filter(v=>v.type==='output_text').map(v=>v.text).join('\n').slice(0,6000)})),usage:response.usage||null};}
   catch{result={...value,state:'uncertain',passed:false,notes:['Avaliação não confirmada. Confira a tentativa antes de iniciar outro lote.'],completedAt:now()};}
   await db.prepare("UPDATE records SET data=?,updated_at=?,version=version+1 WHERE id=? AND org_id=? AND kind='ai_evaluation'").run(JSON.stringify(result),now(),id,org);return result;
  }
  if(d.action==='save'||d.action==='rollback'){
   const old=await policy(org);if(d.version!==old.version)fail('A configuração mudou. Atualize a página.');let routes={},reason=String(d.reason||'').trim();if(reason.length<8||reason.length>1000)fail('Registre o motivo da mudança.');
   if(d.action==='rollback'){const prior=(await rows(org,'ai_routing_history')).find(r=>r.id===d.historyId);if(!prior)fail('Versão anterior não encontrada.');routes=prior.before.routes||{};}
   else{if(!d.routes||typeof d.routes!=='object'||Array.isArray(d.routes))fail('Informe o roteamento por tarefa.');for(const [task,model] of Object.entries(d.routes)){if(!Object.hasOwn(AI_TASKS,task)||!ROUTE_MODELS.includes(model))fail('Tarefa ou modelo inválido.');routes[task]=model;}
    if(Object.keys(routes).length){if(d.qualityReviewed!==true||!uuid(d.batch))fail('Compare os modelos e confira a qualidade antes de ativar.');const evaluations=(await rows(org,'ai_evaluation')).filter(e=>e.batch===d.batch&&e.createdAt>=now()-7*86400000);for(const model of new Set(Object.values(routes)))for(const c of EVAL_CASES)if(!evaluations.some(e=>e.caseId===c.id&&e.model===model&&e.state==='complete'&&e.passed))fail('O modelo escolhido precisa passar nos oito casos deste lote.');for(const model of ROUTE_MODELS)for(const c of EVAL_CASES)if(!evaluations.some(e=>e.caseId===c.id&&e.model===model&&e.state==='complete'))fail('Conclua a comparação dos dois modelos.');}}
   const value={routes,actor:user.id,updatedAt:now(),reason,batch:d.batch||null};await db.exec('SAVEPOINT ai_policy');try{
    if(old.version){const saved=await db.prepare("UPDATE records SET data=?,updated_at=?,version=version+1 WHERE id=? AND org_id=? AND kind='ai_routing' AND version=? RETURNING id").get(JSON.stringify(value),now(),'ai-routing:'+org,org,old.version);if(!saved)fail('A configuração mudou. Atualize.');}
    else await db.prepare("INSERT INTO records(id,org_id,kind,data,created_at,updated_at) VALUES(?,?,'ai_routing',?,?,?)").run('ai-routing:'+org,org,JSON.stringify(value),now(),now());
    await db.prepare("INSERT INTO records(id,org_id,kind,data,created_at,updated_at) VALUES(?,?,'ai_routing_history',?,?,?)").run(randomUUID(),org,JSON.stringify({before:old,after:value,actor:user.id,reason,createdAt:now()}),now(),now());await db.exec('RELEASE SAVEPOINT ai_policy');return policy(org);
   }catch(e){await db.exec('ROLLBACK TO SAVEPOINT ai_policy');await db.exec('RELEASE SAVEPOINT ai_policy');throw e;}
  }fail('Ação inválida.');
 }
 return {policy,listing,action,report};
}
