import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../dist/assets/cloud-tools-ui.js', import.meta.url), 'utf8');
const flush = async () => { for (let n = 0; n < 30; n++) await Promise.resolve(); };
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
function fixture() {
 const handlers = {}, nodes = new Map(), calls = [], timers = [], messages = [], pending = new Map();
 const node = () => ({innerHTML: '', value: '', hidden: false, disabled: false, dataset: {}, contains: () => true, removeAttribute(name) { delete this[name]; }});
 const document = {hidden: false, querySelectorAll: () => [], querySelector(selector) { if (!nodes.has(selector)) nodes.set(selector, node()); return nodes.get(selector); }, addEventListener(name, fn) { handlers[name] = fn; }, removeEventListener(name) { delete handlers[name]; }};
 const state = {company: {id: 'company-a'}, assets: [{id: 'own-video', name: 'Meu vídeo', mime: 'video/mp4'}, {id: 'photo', name: 'Foto', mime: 'image/png'}]};
 let status = {configured: true, available: true, browser: true, video: true}, failedType = false, exportState = 'queued';
 let chat = {messages:[],jobs:[]}, failSend=false;
 let project = {id: 'project-one', name: 'Vídeo inicial', revision: 1, scenes: [{duration: 5, text: 'Olá', background: '#ffffff', textColor: '#171717'}]};
 const api = async (url, method = 'GET', body) => {
  calls.push({url, method, body});
  if (pending.has(url)) return pending.get(url);
  if(url.endsWith('/conversations')&&method==='POST')return {id:'video-thread'};
  if(url.endsWith('/conversations/video-thread/messages')){if(failSend)throw Error('Resposta perdida');chat.messages.push({role:'user',text:body.text});chat.jobs=[{id:'chat-job',state:'queued'}];return {id:'chat-job'};}
  if(url.endsWith('/conversations/video-thread/stop')){chat.jobs=[{id:'chat-job',state:'canceled'}];return {requested:true};}
  if(url.endsWith('/conversations/video-thread'))return structuredClone(chat);
  if (url.endsWith('/status')) return status;
  if (url.endsWith('/runtime/browser')) return {profiles: [{id: 'instagram', name: 'Instagram', open: false, accountLabel: ''}]};
  if (url.endsWith('/frame')) return {image: 'aW1n', width: 1200, height: 800};
  if (url.endsWith('/human') && body?.type === 'type' && failedType) throw new Error('Provider echoed ' + body.text);
  if (url.endsWith('/video/projects') && method === 'POST') { project = {...project, ...body}; return structuredClone(project); }
  if (url.endsWith('/video/projects')) return {projects: [structuredClone(project)]};
  if (url.endsWith('/video/projects/project-one') && method === 'PATCH') { assert.equal(body.expectedRevision, project.revision); project = {...project, scenes: body.scenes, revision: project.revision + 1}; return structuredClone(project); }
  if (url.endsWith('/video/projects/project-one')) return structuredClone(project);
  if (url.endsWith('/exports') && method === 'POST') return {id: 'export-one', state: exportState, progress: 0};
  if (url.endsWith('/exports/export-one')) return {id: 'export-one', state: exportState, progress: exportState === 'complete' ? 100 : 10};
  if (url.endsWith('/import')) return {assetId: 'generated-video', url: 'https://unsafe.example/should-not-be-used'};
  return {};
 };
 const context = vm.createContext({document, console, structuredClone, crypto: {randomUUID: () => 'export-key'}, setInterval(fn) { timers.push(fn); return timers.length; }, clearInterval(id) { timers[id - 1] = null; }, __deps: {api, endpoint: tail => '/api/portal/' + state.company.id + '/' + tail, getState: () => state, esc, toast: (...args) => messages.push(args), refresh: async () => {}}});
 vm.runInContext(source.replace(/export function /g, 'function ') + '\nglobalThis.ui=createCloudToolsUI(__deps);globalThis.point=remotePoint;', context);
 const ui = context.ui;
 return {ui, state, calls, nodes, handlers, timers, messages, document, point: context.point,
  async mount(view) { document.querySelector('#cloud-tools-body'); document.querySelector('#cloud-tools-root'); ui.mount(view); await flush(); },
  click(action, extra = {}) { const b = {dataset: {cloudAction: action, ...extra}}; return handlers.click({target: {closest: () => b}}); },
  submit(form) { return handlers.submit({preventDefault() {}, target: form}); },
  input(index, field, value) { handlers.input({target: {dataset: {index: String(index), sceneField: field}, value}}); },
  hold(url) { let resolve; pending.set(url, new Promise(r => resolve = r)); return value => { pending.delete(url); resolve(value); }; },
  setChat(value){chat=value;}, failChat(value){failSend=value;}, typeChat(value){handlers.input({target:{id:'astra-video-prompt',value}});}, setStatus(value) { status = value; }, setProject(value) { project = {...project, ...value}; }, failType() { failedType = true; }, finishExport() { exportState = 'complete'; },
 };
}

