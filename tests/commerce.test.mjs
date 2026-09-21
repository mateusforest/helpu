import test from 'node:test';
import {testPng} from './image-fixture.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {createDatabase} from '../portal/database.mjs';
import {createHelpuServer} from '../server.mjs';
const stamp=Date.parse('2026-09-21T12:00:00Z');
for(const postgres of [false,true])test('Contratação e saldo em '+(postgres?'PostgreSQL':'SQLite'),async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'helpu-commerce-'));let pg,database,previewEnabled=false;const env={};
 if(postgres){pg=await PGlite.create({parsers:{20:Number}});await pg.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA storage; CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint);');for(const file of ['20260913113000_preserve_helpu_data.sql','20260913140000_activate_cloud_runtime.sql'])await pg.exec(fs.readFileSync(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));await pg.exec('INSERT INTO helpu.portal_migrations VALUES(1,1),(2,1),(3,1),(4,1); SET ROLE helpu_runtime;');let queued=Promise.resolve();database=createDatabase({pool:{async connect(){const prior=queued;let release;queued=new Promise(r=>release=r);await prior;return {async query(sql,args){const result=await pg.query(sql,args);return {...result,rowCount:result.affectedRows};},release};},async end(){}}});}
 const app=await createHelpuServer({dataDir:dir,database,portalOptions:{reelsRenderer:{configured:()=>true,reviewPreview:async()=>{if(!previewEnabled)throw Error('Preview unavailable');return testPng(8,8);}},startScheduler:false,operatorEnv:env,assistedNow:()=>stamp,whatsappChatEnv:{},openaiEnv:{OPENAI_API_KEY:'fake-commerce-key'}}});await new Promise(r=>app.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+app.address().port,db=app.database;
 async function request(url,who,body,foreign=false){const res=await fetch(origin+url,{method:body?'POST':'GET',headers:{Cookie:who?.cookie||'',Origin:foreign?'https://evil.example':origin,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:res.status,body:await res.json(),cookie:res.headers.get('set-cookie')?.split(';')[0]};}
 async function signup(name){const s=await request('/api/auth/signup',null,{name,email:name+'@example.test',password:'only-test-12345',company:name});assert.equal(s.status,201);const b=await request('/api/portal/bootstrap',s);return {cookie:s.cookie,user:b.body.user,org:b.body.companies[0].id};}
 const ok=async p=>{const r=await p;assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};let operator,client,other,r;
 const url=(who=client,admin=false)=>'/api/portal/commerce?org='+who.org+'&admin='+(admin?'1':'0');
 const act=(input,who=client,admin=false)=>request(url(client,admin),who,input);
 const fresh=()=>({format:'feed',prompt:'Apresente a empresa com fatos do cadastro',requestId:randomUUID(),attachments:[]});
 const create=input=>request('/api/portal/'+client.org+'/creations',client,input);
 async function delivered(id){const asset=randomUUID(),child=randomUUID();fs.writeFileSync(path.join(dir,'uploads','fixture'),testPng(16,16));await db.prepare('INSERT INTO assets(id,org_id,name,mime,size,path,created_at) VALUES(?,?,?,?,?,?,?)').run(asset,client.org,'Arte de teste.png','image/png',testPng(16,16).length,'fixture',stamp);await db.prepare("INSERT INTO jobs(id,org_id,user_id,kind,payload,state,scheduled_at,output,idempotency_key,created_at,updated_at) VALUES(?,?,?,'image',?,'succeeded',?,?,?,?,?)").run(child,client.org,client.user.id,JSON.stringify({creationId:id}),stamp,JSON.stringify({assetId:asset}),child,stamp,stamp);await db.prepare("UPDATE jobs SET state='succeeded' WHERE id=?").run(id);}
 try{
 operator=await signup('CommerceOperator');client=await signup('CommerceClient');other=await signup('CommerceOther');env.HELPU_OPERATOR_USER_IDS=String(operator.user.id);
 await db.prepare('UPDATE companies SET policy=? WHERE id=?').run(JSON.stringify({dailyAI:1000,dailyMedia:1000,dailyMessages:1000,enabled:false}),client.org);
 let subscription,payment,quote,first;
 await t.test('catálogo aprovado, acesso e contratação dependente de aceite e recebimento',async()=>{
  assert.equal((await request(url(),other)).status,403);assert.equal((await act({action:'offer',plan:'essential'})).status,403);
  const listing=await ok(request(url(),client));assert.equal(listing.catalog.essential.priceCents,69000);assert.equal(listing.catalog.assisted.priceCents,99000);assert.equal(listing.consulting.priceCents,99000);
  subscription=await ok(act({action:'offer',plan:'essential',start:'2026-09-20T00:00:00-03:00',end:'2026-10-20T00:00:00-03:00',conditions:'Período definido. Renovação mediante novo pagamento. Sem acúmulo de saldo.'},operator,true));
  assert.equal((await act({action:'activate',paymentId:'none'},operator,true)).status,403);
  subscription=await ok(act({action:'accept_plan',version:subscription.version,confirmed:true}));
  payment=await ok(request('/api/portal/finance?admin=1&org='+client.org,operator,{action:'create',requestKey:randomUUID(),description:'Mensalidade',reference:'Contrato',competence:'2026-09',amountCents:69000,dueDate:'2026-09-21',terms:'Pagamento para período contratado.'}));
  assert.equal((await act({action:'activate',paymentId:payment.id},operator,true)).status,409);
  payment=await ok(request('/api/portal/finance?admin=1&org='+client.org,operator,{action:'paid',id:payment.id,version:payment.version,amountCents:69000,paidDate:'2026-09-21',bankConfirmed:true,note:'Recebimento de teste'}));
  subscription=await ok(act({action:'activate',paymentId:payment.id},operator,true));assert.equal(subscription.state,'active');
 });
 await t.test('oito reservas, idempotência e extra não inicia sem aceite exato',async()=>{
  const input=fresh();first=await create(input);assert.equal(first.status,201,JSON.stringify(first.body));assert.ok(first.body.creation.id);assert.equal((await create(input)).body.creation.id,first.body.creation.id);
  for(let i=1;i<8;i++)assert.equal((await create(fresh())).status,201);
  let status=await ok(request(url(),client));assert.equal(status.remaining.image,0);assert.equal(status.remaining.video,4);
  assert.equal((await create(fresh())).status,409);status=await ok(request(url(),client));assert.equal(status.quotes.length,1);quote=status.quotes[0];assert.equal(quote.priceCents,5900);assert.equal(quote.state,'pending');
  assert.equal((await act({action:'accept_extra',id:quote.id,priceCents:1,confirmed:true})).status,409);
  assert.equal((await act({action:'accept_extra',id:quote.id,priceCents:5900,confirmed:true},operator,true)).status,403);
  const accepted=await ok(act({action:'accept_extra',id:quote.id,priceCents:5900,confirmed:true}));assert.ok(accepted.id);assert.equal((await ok(act({action:'accept_extra',id:quote.id,priceCents:5900,confirmed:true}))).id,accepted.id);
 });
 await t.test('falha libera saldo e não fatura extra; carrossel pede autorização',async()=>{
  await db.prepare("UPDATE jobs SET state='failed',error='Teste de falha' WHERE id=?").run(first.body.creation.id);
  let status=await ok(request(url(),client));assert.equal(status.remaining.image,1);assert.equal(status.extrasCents,0);
  assert.equal((await act({action:'invoice_extras',competence:'2026-09',dueDate:'2026-10-20'},operator,true)).status,409);
  assert.equal((await create({...fresh(),format:'carousel',slideCount:5})).status,409);status=await ok(request(url(),client));assert.equal(status.quotes.find(q=>q.type==='carousel').priceCents,14900);
  assert.equal((await create({...fresh(),format:'carousel',slideCount:6})).status,409);
 });
 await t.test('planejamento aguarda aprovação do cliente; datas e idempotência',async()=>{
  assert.equal((await act({action:'save_plan',items:[{format:'feed',prompt:'Tema',publishAt:'2027-01-01'}]})).status,409);
  let p=await ok(act({action:'save_plan',items:[{format:'feed',prompt:'Tema aprovado pelo cliente',publishAt:'2026-10-01T12:00:00-03:00',attachments:[]}]}));
  assert.equal((await act({action:'produce_plan',id:p.id})).status,409);assert.equal((await act({action:'approve_plan',id:p.id,confirmed:true},operator,true)).status,409);
  p=await ok(act({action:'approve_plan',id:p.id,confirmed:true}));p=await ok(act({action:'produce_plan',id:p.id}));assert.ok(p.items[0].creationId);const again=await ok(act({action:'produce_plan',id:p.id}));assert.equal(again.items[0].creationId,p.items[0].creationId);
  const job=await db.prepare('SELECT payload FROM jobs WHERE id=?').get(p.items[0].creationId);assert.equal(JSON.parse(job.payload).publicationAt,'2026-10-01T15:00:00.000Z');
 });
 await t.test('extra entregue fatura uma vez; revisão incluída não permite outro briefing',async()=>{
  let state=await ok(request(url(),client));const usage=state.usage.find(u=>u.quoteId===quote.id);assert.ok(usage.jobId);await delivered(usage.jobId);
  state=await ok(request(url(),client));assert.equal(state.extrasCents,0);assert.equal(state.usage.find(u=>u.jobId===usage.jobId).state,'reserved');
  const preview=(await request('/api/portal/'+client.org+'/creations/'+usage.jobId,client)).body.creation;
  const readFile=()=>fetch(origin+'/api/portal/files/'+preview.assets[0].id,{headers:{Cookie:client.cookie}});
  assert.equal((await readFile()).status,409);previewEnabled=true;
  const protectedFile=await readFile();assert.equal(protectedFile.status,200);assert.deepEqual(Buffer.from(await protectedFile.arrayBuffer()),testPng(8,8));
  await ok(request('/api/portal/'+client.org+'/creations/'+usage.jobId,client,{action:'approve'}));
  assert.deepEqual(Buffer.from(await (await readFile()).arrayBuffer()),testPng(16,16));
  await ok(request('/api/portal/'+client.org+'/creations/'+usage.jobId,client,{action:'approve'}));
  assert.equal((await db.prepare("SELECT count(*) AS n FROM conversation_messages WHERE id=?").get('approval:'+usage.jobId)).n,1);
  state=await ok(request(url(),client));assert.equal(state.extrasCents,5900);
  const charge=await ok(act({action:'invoice_extras',competence:'2026-10',dueDate:'2026-10-20',includeMonthly:true},operator,true));assert.equal(charge.amountCents,74900);
  assert.equal((await act({action:'invoice_extras',competence:'2026-10',dueDate:'2026-10-20',includeMonthly:true},operator,true)).status,409);
  assert.equal((await create({...fresh(),revisionOf:usage.jobId,prompt:'Outro conceito',adjustment:'Mudar cores'})).status,409);
  const revision=await create({...quote.request,requestId:randomUUID(),revisionOf:usage.jobId,adjustment:'Aumente o texto existente'});assert.equal(revision.status,201,JSON.stringify(revision.body));
  assert.equal((await create({...quote.request,requestId:randomUUID(),revisionOf:usage.jobId,adjustment:'Mais uma revisão'})).status,409);
  state=await ok(request(url(),client));assert.equal(state.extrasCents,0);assert.equal(state.remaining.image,0);assert.equal(state.usage.filter(u=>u.revisionOf).length,1);
 });
 await t.test('adaptação não pode ser forjada e falha de extra não é cobrada',async()=>{
  assert.equal((await create({...fresh(),adaptationOf:'qualquer'})).status,409);
  let state=await ok(request(url(),client));const carousel=state.quotes.find(q=>q.type==='carousel');const accepted=await ok(act({action:'accept_extra',id:carousel.id,priceCents:14900,confirmed:true}));
  await db.prepare("UPDATE jobs SET state='failed',error='Falha técnica' WHERE id=?").run(accepted.id);
  state=await ok(request(url(),client));assert.equal(state.quotes.find(q=>q.id===carousel.id).state,'void');assert.equal(state.extrasCents,0);
 });
 await t.test('ajuste antes de aprovar mantém uma reserva e debita uma vez ao aprovar a versão final',async()=>{
  const before=await ok(request(url(),client)),root=before.usage.find(u=>u.state==='reserved'&&!u.revisionOf&&!u.quoteId);
  assert.ok(root);await delivered(root.jobId);
  const revise=()=>request('/api/portal/'+client.org+'/creations/'+root.jobId,client,{action:'revise',adjustment:'Aumente o título',requestId:randomUUID()});
  const version=(await ok(revise())).creation;assert.equal((await revise()).status,400);
  assert.equal((await request('/api/portal/'+client.org+'/creations/'+root.jobId,client,{action:'approve'})).status,400);
  await delivered(version.id);let pending=await ok(request(url(),client));assert.equal(pending.consumed.image,0);assert.equal(pending.usage.find(u=>u.id===root.id).state,'reserved');
  await ok(request('/api/portal/'+client.org+'/creations/'+version.id,client,{action:'approve'}));
  pending=await ok(request(url(),client));assert.equal(pending.consumed.image,1);assert.equal(pending.remaining.image,0);
  assert.equal((await request('/api/portal/'+client.org+'/creations/'+version.id,client,{action:'revise',adjustment:'Outra alteração',requestId:randomUUID()})).status,409);
 });
 }finally{await app.portal.shutdown();await new Promise(r=>app.close(r));await pg?.close();const target=path.resolve(dir);assert.ok(target.startsWith(path.resolve(os.tmpdir())+path.sep+'helpu-commerce-'));fs.rmSync(target,{recursive:true,force:true});}
});
