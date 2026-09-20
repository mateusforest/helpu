import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {createDatabase} from '../portal/database.mjs';
import {createHelpuServer} from '../server.mjs';
import {testPng} from './image-fixture.mjs';
import {COMMERCIAL_SECTORS,OFFER_FIELDS} from '../dist/assets/commercial-schema.js';

for(const postgres of [false,true])test('F09 comercial em '+(postgres?'PostgreSQL':'SQLite'),async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'helpu-commercial-'));let pg,database,time=Date.parse('2026-09-21T12:00:00Z');const env={};
  if(postgres){pg=await PGlite.create({parsers:{20:Number}});await pg.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA storage; CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint);');for(const file of ['20260913113000_preserve_helpu_data.sql','20260913140000_activate_cloud_runtime.sql'])await pg.exec(fs.readFileSync(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));await pg.exec('INSERT INTO helpu.portal_migrations VALUES(1,1),(2,1),(3,1),(4,1); SET ROLE helpu_runtime;');let queued=Promise.resolve();database=createDatabase({pool:{async connect(){const prior=queued;let release;queued=new Promise(r=>release=r);await prior;return {async query(sql,args){const result=await pg.query(sql,args);return {...result,rowCount:result.affectedRows};},release};},async end(){}}});}
  const app=await createHelpuServer({dataDir:dir,database,portalOptions:{startScheduler:false,operatorEnv:env,assistedNow:()=>time,whatsappChatEnv:{}}});await new Promise(r=>app.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+app.address().port,db=app.database;
  async function request(url,who,body,foreign=false){const res=await fetch(origin+url,{method:body?'POST':'GET',headers:{Cookie:who?.cookie||'',Origin:foreign?'https://evil.example':origin,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:res.status,body:await res.json(),cookie:res.headers.get('set-cookie')?.split(';')[0]};}
  async function signup(name){const s=await request('/api/auth/signup',null,{name,email:name+'@example.test',password:'only-test-12345',company:name});assert.equal(s.status,201);const b=await request('/api/portal/bootstrap',s);return {cookie:s.cookie,user:b.body.user,org:b.body.companies[0].id};}
  const admin=(input,who=operator)=>request('/api/portal/commercial-admin',who,input),ok=async p=>{const r=await p;assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};
  const update=(r,action,extra={})=>ok(admin({kind:'page',id:r.id,version:r.version,action,...extra}));
  const privateAction=(r,action,extra={},who=client)=>request('/api/portal/commercial-proposals',who,{id:r.id,version:r.version,action,...extra});
  let operator,client,other,page,offer,lead,assetId;
  try{
    operator=await signup('OperatorCommercial');client=await signup('ClientCommercial');other=await signup('OtherCommercial');env.HELPU_OPERATOR_USER_IDS=String(operator.user.id);const bytes=testPng();assetId=randomUUID();fs.writeFileSync(path.join(dir,'uploads',assetId+'.png'),bytes);await db.prepare('INSERT INTO assets(id,org_id,name,mime,size,path,source_url,created_at) VALUES(?,?,?,?,?,?,?,?)').run(assetId,operator.org,'exemplo.png','image/png',bytes.length,assetId+'.png',null,time);
    const draft={kind:'page',action:'save',requestKey:randomUUID(),orgId:operator.org,sector:'property',company:'Empresa de exemplo',...COMMERCIAL_SECTORS.property,context:'Atende a cidade X, conforme página pública.',source:'https://example.test',checkedAt:'2026-09-20',media:[{id:assetId,caption:'Exemplo fictício, sem resultado comercial',mode:'demonstration'}]};
    await t.test('admin restrito, criação na empresa própria e fontes verificáveis',async()=>{
      assert.equal((await admin(undefined,client)).status,403);assert.equal((await request('/api/portal/commercial-admin')).status,401);
      assert.equal((await request('/api/portal/commercial-admin',operator,draft,true)).status,403);
      assert.equal((await admin({...draft,orgId:client.org})).status,403);
      assert.equal((await admin({...draft,source:'javascript:alert(1)'})).status,400);
      assert.equal((await admin({...draft,checkedAt:'2030-01-01'})).status,400);
      assert.equal((await admin({...draft,checkedAt:'2026-02-31'})).status,400);page=await ok(admin(draft));assert.equal((await ok(admin(draft))).id,page.id);
    });
    await t.test('rascunho exige login da equipe e liberação pública explícita',async()=>{
      assert.equal((await request('/api/presentations/'+page.slug)).status,404);
      const preview='/api/portal/commercial-preview?id='+encodeURIComponent(page.id);assert.equal((await request(preview)).status,401);assert.equal((await request(preview,client)).status,403);assert.equal((await request(preview,operator)).body.company,'Empresa de exemplo');
      assert.equal((await admin({kind:'page',id:page.id,version:page.version,action:'publish'})).status,400);
      page=await update(page,'publish',{publicConsent:true,materialConsent:true});const visible=(await request('/api/presentations/'+page.slug)).body;assert.equal(visible.edition,1);for(const key of ['orgId','id','history','publicApproval','draft','offers','leads'])assert.equal(visible[key],undefined);
      const media=await fetch(origin+visible.media[0].url,{headers:{Range:'bytes=0-7'}});assert.equal(media.status,206);assert.equal((await media.arrayBuffer()).byteLength,8);
      assert.equal((await fetch(origin+'/api/portal/files/'+assetId)).status,401);assert.equal((await request('/api/presentations/'+page.slug+'/media/8')).status,404);
    });
    await t.test('edição mantém a versão pública; desativação revoga página e mídia',async()=>{
      const oldHeadline=page.published.headline;page=await update(page,'save',{...draft,action:'save',headline:'Novo rascunho privado'});assert.equal((await request('/api/presentations/'+page.slug)).body.headline,oldHeadline);
      const stale=page;page=await update(page,'publish',{publicConsent:true,materialConsent:true});assert.equal((await admin({kind:'page',id:page.id,version:stale.version,action:'unpublish'})).status,409);assert.equal((await request('/api/presentations/'+page.slug)).body.headline,'Novo rascunho privado');
      page=await update(page,'unpublish');assert.equal((await request('/api/presentations/'+page.slug)).status,404);assert.equal((await request('/api/presentations/'+page.slug+'/media/0')).status,404);page=await update(page,'publish',{publicConsent:true,materialConsent:true});
    });
    await t.test('interesse tem consentimento, canal específico, idempotência e contenção de repetição',async()=>{
      const contact={name:'Interessado',company:'Empresa Interessada',email:client.user.email,channel:'email',phone:'+5554999999999',interests:['video','content'],note:'Quero uma proposta',consent:true,requestKey:randomUUID()},route='/api/presentations/'+page.slug+'/interest';
      assert.equal((await request(route,null,{...contact,consent:false})).status,400);assert.equal((await request(route,null,contact,true)).status,403);assert.equal((await request(route,null,{...contact,channel:'whatsapp',phone:''})).status,400);
      assert.deepEqual(await ok(request(route,null,contact)),{ok:true});await ok(request(route,null,contact));const queue=await ok(admin());assert.equal(queue.leads.length,1);lead=queue.leads[0];assert.equal(lead.phone,'');assert.equal(lead.consent.purpose,'return_requested_contact');
      await ok(request(route,null,{...contact,requestKey:randomUUID()}));await ok(request(route,null,{...contact,requestKey:randomUUID()}));assert.equal((await request(route,null,{...contact,requestKey:randomUUID()})).status,429);
      const pub=JSON.stringify((await request('/api/presentations/'+page.slug)).body);assert.ok(!pub.includes(client.user.email));assert.ok(!pub.includes('Quero uma proposta'));
    });
    const offerInput=()=>({kind:'offer',action:'send',requestKey:randomUUID(),leadId:lead.id,recipientEmail:client.user.email,title:'Proposta comercial de teste',priceCents:10000,validUntil:'2026-10-01',...Object.fromEntries(OFFER_FIELDS.map(([k])=>[k,'Condições explícitas: '+k]))});
    await t.test('proposta só é visível na conta destinatária, com escopo e prazo completos',async()=>{
      assert.equal((await admin({...offerInput(),recipientEmail:'missing@example.test'})).status,400);assert.equal((await admin({...offerInput(),priceCents:0})).status,400);
      assert.equal((await admin({...offerInput(),validUntil:'2026-09-31'})).status,400);const input=offerInput();offer=await ok(admin(input));assert.equal((await ok(admin(input))).id,offer.id);assert.equal((await request('/api/portal/commercial-proposals',other)).body.offers.length,0);assert.equal((await request('/api/portal/commercial-proposals',client)).body.offers.length,1);assert.equal((await request('/api/portal/commercial-proposals')).status,401);
      assert.equal((await privateAction(offer,'accept',{consent:true},other)).status,404);assert.equal((await privateAction(offer,'accept')).status,400);
      const visible=JSON.stringify((await request('/api/presentations/'+page.slug)).body);assert.ok(!visible.includes('priceCents'));assert.ok(!visible.includes(offer.title));
    });
    await t.test('ajustes criam versões, aceites são concorrentes e contrato aceito é preservado',async()=>{
      offer=await ok(privateAction(offer,'changes',{note:'Especificar duas revisões'}));const old=offer;offer=await ok(admin({...offerInput(),id:offer.id,version:offer.version,priceCents:12000}));assert.equal(offer.versions.length,2);assert.equal(offer.versions[0].priceCents,10000);assert.equal((await privateAction(old,'accept',{consent:true})).status,409);
      const results=await Promise.all([privateAction(offer,'accept',{consent:true}),privateAction(offer,'accept',{consent:true})]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);offer=results.find(r=>r.status===200).body;assert.equal(offer.acceptance.number,2);assert.equal((await admin({...offerInput(),id:offer.id,version:offer.version})).status,409);
    });
    await t.test('validade e bloqueio do contato impedem novos aceites e propostas',async()=>{
      let expiring=await ok(admin(offerInput()));time=Date.parse('2026-10-02T12:00:00Z');assert.equal((await privateAction(expiring,'accept',{consent:true})).status,409);
      expiring=await ok(admin({kind:'offer',action:'withdraw',id:expiring.id,version:expiring.version,note:'Validade encerrada'}));assert.equal(expiring.state,'withdrawn');
      lead=await ok(admin({kind:'interest',id:lead.id,version:lead.version,state:'do_not_contact'}));assert.equal((await admin(offerInput())).status,400);assert.equal((await admin({kind:'interest',id:lead.id,version:lead.version,state:'new'})).status,409);
      assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM jobs').get()).n,0);env.HELPU_OPERATOR_USER_IDS='';assert.equal((await admin()).status,403);
    });
  }finally{await app.portal.shutdown();await new Promise(r=>app.close(r));await pg?.close();const target=path.resolve(dir);assert.ok(target.startsWith(path.resolve(os.tmpdir())+path.sep+'helpu-commercial-'));fs.rmSync(target,{recursive:true,force:true});}
});