test('ferramentas online conferem disponibilidade sem abrir contas automaticamente', async () => {
 const f = fixture(); await f.mount('browser');
 assert.match(f.ui.screens(), /Instagram/); assert.equal(f.calls.filter(c => c.method === 'POST').length, 0);
 f.setStatus({configured: false, available: false}); await f.click('reload');
 assert.match(f.ui.screens(), /Falta conectar o serviço online/); assert.doesNotMatch(f.ui.screens(), /Abrir para entrar/);
});

test('abrir conta assume controle antes de solicitar tela e normaliza coordenadas', async () => {
 const f = fixture(); await f.mount('browser'); await f.click('open-browser', {id: 'instagram'});
 const steps = f.calls.filter(c => /\/(open|human|frame)$/.test(c.url));
 assert.equal(steps[0].url.endsWith('/open'), true); assert.equal(steps[1].body.type, 'take'); assert.equal(steps[2].url.endsWith('/frame'), true);
 const point = f.point({left: 20, top: 10, width: 600, height: 400}, 1200, 800, 320, 210);
 assert.equal(point.x, 600); assert.equal(point.y, 400);
 assert.equal(f.point({left: 0, top: 0, width: 0, height: 0}, 1200, 800, 0, 0), null);
 assert.equal(f.document.querySelector('#cloud-remote-frame').src, 'data:image/jpeg;base64,aW1n');
});

test('entrada privada é apagada antes do envio e nunca é repetida em erro ou HTML', async () => {
 const f = fixture(); await f.mount('browser'); await f.click('open-browser', {id: 'instagram'}); f.failType();
 const input = f.document.querySelector('#cloud-private-input'); input.value = 'PRIVATE-TEST-VALUE';
 const request = f.submit({id: 'cloud-remote-type'}); assert.equal(input.value, ''); await request;
 const typed = f.calls.find(c => c.body?.type === 'type'); assert.equal(typed.body.text, 'PRIVATE-TEST-VALUE');
 assert.doesNotMatch(f.ui.screens(), /PRIVATE-TEST-VALUE/); assert.doesNotMatch(JSON.stringify(f.messages), /PRIVATE-TEST-VALUE/);
 assert.match(f.ui.screens(), /type="password"/);
});

test('sair da ferramenta para captura, oculta tela e devolve controle à empresa original', async () => {
 const f = fixture(); await f.mount('browser'); await f.click('open-browser', {id: 'instagram'});
 f.ui.dispose(); await flush();
 const release = f.calls.at(-1); assert.equal(release.url, '/api/portal/company-a/runtime/browser/instagram/human'); assert.equal(release.body.type, 'release');
 assert.equal(f.timers[0], null); assert.equal(f.document.querySelector('#cloud-remote-frame').src, undefined);
 assert.equal(Object.keys(f.handlers).length, 0);
});

test('resposta de tela da empresa anterior é descartada após a troca', async () => {
 const f = fixture(); await f.mount('browser');
 const deliver = f.hold('/api/portal/company-a/runtime/browser/instagram/frame');
 const opening = f.click('open-browser', {id: 'instagram'}); await flush();
 f.state.company.id = 'company-b'; await f.mount('browser');
 deliver({image: 'b2xk', width: 1200, height: 800}); await opening;
 assert.notEqual(f.document.querySelector('#cloud-remote-frame').src, 'data:image/jpeg;base64,b2xk');
 assert.ok(f.calls.some(c => c.url === '/api/portal/company-a/runtime/browser/instagram/human' && c.body?.type === 'release'));
 assert.doesNotMatch(f.ui.screens(), /Você está no controle/);
});

