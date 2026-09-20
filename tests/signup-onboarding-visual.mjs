import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {createHelpuServer} from '../server.mjs';

const output=path.resolve(process.env.HELPU_VISUAL_OUTPUT||'../output/f04-f05');fs.mkdirSync(output,{recursive:true});
const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'helpu-signup-visual-'));
const app=await createHelpuServer({dataDir,portalOptions:{startScheduler:false,whatsappChatEnv:{}}});
await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+app.address().port;
let browser;
try{
  browser=await chromium.launch({executablePath:process.env.HELPU_CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--disable-background-networking','--no-first-run']});
  const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'pt-BR',reducedMotion:'reduce'});
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(origin+'/cadastro.html');
  assert.equal(await page.locator('#whatsappWelcomeConsent').isChecked(),false);
  const shot=async name=>{assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,name);await page.screenshot({path:path.join(output,name+'.png'),fullPage:true});};
  for(const width of [1440,390,320]){await page.setViewportSize({width,height:1000});await shot('cadastro-'+width);}
  await page.locator('#name').fill('Cliente de teste');await page.locator('#company').fill('Empresa de teste');await page.locator('#email').fill('visual-f04-f05@example.test');await page.locator('#phone').fill('(54) 99999-8888');await page.locator('#whatsappWelcomeConsent').check();await page.locator('#password').fill('somente-teste-123');
  await page.locator('.auth-submit').click();await page.waitForURL('**/portal.html');
  await page.getByRole('heading',{name:'Apresente sua empresa',exact:true}).waitFor();
  await page.getByRole('button',{name:'Ativar WhatsApp',exact:true}).waitFor();
  await page.getByText('Boas-vindas pendentes:',{exact:false}).waitFor();
  for(const width of [1440,390,320]){await page.setViewportSize({width,height:1000});await shot('primeiro-acesso-'+width);}
  await page.getByRole('button',{name:'Ativar WhatsApp',exact:true}).click();
  await page.locator('#whatsapp-chat-form').waitFor();assert.equal(await page.locator('#whatsapp-chat-form input[name="phone"]').inputValue(),'5554999998888');assert.equal(await page.locator('#whatsapp-chat-form input[name="consent"]').isChecked(),false);assert.equal(await page.locator('#whatsapp-chat-form input[name="enabled"]').isChecked(),false);await shot('whatsapp-separado-320');await page.locator('#dialog-close').click();
  await page.locator('[data-guide="next"]').click();await page.getByRole('heading',{name:'Defina sua marca',exact:true}).waitFor();
  await page.locator('[data-guide="skip"]').click();await page.getByRole('button',{name:'Retomar primeiros passos',exact:true}).waitFor();
  await page.reload();await page.getByRole('button',{name:'Retomar primeiros passos',exact:true}).click();await page.getByRole('heading',{name:'Defina sua marca',exact:true}).waitFor();
  await page.locator('[data-guide="next"]').click();await page.getByRole('heading',{name:'Peça sua primeira criação',exact:true}).waitFor();await Promise.all([page.waitForResponse(response=>response.url().endsWith('/onboarding')&&response.request().method()==='POST'),page.locator('#onboarding-goal').selectOption('offer')]);
  await page.reload();await page.locator('#onboarding-goal').waitFor();assert.equal(await page.locator('#onboarding-goal').inputValue(),'offer');await shot('objetivo-retomado-320');
  await page.getByRole('link',{name:'Criar uma imagem',exact:true}).click();await page.waitForURL('**/portal.html#/create/feed');assert.equal(await page.locator('#onboarding-goal').inputValue(),'offer');
  await page.locator('[data-guide="next"]').click();await page.getByRole('link',{name:'Abrir Biblioteca',exact:true}).click();await page.waitForURL('**/portal.html#/studio');
  await page.locator('[data-guide="next"]').click();await page.getByRole('heading',{name:'Leve a conversa para o WhatsApp',exact:true}).waitFor();await page.locator('[data-guide="next"]').click();await page.getByRole('button',{name:'Rever primeiros passos',exact:true}).waitFor();
  await page.reload();await page.getByRole('button',{name:'Rever primeiros passos',exact:true}).click();await page.getByRole('heading',{name:'Apresente sua empresa',exact:true}).waitFor();
  await page.locator('[data-guide="skip"]').click();
  await page.goto(origin+'/portal.html#/conversation');
  await page.locator('#conversation-prompt').fill('Rascunho preservado: criar com as fotos do imóvel.');
  await page.locator('#contextual-help button').click();
  await page.getByRole('heading',{name:'Pedir e ajustar pelo chat',exact:true}).waitFor();
  await shot('ajuda-conversa-320');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#conversation-prompt').inputValue(),'Rascunho preservado: criar com as fotos do imóvel.');
  for(const [route,title]of [['create/reels','Montar e revisar um vídeo'],['create/story','Criar imagens e carrosséis'],['settings','Entender autonomia e consumo'],['calendar','Organizar datas de conteúdo'],['brand','Orientar a identidade da marca']]){
    await page.goto(origin+'/portal.html#/'+route);await page.locator('#contextual-help button').click();
    await page.getByRole('heading',{name:title,exact:true}).waitFor();
    assert.equal(await page.locator('#editor').evaluate(el=>el.scrollWidth>el.clientWidth+1),false,route);
    await shot('ajuda-'+route.replace('/','-')+'-320');await page.locator('#dialog-close').click();
  }
  await page.setViewportSize({width:1440,height:1000});await page.locator('#contextual-help button').click();await shot('ajuda-desktop');
  await page.locator('.context-help-topics summary').click();await page.locator('#dialog-body [data-help-topic="whatsapp"]').click();await page.getByRole('heading',{name:'Ativar a operação no WhatsApp',exact:true}).waitFor();
  await page.locator('#dialog-body [data-help-link]').click();await page.waitForURL('**/portal.html#/conversation');assert.equal(await page.locator('#editor').evaluate(el=>el.open),false);
  assert.equal((await app.database.prepare('SELECT COUNT(*) AS count FROM jobs').get()).count,0);assert.deepEqual(errors,[]);
  console.log(JSON.stringify({ok:true,output,checks:['Cadastro desktop e celular','Consentimento desmarcado','Telefone pré-preenchido sem vínculo','Guia pausado e retomado após recarregar','Objetivo persistido','Telas reais de criação e Biblioteca','Guia concluído e revisto','Nenhum consumo de IA ou envio real','Sem rolagem horizontal em 1440, 390 e 320 px']}));
}finally{
  await browser?.close();await app.portal.shutdown();await new Promise(resolve=>app.close(resolve));
  const target=path.resolve(dataDir);assert.ok(target.startsWith(path.resolve(os.tmpdir())+path.sep+'helpu-signup-visual-'));fs.rmSync(target,{recursive:true,force:true});
}
