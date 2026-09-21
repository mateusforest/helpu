import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {HELP_TOPICS,helpTopicFor} from '../dist/assets/help-content.js';
import {helpBody,createContextualHelpUI} from '../dist/assets/contextual-help-ui.js';
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');

test('contextual help selects creation format and safely handles unknown routes',()=>{
  for(const [view,format,key] of [['conversation','feed','conversation'],['create','feed','images'],['create','story','images'],['create','carousel','images'],['create','reels','reels'],['video','feed','reels'],['browser','feed','integrations'],['toString','feed','general']])assert.equal(helpTopicFor(view,format),key);
});
test('every help topic includes steps, example, expected outcome and recovery with real routes',()=>{
  const routes=new Set(['finance','studio','conversation','brand','company','create/reels','create/feed','settings','integrations','activity','assisted','admin','consultations','consultations-admin','commercial','proposals','pricing','commerce']);
  for(const [key,t] of Object.entries(HELP_TOPICS)){
    assert.ok(t.title&&t.intro&&t.example&&t.result);assert.ok(t.steps.length>=3&&t.recovery.length>=2);
    for(const [,route]of t.links)assert.ok(routes.has(route),route);
    const body=helpBody(key,esc);for(const label of ['Como fazer','Exemplo','O que esperar','Se não funcionar'])assert.ok(body.includes(label));
    assert.ok(!/<form|<input|<script/.test(body));
  }
});
test('help preserves explicit distinctions between scheduling, activation and provider balance',()=>{
  assert.match(HELP_TOPICS.calendar.result,/não confirma publicação automática/);
  assert.match(HELP_TOPICS.whatsapp.intro,/separados/);
  assert.match(HELP_TOPICS.settings.recovery.join(' '),/Limites técnicos são administrados pela Helpu/);
});
test('help opens without network calls, workspace updates or executing a task',()=>{
  const old=globalThis.document;let click,dialog,closed=false;
  const host={innerHTML:''},workspace={innerHTML:'unsaved draft'};
  globalThis.document={addEventListener:(event,fn)=>{if(event==='click')click=fn;},querySelector:selector=>selector==='#workspace'?workspace:host};
  try{
    const ui=createContextualHelpUI({esc,openDialog:(title,body)=>{dialog={title,body};},closeDialog:()=>{closed=true;}});
    ui.mount('create','reels');assert.match(host.innerHTML,/data-help-topic="reels"/);
    click({target:{closest:selector=>selector==='[data-help-topic]'?{dataset:{helpTopic:'reels'}}:null}});
    assert.equal(dialog.title,HELP_TOPICS.reels.title);assert.equal(workspace.innerHTML,'unsaved draft');
    click({target:{closest:selector=>selector==='[data-help-link]'?{}:null}});assert.equal(closed,true);
    const source=fs.readFileSync(new URL('../dist/assets/contextual-help-ui.js',import.meta.url),'utf8');assert.doesNotMatch(source,/fetch\(|\bapi\(|setInterval\(/);
  }finally{globalThis.document=old;}
});
