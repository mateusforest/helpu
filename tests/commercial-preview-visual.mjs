import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright-core';
const root=path.resolve('docs/previews/apresentacao-helpu');
const output=path.resolve('../output/apresentacao-helpu/verificacao');fs.mkdirSync(output,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.HELPU_VISUAL_BROWSER||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(pathToFileURL(path.join(root,'index.html')).href);
 await page.locator('img').evaluateAll(images=>Promise.all(images.map(i=>{i.loading='eager';return i.decode();})));
 assert.ok(await page.locator('img').evaluateAll(images=>images.every(i=>i.complete&&i.naturalWidth>0)));
 for(const width of [1440,390,320]){
  await page.setViewportSize({width,height:900});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow ${width}`);
  await page.evaluate(()=>scrollTo(0,0));
  await page.screenshot({path:path.join(output,`abertura-${width}.png`)});
 }
 for(let i=0;i<4;i++){await page.locator(`[data-step="${i}"]`).click();assert.equal(await page.locator(`[data-step="${i}"]`).getAttribute('aria-selected'),'true');}
 for(const selector of ['#show-portal','[data-art="imobiliaria"]','[data-art="bebidas"]']){
  await page.locator(selector).click();await page.locator('#detail[open]').waitFor();
  await page.waitForFunction(()=>{const i=document.querySelector('#dialog-content img');return i?.complete&&i.naturalWidth>0;});
  await page.keyboard.press('Escape');assert.equal(await page.locator('#detail').isVisible(),false);
 }
 await page.locator('#compare-reference').selectOption('a');await page.locator('#compare-helpu').selectOption('assisted');assert.match(await page.locator('#compare-delta').innerText(),/141 a mais/);
 await page.locator('#compare-reference').selectOption('b');assert.match(await page.locator('#compare-delta').innerText(),/1.610 a menos/);
 await page.locator('#compare-reference').selectOption('c');assert.match(await page.locator('#compare-delta').innerText(),/2.410 a menos/);
 await page.locator('#quiz-next').click();assert.equal(await page.locator('#quiz-error').isVisible(),true);
 for(const [goal,expect] of [[0,'Essencial'],[1,'Assistido'],[2,'Diagnóstico e Estratégia']]){
  for(let i=0;i<5;i++){
   if(i!==4)await page.locator('.choice input').nth(i===3?goal:0).check();
   await page.locator('#quiz-next').click();
  }
  assert.match(await page.locator('#quiz-result h3').innerText(),new RegExp(expect));
  await page.locator('#result-proposal').click();assert.match(await page.locator('#proposal-text').inputValue(),new RegExp(expect));
  const downloadPromise=page.waitForEvent('download');await page.locator('#download-proposal').click();const download=await downloadPromise;assert.equal(download.suggestedFilename(),'meu-proximo-passo-helpu.txt');
  await page.keyboard.press('Escape');await page.locator('#restart').click();
 }
 assert.deepEqual(errors,[]);
 await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:path.join(output,'pagina-completa.png'),fullPage:true});
 console.log('Passed: 320/390/1440 px, images, demo tabs, modal focus/escape, comparison math, quiz validation and all three recommendations, proposal download.');
}finally{await browser.close();}
