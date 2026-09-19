import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {PGlite} from '@electric-sql/pglite';
import {createDatabase} from '../portal/database.mjs';
import {recordProviderUsage,measuredTokens} from '../portal/provider-usage.mjs';
import {requestOpenAIResponse,createProviders} from '../portal/providers.mjs';
import {createHelpuServer} from '../server.mjs';
import {testPng} from './image-fixture.mjs';

const usage={input_tokens:1200,input_tokens_details:{cached_tokens:800,image_tokens:300,text_tokens:900},output_tokens:150,output_tokens_details:{reasoning_tokens:100},total_tokens:1350};
test('medição conserva tokens reais, cache como subconjunto e valores ausentes desconhecidos',()=>{
 assert.deepEqual(measuredTokens(usage),{input:1200,cachedInput:800,output:150,total:1350,reasoningOutput:100,imageInput:300,textInput:900});
 assert.deepEqual(measuredTokens(),{input:null,cachedInput:null,output:null,total:null,reasoningOutput:null,imageInput:null,textInput:null});
 const invalid=measuredTokens({input_tokens:'12',output_tokens:-1,total_tokens:Infinity,input_tokens_details:{cached_tokens:1.5}});
 assert.equal(invalid.input,null);assert.equal(invalid.output,null);assert.equal(invalid.total,null);assert.equal(invalid.cachedInput,null);
 assert.equal(measuredTokens({input_tokens:2,input_tokens_details:{cached_tokens:3}}).cachedInput,null);
 assert.equal(measuredTokens({input_tokens:0,output_tokens:0,total_tokens:0}).total,0);
});

for(const postgres of [false,true])test('ledger privado por empresa deduplica response/request IDs em '+(postgres?'PostgreSQL':'SQLite'),async()=>{
 let pg,db;
 if(postgres){
  pg=await PGlite.create();await pg.exec('CREATE SCHEMA helpu');
  let queued=Promise.resolve();
  db=createDatabase({pool:{async connect(){const prior=queued;let release;queued=new Promise(r=>release=r);await prior;return {async query(sql,args){const r=await pg.query(sql,args);return {...r,rowCount:r.affectedRows};},release};},async end(){}}});
 }else db=createDatabase({filename:':memory:'});
 try{
  await db.exec('CREATE TABLE '+(postgres?'helpu.':'')+'records(id TEXT PRIMARY KEY,org_id TEXT NOT NULL,kind TEXT NOT NULL,data TEXT NOT NULL,external_id TEXT,created_at BIGINT NOT NULL,updated_at BIGINT NOT NULL,UNIQUE(org_id,kind,external_id))');
  const job={org_id:'org-a',id:'job-a'},response={id:'resp_a',requestId:'req_a',model:'actual-model',usage,output:[{text:'private prompt'}],secret:'sk-private'};
  const options={operation:'conversation',model:'configured-model',observedAt:1234};
  const results=await Promise.all([recordProviderUsage(db,job,response,options),recordProviderUsage(db,job,response,options)]);
  assert.equal(results.filter(r=>r.recorded).length,1);
  await recordProviderUsage(db,{...job,id:'retry-job'},response,options);
  await recordProviderUsage(db,{org_id:'org-b',id:'job-b'},response,options);
  await recordProviderUsage(db,job,{requestId:'req_image',usage},{operation:'image',model:'image-model'});
  await recordProviderUsage(db,job,{requestId:'req_image',usage},{operation:'image',model:'image-model'});
  await recordProviderUsage(db,job,{id:'resp_missing'},{operation:'post',model:'configured-model'});
  const rows=await db.prepare("SELECT org_id,data FROM records WHERE kind='provider_usage'").all();assert.equal(rows.length,4);
  const measured=JSON.parse(rows.find(r=>JSON.parse(r.data).responseId==='resp_a'&&r.org_id==='org-a').data);
  assert.equal(measured.jobId,'job-a');assert.equal(measured.orgId,'org-a');assert.equal(measured.model,'actual-model');assert.equal(measured.configuredModel,'configured-model');assert.deepEqual(measured.tokens,measuredTokens(usage));assert.equal(measured.usageAvailable,true);
  const missing=JSON.parse(rows.find(r=>JSON.parse(r.data).responseId==='resp_missing').data);assert.equal(missing.usageAvailable,false);assert.equal(missing.tokens.total,null);
  assert.ok(!JSON.stringify(rows).includes('private'));assert.ok(!JSON.stringify(rows).includes('output_tokens_details'));
 }finally{await db.close();if(pg)await pg.close();}
});

