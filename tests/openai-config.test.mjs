import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {resolveOpenAIConfig} from '../portal/openai-config.mjs';
import {createHelpuServer} from '../server.mjs';

test('OpenAI environment defaults preserve company overrides',()=>{
 const env={OPENAI_API_KEY:'platform-test-secret',OPENAI_MODEL:'agent-test',OPENAI_TASK_MODEL:'task-test'};
 assert.equal(resolveOpenAIConfig({},env).agentModel,'agent-test');
 assert.equal(resolveOpenAIConfig({apiKey:'company-test-secret'},env).apiKey,'company-test-secret');
 assert.equal(resolveOpenAIConfig({agentModel:'company-agent'},env).agentModel,'company-agent');
 assert.deepEqual(resolveOpenAIConfig({environmentDisabled:true},env),{});
});

test('local environment file loads with terminal precedence',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'helpu-env-'));
 fs.writeFileSync(path.join(directory,'.env'),'OPENAI_MODEL=shared-model\nHELPU_PORT=4173\n');
 fs.writeFileSync(path.join(directory,'.env.local'),'OPENAI_MODEL=local-model\nOPENAI_API_KEY=fake-local-secret\n');
 const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!key.startsWith('OPENAI_')&&!key.startsWith('HELPU_')));
 const code="import {loadConfiguration} from "+JSON.stringify(new URL('../scripts/runtime.mjs',import.meta.url).href)+";loadConfiguration("+JSON.stringify(directory)+");console.log(JSON.stringify({model:process.env.OPENAI_MODEL,hasKey:!!process.env.OPENAI_API_KEY}));";
 for(const [extra,expected] of [[{},'local-model'],[{OPENAI_MODEL:'terminal-model'},'terminal-model']]){
  const result=spawnSync(process.execPath,['--input-type=module','-e',code],{env:{...env,...extra},encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  assert.deepEqual(JSON.parse(result.stdout),{model:expected,hasKey:true});
 }
});

test('platform key stays private, is not copied on save, and disconnect persists',async()=>{
 const env={OPENAI_API_KEY:'platform-test-secret',OPENAI_MODEL:'agent-test'};
 const server=await createHelpuServer({dataDir:fs.mkdtempSync(path.join(os.tmpdir(),'helpu-openai-')),portalOptions:{startScheduler:false,openaiEnv:env}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 let cookie='';
 const request=(route,method='GET',data)=>fetch(origin+route,{method,headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)});
 try{
  const auth=await request('/api/auth/signup','POST',{name:'Test',email:'openai-env@example.test',password:'test-password-123',company:'Test'});
  cookie=auth.headers.get('set-cookie').split(';')[0];
  const bootstrap=await(await request('/api/portal/bootstrap')).json();
  const prefix='/api/portal/'+bootstrap.companies[0].id;
  const state=async()=>{
   const result=await(await request(prefix+'/state')).json();
   assert.doesNotMatch(JSON.stringify(result),/platform-test-secret/);
   return result.integrations.find(item=>item.id==='openai');
  };
  assert.equal((await state()).configured,true);
  assert.equal((await state()).values.agentModel,'agent-test');
  assert.equal((await request(prefix+'/integrations/openai','PUT',{agentModel:'saved-agent'})).status,200);
  delete env.OPENAI_API_KEY;
  assert.equal((await state()).configured,false,'saving models must not persist the environment key');
  env.OPENAI_API_KEY='platform-test-secret';
  assert.equal((await state()).configured,true);
  assert.equal((await request(prefix+'/integrations/openai','DELETE')).status,200);
  assert.equal((await state()).configured,false);
  assert.equal((await request(prefix+'/integrations/openai','PUT',{agentModel:'saved-agent'})).status,200);
  assert.equal((await state()).configured,true);
 }finally{await server.portal.shutdown();await new Promise(resolve=>server.close(resolve));}
});
