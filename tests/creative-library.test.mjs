import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHmac} from 'node:crypto';
import {createHelpuServer} from '../server.mjs';
import {testPng} from './image-fixture.mjs';

test('biblioteca criativa: pausa, retomada, identidade, referência e revisão isoladas por empresa',async t=>{
 const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'helpu-creative-'));
 const responses=[],inputs=[],imageInputs=[],plans=[],sent=[];
 const env={HELPU_WHATSAPP_BATCH_MS:'0',HELPU_WHATSAPP_NUMBER:'15551234567',HELPU_WHATSAPP_PHONE_NUMBER_ID:'official-phone',HELPU_WHATSAPP_ACCESS_TOKEN:'fake',HELPU_WHATSAPP_APP_SECRET:'fake-secret',HELPU_WHATSAPP_VERIFY_TOKEN:'fake'};
 const server=await createHelpuServer({dataDir,portalOptions: {operatorEnv:{HELPU_OPERATOR_USER_IDS:'1,2'},startScheduler:false,openaiEnv:{OPENAI_API_KEY:'fake'},whatsappChatEnv:env,whatsappChatFetch:async(url,r)=>{
  if(url.includes('/123456?'))return Response.json({url:'https://lookaside.fbsbx.com/creative',mime_type:'image/png',file_size:testPng().length});
  if(url==='https://lookaside.fbsbx.com/creative')return new Response(testPng());
  sent.push(r);return Response.json({messages:[{id:'sent-'+sent.length}]});
 },conversationRespond:async(_,body)=>{inputs.push(body);return responses.shift()||{status:'completed',output:[{type:'message',content:[{type:'output_text',text:'Certo, aguardarei.'}]}]};},creationRespond:async(_,body)=>{
  const value=JSON.parse(typeof body.input==='string'?body.input:body.input[0].content[0].text);plans.push(value);
  return {status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({caption:'Legenda do imóvel',slides:[{title:'Imóvel',text:'Conheça',visualPrompt:'Imagem clara, texto Conheça, bom respiro',background:'#ffffff',textColor:'#123e30'}]})}]}]};
 },providers:{generateImage:async(_,input)=>{imageInputs.push(input);const [w,h]=input.size.split('x').map(Number);return {base64:testPng(w,h).toString('base64')};}}}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const request=async(url,method='GET',data,cookie)=>{const r=await fetch(origin+url,{method,headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie||''},body:data===undefined?undefined:JSON.stringify(data)});return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};};
 const signup=async email=>{const a=await request('/api/auth/signup','POST',{email,password:'long-test-password',name:'Teste',company:'Empresa'});const b=await request('/api/portal/bootstrap','GET',undefined,a.cookie);return {cookie:a.cookie,org:b.body.companies[0].id};};
 const api=(u,tail,method='GET',data)=>request('/api/portal/'+u.org+'/'+tail,method,data,u.cookie);
 const one=await signup('creative-one@example.test'),two=await signup('creative-two@example.test');
 const thread=async u=>(await api(u,'conversations','POST',{title:'Criação'})).body.id;
 const upload=async(u,name)=>{const r=await fetch(origin+'/api/portal/'+u.org+'/files',{method:'POST',headers:{Origin:origin,Cookie:u.cookie,'X-File-Name':name},body:testPng()});return r.json();};
 const mediaCall=(prompt='Continue o pedido')=>({status:'completed',output:[{type:'function_call',name:'create_media',call_id:'create-'+inputs.length,arguments:JSON.stringify({prompt,format:'feed'})}]});
 const tick=async()=>server.portal.tick();
 const finish=async(id)=>{for(let n=0;n<12;n++){const c=(await api(one,'creations/'+id)).body.creation;if(c.status==='complete')return c;assert.ok(!['failed','blocked','uncertain'].includes(c.status),JSON.stringify(c));await tick();}assert.fail('Não concluiu');};
 try{
  await api(one,'company','PATCH',{policy:{dailyRuns:100,dailyMedia:100}});
  const a=await upload(one,'material.png'),foreign=await upload(two,'segredo.png');
  await t.test('classificação exige empresa correta e não transforma foto de produto em identidade',async()=>{
   assert.equal((await api(one,'creative-library','POST',{action:'classify',assetId:foreign.id,role:'reference'})).status,404);
   assert.equal((await api(one,'creative-library','POST',{action:'classify',assetId:a.id,role:'material'})).status,200);
   assert.equal((await api(one,'creative-library')).body.defined,false);
  });
  await t.test('cancelar descarta o pedido pendente sem gastar uma chamada de IA',async()=>{
   const tid=await thread(two),before=inputs.length;
   await api(two,'conversations/'+tid+'/messages','POST',{text:'Gere um vídeo para a empresa',idempotencyKey:'cancel-create-start'});await tick();
   assert.ok((await server.portal.conversation.waitingForReference(two.org,tid)).request);
   await api(two,'conversations/'+tid+'/messages','POST',{text:'Cancele esse pedido',idempotencyKey:'cancel-create-stop'});await tick();
   assert.equal((await server.portal.conversation.waitingForReference(two.org,tid)).request,undefined);assert.equal(inputs.length,before);
  });
  const id=await thread(one);
  await t.test('sem direção pergunta uma vez, salva briefing sem chamar IA ou criar mídia',async()=>{
   const r=await api(one,'conversations/'+id+'/messages','POST',{text:'Crie uma imagem do imóvel para feed',attachments:[a.id],idempotencyKey:'first-creative-request'});assert.equal(r.status,201);
   await tick();const state=(await api(one,'conversations/'+id)).body;
   assert.match(state.messages.at(-1).text,/alguma imagem ou vídeo de referência/);
   assert.equal(inputs.length,0);assert.equal((await api(one,'creations')).body.creations.length,0);
   assert.equal((await server.portal.conversation.waitingForReference(one.org,id)).request.prompt,'Crie uma imagem do imóvel para feed');
  });
  let created;
  await t.test('sem referência retoma o briefing sem exigir repetição e gera',async()=>{
   responses.push(mediaCall());
   await api(one,'conversations/'+id+'/messages','POST',{text:'Não tenho referência, pode propor.',idempotencyKey:'resume-creative-request'});await tick();
   const all=(await api(one,'creations')).body.creations;assert.equal(all.length,1);created=all[0];assert.match(created.prompt,/Crie uma imagem do imóvel/);
   assert.match(JSON.stringify(inputs[0].input),/Pedido pendente salvo/);
   await finish(created.id);assert.equal((await server.portal.conversation.waitingForReference(one.org,id)).request,undefined);
  });
  await t.test('aprovação não salva estilo; ação explícita salva imagem e orienta próxima criação',async()=>{
   assert.equal((await api(one,'creations/'+created.id,'POST',{action:'save-style',name:'Meu estilo'})).status,400);
   await api(one,'creations/'+created.id,'POST',{action:'approve'});assert.equal((await api(one,'creative-library')).body.styles.length,0);
   assert.equal((await api(one,'creations/'+created.id,'POST',{action:'save-style',name:'Meu estilo'})).status,200);
   const l=(await api(one,'creative-library')).body;assert.equal(l.styles.length,1);assert.equal(l.defined,true);assert.equal((await api(two,'creative-library')).body.styles.length,0);
   const next=await api(one,'creations','POST',{prompt:'Outra peça',format:'feed',requestId:'style-next-request',attachments:[]});assert.equal(next.status,201);await finish(next.body.creation.id);
   assert.equal(plans.at(-1).request.creativeContext.styles[0].name,'Meu estilo');assert.match(imageInputs.at(-1).prompt,/INSPIRAÇÃO VISUAL/);
  });
  await t.test('refinamento recebe pixels da versão anterior e preserva original',async()=>{
   const prior=(await api(one,'creations/'+created.id)).body.creation;
   const r=await api(one,'creations/'+created.id,'POST',{action:'revise',adjustment:'Reduza texto e aumente respiro',requestId:'revision-creative-request'});assert.equal(r.status,200,JSON.stringify(r.body));await finish(r.body.creation.id);
   assert.equal(plans.at(-1).request.revisionOf,created.id);assert.ok(plans.at(-1).request.priorAssetIds.includes(prior.assets[0].id));assert.ok(imageInputs.at(-1).images.length);
   assert.equal((await api(one,'creations/'+created.id)).body.creation.assets[0].id,prior.assets[0].id);
  });
  await t.test('WhatsApp: arquivo sem legenda retoma pedido pendente e salva inspiração',async()=>{
   const tid=await thread(two);await api(two,'company','PATCH',{policy:{dailyRuns:100,dailyMedia:100}});
   const config=(await api(two,'whatsapp-chat','POST',{phone:'11988887777',enabled:true,consent:true,mode:'execute',threadId:tid})).body;
   let n=0;const hook=async({text,media})=>{const body=JSON.stringify({entry:[{changes:[{value:{metadata:{phone_number_id:env.HELPU_WHATSAPP_PHONE_NUMBER_ID},messages:[{id:'creative-wa-'+(++n),from:'5511988887777',timestamp:String(Math.floor(Date.now()/1000)),type:media?'image':'text',...media?{image:{id:'123456'}}:{text:{body:text}}}]}}]}]});const r=await fetch(origin+'/webhooks/helpu-whatsapp',{method:'POST',headers:{'Content-Type':'application/json','x-hub-signature-256':'sha256='+createHmac('sha256',env.HELPU_WHATSAPP_APP_SECRET).update(body).digest('hex')},body});assert.equal(r.status,200);};
   await hook({text:new URL(config.connectUrl).searchParams.get('text')});
   await hook({text:'Gere uma imagem para divulgar a empresa'});await tick();await tick();
   assert.ok((await server.portal.conversation.waitingForReference(two.org,tid)).request);
   responses.push(mediaCall());await hook({media:true});await tick();await tick();
   const l=(await api(two,'creative-library')).body;assert.equal(l.references.length,1);
   const all=(await api(two,'creations')).body.creations;assert.equal(all.length,1);assert.match(all[0].prompt,/divulgar a empresa/);
   assert.equal(l.references[0].role,'reference');
  });
 }finally{await server.portal.close();await new Promise(r=>server.close(r));fs.rmSync(dataDir,{recursive:true,force:true});}
});