test('troca de empresa limpa imediatamente uma tela e entrada privada já visíveis', async () => {
 const f = fixture(); await f.mount('browser'); await f.click('open-browser', {id: 'instagram'});
 const image = f.document.querySelector('#cloud-remote-frame'), input = f.document.querySelector('#cloud-private-input'); input.value = 'UNSENT-PRIVATE';
 assert.ok(image.src);
 f.state.company.id = 'company-b'; const deliver = f.hold('/api/portal/company-b/runtime/status'); f.ui.mount('browser');
 assert.equal(image.src, undefined); assert.equal(input.value, '');
 assert.match(f.document.querySelector('#cloud-tools-body').innerHTML, /desta empresa/);
 deliver({configured: true, available: true, browser: true, video: true}); await flush();
});

test('editor salva revisão, acompanha exportação e usa somente arquivo importado da biblioteca', async () => {
 const f = fixture(); await f.mount('video'); assert.match(f.ui.videos(), /Meu vídeo/); assert.doesNotMatch(f.ui.videos(), /value="photo"/);
 await f.click('select-project', {id: 'project-one'});
 f.input(0, 'text', 'Nova legenda'); await f.click('export-video');
 const save = f.calls.find(c => c.method === 'PATCH'); const generation = f.calls.find(c => c.url.endsWith('/exports'));
 assert.equal(save.body.expectedRevision, 1); assert.equal(save.body.scenes[0].text, 'Nova legenda'); assert.equal(generation.body.revision, 2); assert.equal(generation.body.idempotencyKey, 'export-key');
 assert.match(f.ui.videos(), /O serviço online continua a exportação/);
 f.finishExport(); f.timers[0](); await flush(); assert.match(f.ui.videos(), /Salvar na Biblioteca/);
 await f.click('import-video'); const html = f.ui.videos();
 assert.match(html, /<video controls/); assert.match(html, /\/api\/portal\/files\/generated-video/); assert.doesNotMatch(html, /unsafe\.example/);
});

test('mudança de projeto preserva alterações não salvas e o HTML escapa textos', async () => {
 const f = fixture(); await f.mount('video'); await f.click('select-project', {id: 'project-one'});
 f.input(0, 'text', '<script>invalid()</script>'); await f.click('new-project');
 assert.match(f.ui.videos(), /&lt;script&gt;/); assert.doesNotMatch(f.ui.videos(), /<script>/);
 assert.match(f.messages.at(-1)[0], /Salve suas alterações/);
});

test('limites de duração e texto são conferidos antes de salvar ou exportar', async () => {
 const f = fixture(); f.setProject({scenes: Array.from({length: 3}, () => ({duration: 40, text: 'Cena', background: '#ffffff', textColor: '#171717'}))});
 await f.mount('video'); await f.click('select-project', {id: 'project-one'});
 assert.match(f.ui.videos(), /min="0.2" max="60"/); assert.match(f.ui.videos(), /maxlength="280"/); assert.match(f.ui.videos(), /120 segundos no total/);
 f.input(0, 'duration', '40.1'); await f.click('save-project');
 assert.equal(f.calls.filter(c => c.method === 'PATCH').length, 0); assert.match(f.messages.at(-1)[0], /até 120 segundos/);
 await f.click('export-video'); assert.equal(f.calls.filter(c => c.url.endsWith('/exports')).length, 0);
 f.input(0, 'duration', '40'); f.input(1, 'text', 'x'.repeat(281)); await f.click('save-project');
 assert.match(f.messages.at(-1)[0], /280 caracteres/); assert.equal(f.calls.filter(c => c.method === 'PATCH').length, 0);
 f.input(1, 'text', 'x'.repeat(280)); await f.click('export-video');
 assert.equal(f.calls.find(c => c.method === 'PATCH').body.scenes[0].duration, 40); assert.ok(f.calls.some(c => c.url.endsWith('/exports')));
});

test('cenas muito curtas ou acima de 60 segundos não são enviadas; aceita 32 cenas', async () => {
 const f = fixture(); await f.mount('video'); await f.click('select-project', {id: 'project-one'});
 for (const duration of ['0.1', '60.1', 'NaN']) { f.input(0, 'duration', duration); await f.click('save-project'); assert.match(f.messages.at(-1)[0], /0,2 a 60 segundos/); }
 assert.equal(f.calls.filter(c => c.method === 'PATCH').length, 0);
 f.input(0, 'duration', '0.2');
 for (let i = 0; i < 35; i++) { await f.click('add-scene'); if (i < 31) f.input(i + 1, 'duration', '0.2'); }
 assert.equal((f.ui.videos().match(/data-scene-index=/g) || []).length, 32);
 await f.click('save-project'); assert.equal(f.calls.find(c => c.method === 'PATCH').body.scenes.length, 32);
});

