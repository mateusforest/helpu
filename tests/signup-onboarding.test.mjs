import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHmac} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {createDatabase} from '../portal/database.mjs';
import {createHelpuServer} from '../server.mjs';
import {createWhatsAppWelcome,signupWhatsAppInput,WELCOME_CONSENT_VERSION,WELCOME_NOTICE_VERSION,WELCOME_NOTICE_TEXT} from '../portal/whatsapp-welcome.mjs';

test('telefone opcional, normalização internacional e autorização explícita',()=>{
  assert.deepEqual(signupWhatsAppInput({}),{phone:'',consent:false});
  assert.equal(signupWhatsAppInput({phone:'(54) 99999-8888',whatsappWelcomeConsent:true}).phone,'5554999998888');
  assert.equal(signupWhatsAppInput({phone:'+351 912 345 678'}).phone,'351912345678');
  for(const input of [{phone:'texto1234567890'},{phone:'123'},{whatsappWelcomeConsent:true},{phone:1234},{whatsappWelcomeConsent:'on'}])assert.throws(()=>signupWhatsAppInput(input));
});

test('cadastro atual solicita boas-vindas sem checkbox e exige telefone e aviso válido',()=>{
 assert.deepEqual(signupWhatsAppInput({phone:'54999998888',welcomeNoticeVersion:WELCOME_NOTICE_VERSION}),{phone:'5554999998888',consent:true,noticeAccepted:true});
 assert.throws(()=>signupWhatsAppInput({welcomeNoticeVersion:WELCOME_NOTICE_VERSION}));
 assert.throws(()=>signupWhatsAppInput({phone:'54999998888',welcomeNoticeVersion:'invalido'}));
 assert.equal(signupWhatsAppInput({phone:'54999998888',whatsappWelcomeConsent:false}).consent,false);
 const html=fs.readFileSync(new URL('../dist/cadastro.html',import.meta.url),'utf8');assert.ok(!html.includes('name="whatsappWelcomeConsent"'));assert.ok(html.includes(WELCOME_NOTICE_TEXT));assert.match(html,/<input id="phone"[^>]*required/);
});

