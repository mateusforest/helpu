import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHelpuServer} from '../server.mjs';

test('fluxo padrão cria rascunhos sem acesso social e bloqueia publicação nova ou antiga',async()=>{
 const bodies=[];let responses=[];
 const answer={status:'completed',output:[{type:'message',content:[{type:'output_text',text:'Material preparado para revisão.'}]}]};
 const server=await createHelpuServer({dataDir:fs.mkdtempSync(path.join(os.tmpdir(),'helpu-delivery-')),portalOptions:{startScheduler:false,openaiEnv:{OPENAI_API_KEY:'test-only'},conversationRespond:async(_,body)=>{bodies.push(body);return responses.shift()||answer;}}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+server.address().port;let cookie='',org='';
 const request=async(url,method='GET',body)=>{const res=await fetch(origin+url,{method,headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});cookie=res.headers.get('set-cookie')?.split(';')[0]||cookie;return {status:res.status,body:await res.json()};};
 const api=(tail,method,body)=>request('/api/portal/'+org+'/'+tail,method,body);
 try{
  assert.equal((await request('/api/auth/signup','POST',{name:'QA',company:'Marca',email:'delivery@example.test',password:'test-password-12345'})).status,201);
  org=(await request('/api/portal/bootstrap')).body.companies[0].id;
  for(const kind of ['publish','send','insights','metaCampaign','googlePresence'])assert.equal((await api('jobs','POST',{kind,payload:{}})).status,409,kind);
  assert.equal((await api('browser')).status,409);
  assert.equal((await api('runtime/browser')).status,409);
  const thread=(await api('conversations','POST',{title:'Criar campanha'})).body.id;
  responses=[{status:'completed',output:[{type:'function_call',call_id:'draft',name:'save_draft',arguments:JSON.stringify({kind:'content',dataJson:JSON.stringify({title:'Post manual',caption:'Legenda revisável',visualPrompt:'Fundo claro',channel:'instagram',format:'image'})})}]},answer];
  assert.equal((await api('conversations/'+thread+'/messages','POST',{text:'Crie conteúdo para publicação no Instagram, eu vou postar.',mode:'execute'})).status,201);
  await server.portal.tick();
  assert.ok(bodies.length);
  assert.ok(bodies[0].tools.every(t=>!t.name.startsWith('browser_')));
  assert.deepEqual(bodies[0].tools.find(t=>t.name==='queue_action').parameters.properties.kind.enum,['agent','image','video']);
  const state=(await api('state')).body;
  const content=state.records.content.find(c=>c.title==='Post manual');assert.ok(content);
  const scheduledAt=new Date(Date.now()+86400000).toISOString();
  assert.equal((await api('records/content/'+content.id,'PATCH',{scheduledAt,version:content.version})).status,200);
  assert.equal((await api('state')).body.jobs.some(j=>j.kind==='publish'),false);
  assert.equal(state.jobs.some(j=>j.kind==='publish'),false);
  const old=(await api('conversations','POST',{title:'Antigo'})).body.id;
  const queued=await api('conversations/'+old+'/messages','POST',{text:'Olá',mode:'execute'});
  assert.equal(queued.status,201);
  await server.database.prepare("UPDATE jobs SET kind='publish' WHERE id=?").run(queued.body.id);
  const before=bodies.length;await server.portal.tick();assert.equal(bodies.length,before);
  const blocked=(await api('state')).body.jobs.find(j=>j.id===queued.body.id);assert.equal(blocked.state,'blocked');
 }finally{await server.portal.shutdown();await new Promise(r=>server.close(r));}
});
