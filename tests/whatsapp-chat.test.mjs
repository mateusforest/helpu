import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHmac} from 'node:crypto';
import {createHelpuServer} from '../server.mjs';
import {whatsappPhone,createWhatsAppChat} from '../portal/whatsapp-chat.mjs';
import {createDatabase} from '../portal/database.mjs';
import {PGlite} from '@electric-sql/pglite';

for(const postgres of [false,true])test('WhatsApp oficial: telefone, conversa e isolamento em '+(postgres?'PostgreSQL':'SQLite'),async t=>{
 const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'helpu-wa-chat-')),sent=[];
 const env={HELPU_WHATSAPP_NUMBER:'15551234567',HELPU_WHATSAPP_PHONE_NUMBER_ID:'official-phone',HELPU_WHATSAPP_ACCESS_TOKEN:'fake-token',HELPU_WHATSAPP_APP_SECRET:'fake-secret',HELPU_WHATSAPP_VERIFY_TOKEN:'fake-verify'};
 let database,pg,failSend=false,failResponse=false,responseCalls=0;
 if(postgres){
  pg=await PGlite.create({parsers:{20:Number}});
  await pg.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA storage; CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint);');
  for(const file of ['20260913113000_preserve_helpu_data.sql','20260913140000_activate_cloud_runtime.sql'])await pg.exec(fs.readFileSync(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
  await pg.exec('INSERT INTO helpu.portal_migrations VALUES(1,1),(2,1),(3,1),(4,1); SET ROLE helpu_runtime;');
  let queued=Promise.resolve();
  database=createDatabase({pool:{async connect(){const prior=queued;let release;queued=new Promise(r=>release=r);await prior;return {async query(sql,args){const result=await pg.query(sql,args);return {...result,rowCount:result.affectedRows};},release};},async end(){}}});
 }
 const inboundBytes=Buffer.from([137,80,78,71,13,10,26,10,1,2,3]);let downloads=0;
 const server=await createHelpuServer({dataDir,database,portalOptions:{startScheduler:false,whatsappChatEnv:env,openaiEnv:{OPENAI_API_KEY:'fake-openai'},whatsappChatFetch:async(url,request)=>{if(url.includes('/123456?'))return Response.json({url:'https://lookaside.fbsbx.com/media-fixture',mime_type:'image/png',file_size:inboundBytes.length});if(url==='https://lookaside.fbsbx.com/media-fixture'){downloads++;return new Response(inboundBytes);}if(url.endsWith('/media'))return {ok:true,json:async()=>({id:'uploaded-media'})};sent.push({url,body:JSON.parse(request.body)});if(failSend)throw new Error('Timeout');return {ok:true,json:async()=>({messages:[{id:'sent-'+sent.length}]})};},conversationRespond:async()=>{responseCalls++;if(failResponse)throw new Error('Falha simulada na resposta.');return {status:'completed',output:[{type:'message',content:[{type:'output_text',text:'Seu plano foi preparado.'}]}]};}}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port,db=server.database;
 const request=async(url,method='GET',data,cookie='')=>{const r=await fetch(origin+url,{method,headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie},body:data===undefined?undefined:JSON.stringify(data)});return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};};
 const signup=async email=>{const user=await request('/api/auth/signup','POST',{email,password:'senha-longa-de-teste',name:'Pessoa',company:'Teste'});assert.equal(user.status,201);const boot=await request('/api/portal/bootstrap','GET',undefined,user.cookie);return {cookie:user.cookie,org:boot.body.companies[0].id};};
 const one=await signup('wa-one@example.test'),two=await signup('wa-two@example.test');
 const api=(who,tail,method='GET',body)=>request('/api/portal/'+who.org+'/'+tail,method,body,who.cookie);
 let count=0;
 const webhook=async(text,from='5511988887777',{valid=true,phoneId='official-phone',id,media,timestamp=String(Math.floor(Date.now()/1000))}={})=>{
  const value={metadata:{phone_number_id:phoneId,display_phone_number:env.HELPU_WHATSAPP_NUMBER},messages:[{id:id||'wamid-'+(++count),from,type:media?'image':'text',...media?{image:{id:media,caption:text}}:{text:{body:text}},timestamp}]},body=JSON.stringify({entry:[{changes:[{value}]}]});
  const r=await fetch(origin+'/webhooks/helpu-whatsapp',{method:'POST',headers:{'Content-Type':'application/json','x-hub-signature-256':'sha256='+createHmac('sha256',valid?env.HELPU_WHATSAPP_APP_SECRET:'wrong').update(body).digest('hex')},body});return r.status;
 };
 try{
  await t.test('rota exige sessão e consentimento; telefone oficial não pode ser destinatário',async()=>{
   assert.equal((await request('/api/portal/'+one.org+'/whatsapp-chat')).status,401);
   assert.equal((await request('/api/portal/'+one.org+'/whatsapp-chat','GET',undefined,two.cookie)).status,404);
   assert.equal((await api(one,'whatsapp-chat','POST',{phone:'11988887777',enabled:true})).status,422);
   assert.equal((await api(one,'whatsapp-chat','POST',{phone:env.HELPU_WHATSAPP_NUMBER,enabled:true,consent:true})).status,422);
  });
  const thread=(await api(one,'conversations','POST',{title:'Minha campanha'})).body.id;
  const saved=await api(one,'whatsapp-chat','POST',{phone:'(11) 98888-7777',enabled:true,consent:true,mode:'execute',threadId:thread});
  assert.equal(saved.status,200);assert.equal(saved.body.enabled,false);
  assert.equal(new URL(saved.body.connectUrl).pathname,'/15551234567');
  const code=new URL(saved.body.connectUrl).searchParams.get('text');
  await t.test('código só confirma no telefone certo, com assinatura e número oficial certos',async()=>{
   assert.equal(await webhook(code,undefined,{valid:false}),403);
   await webhook(code,'5511977776666');await webhook(code,undefined,{phoneId:'other'});
   assert.equal((await api(one,'whatsapp-chat')).body.enabled,false);
   await webhook(code);const state=(await api(one,'whatsapp-chat')).body;
   assert.equal(state.enabled,true);assert.equal(state.threadId,thread);assert.equal(state.verified,true);
   const stored=JSON.stringify(await db.prepare("SELECT data FROM records WHERE kind='connection_validation' AND external_id LIKE 'whatsapp-chat:%'").all());
   assert.ok(!stored.includes(code.slice(6)));
   await webhook(code);assert.equal((await api(one,'conversations/'+thread)).body.messages.length,1);
  });
  await t.test('texto usa conversa real, deduplica webhooks e devolve resposta uma vez',async()=>{
   await webhook('Prepare meu plano',undefined,{id:'same-message'});await webhook('Prepare meu plano',undefined,{id:'same-message'});
   await db.scope(()=>server.portal.tick());await db.scope(()=>server.portal.tick());
   const data=(await api(one,'conversations/'+thread)).body;
   assert.equal(data.messages.filter(m=>m.role==='user').length,1);
   assert.ok(data.messages.some(m=>m.text==='Seu plano foi preparado.'));
   assert.equal(sent.filter(x=>x.body.text?.body==='Seu plano foi preparado.').length,1);
   const n=sent.length;await db.scope(()=>server.portal.tick());assert.equal(sent.length,n);
   assert.ok(sent.every(x=>x.body.to==='5511988887777'));
  });
  await t.test('limite diário responde no WhatsApp sem consumir IA nem repetir o aviso',async()=>{
   await api(one,'company','PATCH',{policy:{dailyRuns:1}});
   const calls=responseCalls;
   try{
    await webhook('Prepare outro plano',undefined,{id:'daily-limit'});
    await db.scope(()=>server.portal.tick());await db.scope(()=>server.portal.tick());
    const data=(await api(one,'conversations/'+thread)).body;
    const input=data.messages.find(m=>m.text==='Prepare outro plano');
    const replies=data.messages.filter(m=>m.role==='assistant'&&m.jobId===input.jobId);
    assert.equal(replies.length,1);assert.match(replies[0].text,/limite diário/);
    assert.equal(data.jobs.find(j=>j.id===input.jobId).state,'blocked');
    assert.equal(responseCalls,calls);
    assert.equal(sent.filter(x=>x.body.text?.body===replies[0].text).length,1);
    await webhook('Prepare outro plano',undefined,{id:'daily-limit'});
    await db.scope(()=>server.portal.tick());
    assert.equal(sent.filter(x=>x.body.text?.body===replies[0].text).length,1);
    assert.equal(JSON.parse((await db.prepare('SELECT policy FROM companies WHERE id=?').get(one.org)).policy).dailyRuns,1);
   }finally{await api(one,'company','PATCH',{policy:{dailyRuns:8}});}
  });
  await t.test('falha já explicada na conversa não duplica o aviso no WhatsApp',async()=>{
   failResponse=true;await webhook('Converse sobre o plano',undefined,{id:'response-failure'});
   try{await db.scope(()=>server.portal.tick());}finally{failResponse=false;}
   await db.scope(()=>server.portal.tick());
   const data=(await api(one,'conversations/'+thread)).body;
   const input=data.messages.find(m=>m.text==='Converse sobre o plano');
   assert.equal(data.messages.filter(m=>m.role==='assistant'&&m.jobId===input.jobId).length,1);
   assert.equal(sent.filter(x=>x.body.text?.body==='Falha simulada na resposta.').length,1);
  });
  await t.test('janela expirada aguarda nova mensagem e limite de envios é respeitado',async()=>{
   const link=await db.prepare("SELECT * FROM records WHERE kind='whatsapp_chat_link'").get();
   await db.prepare('UPDATE records SET data=? WHERE id=?').run(JSON.stringify({...JSON.parse(link.data),lastInboundAt:Date.now()-90000000}),link.id);
   await server.portal.conversation.appendMessage(one.org,thread,'assistant','Entrega aguardando janela');
   const n=sent.length;await db.scope(()=>server.portal.tick());assert.equal(sent.length,n);
   assert.equal((await api(one,'whatsapp-chat')).body.deliveryState,'waiting_window');
   await webhook('Pode continuar');env.HELPU_WHATSAPP_DAILY_MESSAGES='1';await db.scope(()=>server.portal.tick());assert.equal(sent.length,n);
   env.HELPU_WHATSAPP_DAILY_MESSAGES='60';await db.scope(()=>server.portal.tick());assert.ok(sent.some(x=>x.body.text?.body==='Entrega aguardando janela'));
  });
  await t.test('anexo recebido fica privado, vinculado à conversa e não duplica no replay',async()=>{
   await webhook('Use esta imagem como referência',undefined,{id:'inbound-image',media:'123456'});
   await db.scope(()=>server.portal.tick());await db.scope(()=>server.portal.tick());
   const messages=(await api(one,'conversations/'+thread)).body.messages;
   const incoming=messages.find(m=>m.role==='user'&&m.text==='Use esta imagem como referência');assert.equal(incoming.attachments.length,1);
   const assetId=incoming.attachments[0];assert.equal((await fetch(origin+'/api/portal/files/'+assetId,{headers:{Cookie:two.cookie}})).status,404);
   await webhook('Use esta imagem como referência',undefined,{id:'inbound-image',media:'123456'});await db.scope(()=>server.portal.tick());assert.equal(downloads,1);
   assert.equal((await api(one,'conversations/'+thread)).body.messages.filter(m=>m.text==='Use esta imagem como referência').length,1);
  });
  await t.test('imagem privada é enviada via mídia oficial e timeout não repete a mensagem',async()=>{
   const response=await fetch(origin+'/api/portal/'+one.org+'/files',{method:'POST',headers:{Origin:origin,Cookie:one.cookie,'Content-Type':'image/png','X-File-Name':'referencia.png'},body:Buffer.from([137,80,78,71,13,10,26,10,1,2,3])});
   assert.equal(response.status,201);const asset=await response.json();
   await server.portal.conversation.appendMessage(one.org,thread,'assistant','Sua imagem',null,[asset.id]);
   await db.scope(()=>server.portal.tick());assert.ok(sent.some(x=>x.body.image?.id==='uploaded-media'));
   failSend=true;await server.portal.conversation.appendMessage(one.org,thread,'assistant','Entrega incerta');await db.scope(()=>server.portal.tick());
   failSend=false;const n=sent.length;await db.scope(()=>server.portal.tick());assert.equal(sent.length,n);
   assert.match((await api(one,'whatsapp-chat')).body.lastError,/não foi confirmada/);
  });
  await t.test('fora da janela usa somente template configurado, sem duplicar aviso ou enviar arquivo livre',async()=>{
   const link=await db.prepare("SELECT * FROM records WHERE kind='whatsapp_chat_link'").get();
   await db.prepare('UPDATE records SET data=? WHERE id=?').run(JSON.stringify({...JSON.parse(link.data),lastInboundAt:Date.now()-90000000}),link.id);
   const asset=await db.prepare('SELECT id FROM assets WHERE org_id=? LIMIT 1').get(one.org);
   await server.portal.conversation.appendMessage(one.org,thread,'assistant','Nova entrega agendada',null,[asset.id]);
   const before=sent.length;await db.scope(()=>server.portal.tick());assert.equal(sent.length,before);
   env.HELPU_WHATSAPP_READY_TEMPLATE='helpu_conteudo_pronto';await db.scope(()=>server.portal.tick());
   assert.equal(sent.length,before+1);assert.equal(sent.at(-1).body.type,'template');assert.equal(sent.at(-1).body.template.language.code,'pt_BR');
   await db.scope(()=>server.portal.tick());assert.equal(sent.length,before+1);
   delete env.HELPU_WHATSAPP_READY_TEMPLATE;
  });
  await t.test('desativar bloqueia novas entradas e saídas; convite antigo não reativa',async()=>{
   const n=sent.length;
   await api(one,'whatsapp-chat','POST',{phone:'11988887777',enabled:false});
   await webhook('Não executar');await webhook(code);
   await server.portal.conversation.appendMessage(one.org,thread,'assistant','Não enviar');
   await db.scope(()=>server.portal.tick());assert.equal(sent.length,n);
   assert.equal((await api(one,'whatsapp-chat')).body.enabled,false);
  });
 }finally{await server.portal.shutdown();await new Promise(resolve=>server.close(resolve));await pg?.close();fs.rmSync(dataDir,{recursive:true,force:true});}
});