test('nome do projeto segue limite de 100 caracteres sem truncar silenciosamente', async () => {
 const f = fixture(); await f.mount('video'); assert.match(f.ui.videos(), /name="name" maxlength="100"/);
 await f.submit({id: 'cloud-create-project', elements: {name: {value: 'x'.repeat(101)}, sourceAssetId: {value: ''}}});
 assert.match(f.messages.at(-1)[0], /100 caracteres/); assert.equal(f.calls.filter(c => c.method === 'POST').length, 0);
});

test('fila desativada mantém edição disponível e impede exportar', async () => {
 const f = fixture(); f.setStatus({configured: true, available: true, browser: true, video: true, queueEnabled: false, worker: {configured: true, state: 'disabled'}});
 await f.mount('video'); await f.click('select-project', {id: 'project-one'});
 assert.match(f.ui.videos(), /fila de produção está desativada/); assert.match(f.ui.videos(), /data-cloud-action="export-video" disabled/);
 f.input(0, 'text', 'Pode salvar'); await f.click('save-project'); assert.ok(f.calls.some(c => c.method === 'PATCH'));
 await f.click('export-video'); assert.equal(f.calls.filter(c => c.url.endsWith('/exports')).length, 0);
});

test('agendador ausente bloqueia na nuvem, mas aceita outro executor confirmado', async () => {
 const f = fixture(); f.state.worker = {local: false, running: false}; f.setStatus({configured: true, available: true, browser: true, video: true, queueEnabled: true, worker: {configured: false}});
 await f.mount('video'); await f.click('select-project', {id: 'project-one'});
 assert.match(f.ui.videos(), /agendador online ainda precisa/); await f.click('export-video'); assert.equal(f.calls.filter(c => c.url.endsWith('/exports')).length, 0);
 f.state.worker.running = true; await f.click('export-video'); assert.equal(f.calls.filter(c => c.url.endsWith('/exports')).length, 1);
});

test('última falha do agendador é informada sem fingir que a exportação terminou', async () => {
 const f = fixture(); f.setStatus({configured: true, available: true, browser: true, video: true, queueEnabled: true, worker: {configured: true, state: 'failed'}});
 await f.mount('video'); assert.match(f.ui.videos(), /último processamento não respondeu/); assert.doesNotMatch(f.ui.videos(), /MP4 pronto/);
});

test('gravações oferecem início e fim editáveis e salvam a duração calculada do corte', async () => {
 const f = fixture(); f.setProject({scenes: [{sourceAssetId: 'own-video', in: 2, out: 7, duration: 5, text: 'Trecho', background: '#ffffff', textColor: '#171717'}]});
 await f.mount('video'); await f.click('select-project', {id: 'project-one'});
 assert.match(f.ui.videos(), /Início do corte/); assert.match(f.ui.videos(), /Fim do corte/); assert.doesNotMatch(f.ui.videos(), /data-scene-field="duration"/);
 f.input(0, 'in', '3.5'); f.input(0, 'out', '5.5');
 assert.equal(f.document.querySelector('#cloud-cut-duration-0').textContent, '2');
 assert.equal(f.document.querySelector('#cloud-scene-total').textContent, '2');
 await f.click('save-project'); const scene = f.calls.find(c => c.method === 'PATCH').body.scenes[0];
 assert.equal(scene.in, 3.5); assert.equal(scene.out, 5.5); assert.equal(scene.duration, 2); assert.equal(scene.sourceAssetId, 'own-video');
});

test('cortes negativos, invertidos ou longos são bloqueados antes de qualquer envio', async () => {
 const f = fixture(); f.setProject({scenes: [{sourceAssetId: 'own-video', in: 0, out: 5, duration: 5, text: '', background: '#ffffff', textColor: '#171717'}]});
 await f.mount('video'); await f.click('select-project', {id: 'project-one'});
 f.input(0, 'in', '-1'); await f.click('save-project'); assert.match(f.messages.at(-1)[0], /início e o fim/);
 f.input(0, 'in', '6'); await f.click('save-project'); assert.match(f.messages.at(-1)[0], /início e o fim/);
 f.input(0, 'out', '66.5'); await f.click('export-video'); assert.match(f.messages.at(-1)[0], /0,2 a 60 segundos/);
 assert.equal(f.calls.filter(c => c.method === 'PATCH' || c.url.endsWith('/exports')).length, 0);
});


