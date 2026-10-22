import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocalEmail} from '../portal/local-email.mjs';
import {createHelpuServer} from '../server.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
test('e-mail requer configuração completa e usa origem confiável do ambiente',async()=>{
 for(const env of [{},{RESEND_API_KEY:'test',HELPU_EMAIL_FROM:'a@example.test',HELPU_PUBLIC_URL:'javascript:alert(1)'}]){
  const mail=createLocalEmail({env,fetcher:()=>assert.fail('Não deve enviar')});assert.equal(mail.configured,false);await assert.rejects(mail.send({}),{status:503});
 }
 let called=false;
 const mail=createLocalEmail({env:{RESEND_API_KEY:'test',HELPU_EMAIL_FROM:'a@example.test',HELPU_PUBLIC_URL:'https://www.helpumkt.com/path'},fetcher:async(url,o)=>{called=true;assert.equal(url,'https://api.resend.com/emails');assert.equal(o.headers.Authorization,'Bearer test');assert.deepEqual(JSON.parse(o.body),{from:'a@example.test',to:['b@example.test'],subject:'Assunto',text:'Texto'});return new Response('{}',{status:200});}});
 assert.equal(mail.origin,'https://www.helpumkt.com');await mail.send({to:'b@example.test',subject:'Assunto',text:'Texto'});assert.ok(called);
});
test('sem serviço de e-mail, cadastro e login funcionam e recuperação informa indisponibilidade',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'helpu-no-email-'));
 const server=await createHelpuServer({dataDir:dir,portalOptions:{startScheduler:false,localEmailEnv:{},whatsappChatEnv:{},openaiEnv:{}}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const post=(action,d,cookie='')=>fetch(origin+'/api/local/customer/'+action,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(d)});
 try{
  const d={name:'Empresa sem e-mail',sellerType:'Loja',email:'no-service@example.test',phone:'54999998888',password:'No-email-service-test'};
  const response=await post('register',d);assert.equal(response.status,200);const cookie=response.headers.get('set-cookie').split(';')[0];
  const me=await (await fetch(origin+'/api/local/customer/me',{headers:{Cookie:cookie}})).json();assert.equal(me.emailEnabled,false);assert.equal(me.business.productsOnly,false);
  assert.equal((await post('login',d)).status,200);
  for(const email of [d.email,'unknown@example.test']){const r=await post('forgot-password',{email});assert.equal(r.status,503);assert.match((await r.json()).error,/não foi ativada/);}
  assert.equal((await post('resend-verification',{},cookie)).status,503);
 }finally{await server.portal.shutdown();await new Promise(r=>server.close(r));fs.rmSync(dir,{recursive:true,force:true});}
});