for(const postgres of [false,true])test('F04/F05: cadastro, boas-vindas e guia em '+(postgres?'PostgreSQL':'SQLite'),async t=>{
  const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'helpu-signup-guide-'));
  const env={HELPU_WHATSAPP_NUMBER:'15551234567',HELPU_WHATSAPP_PHONE_NUMBER_ID:'official',HELPU_WHATSAPP_ACCESS_TOKEN:'fake-token',HELPU_WHATSAPP_APP_SECRET:'fake-secret',HELPU_WHATSAPP_VERIFY_TOKEN:'fake-verify'};
  let database,pg,behavior='ok',releaseSend,sendStarted;
  const sent=[];
  const fetcher=async(url,request)=>{
    sent.push({url,body:JSON.parse(request.body)});
    if(behavior==='timeout')throw new Error('Provider timeout: secret must not appear');
    if(behavior==='hold'){sendStarted?.();await new Promise(resolve=>releaseSend=resolve);}
    if(behavior==='reject')return Response.json({error:{code:132001,message:'private diagnostic'}},{status:400});
    return Response.json({messages:[{id:'welcome-'+sent.length}]});
  };
  if(postgres){
    pg=await PGlite.create({parsers:{20:Number}});
    await pg.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA storage; CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint);');
    for(const file of ['20260913113000_preserve_helpu_data.sql','20260913140000_activate_cloud_runtime.sql'])await pg.exec(fs.readFileSync(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
    await pg.exec('INSERT INTO helpu.portal_migrations VALUES(1,1),(2,1),(3,1),(4,1); SET ROLE helpu_runtime;');
    let queued=Promise.resolve();
    database=createDatabase({pool:{async connect(){const prior=queued;let release;queued=new Promise(r=>release=r);await prior;return {async query(sql,args){const result=await pg.query(sql,args);return {...result,rowCount:result.affectedRows};},release};},async end(){}}});
  }
  const app=await createHelpuServer({dataDir,database,portalOptions:{startScheduler:false,whatsappChatEnv:env,whatsappChatFetch:fetcher}});
  await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+app.address().port,db=app.database;
  let serial=0;
  const request=async(url,method='GET',data,cookie='')=>{const response=await fetch(origin+url,{method,headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie},body:data===undefined?undefined:JSON.stringify(data)});return {status:response.status,body:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};};
  const signup=async(input={})=>{
    const email='signup-'+(++serial)+'@example.test';
    const response=await request('/api/auth/signup','POST',{name:'Teste',email,password:'only-for-test-123',company:'Empresa privada',...input});
    assert.equal(response.status,201,JSON.stringify(response.body));
    const boot=await request('/api/portal/bootstrap','GET',undefined,response.cookie);
    return {cookie:response.cookie,org:boot.body.companies[0].id,user:boot.body.user,email};
  };
  const api=(who,tail,method='GET',data)=>request('/api/portal/'+who.org+'/'+tail,method,data,who.cookie);
  const contact=async who=>JSON.parse((await db.prepare("SELECT data FROM records WHERE id=?").get('signup-wa:'+who.user.id)).data);
  const webhook=async(value,valid=true)=>{const body=JSON.stringify({entry:[{changes:[{value:{metadata:{phone_number_id:'official'},...value}}]}]});return fetch(origin+'/webhooks/helpu-whatsapp',{method:'POST',headers:{'Content-Type':'application/json','x-hub-signature-256':'sha256='+createHmac('sha256',valid?env.HELPU_WHATSAPP_APP_SECRET:'invalid').update(body).digest('hex')},body});};
  const stop=phone=>webhook({messages:[{id:'stop-'+serial,from:phone,type:'text',text:{body:'SAIR'},timestamp:String(Math.floor(Date.now()/1000))}]});
  try{
    const plain=await signup();
    await t.test('guia começa ativo e sem telefone não há mensagem nem vínculo',async()=>{
      assert.equal((await api(plain,'onboarding')).body.state,'active');
      assert.equal((await api(plain,'whatsapp-chat')).body.enabled,false);
      await app.portal.dispatchSignupWelcome();assert.equal(sent.length,0);
      assert.equal((await db.prepare("SELECT COUNT(*) AS count FROM records WHERE kind='signup_whatsapp_contact'").get()).count,0);
    });
    const noConsent=await signup({phone:'11999990001'});
    const opted=await signup({phone:'11999990002',welcomeNoticeVersion:WELCOME_NOTICE_VERSION});
    await t.test('contato é salvo sem autorizar operação e configuração ausente não impede cadastro',async()=>{
      assert.equal((await api(noConsent,'whatsapp-welcome')).body.state,'not_requested');
      assert.equal((await api(opted,'whatsapp-welcome')).body.state,'waiting_configuration');
      const value=(await api(opted,'whatsapp-chat')).body;
      assert.equal(value.phone,'5511999990002');assert.equal(value.enabled,false);assert.equal(value.verified,false);assert.equal(value.pending,false);
      const stored=await contact(opted);assert.equal(stored.consent.version,WELCOME_NOTICE_VERSION);assert.equal(stored.consent.text,WELCOME_NOTICE_TEXT);assert.equal(stored.consent.acceptance,'create_account');assert.equal(stored.consent.source,'signup');assert.equal(stored.phoneVerified,false);
      await app.portal.dispatchSignupWelcome();assert.equal(sent.length,0);
    });
    await t.test('template aprovado configurado sai uma vez, sem texto livre nem dados privados',async()=>{
      env.HELPU_WHATSAPP_WELCOME_TEMPLATE='helpu_boas_vindas_v1';
      await app.portal.dispatchSignupWelcome();await app.portal.dispatchSignupWelcome();
      assert.equal(sent.length,1);assert.deepEqual(sent[0].body,{messaging_product:'whatsapp',to:'5511999990002',type:'template',template:{name:'helpu_boas_vindas_v1',language:{code:'pt_BR'}}});
      assert.equal((await api(opted,'whatsapp-welcome')).body.state,'accepted');
      assert.equal((await api(opted,'whatsapp-chat')).body.enabled,false);
      const duplicate=await request('/api/auth/signup','POST',{email:opted.email,name:'Teste',password:'only-for-test-123',phone:'11999990002',whatsappWelcomeConsent:true});
      assert.equal(duplicate.status,409);await app.portal.dispatchSignupWelcome();assert.equal(sent.length,1);
    });
    await t.test('status assinado reconhece entrega e não regride com eventos antigos',async()=>{
      await webhook({statuses:[{id:'welcome-1',status:'delivered',recipient_id:'5511999990002'}]},false);
      assert.equal((await contact(opted)).state,'accepted');
      await webhook({statuses:[{id:'welcome-1',status:'delivered',recipient_id:'5511999990002'}]});
      await webhook({statuses:[{id:'welcome-1',status:'sent',recipient_id:'5511999990002'}]});
      assert.equal((await contact(opted)).state,'delivered');
    });
    await t.test('cancelamento funciona sem vínculo e o mesmo número não recebe novo convite',async()=>{
      const canceled=await signup({phone:'11999990003',whatsappWelcomeConsent:true});
      await api(canceled,'whatsapp-welcome','POST',{action:'revoke'});await app.portal.dispatchSignupWelcome();assert.equal(sent.length,1);
      const canceledByPhone=await signup({phone:'11999990004',whatsappWelcomeConsent:true});
      await stop('5511999990004');await app.portal.dispatchSignupWelcome();assert.equal((await contact(canceledByPhone)).state,'canceled');
      const repeat=await signup({phone:'11999990004',whatsappWelcomeConsent:true});await app.portal.dispatchSignupWelcome();assert.equal((await contact(repeat)).state,'canceled');assert.equal(sent.length,1);
    });
    await t.test('outro cadastro com mesmo telefone não duplica boas-vindas no dia',async()=>{
      const repeat=await signup({phone:'11999990002',whatsappWelcomeConsent:true});await app.portal.dispatchSignupWelcome();assert.equal((await contact(repeat)).state,'suppressed');assert.equal(sent.length,1);
    });
    await t.test('rejeição explícita e timeout são distintos e nunca repetidos automaticamente',async()=>{
      behavior='reject';const rejected=await signup({phone:'11999990005',whatsappWelcomeConsent:true});await app.portal.dispatchSignupWelcome();assert.equal((await contact(rejected)).state,'failed');
      behavior='timeout';const uncertain=await signup({phone:'11999990006',whatsappWelcomeConsent:true});await app.portal.dispatchSignupWelcome();assert.equal((await contact(uncertain)).state,'uncertain');
      const count=sent.length;behavior='ok';await app.portal.dispatchSignupWelcome();assert.equal(sent.length,count);
      assert.ok(!JSON.stringify((await api(uncertain,'whatsapp-welcome')).body).includes('secret'));
    });
    await t.test('confirmação antiga de operação não nasce do cadastro; guia é isolado e retomável',async()=>{
      assert.equal((await request('/api/portal/'+opted.org+'/onboarding')).status,401);
      assert.equal((await request('/api/portal/'+opted.org+'/onboarding','GET',undefined,plain.cookie)).status,404);
      assert.equal((await request('/api/portal/'+opted.org+'/whatsapp-welcome','POST',{action:'revoke'},plain.cookie)).status,404);
      await api(opted,'onboarding','POST',{action:'step',step:'company'});
      await api(opted,'onboarding','POST',{action:'goal',goal:'offer'});
      await api(opted,'onboarding','POST',{action:'skip'});
      let state=(await api(opted,'onboarding')).body;assert.equal(state.state,'paused');assert.deepEqual(state.completed,['company']);assert.equal(state.goal,'offer');
      await api(opted,'onboarding','POST',{action:'resume'});assert.equal((await api(opted,'onboarding')).body.state,'active');
      assert.equal((await api(opted,'onboarding','POST',{action:'step',step:'run_ai'})).status,400);
      assert.deepEqual((await api(plain,'onboarding')).body.completed,[]);
      const other=await request('/api/portal/companies','POST',{name:'Outra empresa'},opted.cookie);
      assert.equal((await request('/api/portal/'+other.body.id+'/onboarding','GET',undefined,opted.cookie)).body.state,'available');
      await api(opted,'onboarding','POST',{action:'finish'});assert.equal((await api(opted,'onboarding')).body.state,'completed');
      await api(opted,'onboarding','POST',{action:'resume'});assert.deepEqual((await api(opted,'onboarding')).body.completed,[]);
      assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM jobs').get()).count,0);
    });
    await t.test('prazo expirado impede disparos antigos após configurar o canal',async()=>{
      const expired=await signup({phone:'11999990007',whatsappWelcomeConsent:true}),count=sent.length;
      const future=createWhatsAppWelcome({db,env,fetcher,now:()=>Date.now()+2*86400000});await db.scope(()=>future.tick());
      assert.equal((await contact(expired)).state,'expired');assert.equal(sent.length,count);
    });
    if(!postgres)await t.test('dois workers concorrentes e revogação durante envio preservam um único efeito',async()=>{
      const pending=await signup({phone:'11999990008',whatsappWelcomeConsent:true});behavior='hold';
      const started=new Promise(resolve=>sendStarted=resolve),first=app.portal.dispatchSignupWelcome();await started;
      await app.portal.dispatchSignupWelcome();await api(pending,'whatsapp-welcome','POST',{action:'revoke'});
      releaseSend();await first;behavior='ok';
      assert.equal(sent.filter(s=>s.body.to==='5511999990008').length,1);assert.equal((await api(pending,'whatsapp-welcome')).body.consent,false);
      await app.portal.dispatchSignupWelcome();assert.equal(sent.filter(s=>s.body.to==='5511999990008').length,1);
    });
    if(!postgres)await t.test('falha na persistência do guia desfaz usuário, empresa e sessão juntos',async()=>{
      const before=(await db.prepare('SELECT COUNT(*) AS count FROM companies').get()).count;
      await db.exec("CREATE TRIGGER fail_signup_guide BEFORE INSERT ON records WHEN NEW.external_id LIKE 'onboarding:%' BEGIN SELECT RAISE(ABORT,'simulated signup failure'); END");
      try{
        const failed=await request('/api/auth/signup','POST',{name:'Teste rollback',email:'rollback@example.test',password:'only-for-test-123'});
        assert.equal(failed.status,500);
        assert.equal(await db.prepare('SELECT id FROM users WHERE email=?').get('rollback@example.test'),undefined);
        assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM companies').get()).count,before);
      }finally{await db.exec('DROP TRIGGER fail_signup_guide');}
    });
  }finally{
    await app.portal.shutdown();await new Promise(resolve=>app.close(resolve));await pg?.close();
    const resolved=path.resolve(dataDir);assert.ok(resolved.startsWith(path.resolve(os.tmpdir())+path.sep+'helpu-signup-guide-'));fs.rmSync(resolved,{recursive:true,force:true});
  }
});
