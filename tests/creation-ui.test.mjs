import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../dist/assets/creation-ui.js', import.meta.url), 'utf8');
const flush = async () => { for (let n = 0; n < 30; n++) await Promise.resolve(); };
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
function fixture() {
 const nodes = new Map(), handlers = {}, calls = [], timers = [], notices = [], waits = new Map(), copied = [];
 let rows = [], failure = '', key = 0;
 const document = {hidden: false, querySelector(selector) { if (!nodes.has(selector)) nodes.set(selector, {innerHTML: '', value: '', setAttribute() {}}); return nodes.get(selector); }, addEventListener(name, fn) { handlers[name] = fn; }, removeEventListener(name) { delete handlers[name]; }};
 const state = {company: {id: 'company-a'}, assets: [{id: 'logo', name: 'Logo.png', mime: 'image/png', size: 100}, {id: 'recording', name: 'Gravação.mp4', mime: 'video/mp4', size: 100}, {id: 'document', name: 'Briefing.pdf', mime: 'application/pdf', size: 100}]};
 const api = async (url, method = 'GET', body) => {
  calls.push({url, method, body});
  if (waits.has(url + ':' + method)) return waits.get(url + ':' + method);
  if (method === 'GET') return {creations: structuredClone(rows)};
  if (failure) throw new Error(failure);
  const creation = {id: 'creation-' + body.requestId, ...body, status: 'queued', createdAt: Date.now(), assets: []}; rows.unshift(creation); return {creation};
 };
 const context = vm.createContext({document, console, crypto: {randomUUID: () => 'request-' + (++key)}, setInterval(fn) { timers.push(fn); return timers.length; }, clearInterval(id) { timers[id - 1] = null; }, navigator: {clipboard: {async writeText(value) { copied.push(value); }}}, __deps: {api, endpoint: tail => '/api/portal/' + state.company.id + '/' + tail, getState: () => state, esc, toast: (...args) => notices.push(args), refresh: async () => {}, uploadFile: async (url, file) => { calls.push({url, method: 'UPLOAD'}); if (waits.has('upload')) return waits.get('upload'); const asset = {id: 'uploaded-' + file.name, name: file.name, mime: file.type, size: file.size}; state.assets.push(asset); return asset; }}});
 vm.runInContext(source.replace('export function ', 'function ') + '\nglobalThis.ui=createCreationUI(__deps);', context);
 return {ui: context.ui, state, nodes, calls, timers, notices, copied, handlers,
  async mount(format = 'feed') { context.ui.page(format); context.ui.mount('create'); await flush(); },
  html() { return context.ui.page(); },
  results() { return document.querySelector('#creation-results').innerHTML; },
  click(action, extra = {}) { return handlers.click({target: {closest: () => ({dataset: {creationAction: action, ...extra}})}}); },
  type(text) { document.querySelector('#creation-prompt').value = text; handlers.input({target: {id: 'creation-prompt', value: text}}); },
  change(id, value, files) { return handlers.change({target: {id, value, files}}); },
  submit() { return handlers.submit({target: {id: 'creation-form'}, preventDefault() {}}); },
  setRows(next) { rows = next; }, fail(message) { failure = message; },
  hold(id) { let resolve; waits.set(id, new Promise(r => resolve = r)); return value => { waits.delete(id); resolve(value); }; },
 };
}

test('criação mostra quatro formatos e apenas pedido e resultados, sem editor ou pré-validação', async () => {
 const f = fixture(); await f.mount(); const html = f.html();
 for (const format of ['feed', 'story', 'carousel', 'reels']) assert.match(html, new RegExp('data-format="' + format + '"'));
 assert.match(html, /creation-prompt/); assert.match(html, /Anexar referência/); assert.match(html, /Suas criações/);
 assert.doesNotMatch(html, /iframe|timeline|Configurar hospedagem|Validar acesso|cloud-tools|PDF/);
 assert.equal(f.calls.filter(c => c.method === 'POST').length, 0);
});

test('escolha de carrossel envia quantidade e referências; Reels envia duração', async () => {
 const f = fixture(); await f.mount('carousel'); f.type('Uma sequência sobre nossa marca');
 await f.change('creation-library', 'logo'); await f.change('creation-count', '7'); await f.submit();
 const first = f.calls.find(c => c.method === 'POST'); assert.equal(first.body.format, 'carousel'); assert.equal(first.body.slideCount, 7); assert.deepEqual(Array.from(first.body.attachments), ['logo']); assert.ok(first.body.requestId);
 assert.match(f.results(), /Na fila/); assert.doesNotMatch(f.results(), /Pronto para baixar/);
 await f.click('format', {format: 'reels'}); f.type('Um vídeo da empresa'); await f.change('creation-duration', '30'); await f.change('creation-library', 'recording'); await f.submit();
 const second = f.calls.filter(c => c.method === 'POST').at(-1); assert.equal(second.body.format, 'reels'); assert.equal(second.body.duration, 30); assert.equal(second.body.slideCount, undefined); assert.deepEqual(Array.from(second.body.attachments), ['recording']);
});

test('resposta perdida preserva a chave do pedido e impede envio duplicado simultâneo', async () => {
 const f = fixture(); await f.mount(); f.type('Crie uma imagem para nossa marca'); f.fail('Resposta perdida'); await f.submit();
 assert.match(f.html(), /Conferir e reenviar pedido/); f.fail(''); await f.submit();
 const posts = f.calls.filter(c => c.method === 'POST'); assert.equal(posts.length, 2); assert.equal(posts[0].body.requestId, posts[1].body.requestId);
 f.type('Outra imagem'); const deliver = f.hold('/api/portal/company-a/creations:POST'); const sending = f.submit(); await flush(); await f.submit();
 assert.equal(f.calls.filter(c => c.method === 'POST').length, 3); deliver({creation: {id: 'last', status: 'queued'}}); await sending;
});

