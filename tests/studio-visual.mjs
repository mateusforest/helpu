import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {chromium} from 'playwright-core';
import {createHelpuServer} from '../server.mjs';
import {findBrowser} from '../scripts/runtime.mjs';

// Visual inspection only. Copies business text, never users, secrets, cookies or profiles.
// No real generation, AI request or publication is possible in this fixture.
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'helpu-studio-visual-'));
console.log('Visual evidence directory:',directory);
const source=new DatabaseSync(path.resolve('.local-data/helpu.sqlite'),{readOnly:true});
const eme=source.prepare("SELECT id,profile FROM companies WHERE name='EME'").get();
assert.ok(eme,'The existing EME company must exist.');
const pieces=source.prepare("SELECT data FROM records WHERE org_id=? AND kind='content' ORDER BY created_at").all(eme.id).map(row=>JSON.parse(row.data));source.close();
const errors=[],layout=[],screenshots=[];let externalCalls=0;
const refuse=async()=>{externalCalls++;throw new Error('External calls forbidden in visual fixture');};
const server=createHelpuServer({dataDir:directory,portalOptions:{startScheduler:false,providers:new Proxy({},{get:()=>refuse}),conversationRespond:refuse}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
let browser;const db=new DatabaseSync(path.join(directory,'helpu.sqlite'));
try{
  browser=await chromium.launch({executablePath:findBrowser(),headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'pt-BR',reducedMotion:'reduce'});
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  const signup=await context.request.post(origin+'/api/auth/signup',{headers:{Origin:origin},data:{name:'TEST ONLY visual',company:'EME · cópia para inspeção',email:'studio-visual@example.test',password:'test-only-password'}});assert.ok(signup.ok());
  const bootstrap=await(await context.request.get(origin+'/api/portal/bootstrap')).json(),org=bootstrap.companies[0].id;
  const api=async(tail,method='GET',data)=>{const response=await context.request.fetch(origin+'/api/portal/'+org+'/'+tail,{method,headers:{Origin:origin},data});assert.ok(response.ok(),await response.text());return response.json();};
  const nav=async area=>{await page.goto(origin+'/portal.html#/'+area);await page.locator('#workspace h1').waitFor();await page.waitForFunction(area=>document.body.dataset.view===area,area);};
  const shot=async name=>{
    const measurement=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,dialog:document.querySelector('#editor')?.open?{width:document.querySelector('#editor').clientWidth,scrollWidth:document.querySelector('#editor').scrollWidth}:null}));
    layout.push({name,...measurement});const filename=path.join(directory,name+'.png');await page.screenshot({path:filename,fullPage:!name.includes('mobile')&&!name.includes('390'),animations:'disabled'});screenshots.push(filename);
  };
  for(const width of [1440,390]){
    await page.setViewportSize({width,height:width===1440?1000:844});
    for(const area of ['conversation','overview','browser','studio','settings']){await nav(area);await shot('empty-'+area+'-'+width);}
  }
  const profile=JSON.parse(eme.profile);delete profile._evidence;
  await api('company','PATCH',{profile,policy:{enabled:true,dailyRuns:8}});
  const ids=[];for(const piece of pieces)ids.push((await api('records/content','POST',piece)).id);
  const jobId=randomUUID(),now=Date.now();
  db.prepare("INSERT INTO jobs(id,org_id,user_id,kind,payload,state,output,scheduled_at,idempotency_key,created_at,updated_at) VALUES(?,?,?,'agent',?,'succeeded',?,?,?,?,?)").run(jobId,org,1,JSON.stringify({agent:'creative',brief:'TEST ONLY: cópia dos textos existentes para inspeção visual.'}),JSON.stringify({recordIds:ids}),now,'visual-source',now,now);
  const institutional=(await api('state')).records.content.find(c=>c.format==='image'&&/institucional/i.test(c.title));assert.ok(institutional);
  await page.setViewportSize({width:1440,height:1000});await nav('studio');
  await page.locator(`.content-thumbnail[data-id="${institutional.id}"]`).click();await page.getByRole('button',{name:'Produção visual',exact:true}).click();
  await page.getByRole('button',{name:'Registrar verificação',exact:true}).click();await page.getByText('Verificação registrada',{exact:true}).waitFor();
  await page.waitForFunction(()=>document.querySelector('#dialog-body')?.textContent.includes('Versão 1'));await shot('production-blocked-desktop');
  await page.getByText('Origem e rastreabilidade',{exact:true}).click();await page.getByText('Briefing preservado e especificação',{exact:true}).click();await shot('production-specification-desktop');
  await page.setViewportSize({width:390,height:844});await shot('production-specification-mobile');
  await page.locator('#dialog-body').getByRole('button',{name:'Materiais oficiais',exact:true}).click();await shot('materials-mobile');
  await page.setViewportSize({width:1440,height:1000});await shot('materials-desktop');await page.locator('#dialog-close').click();
  const saved=await api('state'),op=saved.operations[0];
  const longText='TEST ONLY: resposta longa para inspecionar legibilidade e scroll.\n\n'+Array.from({length:12},(_,i)=>'Etapa '+(i+1)+': '+pieces[2].visualPrompt).join('\n\n');
  db.prepare('INSERT INTO conversation_messages VALUES(?,?,?,?,?,?,?,?)').run(randomUUID(),op.threadId,org,'assistant',longText,'[]',jobId,Date.now());
  for(const width of [1440,390]){
    await page.setViewportSize({width,height:width===1440?1000:844});
    for(const area of ['conversation','overview','browser','studio','settings','integrations']){await nav(area);if(area==='conversation'){await page.locator('[data-chat=history]').click();await page.locator('[data-chat=choose-thread][data-id="'+op.threadId+'"]').click();await page.locator('.chat-message-text').last().waitFor();}await shot('filled-'+area+'-'+width);}
    await nav('studio');await page.locator('#global-search').fill(institutional.title);await page.locator('#global-search').dispatchEvent('input');await page.waitForFunction(()=>document.querySelectorAll('.content-card').length===1);assert.equal(await page.locator('.content-card').count(),1);await shot('search-'+width);
    await page.locator('#user-menu').click();await shot('account-menu-'+width);await page.locator('#dialog-close').click();
    await page.locator('#navigation-more').click();await shot('navigation-'+width);
  }
  const actual=await api('state');assert.equal(actual.records.content.length,3);assert.equal(actual.assets.length,0);assert.equal(actual.production[0].state,'blocked_missing_brand_assets');assert.equal(actual.records.metrics.length,0);assert.equal(externalCalls,0);assert.deepEqual(errors,[]);
  const navBounds=await page.evaluate(()=>({right:document.querySelector('#portal-nav').getBoundingClientRect().right,moreLeft:document.querySelector('#navigation-more').getBoundingClientRect().left}));assert.ok(navBounds.right<=navBounds.moreLeft,'A navegação não deve passar por baixo do botão de mais áreas.');
  const report={directory,navBounds,scope:'Real Chromium rendering; isolated copy of EME business text; no external execution.',errors,externalCalls,layout,screenshots,overflow:layout.filter(x=>x.scrollWidth>x.width+1||x.dialog&&x.dialog.scrollWidth>x.dialog.width+1)};
  fs.writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({directory,shots:screenshots.length,errors,externalCalls,overflow:report.overflow},null,2));
}finally{await browser?.close();db.close();await server.portal.shutdown();await new Promise(resolve=>server.close(resolve));}
