import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {createHelpuServer} from '../server.mjs';

const output=path.resolve(process.env.HELPU_QA_OUTPUT||'../astra-validation');fs.mkdirSync(output,{recursive:true});
const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'astra-review-visual-'));
const fixture=fs.readFileSync(path.join(output,'fade.mp4'));
const server=await createHelpuServer({dataDir,portalOptions:{startScheduler:false,openaiEnv:{OPENAI_API_KEY:'local-test-key'},creationRespond:async()=>({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({caption:'Prévia de teste local.',slides:Array.from({length:3},(_,i)=>({title:'Cena '+(i+1),text:'Mensagem de teste',visualPrompt:'Teste sintético',background:'#ffffff',textColor:'#002200'}))})}]}]}),reelsRenderer:{configured:()=>true,render:async()=>({bytes:fixture,width:1920,height:1080,duration:15,sha256:'fixture'})}}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
let browser;
try{
 browser=await chromium.launch({executablePath:process.env.HELPU_VISUAL_BROWSER||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--disable-background-networking','--no-first-run']});
 const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'pt-BR'});
 await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
 await context.request.post(origin+'/api/auth/signup',{headers:{Origin:origin},data:{name:'Teste',email:'video-qa@example.test',password:'test-only-long-password',company:'Empresa de teste'}});
 const bootstrap=await (await context.request.get(origin+'/api/portal/bootstrap')).json(),org=bootstrap.companies[0].id;
 const post=async(tail,data)=>{const r=await context.request.post(origin+'/api/portal/'+org+'/'+tail,{headers:{Origin:origin},data});assert.ok(r.ok(),await r.text());return r.json();};
 const created=await post('creations',{prompt:'Prévia horizontal para aprovação',format:'reels',duration:15,requestId:'visual-review-001',videoOptions:{aspectRatio:'16:9',preset:'editorial'}});
 await server.portal.tick();await server.portal.tick();
 await page.goto(origin+'/portal.html#/create/reels');await page.locator('#creation-style').waitFor();
 await page.waitForFunction(()=>document.querySelector('#creation-style')?.options.length>=5);
 await page.locator('#creation-aspect').selectOption('16:9');
 await page.locator('summary').filter({hasText:'Movimento, texto e áudio'}).click();
 await page.screenshot({path:path.join(output,'editor-desktop.png'),fullPage:true});
 const id=created.creation.id;
 await page.locator(`[data-creation-action="approve"][data-id="${id}"]`).click();
 await page.locator(`[data-style-name="${id}"]`).fill('Meu estilo editorial');
 await page.locator(`[data-creation-action="save-style"][data-id="${id}"]`).click();
 await page.waitForFunction(()=>[...document.querySelector('#creation-style').options].some(o=>o.textContent.includes('Meu estilo editorial')));
 await page.locator('#creation-style').selectOption({label:'Meu estilo: Meu estilo editorial'});
 await page.waitForFunction(()=>document.querySelector('#creation-style').value.startsWith('saved:style:'));
 await page.locator(`[data-review-text="${id}"]`).fill('Deixe a última frase mais curta.');
 await page.locator(`[data-creation-action="revise"][data-id="${id}"]`).click();
 await page.waitForFunction(()=>document.querySelectorAll('.creation-result').length===2);
 for(const width of [390,320]){
  await page.setViewportSize({width,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'Horizontal overflow at '+width);
  await page.screenshot({path:path.join(output,'editor-'+width+'.png'),fullPage:true});
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({state:'passed',approval:true,savedStyle:true,revision:true,desktop:true,mobile:[390,320],externalCalls:0,output}));
}finally{await browser?.close();await server.portal.shutdown();await new Promise(r=>server.close(r));fs.rmSync(dataDir,{recursive:true,force:true});}
