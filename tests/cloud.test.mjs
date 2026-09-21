import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomBytes,randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {createDatabase,postgresQuery} from '../portal/database.mjs';
import {createStorage} from '../portal/storage.mjs';
import {createHelpuServer} from '../server.mjs';
import {runCloudWorker} from '../portal/cloud-worker.mjs';

test('PostgreSQL runtime: private schema, sessions, tenants, files, jobs and restart',async t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'helpu-cloud-test-'));
 const pg=await PGlite.create({parsers:{20:Number}});
 const failures=[];let server,origin,cookie='';
 const previousKey=process.env.HELPU_INTEGRATION_KEY;
 process.env.HELPU_INTEGRATION_KEY=randomBytes(32).toString('base64');
 await pg.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA storage; CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint);");
 for(const file of ['20260913113000_preserve_helpu_data.sql','20260913140000_activate_cloud_runtime.sql'])await pg.exec(fs.readFileSync(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
 await pg.exec('INSERT INTO helpu.portal_migrations VALUES(1,1),(2,1),(3,1),(4,1); SET ROLE helpu_runtime;');
 let queued=Promise.resolve();
 const pool={async connect(){const prior=queued;let release;queued=new Promise(r=>{release=r;});await prior;return {async query(sql,args){try{const result=await pg.query(sql,args);return {...result,rowCount:result.affectedRows};}catch(error){failures.push({sql,error:error.message});throw error;}},release};},async end(){}};
 const database=createDatabase({pool});
 const objects=new Map();
 const storage=createStorage({url:'https://storage.example.test',key:'TEST-ONLY-KEY',directory:path.join(directory,'cache'),fetcher:async(url,options)=>{
   assert.equal(options.headers.Authorization,'Bearer TEST-ONLY-KEY');const key=new URL(url).pathname;
   if(options.method==='POST'&&key.includes('/upload/sign/'))return Response.json({url:key.replace('/storage/v1','')+'?token=TEST-ONLY-SIGNED-TOKEN'});
   if(options.method==='POST'){assert.ok(!objects.has(key));objects.set(key,Buffer.from(options.body));return new Response('{}',{status:200});}
   return new Response(objects.get(key)||null,{status:objects.has(key)?200:404});
 }});
 const providers={text:async()=>({pieces:[{title:'TEST ONLY existing draft',caption:'TEST ONLY factual text',visualPrompt:'TEST ONLY brief',format:'image',channel:'instagram'}],summary:'TEST ONLY',questions:[],recommendations:[]})};
 const open=async()=>{server=await createHelpuServer({dataDir:directory,database,cloud:true,portalOptions:{startScheduler:false,storageClient:storage,providers,instagramLoginEnv:{HELPU_PUBLIC_URL:"https://helpu.example",HELPU_INSTAGRAM_APP_ID:"123",HELPU_INSTAGRAM_APP_SECRET:"test-only"},stripeEnv:{STRIPE_SECRET_KEY:"sk_test_cloud",STRIPE_PRICE_ID:"price_cloud",HELPU_PUBLIC_URL:"https://helpu.example"},stripeFetch:async(url)=>{const route=new URL(url).pathname;if(route.endsWith("/prices/price_cloud"))return Response.json({id:"price_cloud",active:true,type:"recurring",billing_scheme:"per_unit",unit_amount:1000,currency:"brl",recurring:{interval:"month",usage_type:"licensed"},product:{name:"Teste"}});if(route.endsWith("/customers"))return Response.json({id:"cus_cloud"});if(route.endsWith("/checkout/sessions"))return Response.json({data:[],id:"cs_cloud",url:"https://checkout.stripe.com/c/pay/test_cloud"});return Response.json({data:[]});}}});await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;};
 const request=async(route,method='GET',body,session=cookie)=>{const response=await fetch(origin+route,{method,headers:{Origin:origin,Cookie:session,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:response.status,headers:response.headers,body:await response.json()};};
 const close=async()=>{await server.portal.shutdown();await new Promise(r=>server.close(r));};
 let org,asset,content;
 try{
  await open();
  await t.test('schema has no anonymous access; authenticated sessions use PostgreSQL',async()=>{
   const permissions=await pg.query("SELECT has_schema_privilege('anon','helpu','USAGE') AS allowed");assert.equal(permissions.rows[0].allowed,false);
   assert.equal((await request('/api/auth/me')).status,401);
   const signup=await request('/api/auth/signup','POST',{name:'TEST ONLY',company:'TEST ONLY CLOUD',email:'cloud@example.test',password:'test-only-password-123'});assert.equal(signup.status,201,JSON.stringify(failures));cookie=signup.headers.get('set-cookie').split(';')[0];
   const bootstrap=await request('/api/portal/bootstrap');assert.equal(bootstrap.status,200,JSON.stringify(failures));org=bootstrap.body.companies[0].id;
   const login=await request('/api/auth/login','POST',{email:'CLOUD@EXAMPLE.TEST',password:'test-only-password-123'});assert.equal(login.status,200);cookie=login.headers.get('set-cookie').split(';')[0];
  });
  await t.test('conta, estado OAuth e faturamento persistem no PostgreSQL',async()=>{
   assert.equal((await request('/api/account')).status,200);
   assert.equal((await request('/api/account/profile','POST',{name:'Nome atualizado'})).status,200);
   assert.equal((await request('/api/account')).body.user.name,'Nome atualizado');
   const ig=await request('/api/portal/'+org+'/integrations/instagram/login','POST',{});assert.equal(ig.status,200,JSON.stringify(failures));
   const cancelled=await fetch(origin+'/api/connect/instagram/callback?error=access_denied&state='+new URL(ig.body.url).searchParams.get('state'),{headers:{Cookie:ig.headers.get('set-cookie').split(';')[0]},redirect:'manual'});assert.equal(cancelled.status,303);assert.match(cancelled.headers.get('location'),/cancelled/,JSON.stringify(failures));
   assert.equal((await request('/api/portal/'+org+'/billing')).status,200,JSON.stringify(failures));
   assert.equal((await request('/api/portal/'+org+'/billing/checkout','POST',{})).status,200,JSON.stringify(failures));
   const change=await request('/api/account/password','POST',{currentPassword:'test-only-password-123',newPassword:'new-cloud-password-123'});assert.equal(change.status,200,JSON.stringify(failures));cookie=change.headers.get('set-cookie').split(';')[0];
   assert.equal((await request('/api/account')).body.security.activeSessions,1);
  });
  await t.test('same tenant records and creative operation survive cloud reads',async()=>{
   assert.equal((await request('/api/portal/'+org+'/company','PATCH',{profile:{description:'TEST ONLY business',audience:'TEST ONLY audience'}})).status,200,JSON.stringify(failures));
   const queued=await request('/api/portal/'+org+'/jobs','POST',{kind:'agent',payload:{agent:'creative',brief:'TEST ONLY'},idempotencyKey:'test-cloud-once'});assert.equal(queued.status,201,JSON.stringify(failures));
   const duplicate=await request('/api/portal/'+org+'/jobs','POST',{kind:'agent',payload:{agent:'creative',brief:'TEST ONLY'},idempotencyKey:'test-cloud-once'});assert.equal(duplicate.body.id,queued.body.id);
   await server.portal.tick();
   const state=await request('/api/portal/'+org+'/state');assert.equal(state.status,200,JSON.stringify(failures));assert.equal(state.body.records.content.length,1,JSON.stringify(failures));content=state.body.records.content[0];
   const preflight=await request('/api/portal/'+org+'/studio/'+content.id+'/preflight','POST',{});assert.equal(preflight.status,200,JSON.stringify(failures));assert.equal(preflight.body.state,'blocked_missing_brand_assets');
   assert.equal((await request('/api/portal/'+org+'/studio/'+content.id)).body.sourceJobId,queued.body.id);
  });
  await t.test('private file persists with hash and another company cannot read it',async()=>{
   const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlS8AAAAASUVORK5CYII=','base64');
   const upload=await fetch(origin+'/api/portal/'+org+'/files',{method:'POST',headers:{Origin:origin,Cookie:cookie,'x-file-name':'test-only.png'},body:bytes});assert.equal(upload.status,201,JSON.stringify(failures));asset=await upload.json();
   const file=await fetch(origin+asset.url,{headers:{Cookie:cookie}});assert.equal(file.status,200,JSON.stringify(failures));assert.deepEqual(Buffer.from(await file.arrayBuffer()),bytes);
   const signup=await request('/api/auth/signup','POST',{name:'TEST OTHER',company:'TEST OTHER',email:'other@example.test',password:'test-only-password-456'},'');const other=signup.headers.get('set-cookie').split(';')[0];
   assert.equal((await request('/api/portal/'+org+'/state','GET',undefined,other)).status,404);
   assert.equal((await fetch(origin+asset.url,{headers:{Cookie:other}})).status,404);
   const row=await database.prepare('SELECT sha256,storage_path FROM assets WHERE id=?').get(asset.id);assert.match(row.sha256,/^[a-f0-9]{64}$/);assert.ok(row.storage_path.startsWith(org+'/'));
  });
  await t.test('cold start preserves login, existing content and verified file',async()=>{
   await close();await open();assert.equal((await request('/api/auth/me')).status,200);
   const state=await request('/api/portal/'+org+'/state');assert.equal(state.status,200,JSON.stringify(failures));assert.equal(state.body.records.content[0].id,content.id);
   assert.equal((await fetch(origin+asset.url,{headers:{Cookie:cookie}})).status,200);
   const channels=await server.portal.conversation.browser.list(org);assert.ok(channels.every(x=>x.blocker.code==='blocked_persistent_browser_required'&&!x.operationalReady));
  });
  await t.test('direct uploads validate the stored file and complete idempotently',async()=>{
   const uploadId=randomUUID(),bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlS8AAAAASUVORK5CYII=','base64');
   const prepared=await request('/api/portal/'+org+'/files/prepare','POST',{uploadId,name:'direct-test.png',size:bytes.length});assert.equal(prepared.status,200,JSON.stringify(failures));assert.equal(prepared.body.mode,'direct');assert.ok(!prepared.body.url.includes('TEST-ONLY-KEY'));
   const object=new URL(prepared.body.url).pathname.replace('/upload/sign/','/');objects.set(object,bytes);
   const completed=await request('/api/portal/'+org+'/files/complete','POST',{uploadId});assert.equal(completed.status,201,JSON.stringify(failures));
   const classified=await request('/api/portal/'+org+'/creative-library','POST',{action:'classify',assetId:completed.body.id,role:'reference'});assert.equal(classified.status,200,JSON.stringify(failures));assert.ok((await request('/api/portal/'+org+'/creative-library')).body.references.some(r=>r.assetId===completed.body.id));
   const repeated=await request('/api/portal/'+org+'/files/complete','POST',{uploadId});assert.equal(repeated.status,200);assert.equal(completed.body.id,repeated.body.id);
   assert.equal((await request('/api/portal/'+org+'/files/complete','POST',{uploadId:randomUUID()})).status,404);
  });
  await t.test('one persisted worker lease prevents concurrent execution and releases after completion',async()=>{
   let enter,release,runs=0;const entered=new Promise(r=>{enter=r;}),gate=new Promise(r=>{release=r;});
   const app={database,portal:{tick:async()=>{runs++;enter();await gate;}}};
   const first=runCloudWorker(app,{enabled:true});await entered;
   try{assert.equal((await runCloudWorker(app,{enabled:true})).state,'already_running');assert.equal(runs,1);}finally{release();await first;}
   const lease=await database.prepare('SELECT expires_at,last_completed_at FROM worker_leases WHERE id=?').get('operating-kernel');assert.equal(lease.expires_at,0);assert.ok(lease.last_completed_at);
   assert.equal((await runCloudWorker(app,{enabled:false})).state,'disabled');assert.equal(runs,1);
  });
  assert.deepEqual(failures,[]);
 }finally{if(server?.listening)await close();await pg.close();if(previousKey===undefined)delete process.env.HELPU_INTEGRATION_KEY;else process.env.HELPU_INTEGRATION_KEY=previousKey;fs.rmSync(directory,{recursive:true,force:true});}
});

test('PostgreSQL parameters preserve literals and JSON values',()=>{
 assert.equal(postgresQuery("SELECT '?' AS literal FROM users WHERE id=?"),"SELECT '?' AS literal FROM helpu.users WHERE id=$1");
 assert.equal(postgresQuery("UPDATE jobs SET payload=json_set(payload,'$.operationId',?) WHERE id=?"),"UPDATE helpu.jobs SET payload=helpu.json_set(payload,'$.operationId',$1::text) WHERE id=$2");
});
