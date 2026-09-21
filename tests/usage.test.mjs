import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHelpuServer} from '../server.mjs';
import {createDatabase} from '../portal/database.mjs';
import {PGlite} from '@electric-sql/pglite';
import {parseUsageLimit,usageCount,usageDay} from '../portal/usage.mjs';
import {openAIError,requestOpenAIResponse,createProviders} from '../portal/providers.mjs';

test('limites explícitos: sem teto artificial e sem coerção de entradas vazias',()=>{
 for(const v of [0,30,1000,'250'])assert.equal(parseUsageLimit(v),Number(v));
 assert.equal(parseUsageLimit('unlimited'),'unlimited');
 for(const v of ['',null,true,-1,1.1,Infinity,'NaN','abc'])assert.throws(()=>parseUsageLimit(v));
});
test('429: cota externa não é repetida, diagnóstico sanitizado e limite temporário tem retentativas finitas',async()=>{
 for(const code of ['credit_balance_exhausted','organization_spend_limit_exceeded','project_spend_limit_exceeded','insufficient_quota','billing_hard_limit_reached','project_usage_limit_exceeded','organization_usage_limit_exceeded','insufficient_credits']){
  let calls=0;
  await assert.rejects(requestOpenAIResponse({apiKey:'test-only'},{input:'probe'},{fetcher:async()=>{calls++;return Response.json({error:{code,message:'private secret'}},{status:429,headers:{'x-request-id':'req-test'}});}}),e=>e.state==='blocked'&&e.providerRejected&&e.providerDiagnostic.code===code&&/OpenAI/.test(e.message)&&!e.message.includes('private secret'));
  assert.equal(calls,1);
 }
 const waits=[];let calls=0;
 const result=await requestOpenAIResponse({apiKey:'test-only'},{input:'probe'},{sleep:async ms=>waits.push(ms),fetcher:async()=>++calls<3?Response.json({error:{code:'rate_limit_exceeded'}},{status:429,headers:{'retry-after':'1'}}):Response.json({status:'completed'})});
 assert.equal(result.status,'completed');assert.equal(calls,3);assert.deepEqual(waits,[1000,1000]);
 calls=0;await assert.rejects(requestOpenAIResponse({apiKey:'test'},{},{sleep:async()=>{},fetcher:async()=>{calls++;return Response.json({error:{code:'rate_limit_exceeded'}},{status:429});}}),e=>e.code==='openai_rate_limit');assert.equal(calls,3);
 calls=0;await assert.rejects(requestOpenAIResponse({apiKey:'test'},{},{fetcher:async()=>{calls++;return Response.json({error:{code:'rate_limit_exceeded'}},{status:429,headers:{'retry-after':'60'}});}}));assert.equal(calls,1);
 await assert.rejects(createProviders(async()=>Response.json({error:{}},{status:500})).generateImage({apiKey:'test'},{prompt:'test'}),e=>e.state==='uncertain');
 const unknown=openAIError(new Response('',{status:429}),{error:{message:'private'}});assert.match(unknown.message,/externo/);assert.equal(unknown.retryable,false);
});
test('400 de edição identifica incompatibilidade sem repetir chamada nem expor resposta privada',async()=>{
 let calls=0;
 const provider=createProviders(async()=>{calls++;return Response.json({error:{code:'invalid_input_fidelity_model',type:'image_generation_user_error',param:'input_fidelity',message:'private prompt secret'}},{status:400,headers:{'x-request-id':'req-safe'}});});
 await assert.rejects(provider.generateImage({apiKey:'test-only'},{prompt:'Teste'}),e=>{
  assert.equal(e.state,'blocked');assert.equal(e.providerRejected,true);assert.equal(e.retryable,false);
  assert.equal(e.providerDiagnostic.param,'input_fidelity');assert.equal(e.providerDiagnostic.requestId,'req-safe');
  assert.match(e.message,/configuração.*não é compatível/);assert.doesNotMatch(JSON.stringify(e)+e.message,/private prompt secret/);return true;
 });assert.equal(calls,1);
 const unsafe=openAIError(new Response('',{status:400}),{error:{param:'private_customer_field',message:'private',code:'bad'}});
 assert.equal(unsafe.providerDiagnostic.param,undefined);
});
for(const postgres of [false,true])test('cotas/reset por empresa, persistência e isolamento: '+(postgres?'PostgreSQL':'SQLite'),async t=>{
 const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'helpu-usage-'));let pg,database,rejectProvider=false;
 if(postgres){pg=await PGlite.create({parsers:{20:Number}});await pg.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA storage; CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint);');for(const f of ['20260913113000_preserve_helpu_data.sql','20260913140000_activate_cloud_runtime.sql'])await pg.exec(fs.readFileSync(new URL('../supabase/migrations/'+f,import.meta.url),'utf8'));await pg.exec('INSERT INTO helpu.portal_migrations VALUES(1,1),(2,1),(3,1),(4,1); SET ROLE helpu_runtime;');let queued=Promise.resolve();database=createDatabase({pool:{async connect(){const prior=queued;let release;queued=new Promise(r=>release=r);await prior;return {async query(sql,args){const r=await pg.query(sql,args);return {...r,rowCount:r.affectedRows};},release};},async end(){}}});}
 const server=await createHelpuServer({dataDir,database,portalOptions:{startScheduler:false,openaiEnv:{OPENAI_API_KEY:'test'},conversationRespond:async()=>{if(rejectProvider)throw openAIError(new Response('',{status:429}),{error:{code:'insufficient_quota'}});return {status:'completed',output:[{type:'message',content:[{type:'output_text',text:'OK'}]}]};}}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,db=server.database;
 const req=async(url,method='GET',data,cookie='')=>{const r=await fetch(base+url,{method,headers:{Origin:base,'Content-Type':'application/json',Cookie:cookie},body:data===undefined?undefined:JSON.stringify(data)});return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};};
 const signup=async email=>{const r=await req('/api/auth/signup','POST',{email,password:'long-test-password',name:'Teste',company:'Empresa'});assert.equal(r.status,201);const b=await req('/api/portal/bootstrap','GET',undefined,r.cookie);return {cookie:r.cookie,org:b.body.companies[0].id};};
 const api=(who,url,method='GET',data)=>req('/api/portal/'+who.org+'/'+url,method,data,who.cookie);
 try{
  const one=await signup('one@usage.test'),two=await signup('two@usage.test');
  assert.equal((await api(one,'company','PATCH',{policy:{dailyRuns:'unlimited',usageTestingEnabled:true}})).status,403);
  assert.equal((await api(one,'usage/reset','POST',{})).status,403);
  await db.prepare("UPDATE companies SET policy=json_set(policy,'$.usageTestingEnabled',json('true')) WHERE id=?").run(one.org);
  const limits={dailyRuns:'unlimited',dailyMedia:'unlimited',dailyMessages:'unlimited'};
  assert.equal((await api(one,'company','PATCH',{policy:limits})).status,200);
  for(const [k,v] of Object.entries(limits))assert.equal((await api(one,'state')).body.company.policy[k],v);
  assert.equal((await api(two,'state')).body.company.policy.dailyRuns,8);
  const thread=(await api(one,'conversations','POST',{})).body.id;
  const submit=async key=>(await api(one,'conversations/'+thread+'/messages','POST',{text:'Oi',idempotencyKey:key})).body;
  for(let i=0;i<3;i++){await submit('first-'+i);await server.portal.tick();}
  assert.equal((await api(one,'state')).body.usage.used.dailyRuns,3);
  const recordsBefore=(await db.prepare('SELECT count(*) AS n FROM usage_reservations WHERE org_id=?').get(one.org)).n;
  const otherPolicy=(await api(two,'state')).body.company.policy;
  assert.equal((await req('/api/portal/'+one.org+'/usage/reset','POST',{},two.cookie)).status,404);
  const reset=await api(one,'usage/reset','POST',{});assert.equal(reset.status,200);assert.equal(reset.body.used.dailyRuns,0);
  assert.equal((await db.prepare('SELECT count(*) AS n FROM usage_reservations WHERE org_id=?').get(one.org)).n,recordsBefore);
  assert.deepEqual((await api(two,'state')).body.company.policy,otherPolicy);
  assert.ok((await api(one,'state')).body.audit.some(a=>a.action==='Uso interno zerado'));
  await submit('first-0');await server.portal.tick();assert.equal((await api(one,'state')).body.usage.used.dailyRuns,0);
  assert.equal((await api(one,'company','PATCH',{policy:{dailyRuns:1}})).status,200);
  await submit('new');await server.portal.tick();assert.equal((await api(one,'state')).body.usage.used.dailyRuns,1);
  await submit('over');await server.portal.tick();assert.ok((await api(one,'state')).body.jobs.some(j=>/limite diário/.test(j.error||'')));
  assert.equal((await api(one,'company','PATCH',{policy:{dailyRuns:250}})).body.policy.dailyRuns,250);
  await api(one,'usage/reset','POST',{});rejectProvider=true;await submit('provider-fail');await server.portal.tick();
  const state=(await api(one,'state')).body;assert.equal(state.usage.used.dailyRuns,0);assert.ok(state.audit.some(a=>a.action==='Solicitação recusada pela OpenAI'));
  const owner=await db.prepare('SELECT user_id FROM memberships WHERE org_id=?').get(one.org);await db.prepare("UPDATE memberships SET role='member' WHERE org_id=? AND user_id=?").run(one.org,owner.user_id);
  assert.equal((await api(one,'usage/reset','POST',{})).status,403);assert.equal((await api(one,'company','PATCH',{policy:limits})).status,403);
 }finally{await new Promise(r=>server.close(r));if(pg)await pg.close();fs.rmSync(dataDir,{recursive:true,force:true});}
});
