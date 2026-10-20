import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {productErrors, photoError} from '../dist/local/product-validation.js';

// Run the real event handlers with controlled, slow responses and minimal DOM doubles.
function editorHarness() {
  const listeners = {}, requests = [];
  const control = () => ({disabled:false});
  const save = {...control(),value:'draft'}, submit = {...control(),value:'submit'}, close = control(), pause = {...control(),dataset:{state:'Pausado'}};
  const error = {textContent:'',focus(){}}, gallery = {innerHTML:''};
  const form = {id:'product-form',isConnected:true,querySelector:()=>error,querySelectorAll:()=>[],closest:()=>dialog};
  const file = {...control(),id:'product-photo',files:[{name:'foto.png',type:'image/png',size:100}],value:'',closest:()=>form};
  const controls = [save,submit,close,pause,file];
  const dialog = {id:'product-editor',querySelectorAll:()=>controls,setAttribute(){},removeAttribute(){},close(){this.closed=true;}};
  pause.closest = () => dialog;
  const values = {title:'Produto de teste',description:'Produto fictício para testar envio.',city:'Vacaria',price:'125.90',phone:'54999998888'};
  const document = {body:{dataset:{mode:'manage'}},addEventListener:(event,fn)=>listeners[event]=fn,querySelector:selector=>selector==='#product-editor'?dialog:selector==='#product-photos'?gallery:{}};
  const context = vm.createContext({document,location:{search:''},URLSearchParams,productErrors,photoError,
    FormData:class {constructor(){ assert.equal(file.disabled,false); } *[Symbol.iterator](){yield* Object.entries(values);}},
    fetch:(url,options)=>new Promise(resolve=>requests.push({url,options,resolve})),confirm:()=>true});
  let source=fs.readFileSync(new URL('../dist/local/products.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'');
  source=source.slice(0,source.lastIndexOf('load().catch'))+'\nload = async () => {};';
  vm.runInContext(source,context);
  return {listeners,requests,controls,form,file,save,submit,pause,dialog,error,gallery,event:(target,submitter)=>({target,submitter,preventDefault(){this.prevented=true;}})};
}
test('salvar bloqueia envio duplicado e pausa concorrente sem perder os campos', async () => {
  const h=editorHarness(), first=h.listeners.submit(h.event(h.form,h.save));
  assert.ok(h.controls.every(c=>c.disabled));
  await h.listeners.submit(h.event(h.form,h.submit));
  await h.listeners.click(h.event(h.pause));
  const cancel=h.event(h.dialog); h.listeners.cancel(cancel); assert.equal(cancel.prevented,true);
  assert.equal(h.requests.length,1);
  assert.equal(JSON.parse(h.requests[0].options.body).priceCents,12590);
  h.requests[0].resolve({ok:true,json:async()=>({})}); await first;
  assert.ok(h.dialog.closed); assert.ok(h.controls.every(c=>!c.disabled));
});
test('erro ao salvar libera controles para tentar novamente', async () => {
  const h=editorHarness(), pending=h.listeners.submit(h.event(h.form,h.submit));
  h.requests[0].resolve({ok:false,status:409,json:async()=>({error:'O anúncio mudou. Recarregue.'})}); await pending;
  assert.match(h.error.textContent,/Recarregue/); assert.ok(!h.dialog.closed);
  assert.ok(h.controls.every(c=>!c.disabled));
});
test('upload impede salvar e pausar até terminar; foto aparece no formulário', async () => {
  const h=editorHarness(), pending=h.listeners.change(h.event(h.file));
  assert.ok(h.controls.every(c=>c.disabled));
  await h.listeners.submit(h.event(h.form,h.save)); await h.listeners.click(h.event(h.pause));
  assert.equal(h.requests.length,1); assert.equal(h.requests[0].url,'/api/local/customer/photo');
  h.requests[0].resolve({ok:true,json:async()=>({id:'photo-new'})}); await pending;
  assert.ok(h.controls.every(c=>!c.disabled)); assert.match(h.error.textContent,/Fotos enviadas/);
  assert.match(h.gallery.innerHTML,/photo-new/);
});
test('falha no upload permite corrigir e reenviar sem travar o editor', async () => {
  const h=editorHarness(), failed=h.listeners.change(h.event(h.file));
  h.requests[0].resolve({ok:false,json:async()=>({error:'Falha no envio.'})}); await failed;
  assert.match(h.error.textContent,/Falha/); assert.ok(h.controls.every(c=>!c.disabled));
  assert.equal(h.gallery.innerHTML,'');
  const retry=h.listeners.change(h.event(h.file));
  h.requests[1].resolve({ok:true,json:async()=>({id:'photo-retry'})}); await retry;
  assert.match(h.gallery.innerHTML,/photo-retry/); assert.ok(h.controls.every(c=>!c.disabled));
});
