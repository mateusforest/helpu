import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {createDatabase} from '../portal/database.mjs';
import {createHelpuServer} from '../server.mjs';
import {legacyBusiness} from './local-legacy-fixture.mjs';

for(const postgres of [false,true])test('Cadastro unificado, páginas e e-mail — '+(postgres?'PostgreSQL':'SQLite'),async t=>{
 const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'helpu-onboarding-')),messages=[];
 const priorKey=process.env.HELPU_INTEGRATION_KEY;process.env.HELPU_INTEGRATION_KEY=randomBytes(32).toString('base64');
 let pg,database,deliveryFails=false;
 if(postgres){
  pg=await PGlite.create({parsers:{20:Number}});
  await pg.exec('CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA storage;CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint);');
  for(const file of ['20260913113000_preserve_helpu_data.sql','20260913140000_activate_cloud_runtime.sql'])await pg.exec(fs.readFileSync(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
  await pg.exec('INSERT INTO helpu.portal_migrations VALUES(1,1),(2,1),(3,1),(4,1);SET ROLE helpu_runtime;');
  let queued=Promise.resolve();database=createDatabase({pool:{async connect(){const previous=queued;let release;queued=new Promise(r=>release=r);await previous;return {async query(sql,args){const result=await pg.query(sql,args);return {...result,rowCount:result.affectedRows};},release};},async end(){}}});
 }
 const server=await createHelpuServer({dataDir,database,cloud:postgres,portalOptions:{storageClient:postgres?{}:undefined,startScheduler:false,operatorEnv:{HELPU_OPERATOR_USER_IDS:'1'},whatsappChatEnv:{},openaiEnv:{},instagramLoginEnv:{},stripeEnv:{},runtimeEnv:{},localEmailEnv:{RESEND_API_KEY:'test-only-key',HELPU_EMAIL_FROM:'Helpu <access@example.test>',HELPU_PUBLIC_URL:'https://example.test'},localEmailFetch:async(url,options)=>{assert.equal(url,'https://api.resend.com/emails');if(deliveryFails)return new Response('{}',{status:503});messages.push(JSON.parse(options.body));return new Response('{"id":"test"}');}}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,db=server.database;
 const password='Onboarding-only-test-2026',registration={name:'Empresa autônoma',phone:'54999998888',sellerType:'Loja',password,email:'company@example.test',sector:'Tecnologia'};
 async function req(route,data,cookie='',status=200){const response=await fetch(origin+route,{method:data?'POST':'GET',headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie},body:data?JSON.stringify(data):undefined});const body=await response.json();assert.equal(response.status,status,route+' '+JSON.stringify(body));return {data:body,cookie:response.headers.get('set-cookie')?.split(';')[0],headers:response.headers};}
 const me=async c=>(await req('/api/local/customer/me',null,c)).data;
 const businesses=async()=>(await req('/api/local/businesses')).data.businesses;
 const mailToken=kind=>messages.filter(m=>m.text.includes('#'+kind+'=')).at(-1).text.match(new RegExp('#'+kind+'=([a-f0-9]{64})'))[1];
 let admin,ordinary,shop,person,invited;
 const profile={name:'Empresa autônoma',description:'Descrição pública da empresa com atendimento local.',publicPhone:'54999998888',address:'Vacaria',hours:'Segunda a sexta',offer:'Serviços',photos:[],catalog:[],sector:'Tecnologia'};
 async function submit(c,fields={}){const b=(await me(c)).business;await req('/api/local/customer/profile',{...profile,version:b.version,publish:true,...fields},c);return (await me(c)).business;}
 async function moderate(b,state='Publicado',reason=''){return (await req('/api/portal/local-admin',{action:'moderate',id:b.id,version:b.version,state,reason},admin)).data;}
 try{
  await t.test('cadastro cria sessão e página comercial; pessoa física usa o mesmo acesso',async()=>{
   admin=(await req('/api/auth/signup',{name:'Admin',email:'admin@example.test',password},'',201)).cookie;
   ordinary=(await req('/api/auth/signup',{name:'Comum',email:'ordinary@example.test',password},'',201)).cookie;
   const created=await req('/api/local/customer/register',registration);shop=created.cookie;
   assert.match(created.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/);if(postgres)assert.match(created.headers.get('set-cookie'),/Secure/);
   const dashboard=await me(shop);assert.equal(dashboard.business.productsOnly,false);assert.equal(dashboard.business.state,'Rascunho');assert.equal(dashboard.emailVerified,false);assert.equal(dashboard.emailEnabled,true);
   assert.equal(messages.length,1);assert.equal((await businesses()).length,0);
   person=(await req('/api/local/customer/register',{...registration,sellerType:'Pessoa física',email:'person@example.test'})).cookie;
   assert.equal((await me(person)).business.productsOnly,true);
   await req('/api/local/customer/profile',profile,person,403);
   await req('/api/local/customer/register',{...registration,email:'COMPANY@EXAMPLE.TEST'},'',409);
   await req('/api/local/apply',{name:'Pedido antigo'},'',410);
   await req('/api/portal/local-admin',{action:'create',name:'Cadastro assistido'},admin,410);
   await req('/api/portal/local-admin',null,shop,401);
  });
  await t.test('rascunho, rejeição, correção, aprovação e pausa têm a mesma regra dos produtos',async()=>{
   await submit(shop,{description:'',publish:false});assert.equal((await me(shop)).business.state,'Rascunho');
   await req('/api/local/customer/profile',{...profile,description:'curta',version:(await me(shop)).business.version,publish:true},shop,400);
   let b=await submit(shop,{state:'Publicado',approval:true});assert.equal(b.state,'Em análise');assert.equal((await businesses()).length,0);
   await req('/api/portal/local-admin',{action:'moderate',id:b.id,version:b.version,state:'Publicado'},person,401);
   await req('/api/portal/local-admin',{action:'moderate',id:b.id,version:b.version,state:'Publicado'},ordinary,403);
   await req('/api/portal/local-admin',{action:'moderate',id:b.id,version:b.version,state:'Rejeitado'},admin,400);
   b=await moderate(b,'Rejeitado','Detalhe os serviços.');assert.equal((await me(shop)).business.moderationReason,'Detalhe os serviços.');
   await req('/api/portal/local-admin',{action:'moderate',id:b.id,version:b.version,state:'Publicado'},admin,409);
   b=await submit(shop);await moderate(b);assert.equal((await businesses()).length,1);
   const published=(await me(shop)).business;
   await req('/api/local/customer/profile',{...profile,version:published.version-1,publish:true},shop,409);
   await req('/api/local/customer/business-pause',{version:published.version},shop);assert.equal((await businesses()).length,0);
   b=(await me(shop)).business;assert.equal(b.state,'Pausado');await req('/api/portal/local-admin',{action:'moderate',id:b.id,version:b.version,state:'Publicado'},admin,409);
   b=await submit(shop);await moderate(b);await submit(shop,{name:'Nome em rascunho',publish:false});assert.equal((await businesses()).length,0);
   b=await submit(shop);await moderate(b);assert.equal((await businesses()).length,1);
  });
  await t.test('produtos continuam independentes e mudanças pendentes não alteram o nome aprovado do vendedor',async()=>{
   const p=(await req('/api/local/customer/products',{title:'Computador novo',description:'Computador novo de teste para cadastro unificado.',category:'Eletrônicos',condition:'Novo',priceCents:150000,city:'Vacaria',phone:'54999998888',photos:[],submit:true},shop)).data;
   await req('/api/portal/local-products',{id:p.id,version:p.version,state:'Publicado'},admin);
   await submit(shop,{name:'Nome ainda não aprovado',publish:false});
   assert.equal((await req('/api/local/products')).data.products[0].sellerName,'Empresa autônoma');
  });
  if(!postgres)await t.test('trocar fotos retira mídia antiga e libera apenas as novas após revisão',async()=>{
   const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jG0kAAAAASUVORK5CYII=','base64');
   const upload=async c=>{const r=await fetch(origin+'/api/local/customer/photo',{method:'POST',headers:{Origin:origin,Cookie:c,'Content-Type':'image/png','X-File-Name':'example.png'},body:bytes});assert.equal(r.status,201);return (await r.json()).id;};
   const first=await upload(shop),second=await upload(shop),foreign=await upload(person);
   await req('/api/local/customer/profile',{...profile,version:(await me(shop)).business.version,photos:[foreign],publish:true},shop,404);
   let b=await submit(shop,{photos:[first]});await moderate(b);let publicPage=(await businesses()).find(x=>x.id===b.id);assert.equal(publicPage.photos.length,1);const oldUrl=publicPage.photos[0];assert.equal((await fetch(origin+oldUrl)).status,200);
   b=await submit(shop,{photos:[second]});assert.equal((await fetch(origin+oldUrl)).status,404);assert.ok(!(await businesses()).some(x=>x.id===b.id));
   await moderate(b);publicPage=(await businesses()).find(x=>x.id===b.id);assert.ok(publicPage.photos[0].includes(second));assert.ok(!publicPage.photos.some(x=>x.includes(first)));assert.equal((await fetch(origin+publicPage.photos[0])).status,200);assert.equal((await fetch(origin+oldUrl)).status,404);
  });
  await t.test('convite antigo e loja cadastrada como productsOnly migram sem duplicar conta',async()=>{
   const b=await legacyBusiness(db,{name:'Loja antiga',productsOnly:true,sellerType:'Loja'});
   const invitation=(await req('/api/portal/local-admin',{action:'invite',id:b.id,email:'legacy@example.test'},admin)).data;
   const token=new URL(invitation.url).hash.slice(8);invited=(await req('/api/local/customer/activate',{token,password})).cookie;
   await req('/api/local/customer/activate',{token,password},'',400);
   const dashboard=await me(invited);assert.equal(dashboard.business.id,b.id);assert.equal(dashboard.business.productsOnly,false);
   const pending=await submit(invited,{name:'Loja antiga'});assert.equal(pending.state,'Em análise');assert.ok(!(await businesses()).some(x=>x.id===b.id));await moderate(pending);
   const other=(await me(shop)).business;
   await submit(invited,{id:other.id,businessId:other.id,name:'Loja antiga atualizada',publish:false});assert.equal((await me(shop)).business.name,other.name);
  });
  await t.test('confirmação usa token único, expira e não expõe tokens ao portal',async()=>{
   await req('/api/local/customer/resend-verification',{},shop);const token=mailToken('confirmar');
   assert.ok(!JSON.stringify(await me(shop)).includes(token));
   await req('/api/local/customer/verify-email',{token});assert.equal((await me(shop)).emailVerified,true);
   await req('/api/local/customer/verify-email',{token},'',400);
   await req('/api/local/customer/resend-verification',{},person);const expired=mailToken('confirmar');
   const id='local-account:'+(await me(person)).business.id;
   const record=JSON.parse((await db.prepare('SELECT data FROM records WHERE id=?').get(id)).data);await db.prepare('UPDATE records SET data=? WHERE id=?').run(JSON.stringify({...record,verifyExpires:0}),id);
   await req('/api/local/customer/verify-email',{token:expired},'',400);
  });
  await t.test('recuperação não revela contas, expira, revoga sessões e rejeita reutilização',async()=>{
   const known=await req('/api/local/customer/forgot-password',{email:registration.email}),unknown=await req('/api/local/customer/forgot-password',{email:'unknown@example.test'});assert.deepEqual(known.data,unknown.data);
   let token=mailToken('redefinir');const id='local-account:'+(await me(shop)).business.id;
   const stored=JSON.parse((await db.prepare('SELECT data FROM records WHERE id=?').get(id)).data);assert.notEqual(stored.resetHash,token);assert.ok(!JSON.stringify(stored).includes(token));
   await db.prepare('UPDATE records SET data=? WHERE id=?').run(JSON.stringify({...stored,resetExpires:0}),id);
   await req('/api/local/customer/reset-password',{token,password:password+'new'},'',400);
   await req('/api/local/customer/forgot-password',{email:registration.email});token=mailToken('redefinir');
   await req('/api/local/customer/reset-password',{token,password:'short'},'',400);
   await req('/api/local/customer/reset-password',{token,password:password+'new'});
   await req('/api/local/customer/reset-password',{token,password:password+'other'},'',400);
   await req('/api/local/customer/me',null,shop,401);await req('/api/local/customer/login',{email:registration.email,password},'',401);
   shop=(await req('/api/local/customer/login',{email:registration.email,password:password+'new'})).cookie;assert.equal((await me(shop)).emailVerified,true);
   await req('/api/local/customer/forgot-password',{email:registration.email});token=mailToken('redefinir');
   await req('/api/local/customer/password',{currentPassword:password+'new',password:password+'changed'},shop);
   await req('/api/local/customer/reset-password',{token,password},'',400);
  });
  await t.test('falha do serviço de e-mail não perde cadastro; reenvio informa erro e limita tentativas',async()=>{
   deliveryFails=true;const c=(await req('/api/local/customer/register',{...registration,email:'delivery@example.test'})).cookie;
   assert.equal((await me(c)).emailVerified,false);
   await req('/api/local/customer/resend-verification',{},c,503);
   const generic=await req('/api/local/customer/forgot-password',{email:'delivery@example.test'});assert.equal(generic.data.ok,true);
   deliveryFails=false;await req('/api/local/customer/resend-verification',{},c);
   await req('/api/local/customer/resend-verification',{},c,429);
   const token=mailToken('confirmar');await req('/api/local/customer/verify-email',{token});assert.equal((await me(c)).emailVerified,true);
  });
 }finally{await server.portal.shutdown();await new Promise(r=>server.close(r));if(pg)await pg.close();fs.rmSync(dataDir,{recursive:true,force:true});if(priorKey===undefined)delete process.env.HELPU_INTEGRATION_KEY;else process.env.HELPU_INTEGRATION_KEY=priorKey;}
});
