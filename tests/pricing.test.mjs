import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {createDatabase} from '../portal/database.mjs';
import {createHelpuServer} from '../server.mjs';
import {blankPlan,calculatePlan,proposalFromPlan} from '../dist/assets/pricing-model.js';
import {COMMERCIAL_SECTORS} from '../dist/assets/commercial-schema.js';
import {pricingFixture} from './pricing-fixture.mjs';
const now=Date.parse('2026-09-21T12:00:00Z');

test('F10 custos, margem, capacidade e comparação são projeções em centavos',()=>{
 const p=pricingFixture(),r=calculatePlan(p,now),c=r.selected;assert.equal(r.ready,true,JSON.stringify(r.issues));
 assert.equal(c.directCents,400);assert.equal(c.humanCents,6000);assert.equal(c.overheadCents,1000);assert.equal(c.reserveCents,640);assert.equal(c.collectionCents,500);assert.equal(c.baseCents,8640);
 assert.equal(c.minimumCents,12000);assert.equal(c.breakEvenCents,9392);assert.equal(c.regular.profitCents,5160);assert.equal(c.regular.marginBps,3440);assert.equal(c.forecastProfitCents,51600);assert.equal(c.minutesPerCustomer,71);assert.equal(c.capacity,16);
 assert.equal(r.channels[1].baseCents,9240);assert.equal(r.channels[1].minimumCents,12320);assert.equal(r.channels[1].regular.profitCents,5010);
 const publicFields=JSON.stringify(proposalFromPlan(p));assert.doesNotMatch(publicFields,/PRIVATE|costs|margin|unitCost|reference/);assert.match(publicFields,/4 × Imagem final/);
});
test('F10 vazio não é zero, custo extremo e percentuais impossíveis não produzem aprovação',()=>{
 assert.equal(calculatePlan(blankPlan(),now).selected.complete,false);
 const p=pricingFixture();p.lines[0].unitCostCents=null;assert.equal(calculatePlan(p,now).selected.complete,false);p.lines[0].unitCostCents=0;assert.equal(calculatePlan(p,now).ready,true);
 p.channels[0].percentBps=7500;assert.equal(calculatePlan(p,now).ready,false);p.channels[0].percentBps=300;
 p.lines[0].quantity=100000;p.lines[0].unitCostCents=100000000;assert.equal(calculatePlan(p,now).selected.complete,false);
});
test('F10 preço mínimo preserva a margem após arredondamento de tarifas',()=>{
 const p=pricingFixture();p.channels[0].fixedCents=101;
 const initial=calculatePlan(p,now);p.regularPriceCents=initial.selected.minimumCents;
 assert.equal(p.regularPriceCents,12003);assert.equal(calculatePlan(p,now).selected.regular.marginBps,2000);
 p.regularPriceCents--;assert.equal(calculatePlan(p,now).ready,false);
 p.lines[0].quantity=1.5;assert.equal(calculatePlan(p,now).ready,false);
});
test('F10 exige capacidade, fontes, condições e margem normal',()=>{
 for(const change of [p=>p.costs.availableHours=1,p=>p.costs.expectedCustomers=0,p=>p.regularPriceCents=11999,p=>p.costReference='',p=>p.observedDate='2026-02-31',p=>p.observedDate='2026-09-22',p=>p.terms.revisions='',p=>p.lines[0].reference='',p=>p.lines[0].confidence='unknown',p=>{p.lines[0].minutes=0;p.channels[0].minutes=0;}]){const p=pricingFixture();change(p);assert.equal(calculatePlan(p,now).ready,false,JSON.stringify(p));}
 const p=pricingFixture();p.lines[0].confidence='estimate';assert.equal(calculatePlan(p,now).ready,true);assert.match(calculatePlan(p,now).warnings.join(' '),/estimado/);
 p.kind='prepaid';assert.equal(calculatePlan(p,now).ready,false);
});
test('F10 lançamento cobre custo, mantém renovação e respeita vagas e validade',()=>{
 const p={...pricingFixture(),launchPriceCents:10000,launchSlots:5,launchUntil:'2026-09-30',launchConditions:'Somente primeira mensalidade; depois preço normal.'};let r=calculatePlan(p,now);assert.equal(r.ready,true);assert.equal(r.selected.launch.profitCents,560);assert.match(r.warnings.join(' '),/menor/);assert.equal(proposalFromPlan(p).priceCents,15000);
 for(const [key,val] of [['launchPriceCents',9000],['launchPriceCents',0],['launchPriceCents',15000],['launchSlots',17],['launchSlots',1.5],['launchUntil','2026-09-20'],['launchUntil','2026-09-31'],['launchConditions',''],['kind','consulting']])assert.equal(calculatePlan({...p,[key]:val},now).ready,false,key);
});

