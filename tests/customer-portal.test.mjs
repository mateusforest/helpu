import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHelpuServer} from '../server.mjs';

test('cliente controla preferências; somente equipe controla limites, reset e diagnóstico interno',async()=>{
 const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'helpu-customer-boundary-')),operatorEnv={};
 const server=await createHelpuServer({dataDir,portalOptions:{operatorEnv,startScheduler:false}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const request=async(cookie,url,method='GET',data)=>{const res=await fetch(origin+url,{method,headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)});return {status:res.status,body:await res.json(),cookie:res.headers.get('set-cookie')?.split(';')[0]};};
 const signup=async(email)=>{const r=await request('','/api/auth/signup','POST',{email,password:'test-only-long-password',name:'Teste',company:'Empresa'});assert.equal(r.status,201);const b=await request(r.cookie,'/api/portal/bootstrap');return {cookie:r.cookie,id:b.body.user.id,org:b.body.companies[0].id};};
 try{
  const client=await signup('client@boundary.test'),staff=await signup('staff@boundary.test');operatorEnv.HELPU_OPERATOR_USER_IDS=String(staff.id);
  const base='/api/portal/'+client.org+'/',admin='/api/portal/admin-settings?org='+client.org;
  const original=(await request(client.cookie,base+'state')).body.company;
  for(const policy of [{dailyRuns:99999},{dailyMedia:'unlimited'},{dailyMessages:1000},{publicBaseUrl:'https://example.com'},{usageResetAt:Date.now()},{usageTestingEnabled:true},{enabled:true},{autoMedia:true}])assert.equal((await request(client.cookie,base+'company','PATCH',{policy})).status,403);
  assert.equal((await request(client.cookie,base+'usage/reset','POST',{})).status,403);
  assert.equal((await request(client.cookie,admin)).status,403);
  assert.equal((await request(client.cookie,admin,'POST',{action:'save',policy:{dailyRuns:1000}})).status,403);
  assert.equal((await request(client.cookie,base+'jobs','POST',{kind:'agent',payload:{purpose:'company_diagnosis',agent:'strategy'}})).status,403);
  const saved=await request(client.cookie,base+'company','PATCH',{name:'Nome atualizado',profile:{description:'Atendimento local'},policy:{schedulesEnabled:true,timeZone:'America/Manaus'}});assert.equal(saved.status,200);assert.equal(saved.body.policy.schedulesEnabled,true);assert.equal(saved.body.policy.enabled,original.policy.enabled);assert.equal(saved.body.policy.dailyRuns,original.policy.dailyRuns);
  let settings=(await request(staff.cookie,admin)).body;assert.equal(settings.company.id,client.org);
  const limits=await request(staff.cookie,admin,'POST',{action:'save',expectedUpdatedAt:settings.company.updatedAt,policy:{dailyRuns:20,dailyMedia:5,dailyMessages:40,publicBaseUrl:'https://www.helpumkt.com/'}});assert.equal(limits.status,200);assert.equal(limits.body.policy.dailyRuns,20);assert.equal(limits.body.policy.schedulesEnabled,true);assert.equal(limits.body.policy.publicBaseUrl,'https://www.helpumkt.com');
  assert.equal((await request(staff.cookie,admin,'POST',{action:'save',expectedUpdatedAt:settings.company.updatedAt,policy:{dailyRuns:2}})).status,409);
  settings=limits.body;
  assert.equal((await request(staff.cookie,admin,'POST',{action:'save',expectedUpdatedAt:settings.company.updatedAt,policy:{dailyRuns:'unlimited'}})).status,422);
  assert.equal((await request(staff.cookie,admin,'POST',{action:'reset',expectedUpdatedAt:settings.company.updatedAt})).status,422);
  await server.database.prepare("UPDATE companies SET policy=json_set(policy,'$.usageTestingEnabled',json('true')) WHERE id=?").run(client.org);
  settings=(await request(staff.cookie,admin)).body;
  const reset=await request(staff.cookie,admin,'POST',{action:'reset',expectedUpdatedAt:settings.company.updatedAt});assert.equal(reset.status,200);assert.equal(reset.body.usage.used.dailyRuns,0);
  assert.equal((await request(client.cookie,base+'usage/reset','POST',{})).status,403);
  const staffCompany=(await request(staff.cookie,'/api/portal/'+staff.org+'/state')).body.company;assert.equal(staffCompany.policy.dailyRuns,8);
 }finally{await new Promise(r=>server.close(r));fs.rmSync(dataDir,{recursive:true,force:true});}
});
