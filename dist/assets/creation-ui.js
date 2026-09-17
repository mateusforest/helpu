const FORMATS = {feed: ['Feed', 'Imagem · vertical 4:5'], story: ['Story', 'Imagem · vertical 9:16'], carousel: ['Carrossel', 'Imagens · vertical 4:5'], reels: ['Reels', 'Vídeo · vertical 9:16']};
const ACTIVE = new Set(['queued', 'working']);
const STATUS = {queued: 'Na fila', working: 'Criando seu material', complete: 'Pronto para baixar', blocked: 'Precisa de um ajuste', failed: 'Não foi possível concluir', uncertain: 'Aguardando confirmação'};
const MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'video/mp4']);
const LIMIT = 25 * 1024 * 1024;

export function createCreationUI({api, endpoint, getState, esc, toast, uploadFile, refresh}) {
 let company = '', epoch = 0, view = '', routeFormat = '', timer = null, listening = false, loading = false, revision = 0;
 let creations = [], loadError = '', submitError = '', prompt = '', format = 'feed', slideCount = 3, duration = 15, attachments = [], sending = false, uploading = false, pending = null;
 const $ = selector => document.querySelector(selector);
 const active = () => view === 'create' && company === getState()?.company?.id;
 const stamp = () => ({company, epoch, base: endpoint('creations'), files: endpoint('files')});
 const current = t => active() && company === t.company && epoch === t.epoch;
 const fileUrl = id => '/api/portal/files/' + encodeURIComponent(id);
 const files = () => (getState()?.assets || []).filter(asset => MIME.has(asset.mime) && (format === 'reels' || asset.mime.startsWith('image/')));
 const locked = () => sending || uploading;
 function ensureCompany() {
  const next = getState()?.company?.id || '';
  if (company === next) return;
  if (timer) clearInterval(timer); timer = null;
  company = next; epoch++; routeFormat = ''; creations = []; loadError = ''; submitError = ''; prompt = ''; format = 'feed'; slideCount = 3; duration = 15; attachments = []; sending = false; uploading = false; loading = false; pending = null;
 }
 function attachmentMarkup() {
  const available = files().filter(asset => !attachments.some(a => a.id === asset.id));
  return `<div class="creation-attachments"><div class="creation-attachment-actions"><label class="p-button secondary creation-upload" for="creation-file">${uploading ? 'Enviando arquivo…' : 'Anexar referência'}<input id="creation-file" type="file" accept="image/png,image/jpeg,image/webp${format === 'reels' ? ',video/mp4' : ''}" multiple ${locked() ? 'disabled' : ''}></label>${available.length ? `<label class="creation-library-label"><span class="sr-only">Escolher arquivo da biblioteca</span><select id="creation-library" ${locked() ? 'disabled' : ''}><option value="">Usar arquivo da biblioteca</option>${available.map(a => `<option value="${esc(a.id)}">${esc(a.name)}</option>`).join('')}</select></label>` : ''}</div>${attachments.length ? `<ul class="creation-files">${attachments.map(a => `<li><span>${esc(a.name)}</span><button type="button" data-creation-action="remove-file" data-id="${esc(a.id)}" aria-label="Remover ${esc(a.name)}" ${locked() ? 'disabled' : ''}>×</button></li>`).join('')}</ul>` : ''}<p class="micro-copy">Fotos e logo${format === 'reels' ? ' ou gravação em MP4' : ''} · até 6 referências${format === 'reels' ? ' e 25 MB por vídeo; até 30 MB no total' : ''}. Imagens: até 20 MB no total.</p></div>`;
 }
 function formMarkup() {
  const options = format === 'carousel' ? `<label class="p-field"><span>Quantidade de imagens</span><select id="creation-count" ${locked() ? 'disabled' : ''}>${Array.from({length: 8}, (_, i) => i + 3).map(n => `<option value="${n}" ${n === slideCount ? 'selected' : ''}>${n} imagens</option>`).join('')}</select></label>` : format === 'reels' ? `<label class="p-field"><span>Duração</span><select id="creation-duration" ${locked() ? 'disabled' : ''}><option value="15" ${duration === 15 ? 'selected' : ''}>15 segundos</option><option value="30" ${duration === 30 ? 'selected' : ''}>30 segundos</option></select></label>` : '';
  return `<form id="creation-form" class="creation-composer"><fieldset class="creation-format"><legend>O que vamos criar?</legend><div class="creation-format-options">${Object.entries(FORMATS).map(([id, [name, description]]) => `<button type="button" data-creation-action="format" data-format="${id}" aria-pressed="${id === format}" class="creation-format-button ${id === format ? 'selected' : ''}" ${locked() ? 'disabled' : ''}><strong>${name}</strong><span>${description}</span></button>`).join('')}</div></fieldset>${options ? `<div class="creation-options">${options}</div>` : ''}<label class="p-field creation-prompt-label" for="creation-prompt"><span>Conte o que você precisa</span><textarea id="creation-prompt" name="prompt" rows="5" maxlength="6000" required ${locked() ? 'disabled' : ''} placeholder="Ex.: apresente nosso serviço com um visual elegante e uma chamada para conversar pelo WhatsApp. Use as cores da marca.">${esc(prompt)}</textarea></label><p class="micro-copy">O Astra usa as informações da sua marca. Inclua textos obrigatórios e detalhes da oferta.</p><div id="creation-attachment-area">${attachmentMarkup()}</div><div id="creation-submit-error" class="creation-error" role="alert" ${submitError ? '' : 'hidden'}>${esc(submitError)}</div><div class="creation-submit-line"><span>O arquivo e a legenda aparecem abaixo.</span><button id="creation-submit" type="submit" class="p-button primary" ${locked() ? 'disabled' : ''}>${sending ? 'Enviando pedido…' : pending ? 'Conferir e reenviar pedido' : format === 'reels' ? 'Criar Reels' : format === 'carousel' ? 'Criar carrossel' : 'Criar imagem'}</button></div></form>`;
 }
 function card(item) {
  const assets = Array.isArray(item.assets) ? item.assets.filter(a => a?.id && (a.mime?.startsWith('image/') || a.mime?.startsWith('video/'))) : [];
  const date = item.createdAt ? new Date(item.createdAt) : null;
  const media = assets.map((asset, i) => `<figure class="creation-media">${asset.mime.startsWith('video/') ? `<video controls playsinline preload="metadata" src="${esc(fileUrl(asset.id))}" aria-label="${esc(asset.name || 'Seu Reels')}"></video>` : `<img loading="lazy" src="${esc(fileUrl(asset.id))}" alt="${esc(asset.name || 'Imagem ' + (i + 1))}">`}<figcaption><span>${assets.length > 1 ? `${i + 1}. ` : ''}${esc(asset.name || 'Arquivo')}${asset.width && asset.height ? `<small>${Number(asset.width)} × ${Number(asset.height)}</small>` : ''}</span><a class="p-button secondary" href="${esc(fileUrl(asset.id))}" download="${esc(asset.name || 'helpu-criacao')}">Baixar${assets.length > 1 ? ' ' + (i + 1) : ''}</a></figcaption></figure>`).join('');
  return `<article class="creation-result" data-creation-id="${esc(item.id)}"><div class="creation-result-heading"><div><span class="creation-result-format">${esc(FORMATS[item.format]?.[0] || 'Criação')}</span><h3>${esc(item.prompt || 'Pedido de criação')}</h3>${date && !Number.isNaN(date.getTime()) ? `<time datetime="${date.toISOString()}">${esc(date.toLocaleString('pt-BR', {dateStyle: 'short', timeStyle: 'short'}))}</time>` : ''}</div><span class="creation-status creation-status-${esc(item.status)}">${esc(STATUS[item.status] || 'Pedido recebido')}</span></div>${item.summary ? `<p class="creation-summary">${esc(item.summary)}</p>` : ''}${ACTIVE.has(item.status) ? '<p class="creation-progress" role="status"><span aria-hidden="true"></span>Você pode continuar usando a Helpu. O resultado será atualizado aqui.</p>' : ''}${item.error ? `<p class="creation-error" role="alert">${esc(item.error)}</p>` : ''}${media ? `<div class="creation-media-grid ${item.format === 'reels' ? 'creation-media-reels' : ''}">${media}</div>` : item.status === 'complete' ? '<p class="creation-error">O arquivo não está disponível nesta resposta. Atualize os resultados para conferir.</p>' : ''}${item.caption ? `<div class="creation-caption"><div><h4>Legenda</h4><button type="button" class="p-button ghost" data-creation-action="copy-caption" data-id="${esc(item.id)}">Copiar legenda</button></div><p>${esc(item.caption)}</p></div>` : ''}</article>`;
 }
 function resultsMarkup() {
  if (loading && !creations.length) return '<p class="creation-loading" role="status">Carregando suas criações…</p>';
  return `${loadError ? `<p class="creation-error" role="alert">${esc(loadError)}</p>` : ''}${creations.length ? creations.map(card).join('') : !loadError ? '<div class="creation-empty"><strong>Seu próximo conteúdo começa aqui.</strong><p>Escolha o formato, faça seu pedido e receba o material pronto para baixar.</p></div>' : ''}`;
 }
 function page(defaultFormat) {
  ensureCompany();
  if (FORMATS[defaultFormat] && routeFormat !== defaultFormat) { routeFormat = defaultFormat; if (!locked()) { format = defaultFormat; attachments = attachments.filter(a => format === 'reels' || a.mime.startsWith('image/')); pending = null; } }
  return `<section id="creation-root" class="creation-workspace"><header class="creation-heading"><span>CRIAR COM O ASTRA</span><h1>Da sua ideia ao conteúdo pronto.</h1><p>Escolha Feed, Story, Carrossel ou Reels. Peça, acompanhe e baixe o resultado.</p></header><div id="creation-form-area">${formMarkup()}</div><section class="creation-results-section" aria-label="Suas criações"><div class="creation-results-title"><h2>Suas criações</h2><button type="button" class="p-button ghost" data-creation-action="refresh">Atualizar resultados</button></div><div id="creation-results" aria-live="polite" aria-busy="${loading}">${resultsMarkup()}</div></section></section>`;
 }
 function paintForm() { if (active() && $('#creation-form-area')) $('#creation-form-area').innerHTML = formMarkup(); }
 function paintResults() { if (active() && $('#creation-results')) { $('#creation-results').innerHTML = resultsMarkup(); $('#creation-results').setAttribute('aria-busy', String(loading)); } }
 async function load() {
  ensureCompany(); if (!active() || loading) return;
  const t = stamp(), startedRevision = revision; loading = true; paintResults();
  try {
   const result = await api(t.base);
   if (!current(t) || revision !== startedRevision) return;
   creations = Array.isArray(result.creations) ? result.creations : []; loadError = '';
  } catch (error) { if (current(t)) loadError = error.message || 'Não foi possível atualizar as criações.'; }
  finally { if (current(t)) { loading = false; paintResults(); } }
 }
 function validateAttachment(asset) {
  if (!MIME.has(asset.mime) || (format !== 'reels' && !asset.mime.startsWith('image/'))) throw new Error(format === 'reels' ? 'Envie PNG, JPG, WebP ou MP4.' : 'Envie PNG, JPG ou WebP.');
  if (Number(asset.size) > LIMIT) throw new Error('Envie arquivos de até 25 MB.');
  if (attachments.some(a => a.id === asset.id)) return false;
  if (attachments.length >= 6) throw new Error('Use até 6 referências por pedido.');
  if (format === 'reels' && attachments.reduce((sum, a) => sum + (Number(a.size) || 0), 0) + (Number(asset.size) || 0) > 30 * 1024 * 1024) throw new Error('As referências do Reels devem somar até 30 MB.');
  if (!asset.mime.startsWith('video/') && attachments.filter(a => !a.mime.startsWith('video/')).reduce((sum, a) => sum + (Number(a.size) || 0), 0) + (Number(asset.size) || 0) > 20 * 1024 * 1024) throw new Error('As imagens devem somar até 20 MB.');
  return true;
 }
 async function onFiles(selected) {
  if (!active() || locked() || !selected.length) return;
  const t = stamp(); uploading = true; submitError = ''; paintForm();
  try {
   for (const file of selected) {
    if (!current(t)) return;
    validateAttachment({mime: file.type, size: file.size});
    const asset = await uploadFile(t.files, file);
    if (!current(t)) return;
    if (validateAttachment(asset)) { attachments.push(asset); pending = null; }
   }
   await refresh(false);
  } catch (error) { if (current(t)) submitError = error.message; }
  finally { if (current(t)) { uploading = false; paintForm(); } }
 }
 async function onSubmit(event) {
  if (event.target?.id !== 'creation-form' || !active()) return;
  event.preventDefault(); if (locked()) return;
  prompt = String($('#creation-prompt')?.value ?? prompt).trim();
  if (!prompt || prompt.length > 6000) { submitError = 'Descreva seu pedido em até 6.000 caracteres.'; paintForm(); return; }
  const body = {prompt, format, attachments: attachments.map(a => a.id), ...(format === 'carousel' ? {slideCount} : {}), ...(format === 'reels' ? {duration} : {})};
  const signature = JSON.stringify(body);
  if (!pending || pending.signature !== signature) pending = {signature, requestId: crypto.randomUUID()};
  const t = stamp(), request = {...body, requestId: pending.requestId}; sending = true; submitError = ''; paintForm();
  try {
   const response = await api(t.base, 'POST', request);
   if (!current(t)) return;
   const creation = response.creation;
   if (!creation?.id) throw new Error('Não foi possível confirmar o pedido. Tente novamente para conferir.');
   revision++; creations = [creation, ...creations.filter(item => item.id !== creation.id)]; pending = null; prompt = ''; attachments = [];
   paintResults(); toast(creation.status === 'complete' ? 'Seu material está pronto.' : 'Pedido recebido. Acompanhe o resultado abaixo.');
  } catch (error) { if (current(t)) submitError = error.message || 'Não foi possível confirmar o pedido. Tente novamente para conferir.'; }
  finally { if (current(t)) { sending = false; paintForm(); } }
 }
 async function onClick(event) {
  const button = event.target?.closest?.('[data-creation-action]');
  if (!button || !active()) return;
  const action = button.dataset.creationAction;
  if (action === 'refresh') return load();
  if (action === 'copy-caption') {
   const caption = creations.find(item => item.id === button.dataset.id)?.caption; if (!caption) return;
   try { await navigator.clipboard.writeText(caption); toast('Legenda copiada.'); } catch { toast('Não foi possível copiar. Selecione o texto da legenda para copiar.', true); } return;
  }
  if (locked()) return;
  if (action === 'format' && FORMATS[button.dataset.format]) { format = button.dataset.format; attachments = attachments.filter(a => format === 'reels' || a.mime.startsWith('image/')); pending = null; submitError = ''; paintForm(); }
  if (action === 'remove-file') { attachments = attachments.filter(a => a.id !== button.dataset.id); pending = null; paintForm(); }
 }
 function onInput(event) {
  if (!active() || locked()) return;
  if (event.target?.id === 'creation-prompt') { prompt = event.target.value; pending = null; }
 }
 async function onChange(event) {
  if (!active() || locked()) return;
  const target = event.target;
  if (target?.id === 'creation-file') return onFiles(Array.from(target.files || []));
  if (target?.id === 'creation-count') { slideCount = Math.max(3, Math.min(10, Number(target.value) || 3)); pending = null; }
  if (target?.id === 'creation-duration') { duration = Number(target.value) === 30 ? 30 : 15; pending = null; }
  if (target?.id === 'creation-library') {
   const asset = files().find(a => a.id === target.value);
   try { if (asset && validateAttachment(asset)) { attachments.push(asset); pending = null; submitError = ''; } } catch (error) { submitError = error.message; }
   paintForm();
  }
 }
 function mount(nextView) {
  ensureCompany();
  if (nextView !== 'create') { if (view === 'create') { epoch++; loading = false; sending = false; uploading = false; } view = ''; if (timer) clearInterval(timer); timer = null; return; }
  const starting = view !== 'create'; view = 'create';
  if (!listening) { document.addEventListener('click', onClick); document.addEventListener('submit', onSubmit); document.addEventListener('input', onInput); document.addEventListener('change', onChange); listening = true; }
  if (starting || !timer) { void load(); timer = setInterval(() => { if (!document.hidden && active()) void load(); }, 5000); }
 }
 function prepare(input) {
  ensureCompany(); if (locked()) return false;
  format = FORMATS[input.format] ? input.format : 'feed'; routeFormat = format; prompt = String(input.prompt || '').slice(0, 6000); pending = null; submitError = '';
  attachments = files().filter(a => (input.attachments || []).includes(a.id)).slice(0, 6); return true;
 }
 function dispose() { mount(''); if (listening) { document.removeEventListener('click', onClick); document.removeEventListener('submit', onSubmit); document.removeEventListener('input', onInput); document.removeEventListener('change', onChange); listening = false; } }
 return {page, mount, dispose, prepare};
}
