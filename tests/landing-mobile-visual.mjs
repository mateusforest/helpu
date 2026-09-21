import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {createHelpuServer} from '../server.mjs';

const output = process.env.HELPU_SCREENSHOTS || fs.mkdtempSync(path.join(os.tmpdir(), 'helpu-mobile-'));
fs.mkdirSync(output, {recursive:true});
const server = await createHelpuServer({dataDir:fs.mkdtempSync(path.join(os.tmpdir(),'helpu-mobile-data-')), portalOptions:{startScheduler:false}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({executablePath:process.env.HELPU_VISUAL_BROWSER || 'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  for(const width of [320,390,430,1440]) {
    const context = await browser.newContext({viewport:{width,height:900},isMobile:width<800,hasTouch:width<800});
    await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
    const page=await context.newPage();
    const errors=[]; page.on('pageerror',error=>errors.push(error.message));
    for(const pageName of ['index','entrar','cadastro']) {
      await page.goto(`${origin}/${pageName}.html`);
      await page.waitForTimeout(600);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${pageName} overflow at ${width}`);
      assert.equal(await page.locator('body').evaluate(el=>/[↗↓↑←↔◎✳⊕⌁Ⅱ]/u.test(el.textContent)),false);
      assert.ok(await page.locator('.ui-icon').count()>0);
      if(pageName!=='index' && width<761) assert.equal(await page.locator('.auth-aside').evaluate(el=>getComputedStyle(el,':after').display),'none');
      if(pageName==='index') {
        if(width<800) {
          await page.locator('.menu-toggle').click();
          assert.equal(await page.locator('.menu-toggle').getAttribute('aria-expanded'),'true');
          await page.keyboard.press('Escape');
          assert.equal(await page.locator('.menu-toggle').getAttribute('aria-expanded'),'false');
        }
        const video=page.locator('.hero-art video');
        await video.scrollIntoViewIfNeeded();
        await page.waitForFunction(()=>{const v=document.querySelector('.hero-art video');return !v.paused&&v.currentTime>0;});
        await page.locator('.motion-toggle').click();
        await page.evaluate(()=>document.querySelector('.hero-art video').dispatchEvent(new Event('canplay')));
        await page.waitForTimeout(200);
        assert.equal(await video.evaluate(v=>v.paused),true,'Manual pause must persist');
        await page.locator('.motion-toggle').click();
        await page.waitForFunction(()=>!document.querySelector('.hero-art video').paused);
        const tabs=page.locator('.operation-tab');
        await tabs.nth(1).click();
        assert.equal(await tabs.nth(1).getAttribute('aria-selected'),'true');
        await page.evaluate(()=>scrollTo(0,0));
      }
      await page.screenshot({path:path.join(output,`${pageName}-${width}.png`),fullPage:true});
    }
    assert.deepEqual(errors,[]);
    await context.close();
  }
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await context.addInitScript(()=>{
    window.playAttempts=0;window.blockPlayback=true;
    const play=HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play=function(){window.playAttempts++;return window.blockPlayback?Promise.reject(new DOMException('Test refusal','NotAllowedError')):play.call(this);};
  });
  const page=await context.newPage();
  await page.goto(`${origin}/index.html`);
  await page.locator('.hero-art video').scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>window.playAttempts>0);
  await page.evaluate(()=>{window.blockPlayback=false;document.body.dispatchEvent(new Event('touchend',{bubbles:true}));});
  await page.waitForFunction(()=>!document.querySelector('.hero-art video').paused);
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.waitForFunction(()=>document.querySelector('.hero-art video').paused);
  assert.equal(await page.locator('.motion-toggle').isVisible(),false);
  await context.close();
  console.log('Passed: mobile/desktop layout, vector icons, menu, tabs, autoplay, retry, manual pause and reduced motion. Screenshots: '+output);
} finally {
  await browser?.close();
  await new Promise(resolve=>server.close(resolve));
}
