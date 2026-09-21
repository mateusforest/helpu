import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';import {createDatabase,bindDatabaseScope} from '../portal/database.mjs';import {createHelpuServer} from '../server.mjs';import {createInternalMarketing} from '../portal/internal-marketing.mjs';import {createAdminClients,clientControl} from '../portal/admin-clients.mjs';import {CONSULTATION_TYPES,COMMON_BRIEF_FIELDS,REPORT_FIELDS} from '../dist/assets/consultation-schema.js';import {WEBSITE_DRAFT} from '../dist/assets/website-offer.js';
for(const postgres of [false,true])test('Admin, liberação, Pix, sites e Instagram oficial em '+(postgres?'PostgreSQL':'SQLite'),async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'helpu-admin-evolution-'));let pg,database,time=Date.parse('2026-09-21T12:00:00Z');const env={};
 if(postgres){pg=await PGlite.create({parsers:{20:Number}});await pg.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA storage; CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint);');for(const f of ['20260913113000_preserve_helpu_data.sql','20260913140000_activate_cloud_runtime.sql'])await pg.exec(fs.readFileSync(new URL('../supabase/migrations/'+f,import.meta.url),'utf8'));await pg.exec('INSERT INTO helpu.portal_migrations VALUES(1,1),(2,1),(3,1),(4,1); SET ROLE helpu_runtime;');let queued=Promise.resolve();database=createDatabase({pool:{async connect(){const before=queued;let release;queued=new Promise(r=>release=r);await before;return {async query(sql,args){const result=await pg.query(sql,args);return {...result,rowCount:result.affectedRows};},release};},async end(){}}});}
 const app=await createHelpuServer({dataDir:dir,database,portalOptions:{startScheduler:false,operatorEnv:env,assistedNow:()=>time,whatsappChatEnv:{}}});await new Promise(r=>app.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.address().port,db=app.database;
 async function req(url,who,data,method){const r=await fetch(base+url,{method:method|| (data?'POST':'GET'),headers:{Cookie:who?.cookie||'',Origin:base,'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
 const ok=async p=>{const r=await p;assert.equal(r.status,200,JSON.stringify(r.data));return r.data;};
 async function signup(name){const r=await req('/api/auth/signup',null,{name,email:name+'@example.test',password:'only-test-12345',company:name});assert.equal(r.status,201);const b=await ok(req('/api/portal/bootstrap',r));return {cookie:r.cookie,user:b.user,org:b.companies[0].id};}
 try{const op=await signup('HelpuInternal'),client=await signup('Customer'),foreign=await signup('Foreign');env.HELPU_OPERATOR_USER_IDS=String(op.user.id);
 const controlUrl='/api/portal/admin-clients?org='+client.org,financeUrl='/api/portal/finance?admin=1&org='+client.org;let control;
 await t.test('diretório restrito, edição versionada, teste sem receita e revogação efetiva',async()=>{
  assert.equal((await req(controlUrl,client)).status,403);control=(await ok(req(controlUrl,op))).control;
  let r=await ok(req(controlUrl,op,{action:'grant',version:control.version,purpose:'test',confirmed:true,end:'2026-09-30T23:59:59-03:00',reason:'Teste autorizado sem cobrança'}));control=r.control;assert.equal(control.grantActive,true);assert.equal(r.finance.paid,0);assert.equal(r.subscription,null);
  assert.equal((await ok(req('/api/portal/'+client.org+'/state',client))).company.policy.dailyMedia,'unlimited');
  await ok(req('/api/portal/'+client.org+'/company',client,{name:'Customer atualizado'},'PATCH'));
  assert.notEqual(JSON.parse((await db.prepare('SELECT policy FROM companies WHERE id=?').get(client.org)).policy).dailyMedia,'unlimited');
  assert.equal((await req(controlUrl,op,{action:'revoke',version:0,reason:'Teste de versão antiga'})).status,409);
  r=await ok(req(controlUrl,op,{action:'revoke',version:control.version,reason:'Encerrar o teste autorizado'}));control=r.control;assert.equal(control.grantActive,false);
  assert.notEqual((await ok(req('/api/portal/'+client.org+'/state',client))).company.policy.dailyMedia,'unlimited');
  assert.equal((await req(controlUrl,op,{action:'grant',version:control.version,purpose:'own',confirmed:true,end:'invalid',reason:'Data inválida deve falhar'})).status,409);
  control=(await ok(req(controlUrl,op,{action:'grant',version:control.version,purpose:'test',confirmed:true,end:new Date(time+60000).toISOString(),reason:'Validar o término automático'}))).control;
  time+=61000;assert.equal((await ok(req(controlUrl,op))).control.grantActive,false);assert.notEqual((await ok(req('/api/portal/'+client.org+'/state',client))).company.policy.dailyMedia,'unlimited');time-=61000;
  control=(await ok(req(controlUrl,op,{action:'revoke',version:control.version,reason:'Encerrar fixture de expiração'}))).control;
 });
 await t.test('arquivos administrativos exigem equipe e empresa exata, com auditoria privada',async()=>{
  const bytes=Buffer.from('%PDF-1.4\nArquivo privado de teste\n%%EOF');
  const uploaded=await fetch(base+'/api/portal/'+client.org+'/files',{method:'POST',headers:{Cookie:client.cookie,Origin:base,'Content-Type':'application/octet-stream','x-file-name':'documento.pdf'},body:bytes});assert.equal(uploaded.status,201);const asset=await uploaded.json();
  const url='/api/portal/admin-client-files/'+asset.id+'?org='+client.org;
  assert.equal((await fetch(base+url,{headers:{Cookie:client.cookie}})).status,403);
  assert.equal((await fetch(base+'/api/portal/admin-client-files/'+asset.id+'?org='+foreign.org,{headers:{Cookie:op.cookie}})).status,404);
  assert.equal((await fetch(base+'/api/portal/files/'+asset.id,{headers:{Cookie:op.cookie}})).status,404);
  const viewed=await fetch(base+url,{headers:{Cookie:op.cookie}});assert.equal(viewed.status,200);assert.deepEqual(Buffer.from(await viewed.arrayBuffer()),bytes);
  assert.ok(await db.prepare("SELECT 1 FROM audit WHERE org_id=? AND action='Arquivo consultado pela equipe'").get(client.org));
  assert.ok(!(await ok(req('/api/portal/'+client.org+'/state',client))).audit.some(a=>a.action==='Arquivo consultado pela equipe'||a.action.startsWith('Cliente:')));
 });
 await t.test('inativação impede novos trabalhos, exclusão preserva cadastro e permite reativar',async()=>{
  control=(await ok(req(controlUrl,op,{action:'suspend',version:control.version,reason:'Pausar testes da empresa'}))).control;
  const denied=await req('/api/portal/'+client.org+'/jobs',client,{kind:'agent',payload:{agent:'director'}});assert.equal(denied.status,409);
  control=(await ok(req(controlUrl,op,{action:'delete',version:control.version,confirmName:'Customer atualizado',reason:'Retirar do diretório de teste'}))).control;assert.equal(control.state,'deleted');assert.ok(await db.prepare('SELECT id FROM companies WHERE id=?').get(client.org));
  control=(await ok(req(controlUrl,op,{action:'activate',version:control.version,reason:'Retomar o cadastro de teste'}))).control;assert.equal(control.state,'active');
 });
 await t.test('Pix é privado por empresa, não quita ao cadastrar e só admin confirma',async()=>{
  const payload={action:'create',requestKey:randomUUID(),description:'Site profissional',reference:'proposta-site',competence:'2026-09',amountCents:245000,dueDate:'2026-09-30',terms:'Entrada de projeto por Pix ou boleto',paymentMethods:['pix','boleto'],pix:{key:'financeiro@example.test',beneficiary:'Helpu Teste',bank:'Banco de teste'}};
  const invoice=await ok(req(financeUrl,op,payload));assert.equal(invoice.state,'open');assert.equal((await ok(req(financeUrl,op,payload))).id,invoice.id);
  assert.equal((await req(financeUrl,op,{...payload,pix:{...payload.pix,key:'other@example.test'}})).status,409);
  const own=await ok(req('/api/portal/finance?org='+client.org,client));assert.equal(own.receivables[0].pix.key,payload.pix.key);assert.equal((await req('/api/portal/finance?org='+client.org,foreign)).status,403);
  assert.equal((await req('/api/portal/finance?org='+client.org,client,{action:'paid',id:invoice.id,version:invoice.version})).status,403);
  assert.equal((await req(financeUrl,op,{action:'paid',id:invoice.id,version:invoice.version,amountCents:invoice.amountCents,paidDate:'2026-09-21',note:'Pix recebido',bankConfirmed:false})).status,400);
  const paid=await ok(req(financeUrl,op,{action:'paid',id:invoice.id,version:invoice.version,amountCents:invoice.amountCents,paidDate:'2026-09-21',note:'Pix recebido e conferido no extrato',bankConfirmed:true}));assert.equal(paid.state,'paid');
  assert.equal((await ok(req(controlUrl,op))).finance.paid,245000);
 });
 await t.test('projeto de site percorre briefing, aceite, entrada, revisão e quitação final',async()=>{
  const url='/api/portal/'+client.org+'/consultations',admin='/api/portal/consultations-admin';
  let r=await ok(req(url,client,{action:'save',requestKey:randomUUID(),type:'website',brief:Object.fromEntries([...COMMON_BRIEF_FIELDS,...CONSULTATION_TYPES.website.fields].map(([k])=>[k,'Informação do cliente para '+k])),assetIds:[]}));
  const customer=async(action,d={})=>r=await ok(req(url,client,{id:r.id,version:r.version,action,...d}));const operator=async(action,d={})=>r=await ok(req(admin,op,{orgId:client.org,id:r.id,version:r.version,action,...d}));
  await customer('submit',{consent:true});await operator('propose',WEBSITE_DRAFT);await customer('accept_proposal',{consent:true,proposalNumber:1});await operator('payment',{confirmed:true,note:'Entrada recebida por Pix'});await operator('brief_complete',{confirmed:true});await operator('start');
  await operator('deliver',{report:Object.fromEntries(REPORT_FIELDS.map(([k])=>[k,'Prévia privada / checklist de '+k])),assetIds:[]});assert.equal((await req(url,client,{id:r.id,version:r.version,action:'complete',consent:true})).status,409);
  await operator('settle_website',{confirmed:true,note:'Saldo recebido por Pix conforme proposta'});await customer('complete',{consent:true});assert.equal(r.state,'completed');
 });
 await t.test('publicação oficial: conta exata, aprovação, isolamento, fila e confirmação sem duplicar',async()=>{
  let username='helpumarketing',published=0,containers=0;const owner=u=>String(u?.id)===String(op.user.id),access=async(org,u)=>{if(!await db.prepare('SELECT 1 FROM memberships WHERE org_id=? AND user_id=?').get(org,u.id))throw Error('not member');};
  const aid=randomUUID();await db.prepare('INSERT INTO assets(id,org_id,name,mime,size,path,created_at) VALUES(?,?,?,?,?,?,?)').run(aid,op.org,'approved.jpg','image/jpeg',100,aid+'.jpg',time);
  let approved=true;const creation={id:'creation-fixture',status:'complete',review:'approved',prompt:'Helpu oficial',caption:'Legenda final',format:'feed',assets:[{id:aid,mime:'image/jpeg'}]};
  const module=bindDatabaseScope(db,createInternalMarketing({db,operator:owner,access,adminClients:createAdminClients({db,operator:owner,now:()=>time}),creations:{get:async()=>({...creation,review:approved?'approved':'pending'}),list:async()=>({creations:[creation]})},integration:async()=>({accountId:'123',accessToken:'never-expose'}),providers:{instagramIdentity:async()=>({id:'123',username}),instagramContainer:async()=>{containers++;return {id:'container-1'};},instagramPoll:async()=>({status_code:'FINISHED'}),instagramPublish:async()=>{published++;return {id:'post-1'};},instagramVerify:async()=>({permalink:'https://www.instagram.com/p/example/'}),instagramMetrics:async()=>({observedAt:time,metrics:[{name:'reach',value:10}],unavailable:[]})},privateStorage:{signPublication:async()=> 'https://storage.example.test/approved.jpg'},queue:async(org,user,kind,payload,scheduledAt,key)=>{await db.prepare('INSERT OR IGNORE INTO jobs(id,org_id,user_id,kind,payload,scheduled_at,idempotency_key,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').run(randomUUID(),org,user,kind,JSON.stringify(payload),Date.parse(scheduledAt),key,time,time);return db.prepare('SELECT * FROM jobs WHERE org_id=? AND idempotency_key=?').get(org,key);},setJob:async(id,state,d={})=>{const old=await db.prepare('SELECT * FROM jobs WHERE id=?').get(id);await db.prepare('UPDATE jobs SET state=?,external=?,output=?,scheduled_at=? WHERE id=?').run(state,JSON.stringify(d.external||JSON.parse(old.external||'{}')),JSON.stringify(d.output||{}),d.scheduledAt||time,id);},audit:async()=>{},now:()=>time}));
  await assert.rejects(()=>module.action(client.user,{action:'setup',orgId:client.org,confirmed:true,username}),e=>e.status===403);
  await module.action(op.user,{action:'setup',orgId:op.org,confirmed:true,username});assert.equal((await clientControl(db,op.org,time)).grantActive,true);
  const d={action:'schedule',requestId:randomUUID(),creationId:creation.id,caption:creation.caption,publishAt:new Date(time+5000).toISOString(),confirmed:true};
  approved=false;await assert.rejects(()=>module.action(op.user,d),/Aprove primeiro/);approved=true;username='anotheraccount';await assert.rejects(()=>module.action(op.user,d),/exclusivamente/);username='helpumarketing';
  let j=await module.action(op.user,d);assert.equal((await module.action(op.user,d)).id,j.id);assert.equal(containers,0);assert.equal(published,0);await module.run(j);j=await db.prepare('SELECT * FROM jobs WHERE id=?').get(j.id);assert.equal(j.state,'waiting_provider');
  username='anotheraccount';await assert.rejects(()=>module.run(j),/exclusivamente/);assert.equal(published,0);username='helpumarketing';await module.run(j);j=await db.prepare('SELECT * FROM jobs WHERE id=?').get(j.id);assert.equal(j.state,'succeeded');assert.equal(published,1);
  await module.run(j);assert.equal(published,1);const listing=await module.listing(op.user);assert.equal(listing.posts[0].metrics.metrics[0].value,10);assert.ok(!JSON.stringify(listing).includes('never-expose'));
  const uncertain=await module.action(op.user,{...d,requestId:randomUUID()});await db.prepare('UPDATE jobs SET external=? WHERE id=?').run(JSON.stringify({containerId:'container-x',publishStartedAt:time}),uncertain.id);await assert.rejects(()=>module.run({...uncertain,external:JSON.stringify({containerId:'container-x',publishStartedAt:time})}),e=>e.state==='uncertain');assert.equal(published,1);
  await assert.rejects(()=>module.action(op.user,{action:'cancel',id:JSON.parse(uncertain.payload).internalPostId}));
  const canceled=await module.action(op.user,{...d,requestId:randomUUID()});await module.action(op.user,{action:'cancel',id:JSON.parse(canceled.payload).internalPostId});await assert.rejects(()=>module.run(canceled),e=>e.state==='canceled');assert.equal(published,1);
  assert.equal((await req('/api/portal/internal-marketing',client)).status,403);
  for(const who of [client,op])assert.equal((await req('/api/portal/'+who.org+'/jobs',who,{kind:'helpu_publish',payload:{internalPostId:j.id}})).status,403);
  assert.equal((await req('/api/portal/'+client.org+'/jobs',client,{kind:'publish',payload:{contentId:'fake'}})).status,409);
 });
 }finally{await app.portal.shutdown();await new Promise(r=>app.close(r));await pg?.close();const target=path.resolve(dir);assert.ok(target.startsWith(path.resolve(os.tmpdir())+path.sep+'helpu-admin-evolution-'));fs.rmSync(target,{recursive:true,force:true});}
});
