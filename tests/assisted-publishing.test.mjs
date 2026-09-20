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
import {createAssistedPublishing} from '../portal/assisted-publishing.mjs';

for(const postgres of [false,true])test('F07 publicação assistida em '+(postgres?'PostgreSQL':'SQLite'),async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'helpu-assisted-'));let pg,database,time=Date.now();const env={};
  if(postgres){
    pg=await PGlite.create({parsers:{20:Number}});await pg.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA storage; CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint);');
    for(const file of ['20260913113000_preserve_helpu_data.sql','20260913140000_activate_cloud_runtime.sql'])await pg.exec(fs.readFileSync(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
    await pg.exec('INSERT INTO helpu.portal_migrations VALUES(1,1),(2,1),(3,1),(4,1); SET ROLE helpu_runtime;');
    let queued=Promise.resolve();database=createDatabase({pool:{async connect(){const prior=queued;let release;queued=new Promise(r=>release=r);await prior;return {async query(sql,args){const result=await pg.query(sql,args);return {...result,rowCount:result.affectedRows};},release};},async end(){}}});
  }
  const app=await createHelpuServer({dataDir:dir,database,portalOptions:{startScheduler:false,operatorEnv:env,assistedNow:()=>time,whatsappChatEnv:{}}});await new Promise(r=>app.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+app.address().port,db=app.database;
  async function request(url,who,body,foreignOrigin=false){const res=await fetch(origin+url,{method:body?'POST':'GET',headers:{Cookie:who?.cookie||'',Origin:foreignOrigin?'https://evil.example':origin,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:res.status,body:await res.json(),cookie:res.headers.get('set-cookie')?.split(';')[0]};}
  async function signup(name){const s=await request('/api/auth/signup',null,{name,email:name+'@example.test',password:'only-test-12345',company:name});assert.equal(s.status,201);const b=await request('/api/portal/bootstrap',s);return {cookie:s.cookie,user:b.body.user,org:b.body.companies[0].id};}
  const client=(who,body)=>request('/api/portal/'+who.org+'/assisted',who,body);
  const admin=(body,who=operator)=>request('/api/portal/assisted-admin',who,body);
  const post=async(who,body)=>{const r=await client(who,body);assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};
  const op=async(r,action,extra={})=>{const v=await admin({orgId:r.orgId,id:r.id,version:r.version,action,...extra});assert.equal(v.status,200,JSON.stringify(v.body));return v.body;};
  let operator,a,b,service,assetId,r;
  try{
    operator=await signup('Operator');a=await signup('ClientA');b=await signup('ClientB');env.HELPU_OPERATOR_USER_IDS=String(operator.user.id);
    const bytes=testPng();assetId=randomUUID();fs.writeFileSync(path.join(dir,'uploads',assetId+'.png'),bytes);await db.prepare('INSERT INTO assets(id,org_id,name,mime,size,path,source_url,created_at) VALUES(?,?,?,?,?,?,?,?)').run(assetId,a.org,'Imagem final','image/png',bytes.length,assetId+'.png',null,time);
  }catch(e){await app.portal.shutdown();await new Promise(r=>app.close(r));await pg?.close();throw e;}
  try{
    const future=()=>new Date(time+60000).toISOString();
    const input=()=>({action:'create',requestKey:randomUUID(),title:'Visite o imóvel',caption:'Agende uma visita.',format:'feed',assetIds:[assetId],scheduledAt:future(),timeZone:'America/Sao_Paulo',boost:{requested:true,budgetCents:5000,objective:'Visitas ao perfil',audience:'Vacaria',startAt:new Date(time+120000).toISOString(),endAt:new Date(time+86400000).toISOString()}});
    await t.test('admin exige função explícita; cliente e outra empresa ficam isolados',async()=>{
      assert.equal((await admin(undefined,a)).status,403);assert.equal((await request('/api/portal/assisted-admin',null)).status,401);
      assert.equal((await request('/api/portal/'+a.org+'/assisted',b)).status,404);
      assert.equal((await request('/api/portal/bootstrap',a)).body.operator,false);assert.equal((await request('/api/portal/bootstrap',operator)).body.operator,true);
      assert.equal((await request('/api/portal/'+a.org+'/assisted',a,{action:'authorize',version:0,consent:true,account:'cliente'},true)).status,403);
      assert.equal((await client(a,input())).status,409);assert.equal((await client(a,{action:'authorize',version:0,account:'cliente'})).status,400);
      service=await post(a,{action:'authorize',version:0,account:'cliente',consent:true});assert.equal(service.delegated,null);
    });
    await t.test('designação por e-mail exige conta anterior ao corte e falha fechada',async()=>{
      const email=operator.user.email;
      const make=env=>createAssistedPublishing({db,env,assetPath:()=>'',now:()=>time+10000});
      const allowed=await make({HELPU_OPERATOR_ACCOUNT_EMAIL:email,HELPU_OPERATOR_ACCOUNT_CREATED_BEFORE:String(time+10000)});assert.equal(allowed.operator(operator.user),true);assert.equal(allowed.operator(a.user),false);
      assert.equal((await make({HELPU_OPERATOR_ACCOUNT_EMAIL:email})).operator(operator.user),false);
      assert.equal((await make({HELPU_OPERATOR_ACCOUNT_EMAIL:email,HELPU_OPERATOR_ACCOUNT_CREATED_BEFORE:'1'})).operator(operator.user),false);
      assert.equal((await make({HELPU_OPERATOR_ACCOUNT_EMAIL:email,HELPU_OPERATOR_ACCOUNT_CREATED_BEFORE:String(time+20000)})).operator(operator.user),false);
      assert.equal((await make({HELPU_OPERATOR_ACCOUNT_EMAIL:'absent@example.test',HELPU_OPERATOR_ACCOUNT_CREATED_BEFORE:String(time+10000)})).operator(operator.user),false);
    });
    await t.test('pedido idempotente e seleção privada de arquivos, sem publicação ou cobrança',async()=>{
      await post(b,{action:'authorize',version:0,account:'outro',consent:true});assert.equal((await client(b,input())).status,400);
      const d=input();r=await post(a,d);const same=await post(a,d);assert.equal(same.id,r.id);assert.equal(same.version,1);assert.equal(r.boost.state,'requested');assert.equal(r.boost.terms.feeCents,null);
      assert.equal((await client(b)).body.requests.length,0);assert.equal((await admin()).body.requests.length,1);
      assert.equal((await fetch(origin+'/api/portal/files/'+assetId,{headers:{Cookie:operator.cookie}})).status,200);
      assert.equal((await fetch(origin+'/api/portal/files/'+assetId,{headers:{Cookie:b.cookie}})).status,404);
      assert.equal((await admin({orgId:r.orgId,id:r.id,version:r.version,action:'approve',consent:true})).status,403);
      assert.equal((await client(a,{id:r.id,version:r.version,action:'submit_review'})).status,403);
    });
    await t.test('aprovação vinculada à versão; edição invalida aceite e versão antiga é rejeitada',async()=>{
      r=await op(r,'submit_review');const old=r;r=await post(a,{action:'approve',id:r.id,version:r.version,consent:true});assert.equal(r.state,'scheduled');
      assert.equal((await client(a,{action:'approve',id:old.id,version:old.version,consent:true})).status,409);
      r=await post(a,{...input(),action:'revise',id:r.id,version:r.version,caption:'Nova legenda'});assert.equal(r.approval,null);assert.equal(r.revision,2);assert.equal(r.revisions[0].snapshot.caption,'Agende uma visita.');
      assert.equal((await admin({orgId:r.orgId,id:r.id,version:r.version,action:'start_publication'})).status,409);
    });
    await t.test('revogação bloqueia arquivos e novas execuções; reautorização exige revisão',async()=>{
      service=await post(a,{action:'revoke',version:service.version});assert.equal((await fetch(origin+'/api/portal/files/'+assetId,{headers:{Cookie:operator.cookie}})).status,404);
      assert.equal((await admin({orgId:r.orgId,id:r.id,version:r.version,action:'submit_review'})).status,409);
      service=await post(a,{action:'authorize',version:service.version,account:'cliente',consent:true});assert.equal((await admin({orgId:r.orgId,id:r.id,version:r.version,action:'submit_review'})).status,409);
      r=await post(a,{...input(),action:'revise',id:r.id,version:r.version});r=await op(r,'submit_review');r=await post(a,{action:'approve',id:r.id,version:r.version,consent:true});
      assert.equal((await admin({orgId:r.orgId,id:r.id,version:r.version,action:'start_publication'})).status,409);
      const verified=await admin({orgId:a.org,action:'verify_access',version:service.version,evidence:'Conferido manualmente na Meta: conta cliente.'});assert.equal(verified.status,200);service=verified.body;
      assert.equal((await admin({orgId:r.orgId,id:r.id,version:r.version,action:'start_publication'})).status,409);
    });
    await t.test('orçamento revisto precisa de novo aceite e não inicia anúncio',async()=>{
      r=await op(r,'quote',{budgetCents:7000,feeCents:1500,startAt:new Date(time+120000).toISOString(),endAt:new Date(time+86400000).toISOString()});assert.equal(r.boost.state,'quoted');
      r=await post(a,{action:'boost_approve',id:r.id,version:r.version,consent:true});assert.equal(r.boost.state,'approved');
      r=await op(r,'quote',{budgetCents:5000,feeCents:0,startAt:new Date(time+120000).toISOString(),endAt:new Date(time+86400000).toISOString()});assert.equal(r.boost.approval,null);
      r=await post(a,{action:'boost_approve',id:r.id,version:r.version,consent:true});
      assert.equal((await admin({orgId:r.orgId,id:r.id,version:r.version,action:'boost_status',state:'active',url:'https://adsmanager.facebook.com/adsmanager/manage',evidence:'Registro'})).status,409);
    });
    await t.test('arquivo alterado bloqueia; reserva única; resultado incerto não permite repetição',async()=>{
      time+=61000;const file=path.join(dir,'uploads',assetId+'.png'),original=fs.readFileSync(file);fs.appendFileSync(file,'changed');assert.equal((await admin({orgId:r.orgId,id:r.id,version:r.version,action:'start_publication'})).status,409);fs.writeFileSync(file,original);
      const attempts=await Promise.all([admin({orgId:r.orgId,id:r.id,version:r.version,action:'start_publication'}),admin({orgId:r.orgId,id:r.id,version:r.version,action:'start_publication'})]);assert.deepEqual(attempts.map(a=>a.status).sort(),[200,409]);r=attempts.find(a=>a.status===200).body;
      r=await op(r,'failed',{note:'A confirmação não apareceu na Meta.'});assert.equal(r.state,'uncertain');assert.equal((await admin({orgId:r.orgId,id:r.id,version:r.version,action:'start_publication'})).status,409);
      assert.equal((await admin({orgId:r.orgId,id:r.id,version:r.version,action:'published',url:'javascript:alert(1)'})).status,400);
      r=await op(r,'published',{url:'https://www.instagram.com/p/test-proof/'});assert.equal(r.state,'published');assert.equal(r.publication.source,'manual_operator');
      assert.equal((await admin({orgId:r.orgId,id:r.id,version:r.version,action:'published',url:'https://www.instagram.com/p/test-proof/'})).status,409);
    });
    await t.test('anúncio exige sequência e evidências; não há jobs nem mensagens automáticas',async()=>{
      time+=60000;for(const state of ['configured','meta_review','active','closed','results'])r=await op(r,'boost_status',{state,url:'https://adsmanager.facebook.com/adsmanager/manage/campaigns',evidence:state==='results'?'Resultados observados: 200 impressões; sem promessa de vendas.':'Conferido manualmente na conta do cliente.'});
      assert.equal(r.boost.evidence.length,5);assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM jobs').get()).count,0);assert.ok(r.history.length>10);assert.equal(r.revisions.length,2);
      env.HELPU_OPERATOR_USER_IDS='';assert.equal((await admin()).status,403);
    });
  }finally{await app.portal.shutdown();await new Promise(r=>app.close(r));await pg?.close();const target=path.resolve(dir);assert.ok(target.startsWith(path.resolve(os.tmpdir())+path.sep+'helpu-assisted-'));fs.rmSync(target,{recursive:true,force:true});}
});
