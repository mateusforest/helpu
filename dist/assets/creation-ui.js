const FORMATS = {feed: ['Feed', 'Imagem · vertical 4:5'], story: ['Story', 'Imagem · vertical 9:16'], carousel: ['Carrossel', 'Imagens · vertical 4:5'], reels: ['Vídeo', 'Vertical 9:16 ou horizontal 16:9']};
const ACTIVE = new Set(['queued', 'working']);
const STATUS = {queued: 'Na fila', working: 'Criando seu material', complete: 'Pronto para baixar', blocked: 'Precisa de um ajuste', failed: 'Não foi possível concluir', uncertain: 'Aguardando confirmação'};
const MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'video/mp4','audio/mpeg','audio/wav','audio/ogg']);
const LIMIT = 25 * 1024 * 1024;

export function createCreationUI({api, endpoint, getState, esc, toast, uploadFile, refresh}) {
 let company = '', epoch = 0, view = '', routeFormat = '', timer = null, listening = false, loading = false, revision = 0;
 let creations = [], loadError = '', submitError = '', prompt = '', format = 'feed', slideCount = 3, duration = 15, attachments = [], sending = false, uploading = false, pending = null;
 let styles=[],presets=[],recipes=[],techniques=[],styleId='',videoOptions={aspectRatio:'9:16',quality:'high',preset:'clean'},referenceOnlyIds=[],reviewRequests=new Map();
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
  styles=[];presets=[];recipes=[];techniques=[];styleId='';videoOptions={aspectRatio:'9:16',quality:'high',preset:'clean'};referenceOnlyIds=[];reviewRequests.clear();
  company = next; epoch++; routeFormat = ''; creations = []; loadError = ''; submitError = ''; prompt = ''; format = 'feed'; slideCount = 3; duration = 15; attachments = []; sending = false; uploading = false; loading = false; pending = null;
 }
 function attachmentMarkup() {
  const available = files().filter(asset => !attachments.some(a => a.id === asset.id));
  return `<div class="creation-attachments"><div class="creation-attachment-actions"><label class="p-button secondary creation-upload" for="creation-file">${uploading ? 'Enviando arquivo…' : 'Anexar referência'}<input id="creation-file" type="file" accept="image/png,image/jpeg,image/webp${format === 'reels' ? ',video/mp4,audio/mpeg,audio/wav,audio/ogg' : ''}" multiple ${locked() ? 'disabled' : ''}></label>${available.length ? `<label class="creation-library-label"><span class="sr-only">Escolher arquivo da biblioteca</span><select id="creation-library" ${locked() ? 'disabled' : ''}><option value="">Usar arquivo da biblioteca</option>${available.map(a => `<option value="${esc(a.id)}">${esc(a.name)}</option>`).join('')}</select></label>` : ''}</div>${attachments.length ? `<ul class="creation-files">${attachments.map(a => `<li><span>${esc(a.name)}</span>${!a.mime?.startsWith('audio/')?`<label><input type="checkbox" data-reference-only="${esc(a.id)}" ${referenceOnlyIds.includes(a.id)?'checked':''}> Apenas referência de estilo</label>`:''}<button type="button" data-creation-action="remove-file" data-id="${esc(a.id)}" aria-label="Remover ${esc(a.name)}" ${locked() ? 'disabled' : ''}>×</button></li>`).join('')}</ul>` : ''}<p class="micro-copy">Fotos e logo${format === 'reels' ? ', gravações MP4 e música MP3/WAV/OGG' : ''} · até ${format === 'reels' ? 8 : 6} referências${format === 'reels' ? ' e 25 MB por vídeo; até 30 MB no total' : ''}. Imagens: até 20 MB no total.</p></div>`;
 }
 function select(id,label,values,value){return `<label class="p-field"><span>${label}</span><select id="${id}" ${locked()?'disabled':''}>${values.map(([k,v])=>`<option value="${esc(k)}" ${String(value)===String(k)?'selected':''}>${esc(v)}</option>`).join('')}</select></label>`;}
 function videoMarkup(){
  return `<div class="creation-options">${select('creation-aspect','Formato',[['9:16','Vertical · 9:16'],['16:9','Horizontal · 16:9']],videoOptions.aspectRatio)}${select('creation-quality','Exportação',[['high','Alta qualidade · Full HD'],['standard','Arquivo menor · Full HD']],videoOptions.quality)}${select('creation-style','Estilo',[...presets.map(p=>['preset:'+p.id,p.name]),...styles.map(p=>['saved:'+p.id,'Meu estilo: '+p.name])],styleId?'saved:'+styleId:'preset:'+videoOptions.preset)}</div><details class="creation-advanced"><summary>Movimento, texto e áudio</summary><div class="creation-options">${select('creation-motion','Movimento',[['none','Sem movimento'],['zoom-in','Aproximar suavemente'],['zoom-out','Afastar suavemente'],['pan','Deslocamento lateral']],videoOptions.motion||'zoom-in')}${select('creation-transition','Transição',[['cut','Corte direto'],['fade','Dissolução suave'],['smoothleft','Deslocamento suave'],['wipeleft','Revelação lateral'],['circleopen','Revelação circular']],videoOptions.transition||'fade')}${select('creation-font','Fonte',[['sans','Sans natural'],['bold','Sans de impacto'],['serif','Editorial serifada'],['serif-italic','Editorial itálica'],['serif-bold','Editorial forte'],['condensed','Condensada'],['mono','Monoespaçada']],videoOptions.font||'sans')}${select('creation-text-animation','Animação do texto',[['fade','Suave'],['rise','Subida'],['pop','Escala'],['words','Palavras em sequência']],videoOptions.textAnimation||'fade')}${select('creation-highlight','Destaque de cor',[['last','Última palavra'],['none','Sem destaque automático']],videoOptions.highlight||'last')}${select('creation-text-box','Fundo do texto',[['auto','Faixa de contraste'],['outline','Contorno discreto'],['none','Sem fundo']],videoOptions.textBox||'auto')}${select('creation-fit','Enquadramento',[['cover','Preencher o quadro'],['contain','Mostrar imagem completa'],['blur','Imagem completa com fundo desfocado']],videoOptions.fit||'cover')}${select('creation-sfx','Efeitos sonoros',[['none','Sem efeitos'],['subtle','Whoosh discreto']],videoOptions.soundEffects||'none')}<label class="p-field">Tamanho do texto<input id="creation-font-size" type="number" min="36" max="96" value="${Number(videoOptions.fontSize)||60}"></label><label class="p-field">Cor de destaque<input id="creation-accent" type="color" value="${esc(videoOptions.accent||'#16804a')}"></label><label class="p-field">Volume da música<input id="creation-music-volume" type="range" min="0" max="1" step="0.05" value="${videoOptions.musicVolume??0.15}"></label><label><input id="creation-source-audio" type="checkbox" ${videoOptions.sourceAudio!==false?'checked':''}> Manter áudio das gravações</label></div><label class="p-field"><span>Legenda sincronizada (SRT, opcional)</span><textarea id="creation-subtitles" maxlength="24000" placeholder="1&#10;00:00:00,000 --> 00:00:02,000&#10;Texto falado">${esc(videoOptions.subtitlesSrt||'')}</textarea></label><p class="micro-copy">Cole a legenda com os tempos da fala. Ainda não há transcrição automática; títulos animados não são legendas sincronizadas.</p><p class="micro-copy">Anexe uma música para usá-la como trilha. Sem anexo, o Astra usa apenas o áudio das gravações. Referência de estilo orienta a composição e não aparece no vídeo.</p></details><details class="creation-advanced"><summary>Biblioteca de modelos de vídeo</summary><p>Receitas adaptáveis à sua marca. As ilustrações indicam a direção visual; a prévia final será gerada com seus materiais.</p><div class="video-recipe-grid">${recipes.map(r=>`<article class="video-recipe-card"><div class="video-recipe-swatch"><small>HELPU · ${esc(r.name)}</small><strong>${esc(r.name)}</strong><span>Sua marca. Seus materiais.</span></div><h4>${esc(r.name)}</h4><p>${esc(r.description)}</p><p class="micro-copy">${esc(r.direction)}</p><button type="button" class="p-button secondary" data-creation-action="recipe" data-id="${esc(r.id)}" ${locked()?'disabled':''}>Usar este modelo</button></article>`).join('')}</div><p class="micro-copy">Mosaicos, recorte de pessoas, tracking e colagens 3D ainda não estão disponíveis. O estilo salvo guarda a receita, sem copiar textos, música ou arquivos do cliente anterior.</p></details><details class="creation-advanced"><summary>Catálogo de recursos do Astra</summary>${techniques.map(t=>`<p><strong>${esc(t.name)}</strong> · ${t.status==='available'?'Disponível':'Em evolução'}<br>${esc(t.detail)}</p>`).join('')}</details>`;
 }
 function formMarkup() {
  const options = format === 'carousel' ? `<label class="p-field"><span>Quantidade de imagens</span><select id="creation-count" ${locked() ? 'disabled' : ''}>${Array.from({length: 8}, (_, i) => i + 3).map(n => `<option value="${n}" ${n === slideCount ? 'selected' : ''}>${n} imagens</option>`).join('')}</select></label>` : format === 'reels' ? `<label class="p-field"><span>Duração</span><select id="creation-duration" ${locked() ? 'disabled' : ''}><option value="15" ${duration === 15 ? 'selected' : ''}>15 segundos</option><option value="30" ${duration === 30 ? 'selected' : ''}>30 segundos</option></select></label>` : '';
  return `<form id="creation-form" class="creation-composer"><fieldset class="creation-format"><legend>O que vamos criar?</legend><div class="creation-format-options">${Object.entries(FORMATS).map(([id, [name, description]]) => `<button type="button" data-creation-action="format" data-format="${id}" aria-pressed="${id === format}" class="creation-format-button ${id === format ? 'selected' : ''}" ${locked() ? 'disabled' : ''}><strong>${name}</strong><span>${description}</span></button>`).join('')}</div></fieldset>${options ? `<div class="creation-options">${options}</div>` : ''}${format==='reels'?videoMarkup():''}<label class="p-field creation-prompt-label" for="creation-prompt"><span>Conte o que você precisa</span><textarea id="creation-prompt" name="prompt" rows="5" maxlength="6000" required ${locked() ? 'disabled' : ''} placeholder="Ex.: apresente nosso serviço com um visual elegante e uma chamada para conversar pelo WhatsApp. Use as cores da marca.">${esc(prompt)}</textarea></label><p class="micro-copy">O Astra usa as informações da sua marca. Inclua textos obrigatórios e detalhes da oferta.</p><div id="creation-attachment-area">${attachmentMarkup()}</div><div id="creation-submit-error" class="creation-error" role="alert" ${submitError ? '' : 'hidden'}>${esc(submitError)}</div><div class="creation-submit-line"><span>O arquivo e a legenda aparecem abaixo.</span><button id="creation-submit" type="submit" class="p-button primary" ${locked() ? 'disabled' : ''}>${sending ? 'Enviando pedido…' : pending ? 'Conferir e reenviar pedido' : format === 'reels' ? 'Criar vídeo' : format === 'carousel' ? 'Criar carrossel' : 'Criar imagem'}</button></div></form>`;
 }
 function card(item) {
  const assets = Array.isArray(item.assets) ? item.assets.filter(a => a?.id && (a.mime?.startsWith('image/') || a.mime?.startsWith('video/'))) : [];
  const date = item.createdAt ? new Date(item.createdAt) : null;
  const media = assets.map((asset, i) => `<figure class="creation-media">${asset.mime.startsWith('video/') ? `<video controls playsinline preload="metadata" src="${esc(fileUrl(asset.id))}" aria-label="${esc(asset.name || 'Seu Reels')}"></video>` : `<img loading="lazy" src="${esc(fileUrl(asset.id))}" alt="${esc(asset.name || 'Imagem ' + (i + 1))}">`}<figcaption><span>${assets.length > 1 ? `${i + 1}. ` : ''}${esc(asset.name || 'Arquivo')}${asset.width && asset.height ? `<small>${Number(asset.width)} × ${Number(asset.height)}</small>` : ''}</span><a class="p-button secondary" href="${esc(fileUrl(asset.id))}" download="${esc(asset.name || 'helpu-criacao')}">${item.approvalRequired&&!item.approvedAt&&item.review!=='approved'?'Baixar prévia':'Baixar'}${assets.length > 1 ? ' ' + (i + 1) : ''}</a></figcaption></figure>`).join('');
  return `<article class="creation-result" data-creation-id="${esc(item.id)}"><div class="creation-result-heading"><div><span class="creation-result-format">${esc(FORMATS[item.format]?.[0] || 'Criação')}</span><h3>${esc(item.prompt || 'Pedido de criação')}</h3>${date && !Number.isNaN(date.getTime()) ? `<time datetime="${date.toISOString()}">${esc(date.toLocaleString('pt-BR', {dateStyle: 'short', timeStyle: 'short'}))}</time>` : ''}</div><span class="creation-status creation-status-${esc(item.status)}">${esc(STATUS[item.status] || 'Pedido recebido')}</span></div>${item.summary ? `<p class="creation-summary">${esc(item.summary)}</p>` : ''}${ACTIVE.has(item.status) ? '<p class="creation-progress" role="status"><span aria-hidden="true"></span>Você pode continuar usando a Helpu. O resultado será atualizado aqui.</p>' : ''}${item.error ? `<p class="creation-error" role="alert">${esc(item.error)}</p>` : ''}${media ? `<div class="creation-media-grid ${item.format === 'reels' ? 'creation-media-reels' : ''}">${media}</div>` : item.status === 'complete' ? '<p class="creation-error">O arquivo não está disponível nesta resposta. Atualize os resultados para conferir.</p>' : ''}${item.caption ? `<div class="creation-caption"><div><h4>Legenda</h4><button type="button" class="p-button ghost" data-creation-action="copy-caption" data-id="${esc(item.id)}">Copiar legenda</button></div><p>${esc(item.caption)}</p></div>` : ''}${item.status==='complete'?reviewMarkup(item):''}</article>`;
 }
 function reviewMarkup(item){return `<section class="creation-review"><p><strong>${item.review==='approved'?'Aprovado':item.review==='changes_requested'?'Ajustes solicitados':'Prévia para aprovação'}</strong>${item.revisionOf?' · Nova versão':''}</p><div class="creation-attachment-actions"><button class="p-button primary" data-creation-action="approve" data-id="${esc(item.id)}" ${locked()||item.review==='approved'||item.review==='changes_requested'?'disabled':''}>Aprovar prévia</button>${item.format==='reels'?`<button class="p-button secondary" data-creation-action="reuse" data-id="${esc(item.id)}">Criar no mesmo estilo</button>`:''}</div><label class="p-field"><span>O que deseja ajustar?</span><textarea data-review-text="${esc(item.id)}" maxlength="4000" placeholder="Ex.: reduza o texto e deixe a primeira cena mais lenta."></textarea></label><button class="p-button secondary" data-creation-action="revise" data-id="${esc(item.id)}" ${locked()||item.review==='changes_requested'?'disabled':''}>Gerar versão ajustada</button><p class="micro-copy">A versão anterior é preservada. No plano, uma rodada de ajustes está incluída; o arquivo final é liberado ao aprovar.</p>${item.review==='approved'?`<label class="p-field"><span>Nome para guardar este estilo</span><input data-style-name="${esc(item.id)}" maxlength="80" placeholder="Ex.: Tour elegante da minha empresa"></label><button class="p-button secondary" data-creation-action="save-style" data-id="${esc(item.id)}">Salvar como estilo para próximas criações</button>`:''}</section>`;}
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
 function paintResults() { if(document.activeElement?.matches?.('[data-review-text],[data-style-name]'))return; if (active() && $('#creation-results')) { $('#creation-results').innerHTML = resultsMarkup(); $('#creation-results').setAttribute('aria-busy', String(loading)); } }
 async function load() {
  ensureCompany(); if (!active() || loading) return;
  const t = stamp(), startedRevision = revision; loading = true; paintResults();
  try {
   const result = await api(t.base);
   if (!current(t) || revision !== startedRevision) return;
   creations = Array.isArray(result.creations) ? result.creations : []; loadError = '';
   const changed=JSON.stringify(styles)!==JSON.stringify(result.styles||[])||!presets.length;styles=result.styles||[];presets=result.capabilities?.videoPresets||[];recipes=result.capabilities?.videoRecipes||[];techniques=result.capabilities?.techniques||[];if(changed&&!locked())paintForm();
  } catch (error) { if (current(t)) loadError = error.message || 'Não foi possível atualizar as criações.'; }
  finally { if (current(t)) { loading = false; paintResults(); } }
 }
 function validateAttachment(asset) {
  if (!MIME.has(asset.mime) || (format !== 'reels' && !asset.mime.startsWith('image/'))) throw new Error(format === 'reels' ? 'Envie imagens, MP4 ou música MP3/WAV/OGG.' : 'Envie PNG, JPG ou WebP.');
  if (Number(asset.size) > LIMIT) throw new Error('Envie arquivos de até 25 MB.');
  if (attachments.some(a => a.id === asset.id)) return false;
  if (attachments.length >= (format === 'reels' ? 8 : 6)) throw new Error('Use até '+(format === 'reels' ? 8 : 6)+' referências por pedido.');
  if (format === 'reels' && attachments.reduce((sum, a) => sum + (Number(a.size) || 0), 0) + (Number(asset.size) || 0) > 30 * 1024 * 1024) throw new Error('As referências do Reels devem somar até 30 MB.');
  if (asset.mime.startsWith('image/') && attachments.filter(a => a.mime.startsWith('image/')).reduce((sum, a) => sum + (Number(a.size) || 0), 0) + (Number(asset.size) || 0) > 20 * 1024 * 1024) throw new Error('As imagens devem somar até 20 MB.');
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
  const body = {prompt, format, referenceOnlyIds:referenceOnlyIds.filter(id=>attachments.some(a=>a.id===id)), attachments: attachments.map(a => a.id), ...(format === 'carousel' ? {slideCount} : {}), ...(format === 'reels' ? {duration,videoOptions,styleId:styleId||undefined,referenceOnlyIds:referenceOnlyIds.filter(id=>attachments.some(a=>a.id===id))} : {})};
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
  if(action==='recipe'){const chosen=presets.find(p=>p.id===button.dataset.id);if(!chosen||locked())return;styleId='';videoOptions={...chosen,preset:chosen.id,aspectRatio:videoOptions.aspectRatio,quality:videoOptions.quality};delete videoOptions.accent;pending=null;paintForm();toast('Modelo aplicado. Descreva o pedido e anexe seus materiais.');return;}
   if(action==='reuse'){
    const item=creations.find(c=>c.id===button.dataset.id);if(!item)return;
    format='reels';styleId='';videoOptions={...item.videoOptions,musicAssetId:null,subtitlesSrt:''};duration=item.duration||15;attachments=[];referenceOnlyIds=[];pending=null;paintForm();$('#creation-prompt')?.focus();toast('Estilo aplicado. Envie os novos materiais e descreva o pedido.');return;
  }
  if(['approve','revise','save-style'].includes(action)){
    const id=button.dataset.id,t=stamp(),body={action};
    if(action==='revise'){body.adjustment=$(`[data-review-text="${id}"]`)?.value?.trim();if(!body.adjustment){toast('Descreva o ajuste.',true);return;}const signature=id+body.adjustment;if(!reviewRequests.has(signature))reviewRequests.set(signature,crypto.randomUUID());body.requestId=reviewRequests.get(signature);}
    if(action==='save-style'){body.name=$(`[data-style-name="${id}"]`)?.value?.trim();if(!body.name){toast('Dê um nome ao estilo.',true);return;}}
    sending=true;button.disabled=true;
    try{await api(t.base+'/'+encodeURIComponent(id),'POST',body);if(current(t)){toast(action==='approve'?'Prévia aprovada.':action==='save-style'?'Estilo salvo para a sua empresa.':'Nova versão solicitada.');revision++;sending=false;await load();}}
    catch(error){if(current(t))toast(error.message,true);}finally{if(current(t)){sending=false;button.disabled=false;}}return;
  }
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
  if(target?.dataset?.referenceOnly){const id=target.dataset.referenceOnly;referenceOnlyIds=target.checked?[...new Set([...referenceOnlyIds,id])]:referenceOnlyIds.filter(x=>x!==id);pending=null;return;}
  if(target?.id==='creation-style'){const split=target.value.indexOf(':'),kind=target.value.slice(0,split),id=target.value.slice(split+1);styleId=kind==='saved'?id:'';const chosen=kind==='saved'?styles.find(s=>s.id===id)?.options:presets.find(s=>s.id===id);videoOptions={...chosen,preset:kind==='saved'?chosen?.preset:id,aspectRatio:videoOptions.aspectRatio,quality:videoOptions.quality};pending=null;paintForm();return;}
  const videoFields={'creation-highlight':'highlight','creation-text-box':'textBox','creation-subtitles':'subtitlesSrt','creation-sfx':'soundEffects','creation-aspect':'aspectRatio','creation-quality':'quality','creation-motion':'motion','creation-transition':'transition','creation-font':'font','creation-text-animation':'textAnimation','creation-fit':'fit','creation-accent':'accent','creation-font-size':'fontSize','creation-music-volume':'musicVolume','creation-source-audio':'sourceAudio'};
  if(videoFields[target?.id]){const field=videoFields[target.id];videoOptions[field]=field==='sourceAudio'?target.checked:['fontSize','musicVolume'].includes(field)?Number(target.value):target.value;pending=null;return;}
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