test('transporte conserva request ID e imagem registra uso antes de validar o arquivo',async()=>{
 const response=await requestOpenAIResponse({apiKey:'test-secret'},{model:'chosen',input:'private'},{fetcher:async()=>Response.json({id:'resp_transport',model:'actual',usage},{headers:{'x-request-id':'req_transport'}})});
 assert.equal(response.requestId,'req_transport');assert.deepEqual(response.usage,usage);
 let measured;
 const provider=createProviders(async()=>Response.json({usage,data:[]},{headers:{'x-request-id':'req_invalid_image'}}));
 await assert.rejects(provider.generateImage({apiKey:'test-secret'},{prompt:'private',onUsage:async value=>measured=value}),e=>e.state==='uncertain');
 assert.equal(measured.requestId,'req_invalid_image');assert.deepEqual(measured.usage,usage);assert.ok(!JSON.stringify(measured).includes('private'));
 await assert.rejects(recordProviderUsage({prepare(){throw Error('private database detail');}},{org_id:'org-a',id:'job-a'},response,{operation:'conversation'}),e=>e.state==='uncertain'&&!e.message.includes('private'));
});

test('chat, planejamento e imagem persistem cada chamada; falha de plano mantém consumo e reconsulta não duplica',async()=>{
 const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'helpu-provider-usage-'));
 let chats=0,plans=0,images=0,invalidPlan=false;
 const server=await createHelpuServer({dataDir,portalOptions:{startScheduler:false,openaiEnv:{OPENAI_API_KEY:'test-only'},conversationRespond:async()=>({id:'resp_chat_'+(++chats),model:'chat-measured',usage,status:'completed',output:chats===1?[{type:'function_call',name:'operation_status',call_id:'status-call',arguments:'{}'}]:[{type:'message',content:[{type:'output_text',text:'Tudo conferido.'}]}]}),creationRespond:async()=>({id:'resp_plan_'+(++plans),model:'plan-measured',usage,status:'completed',output:invalidPlan?[]:[{type:'message',content:[{type:'output_text',text:JSON.stringify({caption:'Legenda',slides:[{title:'Arte',text:'Novidade',visualPrompt:'Arte verde',background:'#ffffff',textColor:'#002200'}]})}]}]}),providers:{generateImage:async(_,{size})=>{images++;const [w,h]=size.split('x').map(Number);return {requestId:'req_image_'+images,model:'image-measured',usage,base64:testPng(w,h).toString('base64')};}}}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 let cookie='',org;
 const request=async(route,method='GET',body)=>{const r=await fetch(origin+route,{method,headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return {status:r.status,body:await r.json()};};
 const api=(tail,method='GET',body)=>request('/api/portal/'+org+'/'+tail,method,body);
 const rows=async()=>await server.database.prepare("SELECT data FROM records WHERE org_id=? AND kind='provider_usage'").all(org);
 try{
  assert.equal((await request('/api/auth/signup','POST',{email:'usage-calls@example.test',password:'test-only-long-password',name:'Teste',company:'Empresa'})).status,201);
  org=(await request('/api/portal/bootstrap')).body.companies[0].id;
  const thread=(await api('conversations','POST',{title:'Teste'})).body;
  const sent=await api('conversations/'+thread.id+'/messages','POST',{text:'Confira o andamento.',mode:'plan'});assert.equal(sent.status,201,JSON.stringify(sent.body));
  await server.portal.tick();assert.equal(chats,2);
  let stored=(await rows()).map(r=>JSON.parse(r.data));assert.equal(stored.filter(r=>r.operation==='conversation').length,2);assert.equal(new Set(stored.map(r=>r.jobId)).size,1);
  const payload={prompt:'Uma arte verde.',format:'feed',requestId:'measure-image-0001',attachments:[]};
  const creation=await api('creations','POST',payload);assert.equal(creation.status,201,JSON.stringify(creation.body));
  for(let i=0;i<6;i++){await server.portal.tick();if((await api('creations/'+creation.body.creation.id)).body.creation.status==='complete')break;}
  assert.equal((await api('creations/'+creation.body.creation.id)).body.creation.status,'complete');assert.equal(images,1);
  stored=(await rows()).map(r=>JSON.parse(r.data));assert.equal(stored.length,4);assert.equal(stored.filter(r=>r.operation==='creation_plan').length,1);assert.equal(stored.filter(r=>r.operation==='image').length,1);
  const image=stored.find(r=>r.operation==='image');assert.equal(image.requestId,'req_image_1');assert.equal(image.model,'image-measured');assert.equal(image.tokens.cachedInput,800);
  await api('creations','POST',payload);await server.portal.tick();assert.equal((await rows()).length,4);assert.equal(images,1);
  invalidPlan=true;const bad=await api('creations','POST',{...payload,requestId:'measure-image-0002'});assert.equal(bad.status,201);
  await server.portal.tick();assert.equal((await rows()).length,5);assert.equal(images,1);
  stored=(await rows()).map(r=>JSON.parse(r.data));assert.equal(stored.filter(r=>r.operation==='creation_plan').length,2);assert.ok(stored.every(r=>r.orgId===org&&r.jobId&&r.usageAvailable));
 }finally{await server.portal.shutdown();await new Promise(r=>server.close(r));assert.ok(path.resolve(dataDir).startsWith(path.resolve(os.tmpdir())+path.sep+'helpu-provider-usage-'));fs.rmSync(dataDir,{recursive:true,force:true});}
});

test('agentes e revisão registram resposta paga mesmo quando o conteúdo é inválido',async()=>{
 const db=createDatabase({filename:':memory:'});
 try{
  await db.exec('CREATE TABLE records(id TEXT PRIMARY KEY,org_id TEXT NOT NULL,kind TEXT NOT NULL,data TEXT NOT NULL,external_id TEXT,created_at BIGINT NOT NULL,updated_at BIGINT NOT NULL,UNIQUE(org_id,kind,external_id))');
  let calls=0;
  const provider=createProviders(async()=>Response.json({id:'resp_extra_'+(++calls),model:'actual',usage,status:'completed',output:[]},{headers:{'x-request-id':'req_extra_'+calls}}));
  const onUsage=operation=>response=>recordProviderUsage(db,{org_id:'org-extra',operationId:'review-operation'},response,{operation,model:response.configuredModel});
  await assert.rejects(provider.text({apiKey:'private-key',model:'legacy-model'},{brief:'private brief',company:{},records:[],onUsage:onUsage('agent')}));
  await assert.rejects(provider.contextualReview({apiKey:'private-key',agentModel:'review-model'},{objective:'private objective',company:{},content:{},onUsage:onUsage('contextual_review')}));
  const validation=await provider.operationalValidation({apiKey:'private-key'},{onUsage:onUsage('operational_validation')});assert.equal(validation.status,'failed');assert.equal(calls,3);
  const rows=(await db.prepare("SELECT data FROM records WHERE kind='provider_usage'").all()).map(r=>JSON.parse(r.data));
  assert.equal(rows.length,3);assert.ok(rows.every(r=>r.operationId==='review-operation'&&r.jobId===null&&r.tokens.input===1200&&r.requestId));
  assert.equal(rows.find(r=>r.operation==='agent').configuredModel,'legacy-model');assert.equal(rows.find(r=>r.operation==='contextual_review').configuredModel,'review-model');
  assert.ok(!JSON.stringify(rows).includes('private'));
 }finally{await db.close();}
});

test('portal vincula as duas chamadas de validação ao validationId e rotina ao job real',async()=>{
 const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'helpu-provider-usage-extra-'));let calls=0;
 const providers=createProviders(async(_url,options)=>{
  const body=JSON.parse(options.body),id='resp_link_'+(++calls);let output;
  if(body.tool_choice?.name==='helpu_validation_probe')output=[{type:'function_call',name:'helpu_validation_probe',call_id:'probe-call',arguments:JSON.stringify({nonce:body.tools[0].parameters.properties.nonce.enum[0]})}];
  else {const value=body.text?.format?.name==='helpu_operational_validation'?{ok:true,nonce:JSON.parse(body.input.at(-1).output).nonce,capability:'structured_tools'}:{summary:'Preparado',recommendations:[],questions:[],pieces:[]};output=[{type:'message',content:[{type:'output_text',text:JSON.stringify(value)}]}];}
  return Response.json({id,model:body.model,usage,status:'completed',output},{headers:{'x-request-id':'req_link_'+calls}});
 });
 const server=await createHelpuServer({dataDir,portalOptions:{startScheduler:false,openaiEnv:{OPENAI_API_KEY:'private-test-key'},providers}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;let cookie='',org;
 const request=async(route,method='GET',body)=>{const r=await fetch(origin+route,{method,headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return {status:r.status,body:await r.json()};};
 const api=(tail,method='GET',body)=>request('/api/portal/'+org+'/'+tail,method,body);
 try{
  await request('/api/auth/signup','POST',{email:'usage-extra@example.test',password:'test-only-long-password',name:'Teste',company:'Empresa'});org=(await request('/api/portal/bootstrap')).body.companies[0].id;
  const validation=await api('integrations/openai/test','POST',{});assert.equal(validation.status,200,JSON.stringify(validation.body));
  let rows=(await server.database.prepare("SELECT data FROM records WHERE org_id=? AND kind='provider_usage'").all(org)).map(r=>JSON.parse(r.data));
  assert.equal(rows.length,2);assert.ok(rows.every(r=>r.operation==='operational_validation'&&r.jobId===null&&r.operationId===validation.body.validation.validationId));assert.equal(new Set(rows.map(r=>r.responseId)).size,2);
  await api('company','PATCH',{profile:{description:'Serviços locais',audience:'Empresas'},policy:{autoMedia:false}});
  const queued=await api('jobs','POST',{kind:'agent',payload:{agent:'creative',brief:'Preparar recomendações'},idempotencyKey:'usage-routine'});assert.equal(queued.status,201,JSON.stringify(queued.body));
  await server.portal.tick();rows=(await server.database.prepare("SELECT data FROM records WHERE org_id=? AND kind='provider_usage'").all(org)).map(r=>JSON.parse(r.data));
  const agent=rows.find(r=>r.operation==='agent');assert.ok(agent);assert.equal(agent.jobId,queued.body.id);assert.equal(agent.operationId,null);assert.equal(calls,3);
 }finally{await server.portal.shutdown();await new Promise(r=>server.close(r));assert.ok(path.resolve(dataDir).startsWith(path.resolve(os.tmpdir())+path.sep+'helpu-provider-usage-extra-'));fs.rmSync(dataDir,{recursive:true,force:true});}
});
