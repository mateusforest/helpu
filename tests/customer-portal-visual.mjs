import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {createHelpuServer} from '../server.mjs';
import {findBrowser} from '../scripts/runtime.mjs';
const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'helpu-customer-ui-')),operatorEnv={};
const output=path.resolve('../output/customer-portal-review');fs.mkdirSync(output,{recursive:true});
const server=await createHelpuServer({dataDir,portalOptions:{operatorEnv,startScheduler:false,conversationRespond:async()=>{throw Error('Sem chamadas de IA neste teste');}}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;let browser;
try{
 browser=await chromium.launch({executablePath:findBrowser(),headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'pt-BR',reducedMotion:'reduce'});
 await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
 assert.ok((await context.request.post(origin+'/api/auth/signup',{headers:{Origin:origin},data:{name:'Cliente',email:'customer-ui@example.test',company:'Empresa exemplo',password:'test-only-long-password'}})).ok());
 const boot=await (await context.request.get(origin+'/api/portal/bootstrap')).json(),org=boot.companies[0].id;
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const [route,heading] of [['company','Tudo da sua empresa, organizado.'],['settings','Como você quer criar.'],['integrations','Converse e receba suas prévias.'],['assisted','Seu conteúdo, acompanhado.']]){
  await page.goto(origin+'/portal.html#/'+route);await page.getByRole('heading',{name:heading,exact:true}).waitFor();
  if(route==='assisted')await page.getByRole('heading',{name:'Publicação manual pela equipe Helpu'}).waitFor();
  assert.equal(await page.locator('#workspace input[name=dailyRuns],#workspace input[name=publicBaseUrl],#workspace [data-action=reset-usage],#workspace [data-action=company-diagnosis]').count(),0);
  await page.screenshot({path:path.join(output,route+'-desktop.png'),fullPage:true});
 }
 await page.goto(origin+'/portal.html#/settings');await page.locator('input[name=schedulesEnabled]').check();await page.getByRole('button',{name:'Salvar preferências'}).click();
 await page.waitForFunction(()=>document.querySelector('#settings-form button')?.disabled===false);
 const state=await (await context.request.get(origin+'/api/portal/'+org+'/state')).json();assert.equal(state.company.policy.schedulesEnabled,true);assert.equal(state.company.policy.enabled,false);
 await page.reload();await page.locator('input[name=schedulesEnabled]').waitFor();assert.equal(await page.locator('input[name=schedulesEnabled]').isChecked(),true);
 for(const [legacy,target]of [['overview','company'],['agents','consultations'],['leads','company'],['pages','company'],['presence','integrations']]){await page.goto(origin+'/portal.html#/'+legacy);await page.waitForFunction(expected=>document.body.dataset.view===expected,target);}
 await page.setViewportSize({width:390,height:844});
 for(const route of ['company','settings','assisted']){await page.goto(origin+'/portal.html#/'+route);await page.waitForFunction(expected=>document.body.dataset.view===expected,route);if(route==='assisted')await page.getByRole('heading',{name:'Publicação manual pela equipe Helpu'}).waitFor();await page.screenshot({path:path.join(output,route+'-mobile.png'),fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
 const adminContext=await browser.newContext({viewport:{width:1440,height:1050},locale:'pt-BR'});await adminContext.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
 await adminContext.request.post(origin+'/api/auth/signup',{headers:{Origin:origin},data:{name:'Equipe',email:'staff-ui@example.test',company:'Helpu',password:'test-only-long-password'}});
 const staff=await(await adminContext.request.get(origin+'/api/portal/bootstrap')).json();operatorEnv.HELPU_OPERATOR_USER_IDS=String(staff.user.id);
 const admin=await adminContext.newPage();admin.on('pageerror',e=>errors.push(e.message));await admin.goto(origin+'/admin.html#/intelligence');await admin.locator('#ai-company').selectOption(org);await admin.locator('#internal-settings').waitFor();
 await admin.locator('#internal-settings input[name=dailyRuns]').fill('27');await admin.getByRole('button',{name:'Salvar controles internos',exact:true}).click();await admin.waitForFunction(()=>document.querySelector('#internal-settings input[name=dailyRuns]')?.value==='27'&&document.querySelector('#internal-settings button')?.disabled===false);
 const updated=await(await context.request.get(origin+'/api/portal/'+org+'/state')).json();assert.equal(updated.company.policy.dailyRuns,27);assert.equal(updated.company.policy.schedulesEnabled,true);
 await admin.screenshot({path:path.join(output,'admin-controls.png'),fullPage:true});
 assert.deepEqual(errors,[]);console.log('Cliente e administração: navegação, persistência, limites, telas desktop/mobile e publicação manual verificados.');
}finally{await browser?.close();await new Promise(r=>server.close(r));fs.rmSync(dataDir,{recursive:true,force:true});}
