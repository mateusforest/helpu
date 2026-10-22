import test from 'node:test';
import {legacyBusiness} from './local-legacy-fixture.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHelpuServer} from '../server.mjs';

test('permissões do marketplace: isolamento bidirecional e moderação exclusiva', async t => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'helpu-product-permissions-'));
  const server = await createHelpuServer({dataDir,portalOptions:{startScheduler:false,operatorEnv:{HELPU_OPERATOR_USER_IDS:'1'},whatsappChatEnv:{},openaiEnv:{}}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const origin = `http://127.0.0.1:${server.address().port}`;
  async function request(url,data,cookie='') {
    const r=await fetch(origin+url,{method:data?'POST':'GET',headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie},body:data?JSON.stringify(data):undefined});
    return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};
  }
  async function ok(url,data,cookie,status=200) {const r=await request(url,data,cookie);assert.equal(r.status,status,JSON.stringify(r.data));return r;}
  const input={title:'Produto de permissões',description:'Produto fictício para verificar isolamento entre contas.',category:'Eletrônicos',condition:'Usado',priceCents:42000,city:'Vacaria, RS',phone:'54999998888',photos:[],submit:true};
  try {
    const admin=(await ok('/api/auth/signup',{name:'Administrador',email:'admin@permissions.test',password:'permissions-test-password'},'',201)).cookie;
    const ordinary=(await ok('/api/auth/signup',{name:'Cliente comum',email:'ordinary@permissions.test',password:'permissions-test-password'},'',201)).cookie;
    const sellers=[];
    for(const [name,sellerType] of [['loja','Loja'],['pessoa','Pessoa física']]) {
      const cookie=(await ok('/api/local/customer/register',{name,email:name+'@permissions.test',password:'permissions-test-password',phone:'54999998888',sellerType})).cookie;
      const business=(await ok('/api/local/customer/me',null,cookie)).data.business;
      const item=(await ok('/api/local/customer/products',{...input,title:'Produto de '+name},cookie)).data;
      sellers.push({name,cookie,business,item});
    }
    for(const attacker of sellers) {
      const owner=sellers.find(s=>s!==attacker);
      await t.test(`${attacker.name} não acessa nem modifica anúncios de ${owner.name}`,async()=>{
        const before=(await ok('/api/local/customer/products',null,owner.cookie)).data;
        const ownList=(await ok('/api/local/customer/products?businessId='+owner.business.id,null,attacker.cookie)).data.products;
        assert.deepEqual(ownList.map(p=>p.id),[attacker.item.id]);
        const body={...input,id:owner.item.id,version:owner.item.version,businessId:attacker.business.id,title:'Alteração indevida',approved:true,role:'admin',admin:true};
        assert.equal((await request('/api/local/customer/products',body,attacker.cookie)).status,404);
        for(const state of ['Pausado','Vendido','Em análise']) assert.equal((await request('/api/local/customer/product-state',{...body,state},attacker.cookie)).status,404);
        assert.deepEqual((await ok('/api/local/customer/products',null,owner.cookie)).data,before);
      });
      await t.test(`${attacker.name} não aprova ou recusa nem o próprio anúncio`,async()=>{
        for(const state of ['Publicado','Rejeitado']) {
          const body={id:attacker.item.id,version:attacker.item.version,state,reason:'Tentativa sem permissão',admin:true,role:'admin'};
          assert.equal((await request('/api/portal/local-products?admin=1',body,attacker.cookie)).status,401);
          assert.equal((await request('/api/local/customer/product-state',body,attacker.cookie)).status,400);
        }
        const before=attacker.item;
        const changed=(await ok('/api/local/customer/products',{...input,id:before.id,version:before.version,businessId:owner.business.id,state:'Publicado',approved:true,role:'admin',history:[]},attacker.cookie)).data;
        assert.equal(changed.businessId,attacker.business.id);assert.equal(changed.state,'Em análise');assert.equal(changed.approved,false);
        attacker.item=changed;
      });
    }
    await t.test('visitante e usuário comum do portal não podem moderar',async()=>{
      for(const [cookie,status] of [['',401],[ordinary,403],[ordinary+'; '+sellers[0].cookie,403]]) {
        assert.equal((await request('/api/portal/local-products',null,cookie)).status,status);
        for(const state of ['Publicado','Rejeitado']) assert.equal((await request('/api/portal/local-products',{id:sellers[0].item.id,version:sellers[0].item.version,state,reason:'Tentativa sem permissão'},cookie)).status,status);
      }
      for(const s of sellers) assert.equal((await ok('/api/local/customer/products',null,s.cookie)).data.products[0].state,'Em análise');
    });
    await t.test('somente operador autenticado aprova e recusa; tentativas alheias não alteram o registro',async()=>{
      for(const s of sellers) {
        const rejected=(await ok('/api/portal/local-products',{id:s.item.id,version:s.item.version,state:'Rejeitado',reason:'Revisar descrição de teste.'},admin)).data;
        const resubmitted=(await ok('/api/local/customer/products',{...input,id:rejected.id,version:rejected.version},s.cookie)).data;
        const published=(await ok('/api/portal/local-products',{id:resubmitted.id,version:resubmitted.version,state:'Publicado'},admin)).data;
        assert.equal(published.state,'Publicado');assert.equal(published.approved,true);
        const other=sellers.find(x=>x!==s);
        assert.equal((await request('/api/local/customer/products',{...input,id:published.id,version:published.version},other.cookie)).status,404);
        assert.equal((await ok('/api/local/customer/products',null,s.cookie)).data.products[0].version,published.version);
      }
    });
  } finally {
    await server.portal.shutdown();await new Promise(r=>server.close(r));fs.rmSync(dataDir,{recursive:true,force:true});
  }
});

