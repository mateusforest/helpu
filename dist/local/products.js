import {matchesProductSearch} from './product-search.js';
import {productErrors, photoError} from './product-validation.js';
const root = document.querySelector('#products');
const mode = document.body.dataset.mode;
const admin = mode === 'manage' && new URLSearchParams(location.search).get('admin') === '1';
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = v => (v / 100).toLocaleString('pt-BR', {style:'currency', currency:'BRL'});
const categories = ['Eletrônicos', 'Casa e móveis', 'Moda', 'Esportes', 'Ferramentas', 'Infantil', 'Veículos', 'Imóveis', 'Outros'];
let products = [], photos = [], editing = null, account = null;
let busy = false;
function lockEditor(scope) {
  busy = true;
  const controls = [...scope.querySelectorAll('button,input,select,textarea')].map(el => [el, el.disabled]);
  controls.forEach(([el]) => el.disabled = true);
  scope.setAttribute('aria-busy', 'true');
  return () => {
    controls.forEach(([el, disabled]) => el.disabled = disabled);
    scope.removeAttribute('aria-busy');
    busy = false;
  };
}
document.addEventListener('cancel', e => { if (busy && e.target.id === 'product-editor') e.preventDefault(); }, true);
async function api(path, body) {
  const response = await fetch(path, {method: body ? 'POST' : 'GET', headers: body ? {'Content-Type':'application/json'} : {}, body: body ? JSON.stringify(body) : undefined});
  const d = await response.json();
  if (!response.ok) throw Object.assign(Error(d.error || 'Não foi possível concluir.'), {status:response.status});
  return d;
}
const options = (values, value) => values.map(v => `<option ${v === value ? 'selected' : ''}>${esc(v)}</option>`).join('');
const privatePhoto = id => '/api/local/customer/photo?id=' + encodeURIComponent(id);
const adminPhoto = (p, id) => '/api/local/product-photo?product=' + encodeURIComponent(p.id) + '&id=' + encodeURIComponent(id);
function card(p, manage = false) {
  const src = manage ? p.photos[0] && (admin ? adminPhoto(p,p.photos[0]) : privatePhoto(p.photos[0])) : p.photos[0];
  return `<article class="product-card"><a href="${manage ? '#anuncio-' + encodeURIComponent(p.id) : '?id=' + encodeURIComponent(p.id)}" ${manage ? 'data-open="' + esc(p.id) + '"' : ''}>${src ? `<img src="${esc(src)}" alt="${esc(p.title)}" loading="lazy">` : '<div class="product-placeholder">Helpu Local</div>'}<div class="product-content"><span class="product-badge">${esc(manage ? p.state : p.state === 'Publicado' ? p.condition : p.state)}</span><h2>${esc(p.title)}</h2><strong class="product-price">${money(p.priceCents)}</strong><p>${esc(p.city)} · ${esc(p.category)}</p>${!manage || admin ? `<p>${esc(p.sellerName)} · ${esc(p.sellerType)}</p>` : ''}</div></a>${manage ? `<div class="product-actions"><button data-open="${esc(p.id)}">${admin ? 'Revisar anúncio' : 'Gerenciar'}</button></div>` : ''}</article>`;
}
function filters(manage) {
  return `<form id="filters" class="product-filters"><label>Buscar<input name="q" type="search" placeholder="O que você procura?"></label><label>Categoria<select name="category"><option value="">Todas</option>${options(categories)}</select></label><label>${manage ? 'Situação' : 'Condição'}<select name="state"><option value="">Todas</option>${options(manage ? ['Rascunho','Em análise','Publicado','Pausado','Vendido','Rejeitado'] : ['Novo','Usado'])}</select></label>${manage ? '' : '<label class="product-check"><input name="sold" type="checkbox"> Incluir vendidos</label>'}</form><p id="product-count" role="status"></p><div id="product-grid" class="product-grid"></div>`;
}
function draw() {
  const f = document.querySelector('#filters'); if (!f) return;
  const q = f.elements.q.value.toLocaleLowerCase('pt-BR'), category = f.elements.category.value, state = f.elements.state.value;
  const list = products.filter(p => matchesProductSearch(p,q) && (!category || p.category === category) && (!state || (mode === 'manage' ? p.state : p.condition) === state) && (mode === 'manage' || f.elements.sold.checked || p.state !== 'Vendido'));
  document.querySelector('#product-count').textContent = list.length + ' anúncio(s)';
  document.querySelector('#product-grid').innerHTML = list.length ? list.map(p => card(p, mode === 'manage')).join('') : '<div class="product-empty"><h2>Nenhum anúncio por aqui ainda.</h2><p>Experimente outros filtros ou anuncie o primeiro item.</p></div>';
}
function detail(p) {
  root.innerHTML = `<a href="/local/produtos.html">← Todos os produtos</a><article class="product-detail"><div class="product-gallery">${p.photos.length ? p.photos.map(src => `<img src="${esc(src)}" alt="${esc(p.title)}">`).join('') : '<div class="product-placeholder">Sem foto</div>'}</div><section><span class="product-badge">${esc(p.state === 'Vendido' ? 'Vendido' : p.condition)}</span><h1>${esc(p.title)}</h1><strong class="product-price">${money(p.priceCents)}</strong><p>${esc(p.category)} · ${esc(p.city)}</p><p class="product-description">${esc(p.description)}</p><p>Anunciado por <strong>${esc(p.sellerName)}</strong> · ${esc(p.sellerType)}</p>${p.phone ? `<a class="product-primary" href="https://wa.me/${encodeURIComponent(p.phone)}?text=${encodeURIComponent('Olá! Vi o anúncio '+p.title+' na Helpu Local e tenho interesse. O item ainda está disponível? Gostaria de mais informações.')}" target="_blank" rel="noopener">Conversar com anunciante ↗</a>` : '<p class="product-sold">Este item já foi vendido.</p>'}<p class="product-note">${p.category==='Imóveis'?'Consulte o anunciante sobre visitas, documentação e condições de negociação.':'Combine pagamento e entrega diretamente com o anunciante. Confira o produto antes de pagar.'}</p></section></article>`;
}
async function load() {
  if (mode === 'register') { register(); return; }
  if (mode === 'manage') {
    if (!admin) account = await api('/api/local/customer/me');
    products = (await api(admin ? '/api/portal/local-products' : '/api/local/customer/products')).products;
    root.innerHTML = `<p class="product-eyebrow">${admin ? 'ADMINISTRAÇÃO' : 'PORTAL DO ANUNCIANTE'}</p><h1>${admin ? 'Moderação de produtos' : 'Meus anúncios'}</h1><p>${admin ? 'Confira as informações e as fotos antes de aprovar. O motivo da recusa aparece para o anunciante.' : 'Venda itens novos ou usados. Após o envio, a equipe Helpu revisa seu anúncio.'}</p><div class="product-actions"><a href="${admin ? '/admin.html#/local' : '/local/cliente.html'}">← Voltar ao portal</a>${admin ? '' : '<button class="product-primary" id="new-product">Anunciar produto</button>'}</div>${filters(true)}<dialog id="product-editor"><button id="close-editor" class="product-close" aria-label="Fechar">×</button><div id="editor-content"></div></dialog>`;
    draw(); return;
  }
  const d = await api('/api/local/products'); products = d.products;
  const id = new URLSearchParams(location.search).get('id');
  if (id && !d.launch.locked) { const p = products.find(x => x.id === id); if (p) detail(p); else root.innerHTML = '<h1>Anúncio indisponível</h1><p>Este anúncio foi retirado do site.</p><a href="/local/produtos.html">Ver outros produtos</a>'; return; }
  root.innerHTML = `<section class="product-hero"><p class="product-eyebrow">DE PESSOA PARA PESSOA · VACARIA E REGIÃO</p><h1>Seu próximo achado<br>está aqui perto.</h1><p>Produtos novos e usados de lojas e pessoas da cidade.</p><a class="product-primary" href="/local/anuncios.html">Quero anunciar</a></section>${d.launch.locked ? '<section class="product-empty"><h2>Estamos preparando o marketplace.</h2><p>Você já pode cadastrar seus itens. Eles aparecerão após aprovação e abertura da Helpu Local.</p></section>' : filters(false)}`;
  draw();
}
function register() {
  root.innerHTML = `<section class="product-signup"><p class="product-eyebrow">VENDA NA SUA CIDADE</p><h1>Crie sua conta Helpu Local.</h1><p>Empresas criam sua página comercial e anunciam produtos. Pessoas físicas anunciam itens novos e usados. Quem já tem acesso à Helpu Local pode <a href="/local/cliente.html">entrar no portal</a>.</p><form id="seller-register"><label>Tipo de anunciante<select name="sellerType"><option value="Loja">Empresa ou loja</option><option value="Pessoa física" ${new URLSearchParams(location.search).get('tipo')==='pessoa'?'selected':''}>Pessoa física</option></select></label><label>Seu nome público ou nome da empresa<input name="name" required minlength="2" maxlength="150" autocomplete="name"></label><label>E-mail<input name="email" type="email" required maxlength="254" autocomplete="email"></label><label>WhatsApp com DDD<input name="phone" type="tel" required maxlength="30" autocomplete="tel"></label><label>Senha<input name="password" type="password" required minlength="10" maxlength="128" autocomplete="new-password"></label><label>Repita a senha<input name="confirm" type="password" required minlength="10" maxlength="128" autocomplete="new-password"></label><p>Ao criar a conta, você já entra no seu portal. Páginas e produtos só aparecem após aprovação da Helpu; alterações precisam de nova análise. O e-mail de acesso permanece privado. <a href="/privacidade.html">Política de privacidade</a>.</p><p role="alert"></p><button class="product-primary">Criar conta</button></form></section>`;
}
function editor(p) {
  editing = p || null; photos = [...(p?.photos || [])];
  const host = document.querySelector('#editor-content');
  if (admin) {
    host.innerHTML = `<h2>${esc(p.title)}</h2><p>${money(p.priceCents)} · ${esc(p.condition)} · ${esc(p.category)} · ${esc(p.city)}</p><p class="product-description">${esc(p.description)}</p><p>Anunciante: ${esc(p.sellerName)} · ${esc(p.sellerType)}</p><p>Contato: +${esc(p.phone)}</p><p>Situação: ${esc(p.state)}</p><div class="product-gallery">${p.photos.map(id => `<img src="${esc(adminPhoto(p,id))}" alt="Foto do produto">`).join('')}</div>${`<form id="moderate"><label>Motivo / orientação<textarea name="reason" maxlength="1000">${esc(p.moderationReason)}</textarea></label><p role="alert"></p><div class="product-actions">${p.state === 'Em análise' ? '<button class="product-primary" value="Publicado">Aprovar publicação</button>' : ''}<button value="Rejeitado">Recusar</button><button value="Pausado">Retirar do site</button></div></form>`}`;
  } else if (p?.soldAt) {
    host.innerHTML = `<h2>${esc(p.title)}</h2><p>Vendido · ${money(p.priceCents)}</p><p>A venda está registrada. Para vender outro item, crie um novo anúncio.</p>`;
  } else {
    host.innerHTML = `<h2>${p ? 'Editar anúncio' : 'O que você quer vender?'}</h2>${p?.moderationReason ? `<p class="product-warning">Orientação da equipe: ${esc(p.moderationReason)}</p>` : ''}<form id="product-form" novalidate><label>Título<input name="title" required minlength="3" maxlength="120" value="${esc(p?.title)}"></label><div class="product-fields"><label>Categoria<select name="category">${options(categories,p?.category)}</select></label><label>Condição<select name="condition">${options(['Usado','Novo'],p?.condition)}</select></label><label>Preço (R$)<input name="price" inputmode="decimal" type="number" required min="0.01" max="1000000" step="0.01" value="${p ? p.priceCents / 100 : ''}"></label><label>Cidade / região<input name="city" required minlength="2" maxlength="100" value="${esc(p?.city || 'Vacaria, RS')}"></label></div><label>Descrição<textarea name="description" required minlength="20" maxlength="3000" rows="4">${esc(p?.description)}</textarea></label><label>WhatsApp público<input name="phone" type="tel" required maxlength="30" value="${esc(p?.phone || account?.business.publicPhone)}"></label><label>Fotos · até 6 imagens, 3 MB cada<input id="product-photo" type="file" accept="image/png,image/jpeg,image/webp" multiple></label><p id="photo-message" role="status" tabindex="-1"></p><div id="product-photos" class="product-thumbnails"></div><p>Salvar alterações retira a versão anterior do site. Envie novamente para análise quando estiver pronto.</p><p role="alert"></p><div class="product-actions"><button value="draft">Salvar rascunho</button><button class="product-primary" value="submit">Enviar para análise</button></div></form>${p ? `<div class="product-actions"><button data-state="Pausado">Pausar anúncio</button>${p.approved && ['Publicado','Pausado'].includes(p.state) ? '<button data-state="Vendido">Marcar como vendido</button>' : ''}</div><p id="state-message" role="alert"></p>` : ''}`;
    host.querySelectorAll('#product-form [name]').forEach(field => { const hint = document.createElement('span'); hint.id = 'error-' + field.name; hint.className = 'product-field-error'; field.setAttribute('aria-describedby', hint.id); field.after(hint); });
    drawPhotos();
  }
  document.querySelector('#product-editor').showModal();
}
function drawPhotos() {
  document.querySelector('#product-photos').innerHTML = photos.map((id,i) => `<div><img src="${esc(privatePhoto(id))}" alt="Foto ${i+1}"><button type="button" data-remove="${esc(id)}">Remover</button></div>`).join('');
}
document.addEventListener('input', e => { if (e.target.closest('#filters')) draw(); });
document.addEventListener('submit', async e => {
  const f = e.target; if (f.id === 'filters') {e.preventDefault(); return;}
  if (!['seller-register','product-form','moderate'].includes(f.id)) return;
  e.preventDefault(); if (busy) return;
  const b = e.submitter, error = f.querySelector('[role=alert]'); error.textContent = '';
  const d = Object.fromEntries(new FormData(f));
  const unlock = lockEditor(f.closest('dialog') || f);
  try {
    if (f.id === 'product-form') {
      const errors = productErrors(d);
      f.querySelectorAll('[name]').forEach(field => { field.setAttribute('aria-invalid', String(Boolean(errors[field.name]))); document.getElementById('error-' + field.name).textContent = errors[field.name] || ''; });
      if (Object.keys(errors).length) { unlock(); f.elements[Object.keys(errors)[0]].focus(); throw Error('Confira os campos destacados antes de salvar o anúncio.'); }
    }
    if (f.id === 'seller-register') {
      if (d.password !== d.confirm) throw Error('As senhas precisam ser iguais.');
      await api('/api/local/customer/register',d); location.href = '/local/cliente.html'; return;
    }
    if (f.id === 'moderate') await api('/api/portal/local-products',{id:editing.id,version:editing.version,state:b.value,reason:d.reason});
    else await api('/api/local/customer/products',{...d,id:editing?.id,version:editing?.version,priceCents:Math.round(Number(d.price)*100),photos,submit:b.value === 'submit'});
    document.querySelector('#product-editor').close(); await load();
  } catch (err) {error.textContent = err.message;} finally {unlock();}
});
document.addEventListener('click', async e => {
  if (busy && e.target.closest('#product-editor')) {e.preventDefault(); return;}
  const open = e.target.closest('[data-open]');
  if (open) {e.preventDefault();editor(products.find(p => p.id === open.dataset.open));}
  if (e.target.id === 'new-product') editor();
  if (e.target.id === 'close-editor') document.querySelector('#product-editor').close();
  if (e.target.dataset.remove) {photos = photos.filter(id => id !== e.target.dataset.remove);drawPhotos();}
  const state = e.target.dataset.state;
  if (state) {
    if (state === 'Vendido' && !confirm('Marcar este item como vendido? Essa ação encerra o anúncio e não pode ser desfeita.')) return;
    const unlock = lockEditor(document.querySelector('#product-editor'));
    try {await api('/api/local/customer/product-state',{id:editing.id,version:editing.version,state});document.querySelector('#product-editor').close();await load();}
    catch(err) {document.querySelector('#state-message').textContent = err.message;}
    finally {unlock();}
  }
});
document.addEventListener('change', async e => {
  if (e.target.id !== 'product-photo') return;
  if (busy) return;
  const input = e.target, f = input.closest('form'), error = f.querySelector('#photo-message');
  const unlock = lockEditor(f.closest('dialog')); error.textContent = 'Enviando fotos…';
  try {
    const files = [...input.files]; const validation = photoError(files, photos.length); if (validation) throw Error(validation);
    for (const file of files) {
      if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 3*1024*1024) throw Error('Use JPG, PNG ou WebP de até 3 MB.');
      const r = await fetch('/api/local/customer/photo',{method:'POST',headers:{'X-File-Name':encodeURIComponent(file.name),'Content-Type':file.type},body:file});
      const d = await r.json(); if (!r.ok) throw Error(d.error || 'Falha no envio.'); if (!f.isConnected) return; photos.push(d.id);
    }
    error.textContent = 'Fotos enviadas. Salve o anúncio para aplicar.';
  } catch(err) {error.textContent = err.message; error.focus();} finally {input.value = '';unlock();if(f.isConnected)drawPhotos();}
});
load().catch(e => {root.innerHTML = `<h1>${e.status === 401 ? 'Entre para continuar' : 'Não foi possível abrir esta área'}</h1><p role="alert">${esc(e.message)}</p>${admin ? '<a href="/entrar.html">Entrar na administração</a>' : '<div class="product-actions"><a class="product-primary" href="/local/cliente.html">Já tenho uma conta</a><a href="/local/cadastro.html">Criar conta para anunciar</a></div>'}`;});