test('webhook oficial é encaminhado à função online e dispara o worker autenticado',()=>{const config=JSON.parse(fs.readFileSync(new URL('../vercel.json',import.meta.url)));assert.ok(config.rewrites.some(r=>r.source==='/webhooks/helpu-whatsapp'&&r.destination==='/api/runtime'));const source=fs.readFileSync(new URL('../api/runtime.mjs',import.meta.url),'utf8');assert.match(source,/route==='\/webhooks\/helpu-whatsapp'/);});

test('telefones da Meta preservam país; entrada brasileira continua simples',()=>{
 assert.equal(whatsappPhone('15551234567',{international:true}),'15551234567');
 assert.equal(whatsappPhone('+1 (555) 123-4567'),'15551234567');
 assert.equal(whatsappPhone('(54) 99990-2688'),'5554999902688');
 assert.equal(whatsappPhone('5554999902688',{international:true}),'5554999902688');
 assert.throws(()=>whatsappPhone('123',{international:true}));
});
test('credenciais sem número oficial não indicam canal configurado',async()=>{
 const chat=createWhatsAppChat({db:{},metadata:async()=>({}),env:{HELPU_WHATSAPP_ACCESS_TOKEN:'test',HELPU_WHATSAPP_PHONE_NUMBER_ID:'test',HELPU_WHATSAPP_APP_SECRET:'test',HELPU_WHATSAPP_VERIFY_TOKEN:'test'}});
 const state=await chat.status('org',{id:1});assert.equal(state.configured,false);assert.equal(state.officialPhone,'');
});