test('marketplace: pessoas, lojas, moderação, fotos, privacidade e venda', async t => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'helpu-products-'));
  const server = await createHelpuServer({dataDir, portalOptions:{startScheduler:false, operatorEnv:{HELPU_OPERATOR_USER_IDS:'1'}, whatsappChatEnv:{}, openaiEnv:{}}});
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const request = (url, data, cookie = '', extra = {}) => fetch(origin + url, {method:data ? 'POST' : 'GET', headers:{Origin:origin, 'Content-Type':'application/json', Cookie:cookie, ...extra}, body:data ? JSON.stringify(data) : undefined});
  async function ok(url, data, cookie, status = 200) {const r = await request(url,data,cookie); const d = await r.json(); assert.equal(r.status,status,JSON.stringify(d)); return d;}
  const cookie = r => r.headers.get('set-cookie').split(';')[0];
  let admin, person, shop, p, image;
  const input = {title:'Notebook usado de teste', description:'Notebook em bom estado, anunciado apenas em ambiente de teste.', category:'Eletrônicos', condition:'Usado', priceCents:123456, city:'Vacaria, RS', phone:'54999998888', photos:[], submit:true};
  try {
    await t.test('novas páginas estão disponíveis', async () => {
      for (const name of ['produtos','anuncios','cadastro']) {const r = await request('/local/' + name + '.html');assert.equal(r.status,200);assert.match(await r.text(),/Helpu Local/);}
    });
    await t.test('cadastro independente de pessoa física e loja, login e sessão', async () => {
      admin = cookie(await request('/api/auth/signup',{name:'Operador',email:'admin@products.test',password:'products-test-password'}));
      for (const type of ['Pessoa física','Loja']) {
        const d = {name:type === 'Loja' ? 'Loja Teste' : 'Maria Teste',email:type === 'Loja' ? 'shop@products.test' : 'person@products.test',password:'products-test-password',phone:'54999998888',sellerType:type};
        const r = await request('/api/local/customer/register',d); assert.equal(r.status,200,await r.clone().text());
        const c = cookie(r); if (type === 'Loja') shop = c; else person = c;
        const me = await ok('/api/local/customer/me',null,c);assert.equal(me.business.sellerType,type);if(type==='Pessoa física')assert.equal(me.billing,null);else{assert.equal(me.business.productsOnly,false);assert.equal(me.billing.automaticCharge,false);}
      }
      assert.equal((await request('/api/local/customer/register',{name:'Duplicado',email:'person@products.test',password:'products-test-password',phone:'54999998888',sellerType:'Pessoa física'})).status,409);
      assert.equal((await request('/api/local/customer/login',{email:'person@products.test',password:'errada'})).status,401);
      assert.equal((await request('/api/local/customer/login',{email:'person@products.test',password:'products-test-password'})).status,200);
      assert.equal((await request('/api/local/customer/products')).status,401);
      assert.equal((await request('/api/local/customer/profile',{},person)).status,403);
      assert.equal((await request('/api/local/customer/assistant',{mode:'profile'},person)).status,403);
    });
    await t.test('envio de fotos, validação e isolamento entre anunciantes', async () => {
      const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
      const r = await fetch(origin+'/api/local/customer/photo',{method:'POST',headers:{Origin:origin,Cookie:person,'Content-Type':'image/png','X-File-Name':'produto.png'},body:bytes});
      assert.equal(r.status,201,await r.clone().text());image = (await r.json()).id;
      const oversized = await fetch(origin+'/api/local/customer/photo',{method:'POST',headers:{Origin:origin,Cookie:person,'Content-Type':'image/png','X-File-Name':'grande.png'},body:Buffer.alloc(3*1024*1024+1)});
      assert.equal(oversized.status,413);
      for (const invalid of [{title:''},{title:'   '},{city:''},{phone:''},{description:''},{priceCents:0},{priceCents:100000001},{priceCents:null}]) assert.equal((await request('/api/local/customer/products',{...input,...invalid},person)).status,400);
      assert.equal((await request('/api/local/customer/products',{...input,photos:[image]},shop)).status,404);
      for (const invalid of [{priceCents:-1},{priceCents:1.5},{condition:'Qualquer'},{category:'inválida'},{description:'curta'},{photos:Array(7).fill(image)}]) assert.equal((await request('/api/local/customer/products',{...input,...invalid},person)).status,400);
      p = await ok('/api/local/customer/products',{...input,photos:[image]},person);assert.equal(p.state,'Em análise');
      assert.equal((await request('/api/local/customer/products',{...input,id:p.id,version:p.version},shop)).status,404);
      assert.equal((await request('/api/local/customer/product-state',{id:p.id,version:p.version,state:'Vendido'},shop)).status,404);
      assert.equal((await request('/api/portal/local-products',null,person)).status,401);
      const outsider = cookie(await request('/api/auth/signup',{name:'Cliente comum',email:'other@products.test',password:'products-test-password'}));
      assert.equal((await request('/api/portal/local-products',null,outsider)).status,403);
      assert.equal((await request('/api/local/customer/products',input,person,{Origin:'https://elsewhere.invalid'})).status,403);
    });
    await t.test('catálogo aberto mantém anúncios e fotos privados até aprovação', async () => {
      assert.equal((await ok('/api/local/products')).products.length,0);
      assert.equal((await request('/api/local/product-photo?product='+encodeURIComponent(p.id)+'&id='+image)).status,404);
      await ok('/api/portal/local-launch',{version:0,open:false,plannedDate:'2026-10-10'},admin);
      assert.equal((await ok('/api/local/products')).products.length,0);
      assert.equal((await request('/api/local/product-photo?product='+encodeURIComponent(p.id)+'&id='+image)).status,404);
      p = await ok('/api/portal/local-products',{id:p.id,version:p.version,state:'Publicado'},admin);
      const d = (await ok('/api/local/products')).products[0];assert.equal(d.title,input.title);assert.equal(d.sellerType,'Pessoa física');assert.equal(d.phone,'5554999998888');
      for (const key of ['businessId','history','moderationReason','email','version']) assert.equal(d[key],undefined,key);
      assert.equal((await request(d.photos[0])).status,200);
      assert.equal((await request('/api/local/customer/products',{...input,id:p.id,version:p.version-1},person)).status,409);
    });
    await t.test('edição requer nova análise; recusas não podem virar vendidos públicos', async () => {
      p = await ok('/api/local/customer/products',{...input,id:p.id,version:p.version,title:'Notebook revisado',photos:[image]},person);
      assert.equal((await ok('/api/local/products')).products.length,0);
      assert.equal((await request('/api/portal/local-products',{id:p.id,version:p.version,state:'Rejeitado'},admin)).status,400);
      p = await ok('/api/portal/local-products',{id:p.id,version:p.version,state:'Rejeitado',reason:'Detalhe o estado do produto.'},admin);
      assert.match((await ok('/api/local/customer/products',null,person)).products[0].moderationReason,/Detalhe/);
      p = await ok('/api/local/customer/product-state',{id:p.id,version:p.version,state:'Pausado'},person);
      assert.equal((await request('/api/local/customer/product-state',{id:p.id,version:p.version,state:'Vendido'},person)).status,409);
    });
    await t.test('correção em rascunho e reenvio preservam orientação até a aprovação', async () => {
      const reason = 'Detalhe o estado do produto.';
      const corrected = {...input,id:p.id,description:'Item usado, tela sem trincas, bateria de seis horas e carregador incluído.',priceCents:45000,photos:[image]};
      p = await ok('/api/local/customer/products',{...corrected,version:p.version,submit:false},person);
      assert.equal(p.state,'Rascunho');
      const reopened = (await ok('/api/local/customer/products',null,person)).products[0];
      assert.equal(reopened.moderationReason,reason);
      assert.equal(reopened.description,corrected.description);
      assert.deepEqual(reopened.photos,[image]);
      assert.equal((await ok('/api/local/products')).products.length,0);
      p = await ok('/api/local/customer/products',{...corrected,version:p.version,submit:true},person);
      assert.equal(p.state,'Em análise');assert.equal(p.moderationReason,reason);
      const review = (await ok('/api/portal/local-products',null,admin)).products.find(x=>x.id===p.id);
      assert.equal(review.moderationReason,reason);assert.equal(review.priceCents,45000);
      assert.equal((await ok('/api/local/products')).products.length,0);
      p = await ok('/api/portal/local-products',{id:p.id,version:p.version,state:'Publicado',reason},admin);
      assert.equal(p.moderationReason,'');
      assert.ok(p.history.some(x=>x.state==='Rejeitado'&&x.reason===reason));
      const published = (await ok('/api/local/products')).products[0];
      assert.equal(published.description,corrected.description);assert.equal(published.priceCents,45000);
      assert.equal(published.moderationReason,undefined);
    });
    await t.test('pausa, venda definitiva, contato removido e retirada administrativa', async () => {
      p = await ok('/api/local/customer/product-state',{id:p.id,version:p.version,state:'Pausado'},person);
      assert.equal((await ok('/api/local/products')).products.length,0);
      p = await ok('/api/local/customer/product-state',{id:p.id,version:p.version,state:'Vendido'},person);
      const sold = (await ok('/api/local/products')).products[0];assert.equal(sold.state,'Vendido');assert.equal(sold.phone,null);
      assert.equal((await request('/api/local/customer/products',{...input,id:p.id,version:p.version},person)).status,409);
      assert.equal((await request('/api/local/customer/product-state',{id:p.id,version:p.version,state:'Em análise'},person)).status,409);
      await ok('/api/portal/local-products',{id:p.id,version:p.version,state:'Pausado',reason:'Retirada solicitada.'},admin);
      assert.equal((await ok('/api/local/products')).products.length,0);
      assert.equal((await request('/api/local/product-photo?product='+encodeURIComponent(p.id)+'&id='+image)).status,404);
      const removed = (await ok('/api/local/customer/products',null,person)).products[0];
      assert.equal((await request('/api/local/customer/products',{...input,id:removed.id,version:removed.version},person)).status,409);
    });
    await t.test('rascunho preserva dados e fotos após sair e entrar, permite editar e enviar', async t => {
      const draft = await ok('/api/local/customer/products',{...input,title:'Rascunho para continuar depois',photos:[image],submit:false},person);
      assert.equal(draft.state,'Rascunho');
      const oldSession = person;
      await ok('/api/local/customer/logout',{},person);
      assert.equal((await request('/api/local/customer/products',null,oldSession)).status,401);
      const login = await request('/api/local/customer/login',{email:'person@products.test',password:'products-test-password'});
      assert.equal(login.status,200); person = cookie(login);
      const reopened = (await ok('/api/local/customer/products',null,person)).products.find(x=>x.id===draft.id);
      assert.deepEqual(reopened,draft);
      const photoResponse = await request('/api/local/customer/photo?id='+encodeURIComponent(image),null,person);
      assert.equal(photoResponse.status,200);
      assert.ok((await photoResponse.arrayBuffer()).byteLength > 0);
      assert.ok(!(await ok('/api/local/products')).products.some(x=>x.id===draft.id));
      const revised = await ok('/api/local/customer/products',{...input,id:draft.id,version:draft.version,title:draft.title,description:'Descrição revisada depois de entrar novamente no portal.',priceCents:32590,photos:reopened.photos,submit:true},person);
      assert.equal(revised.id,draft.id); assert.equal(revised.state,'Em análise');
      assert.equal(revised.priceCents,32590); assert.deepEqual(revised.photos,[image]);
      const review = (await ok('/api/portal/local-products',null,admin)).products.find(x=>x.id===draft.id);
      assert.equal(review.description,revised.description); assert.equal(review.state,'Em análise');
      assert.deepEqual(review.photos,[image]);
      assert.ok(!(await ok('/api/local/products')).products.some(x=>x.id===draft.id));
      await t.test('troca de fotos persiste após login e a vitrine só serve as atuais', async t => {
        const bytes = Buffer.from(await (await request('/api/local/customer/photo?id='+encodeURIComponent(image),null,person)).arrayBuffer());
        const replacements = [];
        for (const name of ['segunda.png','substituta.png']) {
          const upload = await fetch(origin+'/api/local/customer/photo',{method:'POST',headers:{Origin:origin,Cookie:person,'Content-Type':'image/png','X-File-Name':name},body:bytes});
          assert.equal(upload.status,201); replacements.push((await upload.json()).id);
        }
        const original = await ok('/api/local/customer/products',{...input,id:revised.id,version:revised.version,photos:[image,replacements[0]],submit:true},person);
        const approved = await ok('/api/portal/local-products',{id:original.id,version:original.version,state:'Publicado'},admin);
        const oldUrl = '/api/local/product-photo?product='+encodeURIComponent(original.id)+'&id='+encodeURIComponent(image);
        assert.equal((await request(oldUrl)).status,200);
        const changed = await ok('/api/local/customer/products',{...input,id:approved.id,version:approved.version,photos:replacements,submit:false},person);
        assert.equal(changed.state,'Rascunho');
        assert.equal((await request(oldUrl)).status,404);
        assert.ok(!(await ok('/api/local/products')).products.some(x=>x.id===changed.id));
        assert.equal((await request('/api/portal/local-products',{id:changed.id,version:approved.version,state:'Publicado'},admin)).status,409);
        assert.equal((await request('/api/portal/local-products',{id:changed.id,version:changed.version,state:'Publicado'},admin)).status,409);
        await ok('/api/local/customer/logout',{},person);
        const login = await request('/api/local/customer/login',{email:'person@products.test',password:'products-test-password'});
        assert.equal(login.status,200); person=cookie(login);
        const saved = (await ok('/api/local/customer/products',null,person)).products.find(x=>x.id===changed.id);
        assert.deepEqual(saved.photos,replacements);
        const sent = await ok('/api/local/customer/products',{...input,id:saved.id,version:saved.version,photos:saved.photos,submit:true},person);
        assert.ok(!(await ok('/api/local/products')).products.some(x=>x.id===sent.id));
        for (const id of replacements) assert.equal((await request('/api/local/product-photo?product='+encodeURIComponent(sent.id)+'&id='+encodeURIComponent(id))).status,404);
        const moderated = (await ok('/api/portal/local-products',null,admin)).products.find(x=>x.id===sent.id);
        assert.deepEqual(moderated.photos,replacements);
        await ok('/api/portal/local-products',{id:sent.id,version:sent.version,state:'Publicado'},admin);
        const visible = (await ok('/api/local/products')).products.find(x=>x.id===sent.id);
        assert.deepEqual(visible.photos.map(url=>new URL(url,origin).searchParams.get('id')),replacements);
        for (const url of visible.photos) assert.equal((await request(url)).status,200);
        assert.equal((await request(oldUrl)).status,404);
        await t.test('duas edições simultâneas não sobrescrevem a versão mais recente', async () => {
          const current=(await ok('/api/local/customer/products',null,person)).products.find(x=>x.id===sent.id);
          const changes=await Promise.all(['Edição na primeira aba','Edição na segunda aba'].map(title=>request('/api/local/customer/products',{...input,id:current.id,version:current.version,title,photos:replacements},person)));
          assert.deepEqual(changes.map(r=>r.status).sort(),[200,409]);
          const winner=await changes.find(r=>r.status===200).json();
          const latest=(await ok('/api/local/customer/products',null,person)).products.find(x=>x.id===sent.id);
          assert.equal(latest.title,winner.title); assert.equal(latest.version,current.version+1);
          assert.ok(!(await ok('/api/local/products')).products.some(x=>x.id===sent.id));
        });
      });
    });
    await t.test('loja anuncia item novo com o mesmo fluxo; logout revoga acesso', async () => {
      const item = await ok('/api/local/customer/products',{...input,condition:'Novo'},shop);
      await ok('/api/portal/local-products',{id:item.id,version:item.version,state:'Publicado'},admin);
      const d = (await ok('/api/local/products')).products[0];assert.equal(d.sellerType,'Loja');assert.equal(d.condition,'Novo');
      const personal = (await ok('/api/local/customer/products',null,person)).products;
      assert.equal(personal.length,2); assert.ok(!personal.some(x=>x.id===item.id));
      await ok('/api/local/customer/logout',{},person);assert.equal((await request('/api/local/customer/products',null,person)).status,401);
    });
    await t.test('loja com acesso por convite usa o marketplace sem migrar a conta', async () => {
      const b = await legacyBusiness(server.database,{name:'Loja já cadastrada'});
      const invite = await ok('/api/portal/local-admin',{action:'invite',id:b.id,email:'invited@products.test'},admin);
      const activated = await request('/api/local/customer/activate',{token:new URL(invite.url).hash.slice('#ativar='.length),password:'products-test-password'});
      const c = cookie(activated);
      const item = await ok('/api/local/customer/products',input,c);
      await ok('/api/portal/local-products',{id:item.id,version:item.version,state:'Publicado'},admin);
      assert.ok((await ok('/api/local/products')).products.some(x => x.sellerName === 'Loja já cadastrada' && x.sellerType === 'Loja'));
      assert.equal((await ok('/api/local/customer/me',null,c)).business.productsOnly,false);
    });
  } finally {
    await server.portal.shutdown();await new Promise(r => server.close(r));fs.rmSync(dataDir,{recursive:true,force:true});
  }
});