test('Astra mostra chat, prévia e edição manual sem confundir prévia com MP4',async()=>{
 const f=fixture();await f.mount('video');await f.click('select-project',{id:'project-one'});
 assert.match(f.ui.videos(),/Converse com o Astra/);assert.match(f.ui.videos(),/Editar manualmente/);assert.match(f.ui.videos(),/layout aproximado/);
 f.input(0,'text','<script>alert(1)</script>');
 assert.match(f.document.querySelector('#astra-scene-preview').innerHTML,/&lt;script&gt;/);
 assert.doesNotMatch(f.document.querySelector('#astra-scene-preview').innerHTML,/<script>/);
});
test('chat salva edição antes de pedir ao Astra e acompanha a revisão sem sobrescrever',async()=>{
 const f=fixture();await f.mount('video');await f.click('select-project',{id:'project-one'});
 f.input(0,'text','Primeira versão');f.typeChat('Deixe o texto mais curto');await f.submit({id:'astra-video-chat'});
 const send=f.calls.find(c=>c.url.endsWith('/messages'));
 assert.match(send.body.text,/projeto project-one, revisão 2/);assert.equal(send.body.mode,'execute');assert.ok(send.body.idempotencyKey);
 assert.ok(f.calls.findIndex(c=>c.method==='PATCH')<f.calls.indexOf(send));
 const writes=f.calls.filter(c=>c.method==='PATCH').length;f.input(0,'text','Conflito');await f.click('save-project');assert.equal(f.calls.filter(c=>c.method==='PATCH').length,writes);
 f.setProject({revision:3,scenes:[{duration:5,text:'Texto do Astra',background:'#ffffff',textColor:'#171717'}]});
 f.setChat({messages:[{role:'assistant',text:'Texto atualizado.'}],jobs:[{id:'chat-job',state:'succeeded'}]});
 await f.click('refresh-video-chat');assert.match(f.ui.videos(),/Texto do Astra/);assert.match(f.ui.videos(),/Texto atualizado/);
 f.input(0,'text','Ajuste manual final');await f.click('save-project');assert.equal(f.calls.filter(c=>c.method==='PATCH').at(-1).body.expectedRevision,3);
});
test('chat usa pausa existente e mantém idempotência após resposta perdida',async()=>{
 const f=fixture();await f.mount('video');await f.click('select-project',{id:'project-one'});f.typeChat('Troque a cor');f.failChat(true);
 await f.submit({id:'astra-video-chat'});f.failChat(false);await f.submit({id:'astra-video-chat'});
 const sends=f.calls.filter(c=>c.url.endsWith('/messages'));assert.equal(sends.length,2);assert.equal(sends[0].body.idempotencyKey,sends[1].body.idempotencyKey);
 await f.click('pause-video-chat');assert.ok(f.calls.some(c=>c.url.endsWith('/video-thread/stop')));
});
test('sem serviço, seção permanece visível mas não cria projeto ou chama inteligência',async()=>{
 const f=fixture();f.setStatus({configured:false,available:false,video:false});await f.mount('video');
 assert.match(f.ui.videos(),/Converse com o Astra/);f.typeChat('Crie um vídeo');await f.submit({id:'astra-video-chat'});
 assert.equal(f.calls.filter(c=>c.method==='POST').length,0);
});
test('resposta atrasada do chat não aparece na empresa seguinte',async()=>{
 const f=fixture();await f.mount('video');await f.click('select-project',{id:'project-one'});f.typeChat('Ajuste o vídeo');await f.submit({id:'astra-video-chat'});
 const release=f.hold('/api/portal/company-a/conversations/video-thread');const pending=f.click('refresh-video-chat');await flush();
 f.state.company.id='company-b';await f.mount('video');release({messages:[{role:'assistant',text:'SEGREDO EMPRESA A'}],jobs:[]});await pending;
 assert.doesNotMatch(f.ui.videos(),/SEGREDO EMPRESA A/);
});
