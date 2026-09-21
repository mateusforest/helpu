import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHelpuServer} from '../server.mjs';
import {knowledgeTitle,readableTerm} from '../dist/assets/labels.js';
import {createInstagramLogin} from '../portal/instagram-login.mjs';

test('preparação do Instagram expõe somente os nomes de configuração ausentes',()=>{
 const missing=createInstagramLogin({env:{HELPU_PUBLIC_URL:'https://www.helpumkt.com'}}).status();
 assert.equal(missing.available,false);assert.equal(missing.redirectUri,'https://www.helpumkt.com/api/connect/instagram/callback');
 assert.deepEqual(missing.missing,['HELPU_INSTAGRAM_APP_ID','HELPU_INSTAGRAM_APP_SECRET']);
 const ready=createInstagramLogin({env:{HELPU_PUBLIC_URL:'https://www.helpumkt.com',HELPU_INSTAGRAM_APP_ID:'123',HELPU_INSTAGRAM_APP_SECRET:'never-expose-this'}}).status();
 assert.equal(ready.available,true);assert.deepEqual(ready.missing,[]);assert.doesNotMatch(JSON.stringify(ready),/never-expose-this/);
});

test('títulos antigos e termos internos são apresentados em português',()=>{
 assert.equal(knowledgeTitle('Contexto: visualIdentity'),'Contexto: Identidade visual');
 assert.equal(knowledgeTitle('Contexto: positioning'),'Contexto: Posicionamento');
 assert.equal(knowledgeTitle('Título escrito por mim'),'Título escrito por mim');
 assert.equal(readableTerm('responses'),'Astra');
 assert.equal(readableTerm('not_configured'),'Não configurado');
});

