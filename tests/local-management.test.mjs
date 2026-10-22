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

for(const postgres of [false,true])test('Gestão de contas, produtos e limpeza preservando cadastros — '+(postgres?'PostgreSQL':'SQLite'),async t=>{
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
 const server=await createHelpuServer({dataDir,database,cloud:postgres,portalOptions:{storageClient:postgres?{}:undefined,startScheduler:false,operatorEnv:{HELPU_OPERATOR_USER_IDS:'1,3'},whatsappChatEnv:{},openaiEnv:{},instagramLoginEnv:{},stripeEnv:{},runtimeEnv:{},localEmailEnv:{RESEND_API_KEY:'test-only-key',HELPU_EMAIL_FROM:'Helpu <access@example.test>',HELPU_PUBLIC_URL:'https://example.test'},localEmailFetch:async(url,options)=>{assert.equal(url,'https://api.resend.com/emails');if(deliveryFails)return new Response('{}',{status:503});messages.push(JSON.parse(options.body));return new Response('{"id":"test"}');}}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,db=server.database;

 const password='Management-test-only-2026';
 async function req(route,data,cookie='',status=200){const r=await fetch(origin+route,{method:data?'POST':'GET',headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie},body:data?JSON.stringify(data):undefined});const result=await r.json();assert.equal(r.status,status,route+' '+JSON.stringify(result));return {data:result,cookie:r.headers.get('set-cookie')?.split(';')[0]};}
 const control='/api/portal/local-control',productAPI='/api/portal/local-products';
 const register=(email,sellerType='Loja')=>req('/api/local/customer/register',{email,password,name:email.split('@')[0],sellerType,phone:'54999998888'});
 const me=async cookie=>(await req('/api/local/customer/me',null,cookie)).data;
 let admin,ordinary,shop,person,adminLocal,shopBusiness,personBusiness,product;
 const snapshot=()=>db.prepare("SELECT id,data,version FROM records WHERE org_id='helpu-local-directory' AND kind IN ('local_business','local_product') ORDER BY id").all();
 const account=async(id,kind='local')=>(await req(control,null,admin)).data.accounts.find(a=>a.id===String(id)&&a.kind===kind);
 const act=async(a,action,status=200)=>req(control,{id:a.id,kind:a.kind,version:a.version,action,reason:'Verificação administrativa de teste',confirmEmail:a.email},admin,status);
 try {
  await t.test('lista empresas, pessoas físicas e marketing sem vazar credenciais; protege administradores',async()=>{
   admin=(await req('/api/auth/signup',{name:'Admin',email:'admin@example.test',password},'',201)).cookie;
   ordinary=(await req('/api/auth/signup',{name:'Cliente',email:'client@example.test',password},'',201)).cookie;
   await req('/api/auth/signup',{name:'Admin reserva',email:'second@example.test',password},'',201);
   shop=(await register('shop@example.test')).cookie;person=(await register('person@example.test','Pessoa física')).cookie;adminLocal=(await register('admin@example.test','Pessoa física')).cookie;
   shopBusiness=(await me(shop)).business;personBusiness=(await me(person)).business;
   await legacyBusiness(db,{name:'Quarto cadastro preservado'});
   await req(control,null,'',401);await req(control,null,shop,401);await req(control,null,ordinary,403);
   const list=(await req(control,null,admin)).data;assert.equal(list.accounts.length,6);
   assert.ok(!/passwordHash|salt|inviteHash|token|resetHash/.test(JSON.stringify(list)));
   assert.equal(list.accounts.filter(a=>a.protected).length,3);
   for(const a of list.accounts.filter(a=>a.protected))await act(a,'delete-account',403);
   await req(control,{action:'cleanup-preview',preserveEmail:'client@example.test'},admin,403);
  });
  await t.test('notificação chega só ao destinatário e registra leitura sem enviar e-mail',async()=>{
   const before=messages.length;
   await req(control,{action:'notify',businessId:shopBusiness.id,title:'Aviso de revisão',message:'Confira os dados antes de reenviar.'},ordinary,403);
   const n=(await req(control,{action:'notify',businessId:shopBusiness.id,title:'Aviso de revisão',message:'Confira os dados antes de reenviar.'},admin)).data.notification;
   assert.equal((await req('/api/local/customer/notifications',null,shop)).data.notifications[0].id,n.id);
   assert.equal((await req('/api/local/customer/notifications',null,person)).data.notifications.length,0);
   await req('/api/local/customer/notification-read',{id:n.id},person,404);
   await req('/api/local/customer/notification-read',{id:n.id},shop);
   assert.ok((await req(control,null,admin)).data.notifications[0].readAt);assert.equal(messages.length,before);
  });
  await t.test('bloqueio encerra sessões, barra login e recuperação e não modifica empresas',async()=>{
   const before=await snapshot(),a=await account('local-account:'+shopBusiness.id);
   const resetMessage=messages.filter(m=>m.to.includes('shop@example.test')).at(-1);
   const oldVerify=resetMessage.text.match(/#confirmar=([a-f0-9]{64})/)[1];
   await act(a,'block');await req('/api/local/customer/me',null,shop,401);
   await req('/api/local/customer/login',{email:a.email,password},'',403);
   await req('/api/local/customer/verify-email',{token:oldVerify},'',400);
   await req('/api/portal/local-admin',{action:'invite',id:shopBusiness.id,email:a.email},admin,403);
   await act(await account(a.id),'unblock');await req('/api/local/customer/me',null,shop,401);
   shop=(await req('/api/local/customer/login',{email:a.email,password})).cookie;
   assert.deepEqual(await snapshot(),before);
   const general=await account('2','general');await act(general,'block');
   await req('/api/auth/me',null,ordinary,401);await req('/api/auth/login',{email:general.email,password},'',403);
   await act(await account('2','general'),'unblock');await req('/api/auth/me',null,ordinary,401);
   ordinary=(await req('/api/auth/login',{email:general.email,password})).cookie;
  });
  await t.test('exclusão do produto é reversível e restauração exige nova revisão',async()=>{
   product=(await req('/api/local/customer/products',{title:'Item usado',description:'Item usado de exemplo para revisão completa.',city:'Vacaria',phone:'54999998888',category:'Eletrônicos',condition:'Usado',priceCents:150000,photos:[],submit:true},person)).data;
   product=(await req(productAPI,{id:product.id,version:product.version,state:'Publicado'},admin)).data;
   const original={...product};
   await req(productAPI,{id:product.id,version:product.version,action:'delete',reason:'Remoção de teste'},ordinary,403);
   product=(await req(productAPI,{id:product.id,version:product.version,action:'delete',reason:'Remoção de teste'},admin)).data;
   assert.equal((await req('/api/local/products')).data.products.length,0);
   await req('/api/local/customer/product-state',{id:product.id,version:product.version,state:'Em análise'},person,404);
   await req('/api/local/customer/products',{...original,version:product.version},person,404);
   await req(productAPI,{id:product.id,version:product.version,state:'Publicado'},admin,409);
   product=(await req(productAPI,{id:product.id,version:product.version,action:'restore',reason:'Restauração de teste'},admin)).data;
   assert.equal(product.state,'Rascunho');assert.equal(product.approved,false);
   await req(productAPI,{id:product.id,version:product.version,state:'Publicado'},admin,409);
   product=(await req('/api/local/customer/product-state',{id:product.id,version:product.version,state:'Em análise'},person)).data;
   product=(await req(productAPI,{id:product.id,version:product.version,state:'Publicado'},admin)).data;
   assert.equal((await req('/api/local/products')).data.products.length,1);
  });
  await t.test('restaurar item vendido não reabre a venda nem publica automaticamente',async()=>{
   let sold=(await req('/api/local/customer/products',{title:'Item encerrado',description:'Exemplo vendido que deve continuar encerrado.',city:'Vacaria',phone:'54999998888',category:'Eletrônicos',condition:'Usado',priceCents:100,photos:[],submit:true},person)).data;
   sold=(await req(productAPI,{id:sold.id,version:sold.version,state:'Publicado'},admin)).data;
   sold=(await req('/api/local/customer/product-state',{id:sold.id,version:sold.version,state:'Vendido'},person)).data;
   const soldAt=sold.soldAt;
   sold=(await req(productAPI,{id:sold.id,version:sold.version,action:'delete',reason:'Arquivar venda encerrada'},admin)).data;
   sold=(await req(productAPI,{id:sold.id,version:sold.version,action:'restore',reason:'Consultar venda encerrada'},admin)).data;
   assert.equal(sold.state,'Vendido');assert.equal(sold.soldAt,soldAt);assert.equal(sold.approved,false);
   await req('/api/local/customer/product-state',{id:sold.id,version:sold.version,state:'Em análise'},person,409);
   assert.ok(!(await req('/api/local/products')).data.products.some(p=>p.id===sold.id));
  });
  await t.test('limpeza recusa lista desatualizada e reverte tudo se há execução pendente',async()=>{
   const preview=(await req(control,{action:'cleanup-preview',preserveEmail:'admin@example.test'},admin)).data;
   assert.equal(preview.businesses.length,4);assert.equal(preview.remove.length,3);
   await act(await account('2','general'),'block');
   await req(control,{action:'cleanup',preserveEmail:preview.preserveEmail,digest:preview.digest,confirm:'EXCLUIR CONTAS'},admin,409);
   const jobOrg=(await db.prepare('SELECT org_id FROM memberships WHERE user_id=2').get()).org_id;
   await db.prepare("INSERT INTO jobs(id,org_id,user_id,kind,payload,state,scheduled_at,idempotency_key,created_at,updated_at) VALUES(?,?,2,'test','{}','queued',0,'cleanup-test',0,0)").run('cleanup-job',jobOrg);
   const p=(await req(control,{action:'cleanup-preview',preserveEmail:'admin@example.test'},admin)).data;
   await req(control,{action:'cleanup',preserveEmail:p.preserveEmail,digest:p.digest,confirm:'EXCLUIR CONTAS'},admin,409);
   assert.equal((await req(control,null,admin)).data.accounts.length,6);
   await db.prepare("UPDATE jobs SET state='done' WHERE id='cleanup-job'").run();
  });
  await t.test('limpeza remove somente contas revisadas e preserva byte a byte quatro cadastros e produtos',async()=>{
   const before=await snapshot(),assets=await db.prepare('SELECT * FROM assets ORDER BY id').all();
   const p=(await req(control,{action:'cleanup-preview',preserveEmail:'admin@example.test'},admin)).data;
   const result=(await req(control,{action:'cleanup',preserveEmail:p.preserveEmail,digest:p.digest,confirm:'EXCLUIR CONTAS'},admin)).data;
   assert.equal(result.removed,3);assert.equal(result.businessesPreserved,4);
   assert.deepEqual(await snapshot(),before);assert.deepEqual(await db.prepare('SELECT * FROM assets ORDER BY id').all(),assets);
   assert.equal((await req(control,null,admin)).data.accounts.length,3);
   await req('/api/local/customer/me',null,shop,401);await req('/api/local/customer/me',null,person,401);
   await req('/api/auth/me',null,ordinary,401);await req('/api/auth/me',null,admin);
   await me(adminLocal);await req('/api/local/customer/login',{email:'shop@example.test',password},'',401);
   assert.equal((await db.prepare("SELECT user_id FROM jobs WHERE id='cleanup-job'").get()).user_id,null);
   assert.equal((await req('/api/local/products')).data.products.length,1);
   // Removed email is reusable; it cannot acquire the preserved business automatically.
   const fresh=(await register('shop@example.test')).cookie;assert.notEqual((await me(fresh)).business.id,shopBusiness.id);
  });
 }finally{await server.portal.shutdown();await new Promise(r=>server.close(r));if(pg)await pg.close();if(priorKey===undefined)delete process.env.HELPU_INTEGRATION_KEY;else process.env.HELPU_INTEGRATION_KEY=priorKey;fs.rmSync(dataDir,{recursive:true,force:true});}
});
