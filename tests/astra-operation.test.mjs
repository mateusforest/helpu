import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHelpuServer} from '../server.mjs';
import {astraContext} from '../portal/astra-context.mjs';

test('contexto do Astra não transmite credenciais nem promete editor ou navegador na nuvem',()=>{
 const context=astraContext({company:{policy:{enabled:true}},cloud:true,integrations:[{id:'openai',configured:true,values:{apiKey:'secret-value',agentModel:'gpt-6-astra'},sealed:'encrypted-secret',validation:{status:'validated',secret:'hidden'}}]});
 assert.doesNotMatch(JSON.stringify(context),/secret-value|encrypted-secret|hidden/);
 assert.equal(context.capabilities.browser,false);
 assert.equal(context.capabilities.videoEditing,false);
 assert.equal(context.connections[0].model,'gpt-6-astra');
});

test('criação direta informa Reels disponível sem depender do editor antigo',()=>{
 const input={company:{},cloud:true,runtime:{available:false,video:false},creations:{images:true,reels:true,reelsReason:''}};
 const cap=astraContext(input).capabilities;
 assert.equal(cap.videoEditing,true);
 assert.match(cap.videoEditingReason,/create_media/);
 assert.doesNotMatch(cap.videoGeneration,/indisponível/);
 assert.equal(cap.imageGeneration.tool,'create_media');
 const blocked=astraContext({...input,runtime:{available:true,video:true},creations:{images:true,reels:false,reelsReason:'Processador ausente.'}}).capabilities;
 assert.equal(blocked.videoEditing,false);
 assert.equal(blocked.videoGeneration,'Processador ausente.');
 const noKey=astraContext({...input,creations:{images:false,reels:false,reelsReason:''}}).capabilities;
 assert.equal(noKey.imageGeneration.configured,false);
 assert.match(noKey.videoGeneration,/chave/);
});

test('Astra consulta andamento da empresa e agenda com fuso, respeitando Planejar',async()=>{
 const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'helpu-astra-'));
 let responses=[],bodies=[];
 const answer={status:'completed',output:[{type:'message',content:[{type:'output_text',text:'Pedido registrado.'}]}]};
 const tool=(name,args)=>({status:'completed',output:[{type:'function_call',call_id:'test-call',name,arguments:JSON.stringify(args)}]});
 const server=await createHelpuServer({dataDir,portalOptions: {deliveryOnly:false,startScheduler:false,conversationRespond:async(c,body)=>{bodies.push(structuredClone(body));return responses.shift()||answer;}}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+server.address().port;
 let cookie='',org='';
 const request=async(url,method='GET',data)=>{const r=await fetch(origin+url,{method,headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie},body:data?JSON.stringify(data):undefined});if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];assert.ok(r.ok,await r.clone().text());return r.json();};
 const api=(tail,method,data)=>request('/api/portal/'+org+'/'+tail,method,data);
 const run=async(name,args,mode='execute')=>{bodies=[];responses=[tool(name,args),answer];const thread=await api('conversations','POST',{title:'Teste Astra'});await api('conversations/'+thread.id+'/messages','POST',{text:'Confira os próximos passos da operação',mode});await server.portal.tick();return JSON.parse(bodies.at(-1).input.find(m=>m.type==='function_call_output').output);};
 try{
  await request('/api/auth/signup','POST',{name:'Teste',email:'astra@example.test',password:'test-password-12345',company:'Astra QA'});
  org=(await request('/api/portal/bootstrap')).companies[0].id;
  const status=await run('operation_status',{});
  assert.equal(status.environment,'local');assert.ok(status.jobs.length);assert.equal(status.timeZone,'America/Sao_Paulo');
  assert.match(bodies[0].instructions,/Estado operacional/);assert.equal(bodies[0].model,'gpt-6-astra');
  const missing=await run('operation_status',{jobId:'another-company-job'});
  assert.equal(missing.state,'blocked');assert.match(missing.error,/nesta empresa/);
  const scheduledAt=new Date(Date.now()+86400000).toISOString();
  const queued=await run('queue_action',{kind:'insights',payloadJson:'{}',scheduledAt});
  assert.equal(queued.state,'queued');assert.equal(queued.scheduledAt,Date.parse(scheduledAt));
  const checked=await run('operation_status',{jobId:queued.id});assert.equal(checked.jobs[0].id,queued.id);assert.equal(checked.jobs[0].state,'queued');
  const before=(await api('state')).jobs.filter(j=>j.kind==='insights').length;
  const invalid=await run('queue_action',{kind:'insights',payloadJson:'{}',scheduledAt:scheduledAt.slice(0,-1)});
  assert.equal(invalid.state,'blocked');assert.match(invalid.error,/fuso/);
  const planned=await run('queue_action',{kind:'insights',payloadJson:'{}',scheduledAt},'plan');assert.equal(planned.state,'blocked');
  assert.equal((await api('state')).jobs.filter(j=>j.kind==='insights').length,before);
 }finally{await server.portal.shutdown();await new Promise(r=>server.close(r));}
});
