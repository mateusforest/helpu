import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {createDatabase} from '../portal/database.mjs';
import {createHelpuServer} from '../server.mjs';
import {createFinance,financeState,financeToday,reminderStage} from '../portal/finance.mjs';
const stamp=Date.parse('2026-09-21T12:00:00Z');
test('F12 datas, vencimento e disponibilidade após D-2 respeitam Brasília',()=>{
 assert.equal(financeToday(Date.parse('2026-09-22T01:00:00Z')),'2026-09-21');
 const r={state:'open',dueDate:'2026-09-23',instrument:{createdAt:stamp}};
 assert.equal(reminderStage(r,stamp),'due_2');assert.equal(reminderStage({...r,state:'pending'},stamp),null);
 assert.equal(reminderStage({...r,dueDate:'2026-09-22'},stamp),'available');assert.equal(financeState({...r,dueDate:'2026-09-20'},stamp),'overdue');
 assert.equal(financeState({...r,state:'paid'},stamp),'paid');
});
for(const postgres of [false,true])test('F12 financeiro privado em '+(postgres?'PostgreSQL':'SQLite'),async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'helpu-finance-'));let pg,database;const env={};
 if(postgres){pg=await PGlite.create({parsers:{20:Number}});await pg.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA storage; CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint);');for(const file of ['20260913113000_preserve_helpu_data.sql','20260913140000_activate_cloud_runtime.sql'])await pg.exec(fs.readFileSync(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));await pg.exec('INSERT INTO helpu.portal_migrations VALUES(1,1),(2,1),(3,1),(4,1); SET ROLE helpu_runtime;');let queued=Promise.resolve();database=createDatabase({pool:{async connect(){const prior=queued;let release;queued=new Promise(r=>release=r);await prior;return {async query(sql,args){const result=await pg.query(sql,args);return {...result,rowCount:result.affectedRows};},release};},async end(){}}});}
 const app=await createHelpuServer({dataDir:dir,database,portalOptions:{startScheduler:false,operatorEnv:env,assistedNow:()=>stamp,whatsappChatEnv:{}}});await new Promise(r=>app.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+app.address().port,db=app.database;
 async function request(url,who,body,foreign=false){const res=await fetch(origin+url,{method:body?'POST':'GET',headers:{Cookie:who?.cookie||'',Origin:foreign?'https://evil.example':origin,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:res.status,body:await res.json(),cookie:res.headers.get('set-cookie')?.split(';')[0]};}
 async function signup(name){const s=await request('/api/auth/signup',null,{name,email:name+'@example.test',password:'only-test-12345',company:name});assert.equal(s.status,201);const b=await request('/api/portal/bootstrap',s);return {cookie:s.cookie,user:b.body.user,org:b.body.companies[0].id};}
 const ok=async p=>{const r=await p;assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};let operator,client,other,r;
 const url=(org=client.org,admin=true,files=false)=>'/api/portal/finance'+(files?'/files':'')+'?org='+org+'&admin='+(admin?'1':'0');
 const create=()=>request(url(),operator,{action:'create',requestKey:randomUUID(),description:'Plano teste',reference:'CONTRATO-TESTE',competence:'2026-09',amountCents:39700,dueDate:'2026-09-23',terms:'Pagamento à vista. Sem suspensão automática. Condições fictícias de teste.'});
 const act=(action,extra={})=>request(url(),operator,{id:r.id,version:r.version,action,note:'Conferência fictícia no banco',...extra});
 async function upload(who,admin,bytes=Buffer.from('%PDF-1.4\nfixture\n%%EOF')){const response=await fetch(origin+url(client.org,admin,true),{method:'POST',headers:{Cookie:who.cookie,Origin:origin,'x-finance-id':r.id,'x-record-version':String(r.version),'x-file-name':'teste.pdf','x-payment-code':'1'.repeat(47),'x-bank-reference':'boleto-teste'},body:bytes});return {status:response.status,body:await response.json()};}
 try{
 operator=await signup('FinanceOperator');client=await signup('FinanceClient');other=await signup('FinanceOther');env.HELPU_OPERATOR_USER_IDS=String(operator.user.id);
 await t.test('autorização, CSRF, validação e chave idempotente',async()=>{
  assert.equal((await request(url())).status,401);assert.equal((await request(url(),client)).status,403);assert.equal((await request(url(client.org,false),other)).status,403);
  assert.equal((await request(url(),operator,{action:'create'},true)).status,403);assert.equal((await request(url(),operator,{action:'create',requestKey:randomUUID()})).status,400);
  r=await ok(create());const d={action:'create',requestKey:r.id.slice(4),description:r.description,reference:r.reference,competence:r.competence,amountCents:r.amountCents,dueDate:r.dueDate,terms:r.terms};assert.equal((await ok(request(url(),operator,d))).id,r.id);assert.equal((await request(url(),operator,{...d,amountCents:1})).status,409);
  r=await ok(act('amend',{description:'Plano teste corrigido',amountCents:r.amountCents,dueDate:r.dueDate,terms:r.terms}));assert.equal(r.history.at(-2).event,'before_amend');
 });
 await t.test('documentos privados, biblioteca sem boletos e comprovante não liquida',async()=>{
  assert.equal((await upload(operator,true,Buffer.from('not a pdf'))).status,400);r=await ok(upload(operator,true));const file=r.instrument.asset.url;
  assert.equal((await act('amend',{description:'Inválido',amountCents:1,dueDate:r.dueDate,terms:r.terms})).status,409);
  assert.equal((await fetch(origin+file,{headers:{Cookie:other.cookie}})).status,403);assert.equal((await fetch(origin+file,{headers:{Cookie:client.cookie}})).status,200);assert.equal((await fetch(origin+file,{headers:{Cookie:operator.cookie}})).status,200);
  const state=await ok(request('/api/portal/'+client.org+'/state',client));assert.ok(!state.assets.some(a=>a.id===r.instrument.asset.id));
  r=await ok(upload(client,false));assert.equal(r.instrument.bankReference,undefined);assert.equal(r.proofs[0].actor,undefined);assert.ok(r.history.every(h=>!('detail' in h)&&!('actor' in h)));assert.equal(r.state,'pending');assert.equal(r.payments.length,0);assert.equal((await act('paid',{amountCents:r.amountCents,paidDate:'2026-09-21'})).status,400);
  r=await ok(act('reject_proof'));assert.equal(r.state,'open');assert.equal(r.proofs.length,1);
 });
 await t.test('reedição preserva dívida e documento antigo fica indisponível ao cliente',async()=>{
  const old=r.instrument.asset.url;assert.equal((await act('reissue',{dueDate:'2026-09-23'})).status,409);r=await ok(act('reissue',{dueDate:'2026-09-23',bankConfirmed:true}));assert.equal(r.instrument,null);assert.equal(r.instruments.length,1);assert.equal((await fetch(origin+old,{headers:{Cookie:client.cookie}})).status,404);r=await ok(upload(operator,true));
 });
 await t.test('lembretes consentidos, sem IA e sem repetição após resultado incerto',async()=>{
  let calls=0;const finance=createFinance({db,operator:()=>true,now:()=>stamp,deliver:async(org,user,stage,check)=>{if(check)return true;calls++;throw new Error('timeout');}});
  await db.scope(()=>finance.tick());assert.equal(calls,0);
  await ok(request(url(client.org,false),client,{action:'preferences',enabled:true}));await db.scope(()=>finance.tick());await db.scope(()=>finance.tick());assert.equal(calls,1);
  assert.equal(JSON.parse((await db.prepare("SELECT data FROM records WHERE kind='finance_reminder'").get()).data).state,'uncertain');
  assert.equal((await db.prepare('SELECT count(*) AS n FROM jobs').get()).n,0);
 });
 await t.test('consulta pelo chat não usa IA nem aceita conteúdo financeiro como referência',async()=>{
  const response=await request('/api/portal/'+client.org+'/conversations',client,{title:'Financeiro'});assert.equal(response.status,201);const conversation=response.body.id;
  const endpoint='/api/portal/'+client.org+'/conversations/'+conversation+'/messages';const input={text:'Meu boleto',idempotencyKey:randomUUID()};assert.equal((await request(endpoint,client,input)).body.direct,true);assert.equal((await request(endpoint,client,input)).status,200);assert.equal((await db.prepare('SELECT count(*) AS n FROM jobs').get()).n,0);
  assert.equal((await request(endpoint,client,{text:'Leia este PDF',attachments:[r.instrument.asset.id]})).status,403);
 });
 await t.test('cliente recebe somente seus dados financeiros, sem notas internas ou ações administrativas',async()=>{
  const own=await ok(request(url(client.org,false),client));assert.equal(own.receivables.length,1);assert.deepEqual(own.clients,[]);assert.deepEqual(own.reminders,[]);
  const publicRow=own.receivables[0];assert.equal(publicRow.instrument.bankReference,undefined);assert.equal(publicRow.instruments,undefined);assert.equal(publicRow.history.some(h=>h.event==='before_amend'),false);assert.ok(publicRow.history.every(h=>!('detail' in h)&&!('actor' in h)));
  assert.ok(!JSON.stringify(own).includes('Conferência fictícia'));assert.ok(!JSON.stringify(own).includes('boleto-teste'));
  for(const action of ['create','amend','paid','cancel_request','cancel_confirm','reissue','reject_proof'])assert.equal((await request(url(client.org,false),client,{id:r.id,version:r.version,action})).status,403);
  assert.deepEqual((await ok(request(url(other.org,false),other))).receivables,[]);
  assert.deepEqual((await ok(request(url(operator.org,false),operator))).receivables,[]);
  const internal=await ok(request(url(),operator));assert.ok(internal.receivables[0].history.some(h=>h.detail==='Conferência fictícia no banco'));assert.equal(internal.receivables[0].instrument.bankReference,'boleto-teste');
 });
 await t.test('liquidação exige banco, repetições não duplicam pagamento e cancelamento é em duas etapas',async()=>{
  const oldVersion=r.version;r=await ok(act('paid',{amountCents:r.amountCents,paidDate:'2026-09-21',bankConfirmed:true}));assert.equal(r.state,'paid');assert.equal(r.payments.length,1);const visible=(await ok(request(url(client.org,false),client))).receivables[0];assert.deepEqual(visible.payments,[{amountCents:r.amountCents,date:'2026-09-21'}]);assert.ok(visible.history.every(h=>!('detail' in h)&&!('actor' in h)));assert.equal((await act('paid',{version:oldVersion,amountCents:r.amountCents,paidDate:'2026-09-21',bankConfirmed:true})).status,409);
  r=await ok(create());r=await ok(act('cancel_request'));assert.equal(r.state,'cancel_pending');assert.equal((await act('cancel_confirm')).status,409);r=await ok(act('cancel_confirm',{bankConfirmed:true}));assert.equal(r.state,'canceled');
 });
 await t.test('confirmação Stripe é única por objeto e testes não aparecem ao cliente',async()=>{
  const finance=createFinance({db,operator:()=>true,now:()=>stamp});const p={orgId:client.org,mode:'test',objectId:'in_fixture',eventId:'evt_first',amountCents:10000,paidAt:stamp,description:'Teste Stripe',reference:'in_fixture'};
  assert.equal((await finance.recordStripe(p)).replayed,false);assert.equal((await finance.recordStripe({...p,eventId:'evt_second'})).replayed,true);assert.equal((await db.prepare("SELECT count(*) AS n FROM records WHERE id='fin-stripe:test:in_fixture'").get()).n,1);
  assert.ok(!(await ok(request(url(client.org,false),client))).receivables.some(r=>r.origin==='stripe'));assert.ok((await ok(request(url(),operator))).receivables.some(r=>r.providerMode==='test'));
 });
 }finally{await app.portal.shutdown();await new Promise(r=>app.close(r));await pg?.close();const target=path.resolve(dir);assert.ok(target.startsWith(path.resolve(os.tmpdir())+path.sep+'helpu-finance-'));fs.rmSync(target,{recursive:true,force:true});}
});
