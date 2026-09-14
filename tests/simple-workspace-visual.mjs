import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {createHelpuServer} from '../server.mjs';

const output=path.resolve(process.env.HELPU_QA_OUTPUT||'../preview');fs.mkdirSync(output,{recursive:true});
const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'helpu-simple-visual-'));
const server=await createHelpuServer({dataDir,portalOptions:{startScheduler:false,conversationRespond:async()=>({status:'completed',output:[{type:'message',content:[{type:'output_text',text:'Vamos organizar os conteúdos da semana. Este é um ambiente de demonstração; nenhuma ação externa foi realizada.'}]}]})}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port;
let browser;
try{
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--disable-background-networking','--no-first-run']});
 const context=await browser.newContext({viewport:{width:1440,height:960},locale:'pt-BR',reducedMotion:'reduce'});
 await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await context.request.post(origin+'/api/auth/signup',{headers:{Origin:origin},data:{name:'Demonstração',email:'visual@example.test',password:'test-only-password',company:'Minha empresa'}});
 await page.goto(origin+'/portal.html');await page.locator('#conversation-prompt').waitFor();
 await page.waitForFunction(()=>document.querySelector('#portal-nav')?.children.length===5);
 assert.deepEqual(await page.locator('#portal-nav a').allTextContents(),['Conversa','Biblioteca','Calendário','Resultados','Minha empresa']);
 const screenshot=async name=>{await page.screenshot({path:path.join(output,name+'.png'),fullPage:true});};
 const geometry=async()=>page.evaluate(()=>{const nav=document.querySelector('#portal-nav'),bar=document.querySelector('.sidebar').getBoundingClientRect();return {overflow:document.documentElement.scrollWidth>innerWidth,navOverflow:nav.scrollWidth>nav.clientWidth,bottom:bar.bottom,height:innerHeight,links:[...nav.querySelectorAll('a')].map(a=>{const r=a.getBoundingClientRect();return {x:r.x,right:r.right,width:r.width};})};});
 for(const width of [1440,390,320]){
  await page.setViewportSize({width,height:width===1440?960:844});
  const layout=await geometry();assert.equal(layout.overflow,false,JSON.stringify(layout));assert.equal(layout.navOverflow,false,JSON.stringify(layout));assert.ok(Math.abs(layout.bottom-layout.height)<2);assert.ok(layout.links.every(l=>l.width>=44&&l.x>=0&&l.right<=width));
  await screenshot('conversa-'+width);
 }
 await page.setViewportSize({width:1440,height:960});
 await page.locator('#portal-nav a[href="#/company"]').click();await page.locator('.company-grid').waitFor();await screenshot('minha-empresa-desktop');
 await page.locator('.company-tile[href="#/settings"]').click();await page.locator('#settings-form').waitFor();assert.equal(await page.locator('#portal-nav a[aria-current="page"]').getAttribute('href'),'#/company');
 for(const route of ['studio','calendar','results']){await page.locator('#portal-nav a[href="#/'+route+'"]').click();await page.waitForFunction(route=>document.body.dataset.view===route,route);assert.equal(await page.locator('#workspace h1').count(),1);}
 await page.locator('#portal-nav a[href="#/conversation"]').click();await page.locator('#conversation-prompt').waitFor();
 await page.locator('[data-chat="suggest"]').first().click();assert.ok((await page.locator('#conversation-prompt').inputValue()).length>10);
 await page.locator('.send-prompt').click();await page.waitForFunction(()=>document.querySelector('.chat-working'));await server.portal.tick();await page.locator('.chat-message.assistant').waitFor();
 await page.setViewportSize({width:390,height:844});await screenshot('conversa-em-andamento-mobile');
 assert.equal((await geometry()).overflow,false);
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({ok:true,screenshots:output,checks:['5 destinos inferiores em 1440, 390 e 320px','Sem rolagem horizontal','Rotas secundárias preservadas','Conversa e execução simulada','Sem erro JavaScript'],externalCalls:0}));
}finally{await browser?.close();await server.portal.shutdown();await new Promise(r=>server.close(r));}
