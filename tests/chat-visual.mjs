import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {createHelpuServer} from '../server.mjs';

// Isolated local account and mocked conversations. No provider calls or real client data.
const output=path.resolve(process.env.HELPU_QA_OUTPUT||'../preview');fs.mkdirSync(output,{recursive:true});
const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'helpu-chat-visual-'));
const server=await createHelpuServer({dataDir,portalOptions:{startScheduler:false}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port;
let browser;
try{
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--disable-background-networking','--no-first-run']});
 const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'pt-BR',reducedMotion:'reduce'});
 await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const signup=await context.request.post(origin+'/api/auth/signup',{headers:{Origin:origin},data:{name:'Demonstração',email:'chat@example.test',password:'test-only-password',company:'Minha marca'}});assert.equal(signup.status(),201);
 const org=(await (await context.request.get(origin+'/api/portal/bootstrap')).json()).companies[0].id;
 const base=origin+'/api/portal/'+org+'/conversations';
 const thread=await (await context.request.post(base,{headers:{Origin:origin},data:{title:'Uma campanha para a minha marca'}})).json();
 const stamp=Date.now(),user={id:'user',role:'user',text:'Quero criar uma campanha para a minha marca.',createdAt:stamp,attachments:[]};
 const assistant={id:'assistant',role:'assistant',jobId:'job',createdAt:stamp+1,attachments:[],text:'Vamos começar pela ideia da campanha. Preparei uma direção inicial com o contexto da sua marca:\n\n- **Formato:** uma imagem quadrada e um vídeo curto.\n- **Mensagem:** mostrar como seu produto facilita o dia a dia.\n- **Chamada:** um convite para conhecer a oferta.\n\nPor enquanto, isso é uma proposta; as imagens e os vídeos ainda não foram gerados.\n\nQual produto você quer divulgar primeiro?'};
 let snapshot={messages:[user],jobs:[{id:'job',state:'working'}],events:[{jobId:'job',kind:'operation_transition',label:'Operação: understanding',detail:{to:'understanding'}}],operations:[{id:'op',state:'understanding',objective:user.text,updatedAt:stamp,plan:[],artifactIds:[]}]};
 const posted=[];
 await context.route(base+'/'+thread.id,r=>r.fulfill({json:snapshot}));
 await context.route(base+'/'+thread.id+'/messages',async r=>{posted.push(r.request().postDataJSON());await r.fulfill({status:201,json:{}});});
 await page.goto(origin+'/portal.html');await page.locator('#conversation-prompt').waitFor();
 await page.locator('[data-chat="history"]').click();await page.locator('[data-chat="choose-thread"][data-id="'+thread.id+'"]').click();
 await page.getByText('Entendendo seu pedido',{exact:true}).first().waitFor();
 assert.equal(await page.locator('.operation-context').isVisible(),false);
 assert.equal(await page.locator('.conversation-thread-head').evaluate(el=>getComputedStyle(el).position),'absolute');
 assert.equal(await page.locator('#portal-nav a').count(),5);
 const shot=async name=>page.screenshot({path:path.join(output,name+'.png'),fullPage:true});
 const noOverflow=async()=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await shot('chat-andamento-desktop');
 await page.locator('.chat-activity>summary').click();
 snapshot={...snapshot,operations:[{...snapshot.operations[0],state:'planning',updatedAt:stamp+2}],events:[...snapshot.events,{jobId:'job',kind:'operation_transition',label:'Operação: planning',detail:{to:'planning'}}]};
 await page.locator('.chat-working').filter({hasText:'Organizando os próximos passos'}).waitFor();
 assert.equal(await page.locator('.chat-activity').evaluate(el=>el.open),true,'A atualização deve preservar detalhes abertos');
 await page.locator('.chat-activity>summary').click();
 snapshot={...snapshot,messages:[user,assistant],jobs:[{id:'job',state:'succeeded'}],operations:[{...snapshot.operations[0],state:'ready',updatedAt:stamp+3}]};
 await page.locator('.chat-message.assistant strong').first().waitFor();
 assert.equal(await page.locator('.chat-message.assistant li').count(),3);
 assert.equal(await page.locator('.chat-message.assistant').innerText().then(t=>t.includes('**')),false);
 assert.equal(await page.locator('.chat-activity').evaluate(el=>el.open),false);
 for(const width of [1440,390,320]){
  await page.setViewportSize({width,height:width===1440?1000:844});await noOverflow();await shot('chat-resposta-'+width);
  if(width<700){
   await page.locator('.chat-activity').scrollIntoViewIfNeeded();
   const overlap=await page.evaluate(()=>{const reply=document.querySelector('.chat-message.assistant').getBoundingClientRect(),composer=document.querySelector('.conversation-composer').getBoundingClientRect();return reply.bottom>composer.top;});
   assert.equal(overlap,false,'A última resposta deve ficar acima do campo de envio ao rolar');
   await page.screenshot({path:path.join(output,'chat-resposta-final-'+width+'.png')});
  }
 }
 await page.setViewportSize({width:1440,height:1000});
 const prompt=page.locator('#conversation-prompt');await prompt.fill('Quero divulgar o produto');await prompt.press('Shift+Enter');await prompt.press('X');
 assert.equal(await prompt.inputValue(),'Quero divulgar o produto\nX');assert.equal(posted.length,0);
 await prompt.press('Enter');await page.waitForFunction(()=>document.querySelector('#conversation-prompt').value==='');
 assert.equal(posted.length,1);assert.equal(posted[0].text,'Quero divulgar o produto\nX');
 // Even if the model returns HTML, the transcript must keep it as inert text.
 snapshot={...snapshot,messages:[user,{...assistant,text:'<img src=x onerror="window.chatXss=true"> **Seguro**\n\n[Perigoso](javascript:alert)'}]};
 await page.locator('.chat-message.assistant strong').filter({hasText:'Seguro'}).waitFor();
 assert.equal(await page.locator('.chat-message.assistant img,.chat-message.assistant a').count(),0);
 assert.equal(await page.evaluate(()=>window.chatXss),undefined);
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({ok:true,screenshots:output,checks:['Markdown e texto seguro','Estados históricos em português','Detalhes recolhidos e preservados durante atualização','Enter e Shift+Enter','5 áreas na barra inferior','Sem rolagem horizontal em 1440, 390 e 320px'],externalCalls:0}));
}finally{await browser?.close();await server.portal.shutdown();await new Promise(r=>server.close(r));}
