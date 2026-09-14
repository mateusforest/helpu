import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {createHelpuServer} from '../server.mjs';
const output=path.resolve(process.env.HELPU_VISUAL_OUTPUT||'../preview/account');fs.mkdirSync(output,{recursive:true});
const server=await createHelpuServer({dataDir:fs.mkdtempSync(path.join(os.tmpdir(),'helpu-account-visual-')),portalOptions:{startScheduler:false,instagramLoginEnv:{},stripeEnv:{}}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
let browser;
try{
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--disable-background-networking','--no-first-run']});
 const context=await browser.newContext({viewport:{width:1440,height:960},locale:'pt-BR',reducedMotion:'reduce'});
 await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
 await context.route('**/state',async r=>{const response=await r.fetch();const state=await response.json();state.worker.local=false;await r.fulfill({response,json:state});});
 await context.request.post(origin+'/api/auth/signup',{headers:{Origin:origin},data:{name:'Conta de demonstração',email:'account-visual@example.test',password:'test-only-password',company:'Minha empresa'}});
 const org=(await (await context.request.get(origin+'/api/portal/bootstrap')).json()).companies[0].id;
 await context.request.patch(origin+'/api/portal/'+org+'/company',{headers:{Origin:origin},data:{profile:{positioning:'Posicionamento de demonstração',visualIdentity:'Identidade de demonstração'}}});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/portal.html#/account');await page.locator('.account-workspace .account-section').waitFor();
 await page.getByText('Pagamentos pelo Stripe',{exact:true}).waitFor();
 const shot=async name=>{assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,name);await page.screenshot({path:path.join(output,name+'.png'),fullPage:true});};
 for(const width of [1440,390,320]){
  await page.setViewportSize({width,height:width===1440?960:844});
  for(const tab of ['plan','configuration','security','billing']){await page.locator('[data-account-tab="'+tab+'"]').click();await shot('conta-'+tab+'-'+width);}
  await page.goto(origin+'/portal.html#/integrations');await page.locator('.connection-card').first().waitFor();assert.equal(await page.getByRole('heading',{name:'Higgsfield',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'Conectar com login',exact:true}).count(),0);await shot('conexoes-'+width);
  await page.getByRole('button',{name:'Como habilitar o login'}).click();await page.locator('#editor[open]').waitFor();await shot('instagram-login-'+width);await page.locator('#dialog-close').click();
  await page.locator('#user-menu').click();await page.locator('.account-workspace .account-section').waitFor();
 }
 await page.locator('[data-account-tab="configuration"]').click();await page.locator('#account-profile-form input[name="name"]').fill('Nome atualizado');await page.locator('#account-profile-form button[type="submit"]').click();await page.waitForFunction(()=>document.querySelector('#user-initials')?.textContent==='NA');
 await page.reload();await page.locator('.account-workspace .account-section').waitFor();await page.locator('[data-account-tab="configuration"]').click();assert.equal(await page.locator('#account-profile-form input[name="name"]').inputValue(),'Nome atualizado');
 await page.goto(origin+'/portal.html#/brand');await page.getByText('Contexto: Posicionamento',{exact:true}).waitFor();assert.equal(await page.getByText('Contexto: visualIdentity',{exact:true}).count(),0);
 await page.goto(origin+'/portal.html#/browser');await page.getByRole('heading',{name:'Conecte seus canais pela internet.'}).waitFor();assert.equal(await page.locator('[data-chat="open-session"]').count(),0);
 // Fictitious populated Stripe response, to inspect invoices and prices without external payments.
 await context.route('**/billing',r=>r.fulfill({json:{status:'ready',provider:'stripe',mode:'test',canCheckout:false,canPortal:true,subscription:{status:'active',price:{name:'Plano de demonstração',amount:9900,currency:'brl',interval:'month',intervalCount:1}},invoices:[{number:'TEST-0001',status:'paid',created:1789290000,amount:9900,currency:'brl',url:'https://invoice.stripe.com/i/test_fixture'}]}}));
 await page.goto(origin+'/retorno.html?company='+org+'&billing=return');await page.waitForURL('**/portal.html?company=*#/account');await page.getByText('Plano Ativo',{exact:true}).waitFor();
 for(const width of [1440,390,320]){await page.setViewportSize({width,height:width===1440?960:844});await page.locator('[data-account-tab="plan"]').click();await shot('stripe-plano-'+width);await page.locator('[data-account-tab="billing"]').click();await shot('stripe-faturas-'+width);}
 assert.deepEqual(errors,[]);assert.equal(await page.locator('#portal-nav a').count(),5);
 console.log(JSON.stringify({ok:true,output,checks:['Quatro áreas da conta','Nome persiste após recarregar','Textos antigos em português','Conexões sem Higgsfield e sem login local na nuvem','Retorno Stripe à conta','Plano e faturas simulados','1440, 390 e 320 px sem rolagem horizontal','Nenhum erro JavaScript'],externalPayments:0}));
}finally{await browser?.close();await server.portal.shutdown();await new Promise(r=>server.close(r));}
