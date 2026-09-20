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
import {workingDate} from '../portal/consultations.mjs';
import {CONSULTATION_TYPES,BRIEF_REQUIRED,REPORT_FIELDS} from '../dist/assets/consultation-schema.js';
import {consultationText} from '../dist/assets/consultation-ui.js';

test('fontes do relatório viram links HTTPS escapados, sem executar HTML ou credenciais',()=>{
  const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
  assert.match(consultationText('Fonte https://example.test/pagina. Data 20/09.',esc),/href="https:\/\/example.test\/pagina"/);
  const value=consultationText('<img src=x onerror=alert(1)> javascript:alert(1) https://user:password@example.test',esc);
  assert.doesNotMatch(value,/<img|<a /);assert.match(value,/&lt;img/);
});

test('consultoria conta prazo em dias úteis com virada de mês e fim de semana',()=>{
  assert.equal(workingDate('2026-09-18',1),'2026-09-21');assert.equal(workingDate('2026-09-30',3),'2026-10-05');
});
for(const postgres of [false,true])test('F08 consultorias em '+(postgres?'PostgreSQL':'SQLite'),async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'helpu-consultations-'));let pg,database,time=Date.parse('2026-09-21T12:00:00Z');const env={};
  if(postgres){pg=await PGlite.create({parsers:{20:Number}});await pg.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA storage; CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint);');
    for(const file of ['20260913113000_preserve_helpu_data.sql','20260913140000_activate_cloud_runtime.sql'])await pg.exec(fs.readFileSync(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
    await pg.exec('INSERT INTO helpu.portal_migrations VALUES(1,1),(2,1),(3,1),(4,1); SET ROLE helpu_runtime;');
    let queued=Promise.resolve();database=createDatabase({pool:{async connect(){const prior=queued;let release;queued=new Promise(r=>release=r);await prior;return {async query(sql,args){const result=await pg.query(sql,args);return {...result,rowCount:result.affectedRows};},release};},async end(){}}});
  }
  const app=await createHelpuServer({dataDir:dir,database,portalOptions:{startScheduler:false,operatorEnv:env,assistedNow:()=>time,whatsappChatEnv:{}}});await new Promise(r=>app.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+app.address().port,db=app.database;
  async function request(url,who,body,foreign=false){const res=await fetch(origin+url,{method:body?'POST':'GET',headers:{Cookie:who?.cookie||'',Origin:foreign?'https://evil.example':origin,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:res.status,body:await res.json(),cookie:res.headers.get('set-cookie')?.split(';')[0]};}
  async function signup(name){const s=await request('/api/auth/signup',null,{name,email:name+'@example.test',password:'only-test-12345',company:name});assert.equal(s.status,201);const b=await request('/api/portal/bootstrap',s);return {cookie:s.cookie,user:b.body.user,org:b.body.companies[0].id};}
  const client=(who,body)=>request('/api/portal/'+who.org+'/consultations',who,body);
  const admin=(body,who=operator)=>request('/api/portal/consultations-admin',who,body);
  const ok=async p=>{const r=await p;assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};
  const change=(r,action,extra={})=>ok(client(a,{id:r.id,version:r.version,action,...extra}));
  const op=(r,action,extra={})=>ok(admin({orgId:r.orgId,id:r.id,version:r.version,action,...extra}));
  const fullBrief=type=>Object.fromEntries([...BRIEF_REQUIRED,...CONSULTATION_TYPES[type].fields.map(([k])=>k)].map(k=>[k,'Informação real: '+k]));
  const quote={scope:'Uma empresa e três canais',deliverables:'Plano de 30 dias',exclusions:'Sem gestão contínua ou site',paymentInstructions:'Combinar pagamento com a equipe',deadlineRule:'Revisão em até dois dias úteis; feriados combinados.',priceCents:12345,businessDays:3,revisions:1,revisionBusinessDays:2};
  const report=Object.fromEntries(REPORT_FIELDS.map(([k])=>[k,'Análise humana, fonte https://example.test, em 21/09/2026.']));
  let operator,a,b,r,assetId;
  try{
    operator=await signup('OperatorF08');a=await signup('ClientF08A');b=await signup('ClientF08B');env.HELPU_OPERATOR_USER_IDS=String(operator.user.id);
    const bytes=testPng();assetId=randomUUID();fs.writeFileSync(path.join(dir,'uploads',assetId+'.png'),bytes);await db.prepare('INSERT INTO assets(id,org_id,name,mime,size,path,source_url,created_at) VALUES(?,?,?,?,?,?,?,?)').run(assetId,a.org,'Referência','image/png',bytes.length,assetId+'.png',null,time);
    const file=async(id,who)=>fetch(origin+'/api/portal/files/'+id,{headers:{Cookie:who.cookie}});
    await t.test('acesso administrativo, CSRF e isolamento entre empresas',async()=>{
      assert.equal((await admin(undefined,a)).status,403);assert.equal((await request('/api/portal/consultations-admin')).status,401);
      assert.equal((await request('/api/portal/'+a.org+'/consultations',b)).status,404);
      assert.equal((await request('/api/portal/'+a.org+'/consultations',a,{action:'save'},true)).status,403);
      assert.equal((await client(b,{action:'save',requestKey:randomUUID(),type:'diagnosis',brief:{},assetIds:[assetId]})).status,400);
      assert.equal((await client(a,{action:'payment'})).status,403);
      assert.equal((await request('/api/portal/consultations-admin',operator,{action:'assign'},true)).status,403);
      assert.equal((await client(a,{action:'save',requestKey:randomUUID(),type:'diagnosis',brief:{company:'a'.repeat(4001)}})).status,400);
    });
    await t.test('rascunho idempotente, privado da empresa e sem execução de IA',async()=>{
      const input={action:'save',requestKey:randomUUID(),type:'diagnosis',brief:{company:'Teste'},assetIds:[assetId]};r=await ok(client(a,input));assert.equal(r.state,'draft');assert.equal((await ok(client(a,input))).id,r.id);
      assert.equal((await admin()).body.requests.length,0);assert.equal((await file(assetId,operator)).status,404);
      assert.equal((await admin({action:'assign',orgId:a.org,id:r.id,version:r.version})).status,404);
      assert.equal((await client(a,{action:'submit',id:r.id,version:r.version,consent:true})).status,400);
      const stale=r;r=await change(r,'save',{type:'diagnosis',brief:fullBrief('diagnosis'),assetIds:[assetId]});
      assert.equal((await client(a,{action:'submit',id:stale.id,version:stale.version,consent:true})).status,409);
      assert.equal((await client(a,{action:'submit',id:r.id,version:r.version})).status,400);
      r=await change(r,'submit',{consent:true});assert.equal(r.state,'triage');assert.equal((await admin()).body.pendingCount,1);assert.equal((await file(assetId,operator)).status,200);assert.equal((await file(assetId,b)).status,404);
    });
    await t.test('triagem, complemento e proposta versionada sem cobrança',async()=>{
      r=await op(r,'assign');assert.equal(r.assignee,String(operator.user.id));r=await op(r,'request_info',{note:'Envie contexto dos canais'});r=await change(r,'answer',{note:'Canais e objetivos completos',assetIds:[]});assert.equal(r.state,'triage');
      assert.equal((await admin({orgId:a.org,id:r.id,version:r.version,action:'propose',...quote,priceCents:0})).status,400);
      r=await op(r,'propose',quote);assert.equal(r.proposals.length,1);const old=r;r=await op(r,'propose',{...quote,priceCents:23456});assert.equal(r.proposals[0].priceCents,12345);
      assert.equal((await client(a,{id:old.id,version:old.version,action:'accept_proposal',consent:true})).status,409);
      assert.equal((await client(a,{id:r.id,version:r.version,action:'accept_proposal'})).status,400);
      assert.equal((await admin({orgId:a.org,id:r.id,version:r.version,action:'accept_proposal',consent:true})).status,403);
      r=await change(r,'accept_proposal',{consent:true});assert.equal(r.acceptance.proposalNumber,2);assert.equal(r.payment,undefined);
    });
    await t.test('pagamento e briefing são barreiras reais ao início; aceite não pode ser editado',async()=>{
      assert.equal((await admin({orgId:a.org,id:r.id,version:r.version,action:'start'})).status,409);
      r=await op(r,'request_info',{note:'Precisamos confirmar o público'});
      assert.equal((await client(a,{action:'save',id:r.id,version:r.version,type:'identity',brief:fullBrief('identity')})).status,409);
      assert.equal((await client(a,{action:'submit',id:r.id,version:r.version,consent:true})).status,409);
      assert.equal((await client(a,{action:'cancel',id:r.id,version:r.version})).status,409);
      r=await change(r,'answer',{note:'Público confirmado'});assert.equal(r.state,'accepted');
      assert.equal((await admin({orgId:a.org,id:r.id,version:r.version,action:'payment',confirmed:true})).status,400);
      r=await op(r,'payment',{confirmed:true,note:'Recebimento conferido manualmente, referência teste'});
      assert.equal((await admin({orgId:a.org,id:r.id,version:r.version,action:'start'})).status,409);
      r=await op(r,'brief_complete',{confirmed:true});r=await op(r,'start');assert.equal(r.dueDate,'2026-09-24');assert.equal(r.state,'working');
    });
    await t.test('pausa explícita, complementos e retomada preservam prazo útil',async()=>{
      r=await op(r,'pause',{note:'Precisamos dos exemplos finais'});time=Date.parse('2026-09-23T12:00:00Z');
      r=await change(r,'answer',{note:'Exemplos confirmados'});assert.equal(r.state,'paused');
      assert.equal((await admin({orgId:a.org,id:r.id,version:r.version,action:'deliver',report})).status,409);
      r=await op(r,'resume',{confirmed:true});assert.equal(r.dueDate,'2026-09-28');assert.equal(r.state,'working');
    });
    await t.test('arquivo de entrega restrito ao pedido, com controle de concorrência e autenticação',async()=>{
      async function upload(who,record,extra={}){return fetch(origin+'/api/portal/consultations-admin/files',{method:'POST',headers:{Cookie:who.cookie,Origin:origin,'X-Company-Id':a.org,'X-Consultation-Id':record.id,'X-Record-Version':String(record.version),'X-File-Name':'guia.png',...extra},body:bytes});}
      assert.equal((await upload(a,r)).status,403);assert.equal((await upload(operator,r,{'X-Company-Id':b.org})).status,404);
      const old=r,response=await upload(operator,r);assert.equal(response.status,200);r=await response.json();assert.equal((await upload(operator,old)).status,409);
      assert.equal((await file(r.deliveryAssets[0].id,b)).status,404);assert.equal((await file(r.deliveryAssets[0].id,operator)).status,200);
      assert.equal((await admin({orgId:a.org,id:r.id,version:r.version,action:'deliver',report,assetIds:[assetId]})).status,400);
    });
    await t.test('entrega privada, revisão limitada e aceite final com histórico imutável',async()=>{
      assert.equal((await admin({orgId:a.org,id:r.id,version:r.version,action:'deliver',report:{summary:'Faltam evidências'}})).status,400);
      r=await op(r,'report_draft',{report:{summary:'Rascunho interno'}});assert.equal((await client(a)).body.requests[0].reportDraft,undefined);r=await op(r,'deliver',{report,assetIds:[r.deliveryAssets[0].id]});assert.equal(r.state,'delivered');r=await change(r,'revise',{note:'Ajustar a prioridade do canal'});assert.equal(r.revisionsUsed,1);
      r=await op(r,'deliver',{report:{...report,priorities:'Prioridade revisada com justificativa'},assetIds:[]});assert.equal(r.deliveries.length,2);assert.notEqual(r.deliveries[0].report.priorities,r.deliveries[1].report.priorities);
      assert.equal((await client(a,{action:'revise',id:r.id,version:r.version,note:'Mais uma'})).status,409);
      assert.equal((await client(a,{action:'complete',id:r.id,version:r.version})).status,400);
      const attempts=await Promise.all([client(a,{action:'complete',id:r.id,version:r.version,consent:true}),client(a,{action:'complete',id:r.id,version:r.version,consent:true})]);assert.deepEqual(attempts.map(x=>x.status).sort(),[200,409]);r=attempts.find(x=>x.status===200).body;
      assert.equal(r.finalAcceptance.deliveryNumber,2);assert.equal(r.state,'completed');assert.ok(r.history.length>15);assert.equal((await client(b)).body.requests.length,0);
      assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM jobs').get()).n,0);
    });
    await t.test('quatro formulários exigem suas perguntas e cancelamento revoga acesso aos anexos',async()=>{
      for(const type of Object.keys(CONSULTATION_TYPES)){let x=await ok(client(a,{action:'save',requestKey:randomUUID(),type,brief:Object.fromEntries(BRIEF_REQUIRED.map(k=>[k,'Preenchido']))}));assert.equal((await client(a,{action:'submit',id:x.id,version:x.version,consent:true})).status,400);x=await change(x,'save',{type,brief:fullBrief(type)});x=await change(x,'submit',{consent:true});assert.equal(x.type,type);x=await change(x,'cancel');assert.equal(x.state,'canceled');}
      env.HELPU_OPERATOR_USER_IDS='';assert.equal((await admin()).status,403);assert.equal((await file(assetId,operator)).status,404);
    });
  }finally{await app.portal.shutdown();await new Promise(r=>app.close(r));await pg?.close();const target=path.resolve(dir);assert.ok(target.startsWith(path.resolve(os.tmpdir())+path.sep+'helpu-consultations-'));fs.rmSync(target,{recursive:true,force:true});}
});