test('configurações e segurança da conta persistem e isolam as sessões',async()=>{
 const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'helpu-account-'));
 const server=await createHelpuServer({dataDir,portalOptions:{startScheduler:false}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+server.address().port;
 const request=(route,body,cookie='',originHeader=origin)=>fetch(origin+route,{method:body?'POST':'GET',headers:{Origin:originHeader,Cookie:cookie,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,redirect:'manual'});
 const input={name:'Pessoa',email:'account@example.test',password:'test-password-123',company:'Conta QA'};
 const session=r=>r.headers.get('set-cookie').split(';')[0];
 try{
  assert.equal((await request('/api/account')).status,401);
  const a=session(await request('/api/auth/signup',input));
  const b=session(await request('/api/auth/login',input));
  assert.equal((await (await request('/api/account',null,a)).json()).security.activeSessions,2);
  assert.equal((await request('/api/account/profile',{name:'Novo nome'},a,'https://evil.example')).status,403);
  assert.equal((await request('/api/account/profile',{name:'Novo nome',email:'ignored@example.test'},a)).status,200);
  const profile=await (await request('/api/account',null,b)).json();assert.equal(profile.user.name,'Novo nome');assert.equal(profile.user.email,input.email);
  await request('/api/account/sessions/revoke',{},a);assert.equal((await request('/api/auth/me',null,b)).status,401);assert.equal((await request('/api/auth/me',null,a)).status,200);
  const c=session(await request('/api/auth/login',input));
  assert.equal((await request('/api/account/password',{currentPassword:'wrong-password-123',newPassword:'changed-password-123'},a)).status,400);
  const changed=await request('/api/account/password',{currentPassword:input.password,newPassword:'changed-password-123'},a);assert.equal(changed.status,200);
  const next=session(changed);assert.notEqual(next,a);
  assert.equal((await request('/api/auth/me',null,a)).status,401);assert.equal((await request('/api/auth/me',null,c)).status,401);assert.equal((await request('/api/auth/me',null,next)).status,200);
  assert.equal((await request('/api/auth/login',input)).status,401);assert.equal((await request('/api/auth/login',{...input,password:'changed-password-123'})).status,200);
 }finally{await server.portal.shutdown();await new Promise(r=>server.close(r));}
});

test('login oficial vincula a empresa iniciadora e impede falsificação e repetição',async()=>{
 const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'helpu-instagram-login-'));
 const external=[],operatorEnv={};let username='empresa_teste';
 const server=await createHelpuServer({dataDir,portalOptions:{startScheduler:false,operatorEnv,instagramLoginEnv:{HELPU_PUBLIC_URL:'https://helpu.example',HELPU_INSTAGRAM_APP_ID:'123',HELPU_INSTAGRAM_APP_SECRET:'app-secret'},instagramLoginFetch:async(url,options)=>{
  external.push({url:String(url),options});
  if(String(url).includes('/oauth/access_token'))return Response.json({access_token:'short-secret',user_id:'17841400000000001'});
  if(String(url).includes('/access_token?'))return Response.json({access_token:'long-secret',expires_in:5184000});
  return Response.json({user_id:'17841400000000001',username});
 }}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const request=(route,body,cookie='')=>fetch(origin+route,{method:body?'POST':'GET',headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,redirect:'manual'});
 try{
  const auth=await request('/api/auth/signup',{name:'Pessoa',email:'oauth@example.test',password:'test-password-123',company:'Empresa A'}),session=auth.headers.get('set-cookie').split(';')[0];
  const bootstrap=await (await request('/api/portal/bootstrap',null,session)).json(),org=bootstrap.companies[0].id;
  const state=await (await request('/api/portal/'+org+'/state',null,session)).json();assert.equal(state.connectionLogin.instagram.available,true);assert.doesNotMatch(JSON.stringify(state),/app-secret/);
  const start=await request('/api/portal/'+org+'/integrations/instagram/login',{},session);assert.equal(start.status,200);
  const proof=start.headers.get('set-cookie').split(';')[0],authorize=new URL((await start.json()).url);
  assert.equal(authorize.hostname,'www.instagram.com');assert.ok(authorize.searchParams.get('scope').includes('instagram_business_content_publish'));assert.equal(authorize.searchParams.get('redirect_uri'),'https://helpu.example/api/connect/instagram/callback');
  const callback='/api/connect/instagram/callback?state='+authorize.searchParams.get('state')+'&code=test-code';
  assert.match((await request(callback,null,session)).headers.get('location'),/failed/);assert.equal(external.length,0);
  const done=await request(callback,null,session+'; '+proof);assert.equal(done.status,303);assert.match(done.headers.get('location'),/connected/);assert.equal(external.length,3);
  const saved=await (await request('/api/portal/'+org+'/state',null,session)).json(),ig=saved.integrations.find(c=>c.id==='instagram');assert.equal(ig.configured,true);assert.equal(ig.identity.username,'empresa_teste');assert.equal(ig.identity.accountId,'17841400000000001');assert.doesNotMatch(JSON.stringify(saved),/long-secret|short-secret|app-secret/);
  const invalid=await fetch(origin+'/api/portal/'+org+'/integrations/instagram',{method:'PUT',headers:{Origin:origin,Cookie:session,'Content-Type':'application/json'},body:JSON.stringify({accountId:'invalid@example.test',accessToken:'replacement-token'})});
  assert.equal(invalid.status,400);const invalidBody=await invalid.json();assert.match(invalidBody.error,/ID numérico/);assert.doesNotMatch(JSON.stringify(invalidBody),/invalid@example.test|replacement-token/);
  const unchanged=(await (await request('/api/portal/'+org+'/state',null,session)).json()).integrations.find(c=>c.id==='instagram');assert.equal(unchanged.identity.accountId,'17841400000000001');assert.equal(unchanged.configured,true);
  assert.match((await request(callback,null,session+'; '+proof)).headers.get('location'),/failed/);assert.equal(external.length,3);
  operatorEnv.HELPU_OPERATOR_USER_IDS=String(bootstrap.user.id);
  assert.equal((await request('/api/portal/internal-marketing',{action:'setup',orgId:org,username:'helpumarketing',confirmed:true},session)).status,200);
  for(const accepted of [false,true]){
   const internal=await request('/api/portal/internal-marketing',{action:'connect'},session);assert.equal(internal.status,200);
   const internalUrl=new URL((await internal.json()).url),internalProof=internal.headers.get('set-cookie').split(';')[0];
   assert.deepEqual(internalUrl.searchParams.get('scope').split(','),['instagram_business_basic','instagram_business_content_publish','instagram_business_manage_insights']);
   if(accepted)username='helpumarketing';
   const response=await request('/api/connect/instagram/callback?state='+internalUrl.searchParams.get('state')+'&code=test-internal',null,session+'; '+internalProof);
   assert.equal(response.status,303);assert.match(response.headers.get('location'),accepted?/admin\.html#\/marketing/:/failed/);
   const actual=(await(await request('/api/portal/'+org+'/state',null,session)).json()).integrations.find(c=>c.id==='instagram');assert.equal(actual.identity.username,accepted?'helpumarketing':'empresa_teste');
  }
  const requestsBeforeLogout=external.length;
  const second=await request('/api/portal/'+org+'/integrations/instagram/login',{},session),auth2=new URL((await second.json()).url),proof2=second.headers.get('set-cookie').split(';')[0];
  await request('/api/auth/logout',{},session);
  assert.match((await request('/api/connect/instagram/callback?state='+auth2.searchParams.get('state')+'&code=test-code',null,proof2)).headers.get('location'),/failed/);assert.equal(external.length,requestsBeforeLogout);
 }finally{await server.portal.shutdown();await new Promise(r=>server.close(r));}
});
