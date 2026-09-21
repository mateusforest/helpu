import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {createHelpuServer} from '../server.mjs';import {testPng} from './image-fixture.mjs';
test('catálogo compartilhado: apenas admin publica, clientes veem publicados e adotam cópias privadas',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'helpu-template-test-')),env={};const app=await createHelpuServer({dataDir:dir,portalOptions:{startScheduler:false,operatorEnv:env}});await new Promise(r=>app.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+app.address().port;
 const call=async(u,url,method='GET',data)=>{const r=await fetch(origin+url,{method,headers:{Cookie:u?.cookie||'',Origin:origin,'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)});return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};};
 const signup=async name=>{const u=await call(null,'/api/auth/signup','POST',{email:name+'@example.test',name,company:name,password:'test-only-password'});const b=(await call(u,'/api/portal/bootstrap')).body;return {...u,org:b.companies[0].id,id:b.user.id};};
 try{const admin=await signup('TemplateAdmin'),client=await signup('TemplateClient'),other=await signup('TemplateOther');env.HELPU_OPERATOR_USER_IDS=String(admin.id);
 const up=await fetch(origin+'/api/portal/'+admin.org+'/files',{method:'POST',headers:{Origin:origin,Cookie:admin.cookie,'X-File-Name':'template.png'},body:testPng()});const asset=await up.json();
 const draft={action:'save',orgId:admin.org,assetId:asset.id,name:'Editorial de bebidas',sectors:['Bebidas e adegas'],description:'Produto em destaque, margem ampla e título curto',state:'draft'};
 assert.equal((await call(client,'/api/portal/template-catalog','POST',draft)).status,403);assert.equal((await call(client,'/api/portal/template-catalog?admin=1')).status,403);
 let t=(await call(admin,'/api/portal/template-catalog','POST',draft)).body;assert.equal((await call(client,'/api/portal/template-catalog')).body.templates.length,0);
 assert.ok([403,404].includes((await fetch(origin+'/api/portal/files/'+asset.id,{headers:{Cookie:client.cookie}})).status));
 t=(await call(admin,'/api/portal/template-catalog','POST',{...draft,id:t.id,version:t.version,state:'published'})).body;assert.equal((await call(client,'/api/portal/template-catalog')).body.templates.length,1);
 assert.equal((await fetch(origin+'/api/portal/files/'+asset.id,{headers:{Cookie:client.cookie}})).status,200);
 const adopted=await call(client,'/api/portal/'+client.org+'/template-catalog','POST',{id:t.id});assert.equal(adopted.status,200);assert.notEqual(adopted.body.assetId,asset.id);
 assert.equal((await call(client,'/api/portal/'+client.org+'/template-catalog','POST',{id:t.id})).body.assetId,adopted.body.assetId);
 assert.ok([403,404].includes((await call(other,'/api/portal/'+client.org+'/template-catalog','POST',{id:t.id})).status));
 assert.ok([403,404].includes((await fetch(origin+'/api/portal/files/'+adopted.body.assetId,{headers:{Cookie:other.cookie}})).status));
 const lib=(await call(client,'/api/portal/'+client.org+'/creative-library')).body;assert.equal(lib.references[0].assetId,adopted.body.assetId);
 await call(admin,'/api/portal/template-catalog','POST',{...draft,id:t.id,version:t.version,state:'archived'});assert.equal((await call(client,'/api/portal/template-catalog')).body.templates.length,0);
 assert.equal((await call(client,'/api/portal/'+client.org+'/template-catalog','POST',{id:t.id})).status,404);
 assert.equal((await fetch(origin+'/api/portal/files/'+adopted.body.assetId,{headers:{Cookie:client.cookie}})).status,200);
 }finally{await app.portal.shutdown();await new Promise(r=>app.close(r));const target=path.resolve(dir);assert.ok(target.startsWith(path.resolve(os.tmpdir())+path.sep+'helpu-template-test-'));fs.rmSync(target,{recursive:true,force:true});}
});