for(const postgres of [false,true])test('F10 fluxo administrativo em '+(postgres?'PostgreSQL':'SQLite'),async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'helpu-pricing-'));let pg,database;const env={};
 if(postgres){pg=await PGlite.create({parsers:{20:Number}});await pg.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA storage; CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint);');for(const file of ['20260913113000_preserve_helpu_data.sql','20260913140000_activate_cloud_runtime.sql'])await pg.exec(fs.readFileSync(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));await pg.exec('INSERT INTO helpu.portal_migrations VALUES(1,1),(2,1),(3,1),(4,1); SET ROLE helpu_runtime;');let queued=Promise.resolve();database=createDatabase({pool:{async connect(){const prior=queued;let release;queued=new Promise(r=>release=r);await prior;return {async query(sql,args){const result=await pg.query(sql,args);return {...result,rowCount:result.affectedRows};},release};},async end(){}}});}
 const app=await createHelpuServer({dataDir:dir,database,portalOptions:{startScheduler:false,operatorEnv:env,assistedNow:()=>now,whatsappChatEnv:{}}});await new Promise(r=>app.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+app.address().port,db=app.database;
 async function request(url,who,body,foreign=false){const res=await fetch(origin+url,{method:body?'POST':'GET',headers:{Cookie:who?.cookie||'',Origin:foreign?'https://evil.example':origin,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:res.status,body:await res.json(),cookie:res.headers.get('set-cookie')?.split(';')[0]};}
 async function signup(name){const s=await request('/api/auth/signup',null,{name,email:name+'@example.test',password:'only-test-12345',company:name});assert.equal(s.status,201);const b=await request('/api/portal/bootstrap',s);return {cookie:s.cookie,user:b.body.user,org:b.body.companies[0].id};}
 const ok=async p=>{const r=await p;assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};let operator,client,plan,offer,source,policy;
 const api=(input,who=operator)=>request('/api/portal/pricing',who,input),save=(draft=pricingFixture())=>api({action:'save',orgId:operator.org,requestKey:randomUUID(),plan:draft}),act=(r,action,extra={})=>api({id:r.id,version:r.version,action,...extra});
 try{
  operator=await signup('OperatorPricing');client=await signup('ClientPricing');env.HELPU_OPERATOR_USER_IDS=String(operator.user.id);policy=(await db.prepare('SELECT policy FROM companies WHERE id=?').get(operator.org)).policy;
  await t.test('acesso da equipe, empresa de origem, CSRF e privacidade',async()=>{
   assert.equal((await request('/api/portal/admin-overview')).status,401);assert.equal((await request('/api/portal/admin-overview',client)).status,403);const overview=await ok(request('/api/portal/admin-overview',operator));assert.equal(overview.totals.clients,2);assert.equal(overview.clients.length,2);assert.doesNotMatch(JSON.stringify(overview),/email|password|profile|payload|messages/);assert.equal((await request('/api/portal/pricing')).status,401);assert.equal((await api(undefined,client)).status,403);assert.equal((await request('/api/portal/pricing',operator,{action:'save'},true)).status,403);
   assert.equal((await api({action:'save',orgId:client.org,requestKey:randomUUID(),plan:blankPlan()})).status,403);assert.equal((await request('/api/portal/pricing?orgId='+client.org,operator)).status,404);
   const malformed=pricingFixture();malformed.lines[0].quantity=1.5;assert.equal((await save(malformed)).status,400);malformed.lines[0].quantity=2;malformed.channels[0].fixedCents=-1;assert.equal((await save(malformed)).status,400);
  });
  await t.test('rascunhos incompletos persistem, repetição não duplica e revisão exige validação',async()=>{
   const input={action:'save',orgId:operator.org,requestKey:randomUUID(),plan:blankPlan()};plan=await ok(api(input));assert.equal((await ok(api(input))).id,plan.id);assert.equal(plan.draft.lines[0].unitCostCents,null);assert.equal((await act(plan,'review',{confirmed:true,capacityConfirmed:true})).status,409);
   plan=await ok(act(plan,'save',{plan:pricingFixture()}));assert.equal((await act(plan,'review',{confirmed:true})).status,400);plan=await ok(act(plan,'review',{confirmed:true,capacityConfirmed:true}));assert.equal(plan.state,'reviewed');assert.equal(plan.versions.length,1);assert.equal((await act(plan,'review',{confirmed:true,capacityConfirmed:true})).status,409);
   const list=await ok(request('/api/portal/pricing?orgId='+operator.org,operator));assert.equal(list.billingActivated,false);assert.equal(list.technicalUsage.calls,0);assert.equal(list.technicalUsage.tokens.input,null);
   const state=JSON.stringify((await ok(request('/api/portal/'+operator.org+'/state',operator))).records);assert.doesNotMatch(state,/pricing_plan|PRIVATE-/);assert.equal((await request('/api/portal/'+operator.org+'/records/pricing_plan',operator)).status,404);
  });
  await t.test('só uma oferta principal revisada e alterações concorrentes preservam versão',async()=>{
   const next=await ok(save());assert.equal((await act(next,'review',{confirmed:true,capacityConfirmed:true})).status,409);await ok(act(next,'archive'));
   const edits=await Promise.all([act(plan,'save',{plan:pricingFixture()}),act(plan,'save',{plan:pricingFixture()})]);assert.deepEqual(edits.map(x=>x.status).sort(),[200,409]);plan=edits.find(x=>x.status===200).body;assert.equal(plan.reviewed,null);assert.equal(plan.versions.length,1);assert.equal((await ok(request('/api/portal/commercial-admin',operator))).pricingSources.length,0);
   plan=await ok(act(plan,'review',{confirmed:true,capacityConfirmed:true}));source=(await ok(request('/api/portal/commercial-admin',operator))).pricingSources[0];assert.equal(source.proposal.priceCents,15000);assert.doesNotMatch(JSON.stringify(source),/PRIVATE|costs|marginBps/);
  });
  await t.test('proposta guarda só a base comercial e não vaza custos ao destinatário',async()=>{
   let page=await ok(request('/api/portal/commercial-admin',operator,{kind:'page',action:'save',requestKey:randomUUID(),orgId:operator.org,sector:'general',...COMMERCIAL_SECTORS.general,company:'Cliente teste',media:[]}));page=await ok(request('/api/portal/commercial-admin',operator,{kind:'page',action:'publish',id:page.id,version:page.version,publicConsent:true,materialConsent:true}));
   await ok(request('/api/presentations/'+page.slug+'/interest',null,{name:'Cliente',company:'Cliente teste',email:client.user.email,channel:'email',interests:['content'],consent:true,requestKey:randomUUID()}));const lead=(await ok(request('/api/portal/commercial-admin',operator))).leads[0];
   const input={kind:'offer',action:'send',requestKey:randomUUID(),leadId:lead.id,recipientEmail:client.user.email,...source.proposal,validUntil:'2026-10-01',pricingPlanId:source.id,pricingVersion:source.version};offer=await ok(request('/api/portal/commercial-admin',operator,input));assert.equal(offer.versions[0].pricingReference.revision,source.revision);
   const view=JSON.stringify(await ok(request('/api/portal/commercial-proposals',client)));assert.doesNotMatch(view,/PRIVATE|marginBps|unitCostCents|costReference/);assert.match(view,/15000/);
   plan=await ok(act(plan,'save',{plan:{...pricingFixture(),regularPriceCents:16000}}));assert.equal((await request('/api/portal/commercial-admin',operator,{...input,requestKey:randomUUID()})).status,409);assert.equal(plan.versions.at(-1).plan.regularPriceCents,15000);assert.equal((await ok(request('/api/portal/commercial-proposals',client))).offers[0].versions[0].priceCents,15000);
  });
  await t.test('pré-pagos aguardam saldo, arquivar revoga base e nada altera cobrança ou quotas',async()=>{
   const prepaid=await ok(save({...pricingFixture(),kind:'prepaid'}));assert.equal((await act(prepaid,'review',{confirmed:true,capacityConfirmed:true})).status,409);plan=await ok(act(plan,'archive'));assert.equal(plan.reviewed,null);
   assert.equal((await db.prepare('SELECT policy FROM companies WHERE id=?').get(operator.org)).policy,policy);assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM jobs').get()).n,0);assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM usage_reservations').get()).n,0);
   assert.equal((await ok(request('/api/portal/commercial-admin',operator))).pricingSources.length,0);await db.prepare('INSERT INTO records(id,org_id,kind,data,external_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run('admin-count-fixture',client.org,'assisted_request',JSON.stringify({state:'review',privateText:'PRIVATE-CONVERSATION'}),'admin-count-fixture',now,now);const overview=await ok(request('/api/portal/admin-overview',operator));assert.equal(overview.totals.publications,1);assert.equal(overview.clients.find(c=>c.id===client.org).publicationRequests,1);assert.doesNotMatch(JSON.stringify(overview),/PRIVATE-CONVERSATION/);env.HELPU_OPERATOR_USER_IDS='';assert.equal((await request('/api/portal/admin-overview',operator)).status,403);assert.equal((await api()).status,403);
  });
 }finally{await app.portal.shutdown();await new Promise(r=>app.close(r));await pg?.close();const target=path.resolve(dir);assert.ok(target.startsWith(path.resolve(os.tmpdir())+path.sep+'helpu-pricing-'));fs.rmSync(target,{recursive:true,force:true});}
});
