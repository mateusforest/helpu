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
 const contentTitles=['Nossa história','Destaque da semana','Nossa equipe','Oferta especial'];
 for(let i=0;i<4;i++){const response=await context.request.post(origin+'/api/portal/'+org+'/records/content',{headers:{Origin:origin},data:{title:contentTitles[i],format:i===0?'video':'image',channel:'instagram',status:'review',scheduledAt:new Date(Date.now()+(i+2)*86400000).toISOString()}});assert.equal(response.status(),201);}
 await page.goto(origin+'/portal.html');await page.locator('#conversation-prompt').waitFor();
 await page.getByRole('heading',{name:'Sua marca merece mais do que mais um post.'}).waitFor();
 assert.equal(await page.locator('.composer-hint,.chat-whatsapp-card').count(),0);
 assert.equal(await page.locator('.conversation-programming tbody tr').count(),3);
 assert.deepEqual(await page.locator('.conversation-programming td button').allTextContents(),contentTitles.slice(0,3));
 const panelSize=await page.locator('.conversation-programming').boundingBox();assert.ok(panelSize.width<=300&&panelSize.height<380,JSON.stringify(panelSize));
 const whatsappInside=async()=>{const outer=await page.locator('.conversation-composer').boundingBox(),inner=await page.locator('.composer-whatsapp').boundingBox();assert.ok(inner.x>=outer.x&&inner.y>=outer.y&&inner.x+inner.width<=outer.x+outer.width&&inner.y+inner.height<=outer.y+outer.height,'WhatsApp deve ficar dentro do campo');};
 await whatsappInside();
 await page.locator('[data-guide="skip"]').click();await page.locator('.first-access-panel').waitFor({state:'hidden'});await whatsappInside();
 await page.screenshot({path:path.join(output,'conversa-programacao-desktop.png'),fullPage:true});
 await page.locator('#conversation-programming summary').click();await page.waitForTimeout(4200);assert.equal(await page.locator('#conversation-programming').evaluate(el=>el.open),false);
 await page.locator('#conversation-programming summary').click();
 await page.locator('[data-chat="program-all"]').click();assert.equal(await page.locator('#dialog-body tbody tr').count(),4);await page.locator('#dialog-close').click();
 await page.locator('[data-chat="program-create"]').click();
 await page.locator('#quick-program-form [name="brief"]').fill('Apresentar nossa equipe');
 await page.locator('#quick-program-form [name="when"]').selectOption('later');
 await page.locator('#quick-program-form [name="generateAt"]').fill('2099-10-01T09:00');
 await page.locator('#quick-program-form [name="postAt"]').fill('2099-10-02T18:00');
 await page.waitForTimeout(4200);assert.equal(await page.locator('#quick-program-form [name="brief"]').inputValue(),'Apresentar nossa equipe');
 await page.locator('#quick-program-form [type="submit"]').click();
 assert.match(await page.locator('#conversation-prompt').inputValue(),/Apresentar nossa equipe.*Agende a geração.*Data prevista para postagem/s);assert.equal(posted.length,0);
 await page.locator('#conversation-prompt').fill('Rascunho preservado.');
 await page.locator('[data-chat="program-idea"]').click();await page.locator('#quick-program-form [type="submit"]').click();
 assert.match(await page.locator('#conversation-prompt').inputValue(),/^Rascunho preservado..*Sugira três ideias/s);assert.equal(await page.locator('#conversation-mode').inputValue(),'plan');
 await page.locator('[data-chat="whatsapp"]').click();await page.locator('#whatsapp-chat-form').waitFor();assert.equal(await page.locator('#whatsapp-chat-form').getByRole('button',{name:'Ativar WhatsApp',exact:true}).count(),1);await page.locator('#dialog-close').click();
 for(const width of [390,320]){await page.setViewportSize({width,height:844});await page.reload();await page.locator('#conversation-prompt').waitFor();assert.equal(await page.locator('#conversation-programming').evaluate(el=>el.open),false);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.locator('#conversation-programming summary').click();assert.equal(await page.locator('.conversation-programming tbody tr').count(),3);await page.screenshot({path:path.join(output,'conversa-programacao-'+width+'.png'),fullPage:true});}
 await page.setViewportSize({width:1440,height:1000});await page.reload();await page.locator('#conversation-prompt').waitFor();
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
