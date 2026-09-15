const ACTIVE_VIEWS = new Set(['browser', 'video']);
const KEY_OPTIONS = ['Tab', 'Enter', 'Backspace', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
const KEY_LABELS = {Tab: 'Próximo campo', Enter: 'Enter', Backspace: 'Apagar', Escape: 'Esc', ArrowUp: 'Seta acima', ArrowDown: 'Seta abaixo', ArrowLeft: 'Seta à esquerda', ArrowRight: 'Seta à direita'};
const EXPORT_STATES = {queued: 'Na fila', working: 'Gerando o MP4', complete: 'MP4 pronto', failed: 'A exportação não foi concluída'};
const newScene = () => ({duration: 5, text: '', background: '#ffffff', textColor: '#171717'});
const VIDEO_LIMITS = {scenes: 32, minimum: 0.2, maximum: 60, total: 120, text: 280, name: 100};
const color = (value, fallback) => /^#[a-f\d]{6}$/i.test(value || '') ? value : fallback;
const sceneDuration = scene => scene.sourceAssetId ? Number(scene.out) - Number(scene.in) : Number(scene.duration);

export function remotePoint(rect, imageWidth, imageHeight, clientX, clientY) {
 if (!rect.width || !rect.height || !imageWidth || !imageHeight) return null;
 return {x: Math.min(imageWidth - 1, Math.max(0, Math.floor((clientX - rect.left) * imageWidth / rect.width))), y: Math.min(imageHeight - 1, Math.max(0, Math.floor((clientY - rect.top) * imageHeight / rect.height)))};
}

export function createCloudToolsUI({api, endpoint, getState, esc, toast, refresh}) {
 let view = '', company = '', epoch = 0, timer = null, listening = false, busy = false, loading = false;
 let runtime = null, loadError = '', profiles = [], selectedChannel = '', humanOwned = false, frameBusy = false, frameWidth = 0, frameHeight = 0;
 let projects = [], project = null, draft = [], dirty = false, exportJob = null, exportKey = null, importedAssetId = '', pollBusy = false;
 const $ = selector => document.querySelector(selector);
 const button = (text, action, extra = '', primary = false) => `<button type="button" class="p-button ${primary ? 'primary' : 'secondary'}" data-cloud-action="${action}" ${extra}>${text}</button>`;
 const active = () => ACTIVE_VIEWS.has(view) && company === getState()?.company?.id;
 const ticket = () => ({epoch, company, view, base: endpoint('runtime/')});
 const current = t => active() && t.epoch === epoch && t.company === company && t.view === view;
 const ownUrl = id => '/api/portal/files/' + encodeURIComponent(id);
 const projectName = p => p?.name || 'Vídeo sem nome';
 function resetData() {
  runtime = null; loadError = ''; profiles = []; selectedChannel = ''; humanOwned = false; frameBusy = false; frameWidth = 0; frameHeight = 0;
  projects = []; project = null; draft = []; dirty = false; exportJob = null; exportKey = null; importedAssetId = ''; pollBusy = false; busy = false; loading = false;
 }
 function releaseOwned() {
  if (!humanOwned || !selectedChannel || !company) return;
  const url = '/api/portal/' + encodeURIComponent(company) + '/runtime/browser/' + encodeURIComponent(selectedChannel) + '/human';
  humanOwned = false;
  // Only release the ownership belonging to this client; never navigate or close a saved account here.
  void api(url, 'POST', {type: 'release'}).catch(() => {});
 }
 function ensureCompany() {
  const next = getState()?.company?.id || '';
  if (next !== company) {
   releaseOwned(); epoch++; company = next; resetData();
   const field = $('#cloud-private-input'); if (field) field.value = '';
   const img = $('#cloud-remote-frame'); if (img) { img.removeAttribute('src'); img.hidden = true; }
   const body = $('#cloud-tools-body'); if (body) body.innerHTML = '<p class="cloud-loading" role="status">Carregando as ferramentas desta empresa…</p>';
  }
 }
 function readiness(capability) {
  if (loadError) return `<div class="cloud-notice" role="alert"><p>${esc(loadError)}</p>${button('Tentar novamente', 'reload')}</div>`;
  if (!runtime) return '<p class="cloud-loading" role="status">Conferindo o serviço online…</p>';
  if (!runtime.configured) return '<div class="cloud-notice"><strong>Falta conectar o serviço online.</strong><p>A hospedagem do navegador e do vídeo precisa ser configurada pela administração da Helpu. Depois disso, você poderá usar as ferramentas aqui, com seu computador desligado entre os pedidos.</p><a class="p-button secondary" href="#/integrations">Ver conexões</a></div>';
  if (!runtime.available) return `<div class="cloud-notice" role="alert"><strong>O serviço online não respondeu.</strong><p>${esc(runtime.error || 'Tente novamente em alguns instantes.')}</p>${button('Conferir novamente', 'reload')}</div>`;
  if (runtime[capability] === false) return `<div class="cloud-notice"><strong>${capability === 'browser' ? 'Navegador' : 'Exportação de vídeo'} indisponível neste serviço.</strong><p>A administração precisa habilitar essa ferramenta na hospedagem.</p></div>`;
  return '';
 }
 function queueBlocked() {
  return runtime?.queueEnabled === false || (getState()?.worker?.local === false && runtime?.worker?.configured === false && getState()?.worker?.running !== true);
 }
 function queueNotice() {
  const worker = runtime?.worker;
  if (runtime?.queueEnabled === false || worker?.state === 'disabled') return '<div class="cloud-notice" role="status"><strong>A fila de produção está desativada.</strong><p>Você pode editar e salvar projetos. Para gerar o MP4, a administração precisa ativar o processamento online dos pedidos.</p></div>';
  if (worker?.configured === false && getState()?.worker?.running !== true) return `<div class="cloud-notice" role="status"><strong>O agendador online ainda precisa ser configurado.</strong><p>${queueBlocked() ? 'Os projetos podem ser editados e salvos. A geração do MP4 ficará disponível quando o processamento dos pedidos estiver conectado.' : 'Confira se há outro serviço ativo para processar os pedidos. Sem ele, as exportações ficam aguardando na fila.'}</p></div>`;
  if (worker?.state === 'failed') return '<div class="cloud-notice" role="status"><strong>O último processamento não respondeu.</strong><p>O pedido pode continuar na fila. A administração precisa conferir o serviço online antes de iniciar novas exportações.</p></div>';
  return '';
 }
 function validateScenes(scenes) {
  if (!Array.isArray(scenes) || !scenes.length || scenes.length > VIDEO_LIMITS.scenes) throw new Error('Use de uma a 32 cenas.');
  if (scenes.some(s => s.sourceAssetId && (!Number.isFinite(Number(s.in)) || !Number.isFinite(Number(s.out)) || Number(s.in) < 0 || Number(s.out) <= Number(s.in)))) throw new Error('Confira o início e o fim do corte. O fim precisa ser posterior ao início.');
  if (scenes.some(s => !Number.isFinite(sceneDuration(s)) || sceneDuration(s) < VIDEO_LIMITS.minimum - 0.000001 || sceneDuration(s) > VIDEO_LIMITS.maximum + 0.000001)) throw new Error('Use de 0,2 a 60 segundos por cena.');
  if (scenes.reduce((total, s) => total + sceneDuration(s), 0) > VIDEO_LIMITS.total + 0.000001) throw new Error('O vídeo pode ter até 120 segundos. Reduza a duração ou remova uma cena.');
  if (scenes.some(s => String(s.text || '').length > VIDEO_LIMITS.text)) throw new Error('Use até 280 caracteres no texto de cada cena.');
 }
 function heading(kicker, title, text, link = '') {
  return `<div class="page-heading"><div><p class="overline">${kicker}</p><h1>${title}</h1><p>${text}</p></div>${link}</div>`;
 }
 function browserContent() {
  const blocked = readiness('browser');
  if (blocked) return blocked;
  const selected = profiles.find(p => p.id === selectedChannel);
  return `<div class="cloud-session-grid">${profiles.map(p => `<article class="cloud-session-card"><div class="cloud-card-line"><h2>${esc(p.name || p.id)}</h2><span class="p-tag">${p.open ? 'Sessão aberta' : p.accountLabel ? 'Perfil salvo' : 'Sem sessão aberta'}</span></div><p>${esc(p.accountLabel || 'Entre na conta desta empresa pela tela online.')}</p>${button(p.open ? 'Ver e controlar' : 'Abrir para entrar', 'open-browser', `data-id="${esc(p.id)}" ${busy ? 'disabled' : ''}`, true)}${p.open ? button('Fechar navegador', 'close-browser', `data-id="${esc(p.id)}" ${busy ? 'disabled' : ''}`) : ''}</article>`).join('') || '<p>Nenhum canal disponível neste serviço.</p>'}</div>
  ${selected ? `<section class="cloud-remote-panel"><div class="cloud-card-line"><div><h2>${esc(selected.name || selected.id)}</h2><p id="cloud-control-state">${humanOwned ? 'Você está no controle. A automação fica pausada nesta sessão.' : 'Assuma o controle para visualizar e usar esta conta.'}</p></div>${button(humanOwned ? 'Devolver controle' : 'Assumir controle', humanOwned ? 'release-browser' : 'take-browser', busy ? 'disabled' : '')}</div>
  <div class="cloud-frame-wrap"><img id="cloud-remote-frame" alt="Tela do navegador online. Clique na tela para selecionar um campo ou botão." draggable="false" hidden><p id="cloud-frame-note" role="status">${humanOwned ? 'Carregando a tela…' : 'A tela fica oculta enquanto você não está no controle.'}</p></div>
  ${humanOwned ? `<div class="cloud-remote-input"><form id="cloud-remote-type" autocomplete="off"><label class="p-field"><span>Texto para o campo selecionado na tela</span><input id="cloud-private-input" type="password" autocomplete="new-password" spellcheck="false" autocapitalize="off" maxlength="4000" placeholder="Clique no campo acima e digite aqui" required></label><button type="submit" class="p-button primary">Enviar ao campo</button></form><p class="micro-copy">O texto é enviado apenas ao campo selecionado e apagado desta caixa. Senhas e códigos de acesso ficam ocultos aqui.</p><div class="cloud-keyboard"><label class="p-field"><span>Tecla</span><select id="cloud-remote-key">${KEY_OPTIONS.map(key => `<option value="${key}">${KEY_LABELS[key]}</option>`).join('')}</select></label>${button('Enviar tecla', 'remote-key')}${button('Rolar para cima', 'scroll-up')}${button('Rolar para baixo', 'scroll-down')}</div></div>
  <details class="cloud-confirm"><summary>Confirmar a conta aberta</summary><form id="cloud-confirm-account"><p>Após concluir o login, confira o perfil na tela e informe qual conta está aberta.</p><label class="p-field"><span>Nome ou @perfil da conta</span><input name="accountLabel" maxlength="120" required autocomplete="off" value="${esc(selected.accountLabel || '')}"></label><label class="checkline"><input type="checkbox" name="automationAllowed" ${selected.automationAllowed ? 'checked' : ''}><span>Permitir que a Helpu use esta sessão conforme as regras da minha empresa.</span></label><button type="submit" class="p-button secondary">Confirmar conta</button><p class="micro-copy">Confirmar a conta não publica conteúdo nem autoriza gastos com anúncios.</p></form></details>` : ''}</section>` : ''}
  <p class="cloud-footnote">Estas são sessões online separadas por empresa. As conexões oficiais e as regras de publicação continuam em <a href="#/integrations">Conexões</a> e <a href="#/settings">Autonomia</a>.</p>`;
 }
 function screens() {
  ensureCompany();
  return `<section id="cloud-tools-root" class="cloud-tools">${heading('CONTAS ONLINE', 'Suas contas dentro da Helpu.', 'Abra o navegador online para entrar e acompanhar a conta da sua empresa.', '<a class="p-button secondary" href="#/integrations">Conexões oficiais</a>')}<div id="cloud-tools-body">${browserContent()}</div></section>`;
 }
 function sceneFields(scene, index) {
  const timing = scene.sourceAssetId ? `<div class="cloud-scene-trim"><label class="p-field"><span>Início do corte em segundos</span><input type="number" min="0" step="0.1" data-scene-field="in" data-index="${index}" value="${Number(scene.in) || 0}"></label><label class="p-field"><span>Fim do corte em segundos</span><input type="number" min="0" step="0.1" data-scene-field="out" data-index="${index}" value="${Number(scene.out) || 0}"></label><p class="micro-copy">Duração do trecho: <output id="cloud-cut-duration-${index}">${Number.isFinite(sceneDuration(scene)) ? Math.round(sceneDuration(scene) * 1000) / 1000 : '—'}</output> segundos. O corte precisa estar dentro da gravação original.</p></div>` : '';
  return `<article class="cloud-scene" data-scene-index="${index}"><div class="cloud-card-line"><h3>Cena ${index + 1}</h3>${button('Remover', 'remove-scene', `data-index="${index}" ${draft.length < 2 || busy ? 'disabled' : ''}`)}</div><label class="p-field"><span>Texto na tela</span><textarea data-scene-field="text" data-index="${index}" rows="3" maxlength="280">${esc(scene.text)}</textarea></label>${timing}<div class="cloud-scene-settings">${scene.sourceAssetId ? '' : `<label class="p-field"><span>Duração em segundos</span><input type="number" min="0.2" max="60" step="0.1" data-scene-field="duration" data-index="${index}" value="${Number(scene.duration) || 5}"></label>`}<label class="p-field"><span>Cor de fundo</span><input type="color" data-scene-field="background" data-index="${index}" value="${color(scene.background, '#ffffff')}"></label><label class="p-field"><span>Cor do texto</span><input type="color" data-scene-field="textColor" data-index="${index}" value="${color(scene.textColor, '#171717')}"></label></div></article>`;
 }
 function exportContent() {
  if (!exportJob) return '';
  const progress = Math.min(100, Math.max(0, Number(exportJob.progress) || 0));
  return `<section class="cloud-export" aria-live="polite"><h3>${esc(EXPORT_STATES[exportJob.state] || 'Conferindo a exportação')}</h3>${['queued', 'working'].includes(exportJob.state) ? `<progress max="100" value="${progress}" aria-label="Progresso da exportação"></progress><p>Você pode sair desta tela. O serviço online continua a exportação.</p>` : ''}${exportJob.state === 'failed' ? `<p class="form-error">${esc(exportJob.error || 'Revise o projeto e tente exportar novamente.')}</p>` : ''}${exportJob.state === 'complete' && !importedAssetId ? `<p>Salve o arquivo na Biblioteca para assistir e baixar.</p>${button('Salvar na Biblioteca', 'import-video', busy ? 'disabled' : '', true)}` : ''}${importedAssetId ? `<video controls preload="metadata" src="${ownUrl(importedAssetId)}" aria-label="Vídeo exportado"></video><a class="p-button secondary" href="${ownUrl(importedAssetId)}" download>Baixar MP4</a><a class="p-button secondary" href="#/studio">Ver Biblioteca</a>` : ''}</section>`;
 }
 function videoContent() {
  const blocked = readiness('video');
  if (blocked) return blocked;
  const assets = (getState()?.assets || []).filter(a => a.mime?.startsWith('video/'));
  return `${queueNotice()}<div class="cloud-video-layout"><aside class="cloud-project-list"><h2>Seus projetos</h2>${button('Novo vídeo', 'new-project', busy ? 'disabled' : '', true)}${projects.map(p => `<button type="button" class="cloud-project-choice" data-cloud-action="select-project" data-id="${esc(p.id)}" ${project?.id === p.id ? 'aria-current="true"' : ''} ${busy ? 'disabled' : ''}>${esc(projectName(p))}</button>`).join('') || '<p>Crie seu primeiro projeto.</p>'}</aside><div class="cloud-video-editor">
  ${!project ? `<h2>Crie um vídeo com cenas.</h2><p>Combine textos, cores e duração. Se quiser, use um vídeo da Biblioteca como gravação de base.</p><form id="cloud-create-project"><label class="p-field"><span>Nome do projeto</span><input name="name" maxlength="100" required placeholder="Vídeo da minha empresa"></label><label class="p-field"><span>Vídeo de base</span><select name="sourceAssetId"><option value="">Criar somente com textos e cores</option>${assets.map(a => `<option value="${esc(a.id)}">${esc(a.name)}</option>`).join('')}</select></label><button type="submit" class="p-button primary" ${busy ? 'disabled' : ''}>Criar projeto</button></form><p class="micro-copy">Para usar uma gravação, envie o arquivo primeiro à <a href="#/studio">Biblioteca</a>.</p>` : `<div class="cloud-card-line"><div><h2>${esc(projectName(project))}</h2><p>Vídeo vertical · <span id="cloud-scene-total">${draft.reduce((n, s) => n + (Number(s.duration) || 0), 0)}</span> segundos${project.sourceAssetId ? ' · gravação de base vinculada' : ''}</p></div><span id="cloud-save-state" class="p-tag">${dirty ? 'Alterações não salvas' : 'Projeto salvo'}</span></div><div class="cloud-scenes">${draft.map(sceneFields).join('')}</div><div class="cloud-editor-actions">${button('Adicionar cena', 'add-scene', `${draft.length >= VIDEO_LIMITS.scenes || busy ? 'disabled' : ''}`)}${button('Salvar alterações', 'save-project', busy ? 'disabled' : '')}${button('Gerar MP4', 'export-video', `${busy || queueBlocked() || ['queued', 'working'].includes(exportJob?.state) ? 'disabled' : ''}`, true)}</div><p class="micro-copy">Até 32 cenas, com 0,2 a 60 segundos por cena e 120 segundos no total. Use até 280 caracteres por cena. A exportação usa a versão salva e não publica o arquivo.</p><div id="cloud-export-result">${exportContent()}</div>`}</div></div>`;
 }
 function videos() {
  ensureCompany();
  return `<section id="cloud-tools-root" class="cloud-tools">${heading('ASTRA VÍDEO', 'Seu vídeo ganha forma aqui.', 'Edite cenas e acompanhe a exportação na nuvem, sem depender do seu computador.')}<div id="cloud-tools-body">${videoContent()}</div></section>`;
 }
 function paint() {
  if (!active()) return;
  const body = $('#cloud-tools-body');
  if (!body) return;
  body.innerHTML = view === 'browser' ? browserContent() : videoContent();
  setControlState();
 }
 function setControlState() {
  if (!active()) return;
  document.querySelectorAll('#cloud-tools-root input, #cloud-tools-root select, #cloud-tools-root textarea, #cloud-tools-root button').forEach(el => {
   const action = el.dataset?.cloudAction;
   el.disabled = busy || (action === 'export-video' && (queueBlocked() || ['queued', 'working'].includes(exportJob?.state))) || (action === 'remove-scene' && draft.length < 2) || (action === 'add-scene' && draft.length >= VIDEO_LIMITS.scenes);
  });
 }
 async function load() {
  ensureCompany(); if (!active() || loading) return;
  const t = ticket(); loading = true; loadError = '';
  try {
   const status = await api(t.base + 'status');
   if (!current(t)) return; runtime = status;
   if (status.configured && status.available) {
    const result = await api(t.base + (view === 'browser' ? 'browser' : 'video/projects'));
    if (!current(t)) return;
    if (view === 'browser') profiles = result.profiles || []; else projects = result.projects || [];
   }
  } catch (error) { if (current(t)) loadError = error.message || 'Não foi possível carregar o serviço.'; }
  finally { if (current(t)) { loading = false; paint(); } }
 }
 async function frame() {
  if (!active() || view !== 'browser' || !humanOwned || !selectedChannel || frameBusy || document.hidden) return;
  const t = ticket(), channel = selectedChannel; frameBusy = true;
  try {
   const result = await api(t.base + 'browser/' + encodeURIComponent(channel) + '/frame');
   if (!current(t) || channel !== selectedChannel || !humanOwned) return;
   const img = $('#cloud-remote-frame'), note = $('#cloud-frame-note');
   if (!img) return;
   if (!Number.isInteger(result.width) || !Number.isInteger(result.height) || result.width <= 0 || result.height <= 0 || typeof result.image !== 'string' || result.image.length > 12 * 1024 * 1024 || !/^[A-Za-z0-9+/]+={0,2}$/.test(result.image)) throw new Error('A tela recebida não é válida.');
   frameWidth = result.width; frameHeight = result.height;
   img.src = 'data:image/jpeg;base64,' + result.image; img.hidden = false;
   if (note) note.hidden = true;
  } catch (error) {
   if (current(t) && channel === selectedChannel && humanOwned) { const note = $('#cloud-frame-note'); if (note) { note.textContent = error.message || 'Não foi possível atualizar a tela.'; note.hidden = false; } const img = $('#cloud-remote-frame'); if (img) { img.removeAttribute('src'); img.hidden = true; } }
  } finally { if (current(t)) frameBusy = false; }
 }
 async function pollExport() {
  if (!active() || view !== 'video' || document.hidden || pollBusy || !exportJob || !['queued', 'working'].includes(exportJob.state)) return;
  const t = ticket(), exportId = exportJob.id; pollBusy = true;
  try {
   const value = await api(t.base + 'video/exports/' + encodeURIComponent(exportId));
   if (!current(t) || exportId !== exportJob?.id) return;
   exportJob = value; if (value.state === 'failed') exportKey = null; const result = $('#cloud-export-result'); if (result) result.innerHTML = exportContent();
   const exportButton = $('[data-cloud-action="export-video"]'); if (exportButton) exportButton.disabled = busy || queueBlocked() || ['queued', 'working'].includes(value.state);
  } catch (error) { if (current(t)) toast(error.message || 'Não foi possível conferir a exportação.', true); }
  finally { if (current(t)) pollBusy = false; }
 }
 async function human(t, channel, data) { return api(t.base + 'browser/' + encodeURIComponent(channel) + '/human', 'POST', data); }
 async function withAction(run, genericError = '') {
  ensureCompany(); if (!active() || busy) return;
  const t = ticket(); busy = true; setControlState();
  try { await run(t); }
  catch (error) { if (current(t)) toast(genericError || error.message || 'Não foi possível concluir.', true); }
  finally { if (current(t)) { busy = false; setControlState(); } }
 }
 async function save(t) {
  if (!project) return;
  const id = project.id;
  const scenes = draft.map(s => ({...s, duration: sceneDuration(s), ...(s.sourceAssetId ? {in: Number(s.in), out: Number(s.out)} : {})}));
  validateScenes(scenes);
  const result = await api(t.base + 'video/projects/' + encodeURIComponent(id), 'PATCH', {expectedRevision: project.revision, scenes});
  if (!current(t) || id !== project?.id) return;
  project = result; draft = structuredClone(result.scenes || scenes); dirty = false; exportKey = null;
  projects = projects.map(p => p.id === id ? result : p);
 }
 async function click(event) {
  if (!active()) return;
  if (event.target.id === 'cloud-remote-frame' && humanOwned) {
   const point = remotePoint(event.target.getBoundingClientRect(), frameWidth, frameHeight, event.clientX, event.clientY);
   if (point) await withAction(async t => { await human(t, selectedChannel, {type: 'click', ...point}); if (current(t)) await frame(); });
   return;
  }
  const b = event.target.closest('[data-cloud-action]'); if (!b || !$('#cloud-tools-root')?.contains(b)) return;
  const action = b.dataset.cloudAction, id = b.dataset.id;
  if (busy) return;
  if (action === 'reload') { await load(); return; }
  await withAction(async t => {
   if (action === 'open-browser') {
    if (selectedChannel && selectedChannel !== id) { releaseOwned(); selectedChannel = ''; }
    await api(t.base + 'browser/' + encodeURIComponent(id) + '/open', 'POST', {});
    if (!current(t)) return;
    await human(t, id, {type: 'take'});
    if (!current(t)) { void human(t, id, {type: 'release'}).catch(() => {}); return; }
    selectedChannel = id; humanOwned = true; profiles = profiles.map(p => p.id === id ? {...p, open: true} : p); paint(); await frame();
   } else if (action === 'take-browser') {
    const channel = selectedChannel; await human(t, channel, {type: 'take'});
    if (!current(t)) { void human(t, channel, {type: 'release'}).catch(() => {}); return; }
    humanOwned = true; paint(); await frame();
   } else if (action === 'release-browser') {
    await human(t, selectedChannel, {type: 'release'});
    if (current(t)) { humanOwned = false; paint(); }
   } else if (action === 'close-browser') {
    await api(t.base + 'browser/' + encodeURIComponent(id) + '/close', 'POST', {});
    if (current(t)) { profiles = profiles.map(p => p.id === id ? {...p, open: false} : p); if (selectedChannel === id) { selectedChannel = ''; humanOwned = false; } paint(); }
   } else if (action === 'remote-key' && humanOwned) {
    const key = $('#cloud-remote-key')?.value; if (KEY_OPTIONS.includes(key)) await human(t, selectedChannel, {type: 'key', key});
    if (current(t)) await frame();
   } else if (['scroll-up', 'scroll-down'].includes(action) && humanOwned) {
    await human(t, selectedChannel, {type: 'scroll', dy: action === 'scroll-up' ? -500 : 500}); if (current(t)) await frame();
   } else if (action === 'new-project') {
    if (dirty) { toast('Salve suas alterações antes de abrir outro projeto.', true); return; }
    project = null; draft = []; exportJob = null; exportKey = null; importedAssetId = ''; paint();
   } else if (action === 'select-project') {
    if (dirty) { toast('Salve suas alterações antes de abrir outro projeto.', true); return; }
    const value = await api(t.base + 'video/projects/' + encodeURIComponent(id));
    if (current(t)) { project = value; draft = structuredClone(value.scenes || [newScene()]); dirty = false; exportJob = value.latestExport || null; exportKey = null; importedAssetId = value.latestExport?.assetId || ''; paint(); }
   } else if (action === 'add-scene' && draft.length < VIDEO_LIMITS.scenes) { draft.push(newScene()); dirty = true; paint();
   } else if (action === 'remove-scene' && draft.length > 1) { const index = Number(b.dataset.index); if (Number.isInteger(index) && index >= 0 && index < draft.length) { draft.splice(index, 1); dirty = true; paint(); }
   } else if (action === 'save-project') { await save(t); if (current(t)) { paint(); toast('Projeto salvo.'); }
   } else if (action === 'export-video') {
    if (queueBlocked()) throw new Error('O processamento online dos pedidos precisa ser ativado antes de gerar o MP4. Você pode salvar o projeto enquanto isso.');
    validateScenes(draft);
    if (dirty) await save(t); if (!current(t) || !project) return;
    exportKey ||= crypto.randomUUID();
    const result = await api(t.base + 'video/projects/' + encodeURIComponent(project.id) + '/exports', 'POST', {revision: project.revision, idempotencyKey: exportKey});
    if (current(t)) { exportJob = result; importedAssetId = ''; if (result.state === 'failed') exportKey = null; paint(); }
   } else if (action === 'import-video' && exportJob?.state === 'complete') {
    const result = await api(t.base + 'video/exports/' + encodeURIComponent(exportJob.id) + '/import', 'POST', {});
    if (current(t)) { importedAssetId = result.assetId; await refresh(false); if (current(t)) { paint(); toast('Vídeo salvo na Biblioteca.'); } }
   }
  });
 }
 function input(event) {
  if (!active() || view !== 'video' || busy) return;
  const field = event.target.dataset?.sceneField, index = Number(event.target.dataset?.index);
  if (!['text', 'duration', 'background', 'textColor', 'in', 'out'].includes(field) || !Number.isInteger(index) || !draft[index]) return;
  if (['in', 'out'].includes(field) && !draft[index].sourceAssetId) return;
  draft[index][field] = event.target.value; dirty = true;
  if (draft[index].sourceAssetId) { draft[index].duration = sceneDuration(draft[index]); const cut = $('#cloud-cut-duration-' + index); if (cut) cut.textContent = Number.isFinite(draft[index].duration) ? String(Math.round(draft[index].duration * 1000) / 1000) : '—'; }
  const status = $('#cloud-save-state'); if (status) status.textContent = 'Alterações não salvas';
  const total = $('#cloud-scene-total'); if (total) total.textContent = String(draft.reduce((n, s) => n + (Number(s.duration) || 0), 0));
 }
 async function submit(event) {
  if (!active()) return;
  const form = event.target;
  if (!['cloud-remote-type', 'cloud-confirm-account', 'cloud-create-project'].includes(form.id)) return;
  event.preventDefault();
  if (form.id === 'cloud-remote-type') {
   const field = $('#cloud-private-input');
   if (!humanOwned || busy || !field?.value) return;
   const text = field.value; field.value = '';
   // Neither persist nor echo the value. Errors from a remote provider may contain input text.
   await withAction(async t => { await human(t, selectedChannel, {type: 'type', text}); if (current(t)) await frame(); }, 'Não foi possível enviar ao campo. Confira a tela e tente novamente.');
   return;
  }
  await withAction(async t => {
   if (form.id === 'cloud-confirm-account' && humanOwned) {
    const accountLabel = form.elements.accountLabel.value.trim(), automationAllowed = form.elements.automationAllowed.checked;
    if (!accountLabel) throw new Error('Informe a conta que aparece na tela.');
    await api(t.base + 'browser/' + encodeURIComponent(selectedChannel) + '/confirm', 'POST', {accountLabel, automationAllowed});
    if (current(t)) { profiles = profiles.map(p => p.id === selectedChannel ? {...p, accountLabel, automationAllowed} : p); toast('Conta registrada. As regras de Autonomia continuam valendo.'); }
   } else if (form.id === 'cloud-create-project') {
    const name = form.elements.name.value.trim(), sourceAssetId = form.elements.sourceAssetId.value;
    if (!name) throw new Error('Dê um nome ao projeto.');
    if (name.length > VIDEO_LIMITS.name) throw new Error('Use até 100 caracteres no nome do projeto.');
    const value = await api(t.base + 'video/projects', 'POST', {name, scenes: [newScene()], ...(sourceAssetId ? {sourceAssetId} : {})});
    if (current(t)) { project = value; projects = [value, ...projects]; draft = structuredClone(value.scenes || [newScene()]); dirty = false; exportJob = null; exportKey = null; importedAssetId = ''; paint(); }
   }
  });
  if (active()) { const create = $('#cloud-create-project button[type="submit"]'); if (create) create.disabled = false; }
 }
 function listen() {
  if (listening) return; listening = true;
  document.addEventListener('click', click); document.addEventListener('input', input); document.addEventListener('submit', submit);
 }
 function mount(nextView) {
  if (!ACTIVE_VIEWS.has(nextView)) { dispose(); return; }
  ensureCompany();
  if (view && view !== nextView) { releaseOwned(); epoch++; selectedChannel = ''; frameBusy = false; loading = false; pollBusy = false; }
  view = nextView; listen();
  void load();
  if (!timer) timer = setInterval(() => { ensureCompany(); if (active()) { void frame(); void pollExport(); } }, 1000);
 }
 function dispose() {
  releaseOwned(); epoch++; view = ''; if (timer) clearInterval(timer); timer = null;
  if (listening) { document.removeEventListener('click', click); document.removeEventListener('input', input); document.removeEventListener('submit', submit); listening = false; }
  const field = $('#cloud-private-input'); if (field) field.value = '';
  const img = $('#cloud-remote-frame'); if (img) { img.removeAttribute('src'); img.hidden = true; }
  resetData();
 }
 return {screens, videos, mount, dispose};
}