test('anexos são validados antes do upload e vídeo só permanece em Reels', async () => {
 const f = fixture(); await f.mount(); await f.change('creation-file', '', [{name: 'arquivo.pdf', type: 'application/pdf', size: 100}]);
 assert.match(f.html(), /Envie PNG, JPG ou WebP/); assert.equal(f.calls.filter(c => c.method === 'UPLOAD').length, 0);
 await f.change('creation-file', '', [{name: 'large.png', type: 'image/png', size: 21 * 1024 * 1024}]); assert.equal(f.calls.filter(c => c.method === 'UPLOAD').length, 0);
 await f.change('creation-file', '', [{name: 'foto.png', type: 'image/png', size: 100}]); assert.match(f.html(), /foto.png/);
 await f.click('format', {format: 'reels'}); await f.change('creation-library', 'recording'); assert.match(f.html(), /data-id="recording"/);
 await f.click('format', {format: 'story'}); assert.doesNotMatch(f.html(), /data-id="recording"|video\/mp4/);
});

test('resultado usa arquivos privados, mostra dimensões e copia a legenda sem executar HTML', async () => {
 const f = fixture(); f.setRows([{id: 'done', format: 'carousel', status: 'complete', prompt: '<script>request()</script>', caption: '<img onerror=bad()> Legenda', createdAt: Date.now(), assets: [{id: 'asset-one', name: '01.png', mime: 'image/png', url: 'https://untrusted.invalid/file', width: 1024, height: 1280}, {id: 'asset-two', name: '02.png', mime: 'image/png'}]}]); await f.mount(); const html = f.results();
 assert.match(html, /Pronto para baixar/); assert.match(html, /1024 × 1280/); assert.match(html, /\/api\/portal\/files\/asset-one/); assert.match(html, /Baixar 1/); assert.match(html, /Baixar 2/);
 assert.doesNotMatch(html, /untrusted.invalid|<script>|<img onerror/); assert.match(html, /&lt;script&gt;/);
 await f.click('copy-caption', {id: 'done'}); assert.deepEqual(f.copied, ['<img onerror=bad()> Legenda']);
});

test('falha parcial mantém arquivos gerados disponíveis sem afirmar conclusão total', async () => {
 const f = fixture(); f.setRows([{id: 'partial', format: 'carousel', status: 'failed', prompt: 'Três imagens', error: 'A terceira imagem falhou.', assets: [{id: 'first', name: '01.png', mime: 'image/png'}]}]); await f.mount();
 assert.match(f.results(), /A terceira imagem falhou/); assert.match(f.results(), /\/api\/portal\/files\/first/); assert.doesNotMatch(f.results(), /Pronto para baixar/);
});

test('troca de empresa descarta resposta e upload antigos, limpa dados e refaz leitura', async () => {
 const f = fixture(); await f.mount(); f.type('Pedido privado da empresa A'); const deliver = f.hold('upload'); const upload = f.change('creation-file', '', [{name: 'segredo.png', type: 'image/png', size: 100}]); await flush();
 f.state.company.id = 'company-b'; await f.mount(); deliver({id: 'private', name: 'segredo.png', mime: 'image/png', size: 100}); await upload;
 assert.doesNotMatch(f.html(), /Pedido privado|segredo.png/); assert.ok(f.calls.some(c => c.url === '/api/portal/company-b/creations'));
 const result = f.hold('/api/portal/company-b/creations:GET'); const loading = f.click('refresh'); await flush(); f.state.company.id = 'company-c'; await f.mount(); result({creations: [{id: 'secret', prompt: 'Private B'}]}); await loading;
 assert.doesNotMatch(f.html(), /Private B/); f.ui.dispose(); assert.equal(Object.keys(f.handlers).length, 0); assert.ok(f.timers.every(t => t === null));
});

test('histórico atualiza sem apagar o pedido que está sendo escrito', async () => {
 const f = fixture(); await f.mount(); f.type('Ainda escrevendo...'); f.setRows([{id: 'ready', format: 'reels', status: 'complete', assets: [{id: 'mp4', mime: 'video/mp4', name: 'Reels.mp4'}]}]); f.timers.at(-1)(); await flush();
 assert.match(f.html(), /Ainda escrevendo/); assert.match(f.results(), /<video controls playsinline/); assert.match(f.results(), /Reels.mp4/);
});

test('uma leitura iniciada antes do envio não apaga o pedido recém-recebido', async () => {
 const f = fixture(); await f.mount(); const deliver = f.hold('/api/portal/company-a/creations:GET'); const loading = f.click('refresh'); await flush();
 f.type('Imagem nova'); await f.submit(); assert.match(f.results(), /Imagem nova/); deliver({creations: []}); await loading; assert.match(f.results(), /Imagem nova/);
});


test('Reels impede upload que excederia 30 MB de referências', async () => {
 const f = fixture(); await f.mount('reels');
 await f.change('creation-file', '', [{name:'primeiro.mp4',type:'video/mp4',size:16*1024*1024},{name:'segundo.mp4',type:'video/mp4',size:16*1024*1024}]);
 assert.equal(f.calls.filter(c=>c.method==='UPLOAD').length,1);assert.match(f.html(),/As referências do Reels devem somar até 30 MB/);assert.match(f.html(),/primeiro.mp4/);
});
