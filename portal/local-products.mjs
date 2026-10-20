import {randomUUID} from 'node:crypto';

const ORG = 'helpu-local-directory';
export const PRODUCT_CATEGORIES = ['Eletrônicos', 'Casa e móveis', 'Moda', 'Esportes', 'Ferramentas', 'Infantil', 'Veículos', 'Outros'];
const fail = (message, status = 400) => { throw Object.assign(new Error(message), {status}); };
const decode = r => r ? {...JSON.parse(r.data), id: r.id, version: r.version} : null;
function text(v, max) {
  if (typeof v !== 'string' || v.trim().length > max) fail('Confira os campos do anúncio.');
  return v.trim();
}

export function createLocalProducts({db, customer, operator, now = Date.now}) {
  const read = id => db.prepare("SELECT * FROM records WHERE org_id=? AND kind='local_product' AND id=?").get(ORG, id).then(decode);
  const seller = id => db.prepare("SELECT * FROM records WHERE org_id=? AND kind='local_business' AND id=?").get(ORG, id).then(decode);
  const allowed = user => { if (!operator(user)) fail('Acesso restrito à equipe Helpu.', 403); };
  async function save(value, old) {
    const data = {...value, updatedAt: now()}; delete data.id; delete data.version;
    if (old) {
      const result = await db.prepare('UPDATE records SET data=?,version=version+1,updated_at=? WHERE org_id=? AND id=? AND version=? RETURNING id').get(JSON.stringify(data), now(), ORG, old.id, old.version);
      if (!result) fail('O anúncio mudou. Recarregue antes de tentar novamente.', 409);
    } else {
      await db.prepare("INSERT INTO records(id,org_id,kind,data,created_at,updated_at) VALUES(?,?,'local_product',?,?,?)").run(value.id, ORG, JSON.stringify(data), now(), now());
    }
    return read(value.id);
  }
  function version(old, d) { if (old.version !== d.version) fail('O anúncio mudou. Recarregue antes de tentar novamente.', 409); }
  async function own(token, id) {
    const a = await customer.authenticate(token), p = await read(id);
    if (!p || p.businessId !== a.businessId) fail('Anúncio não encontrado.', 404);
    return p;
  }
  async function listing(token) {
    const a = await customer.authenticate(token);
    return {products: (await db.prepare("SELECT * FROM records WHERE org_id=? AND kind='local_product' AND json_extract(data,'$.businessId')=? ORDER BY created_at DESC").all(ORG, a.businessId)).map(decode)};
  }
  async function edit(token, d) {
    const a = await customer.authenticate(token), old = d.id ? await own(token, d.id) : null;
    if (old) { version(old, d); if (old.soldAt) fail('Um item vendido não pode ser editado. Crie outro anúncio.', 409); }
    const title = text(d.title, 120), description = text(d.description, 3000), city = text(d.city, 100);
    let phone = text(d.phone, 30).replace(/\D/g, ''); if (phone.length === 10 || phone.length === 11) phone = '55' + phone;
    if (title.length < 3 || description.length < 20 || city.length < 2 || !/^55\d{10,11}$/.test(phone)) fail('Informe título, descrição de pelo menos 20 caracteres, cidade e WhatsApp com DDD.');
    if (!PRODUCT_CATEGORIES.includes(d.category) || !['Novo', 'Usado'].includes(d.condition)) fail('Escolha a categoria e a condição do produto.');
    if (!Number.isSafeInteger(d.priceCents) || d.priceCents < 1 || d.priceCents > 100000000) fail('Informe um preço entre R$ 0,01 e R$ 1.000.000.');
    if (!Array.isArray(d.photos) || d.photos.length > 6 || new Set(d.photos).size !== d.photos.length) fail('Use até seis fotos diferentes.');
    for (const id of d.photos) await customer.photo(token, id);
    if (!old) { const count = await db.prepare("SELECT COUNT(*) AS count FROM records WHERE org_id=? AND kind='local_product' AND json_extract(data,'$.businessId')=?").get(ORG, a.businessId); if (Number(count.count) >= 200) fail('Limite de 200 anúncios por conta.', 409); }
    const state = d.submit === true ? 'Em análise' : 'Rascunho';
    return save({...old, id: old?.id || 'local-product:' + randomUUID(), businessId: a.businessId,
      title, description, city, phone, category: d.category, condition: d.condition, priceCents: d.priceCents,
      photos: d.photos, state, approved: false, moderationReason: old?.moderationReason || '', createdAt: old?.createdAt || now(),
      history: [...(old?.history || []), {at: now(), actor: a.id, state}].slice(-100)}, old);
  }
  async function transition(token, d) {
    const p = await own(token, d.id); version(p, d);
    if (!['Pausado', 'Vendido', 'Em análise'].includes(d.state)) fail('Situação inválida.');
    if (p.soldAt || (d.state === 'Vendido' && (!p.approved || !['Publicado', 'Pausado'].includes(p.state)))) fail('Esta mudança não está disponível para o anúncio.', 409);
    return save({...p, state: d.state, approved: d.state === 'Em análise' ? false : p.approved, soldAt: d.state === 'Vendido' ? now() : null,
      history: [...(p.history || []), {at: now(), actor: p.businessId, state: d.state}].slice(-100)}, p);
  }
  async function admin(user, d) {
    allowed(user);
    if (!d) {
      const rows = await db.prepare("SELECT * FROM records WHERE org_id=? AND kind='local_product' ORDER BY updated_at DESC").all(ORG);
      const products = [];
      for (const row of rows) { const p = decode(row), b = await seller(p.businessId); products.push({...p, sellerName:b?.name || 'Anunciante indisponível', sellerType:b?.sellerType || 'Loja'}); }
      return {products};
    }
    const p = await read(d.id); if (!p) fail('Anúncio não encontrado.', 404); version(p, d);
    if (!['Publicado', 'Rejeitado', 'Pausado'].includes(d.state) || (d.state === 'Publicado' && (p.soldAt || p.state !== 'Em análise'))) fail('Mudança de moderação inválida.', 409);
    const b = await seller(p.businessId); if (!b || b.state === 'Inativo') fail('O anunciante está inativo.', 409);
    const reason = text(d.reason || '', 1000);
    const moderationReason = d.state === 'Publicado' ? '' : reason;
    if (d.state !== 'Publicado' && moderationReason.length < 3) fail('Informe o motivo para orientar o anunciante.');
    return save({...p, state: d.state, approved: d.state === 'Publicado', moderationReason, history: [...(p.history || []), {at: now(), actor: String(user.id), state: d.state, reason}].slice(-100)}, p);
  }
  async function visible(id) {
    const p = await read(id), b = p && await seller(p.businessId);
    if (!p || !p.approved || !['Publicado', 'Vendido'].includes(p.state) || !b || b.state === 'Inativo') fail('Anúncio indisponível.', 404);
    return {p, b};
  }
  async function publicList() {
    const rows = await db.prepare("SELECT * FROM records WHERE org_id=? AND kind='local_product' AND json_extract(data,'$.state') IN ('Publicado','Vendido') ORDER BY created_at DESC").all(ORG);
    const products = [];
    for (const row of rows) {
      const p = decode(row), b = await seller(p.businessId); if (!p.approved || !b || b.state === 'Inativo') continue;
      products.push({id: p.id, title: p.title, description: p.description, city: p.city, category: p.category,
        condition: p.condition, priceCents: p.priceCents, state: p.state, createdAt: p.createdAt,
        sellerName: b.name, sellerType: b.sellerType || 'Loja', phone: p.state === 'Publicado' ? p.phone : null,
        photos: p.photos.map(id => '/api/local/product-photo?product=' + encodeURIComponent(p.id) + '&id=' + encodeURIComponent(id))});
    }
    return {products};
  }
  async function photo(productId, assetId, user) {
    const p = operator(user) ? await read(productId) : (await visible(productId)).p;
    if (!p || !p.photos.includes(assetId)) fail('Foto não encontrada.', 404);
    const a = await db.prepare('SELECT * FROM assets WHERE id=?').get(assetId);
    if (!a || !['image/jpeg', 'image/png', 'image/webp'].includes(a.mime)) fail('Foto não encontrada.', 404);
    return a;
  }
  return {listing, edit, transition, admin, publicList, photo};
}
