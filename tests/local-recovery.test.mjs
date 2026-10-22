import test from 'node:test';
import {legacyBusiness} from './local-legacy-fixture.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createHelpuServer} from '../server.mjs';

test('Helpu Local recuperada: rotas, cadastro, administração e acesso do cliente', async t => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'helpu-local-recovery-'));
  const server = await createHelpuServer({dataDir, portalOptions: {
    startScheduler: false, operatorEnv: {HELPU_OPERATOR_USER_IDS: '1'},
    whatsappChatEnv: {}, openaiEnv: {},
  }});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  async function request(url, body, cookie = '') {
    return fetch(origin + url, {method: body ? 'POST' : 'GET', redirect: 'manual',
      headers: {Origin: origin, 'Content-Type': 'application/json', Cookie: cookie},
      body: body ? JSON.stringify(body) : undefined});
  }
  let adminCookie, customerCookie, business, invite;
  const application = {name: 'Loja de teste', owner: 'Responsável de teste',
    phone: '54999998888', sector: 'Tecnologia', requestKey: randomUUID()};
  try {
    await t.test('rotas locais e manifesto são servidos com o tipo correto', async () => {
      for (const route of ['/local', '/local/', '/local/index.html', '/local/cliente.html']) {
        const response = await request(route);
        assert.equal(response.status, 200, route);
        assert.match(response.headers.get('content-type'), /text\/html/);
        assert.match(await response.text(), /Helpu Local/);
      }
      const manifest = await request('/local/manifest.webmanifest');
      assert.match(manifest.headers.get('content-type'), /application\/manifest\+json/);
      assert.ok((await manifest.json()).name);
    });
    await t.test('catálogo aberto; áreas privadas continuam exigindo autenticação', async () => {
      assert.equal((await (await request('/api/local/launch')).json()).locked, false);
      assert.equal((await request('/api/local/customer/me')).status, 401);
      assert.equal((await request('/api/portal/local-admin')).status, 401);
    });
    await t.test('cadastro antigo foi retirado; empresas existentes continuam administráveis', async () => {
      assert.equal((await request('/api/local/apply', application)).status, 410);
      assert.equal((await request('/api/local/apply', application)).status, 410);
      const signup = await request('/api/auth/signup', {name: 'Equipe teste',
        email: 'operator@example.test', password: 'recovery-test-password-2026'});
      assert.equal(signup.status, 201);
      adminCookie = signup.headers.get('set-cookie').split(';')[0];
      await legacyBusiness(server.database,application);
      const listing = await request('/api/portal/local-admin', null, adminCookie);
      assert.equal(listing.status, 200);
      const data = await listing.json();
      assert.equal(data.businesses.length, 1);
      business = data.businesses[0];
      assert.equal(business.state, 'Rascunho');
    });
    await t.test('equipe emite convite; cliente ativa acesso separado', async () => {
      const response = await request('/api/portal/local-admin', {
        action: 'invite', id: business.id, email: 'seller@example.test',
      }, adminCookie);
      assert.equal(response.status, 200);
      invite = await response.json();
      const token = new URL(invite.url).hash.slice('#ativar='.length);
      const activation = await request('/api/local/customer/activate', {
        token, password: 'seller-test-password-2026',
      });
      assert.equal(activation.status, 200);
      customerCookie = activation.headers.get('set-cookie').split(';')[0];
      assert.equal((await request('/api/portal/local-admin', null, customerCookie)).status, 401);
      const dashboard = await request('/api/local/customer/me', null, customerCookie);
      assert.equal(dashboard.status, 200);
      assert.equal((await dashboard.json()).business.name, application.name);
      assert.notEqual((await request('/api/local/customer/activate', {token,
        password: 'seller-test-password-2026'})).status, 200);
    });
    await t.test('catálogo ignora bloqueio antigo, mas exige publicação e preserva dados privados', async () => {
      assert.equal((await (await request('/api/local/businesses')).json()).businesses.length,0);
      const submitted = await request('/api/local/customer/profile', {...business,publish:true, description: 'Loja de tecnologia criada apenas para este teste.',
        publicPhone: '54999997777', notes: 'Anotação privada de teste',
        catalog: [{id: randomUUID(), name: 'Computador de teste', description: 'Item sintético',
          priceCents: 150000, available: true}],
      }, customerCookie);
      assert.equal(submitted.status,200,await submitted.text());
      const pending=(await (await request('/api/local/customer/me',null,customerCookie)).json()).business;
      const published=await request('/api/portal/local-admin',{action:'moderate',id:pending.id,version:pending.version,state:'Publicado'},adminCookie);
      assert.equal(published.status, 200, await published.text());
      assert.equal((await (await request('/api/local/businesses')).json()).businesses.length,1);
      const launch = await request('/api/portal/local-launch', {
        version: 0, open: false, plannedDate: '2026-10-10',
      }, adminCookie);
      assert.equal(launch.status, 200);
      assert.equal((await (await request('/api/local/launch')).json()).locked,false);
      const billing=(await (await request('/api/local/customer/me',null,customerCookie)).json()).billing;
      assert.equal(billing.launchedAt,null);assert.equal(billing.automaticCharge,false);
      const visible = await (await request('/api/local/businesses')).json();
      assert.equal(visible.businesses.length, 1);
      assert.equal(visible.businesses[0].catalog[0].name, 'Computador de teste');
      assert.equal(visible.businesses[0].phone, '5554999997777');
      assert.equal(visible.businesses[0].owner, undefined);
      assert.equal(visible.businesses[0].notes, undefined);
    });
    await t.test('exclusão do catálogo é restrita à equipe, oculta empresa e produtos e permite restaurar', async () => {
      const ordinaryResponse=await request('/api/auth/signup',{name:'Usuário comum',email:'ordinary@catalog.test',password:'ordinary-test-password'});
      const ordinary=ordinaryResponse.headers.get('set-cookie').split(';')[0];
      const listing=await (await request('/api/portal/local-admin',null,adminCookie)).json();
      const current=listing.businesses.find(x=>x.id===business.id);
      const draft=await (await request('/api/local/customer/products',{title:'Produto da empresa',description:'Produto de teste vinculado ao cadastro da empresa.',category:'Outros',condition:'Novo',priceCents:1000,city:'Vacaria',phone:'54999997777',photos:[],submit:true},customerCookie)).json();
      assert.equal((await request('/api/portal/local-products',{id:draft.id,version:draft.version,state:'Publicado'},adminCookie)).status,200);
      const removal={action:'delete',id:current.id,version:current.version};
      assert.equal((await request('/api/portal/local-admin',removal,ordinary)).status,403);
      assert.equal((await request('/api/portal/local-admin',removal,customerCookie)).status,401);
      assert.equal((await request('/api/portal/local-admin',{...removal,version:current.version-1},adminCookie)).status,409);
      const response=await request('/api/portal/local-admin',removal,adminCookie);assert.equal(response.status,200);
      const deleted=await response.json();assert.ok(deleted.deletedAt);assert.equal(deleted.state,'Inativo');
      assert.equal((await (await request('/api/local/businesses')).json()).businesses.length,0);
      assert.equal((await (await request('/api/local/products')).json()).products.length,0);
      assert.equal((await request('/api/local/customer/me',null,customerCookie)).status,403);
      assert.equal((await request('/api/portal/local-admin',{...current,version:deleted.version},adminCookie)).status,409);
      const restore={action:'restore',id:deleted.id,version:deleted.version};
      assert.equal((await request('/api/portal/local-admin',restore,ordinary)).status,403);
      const restored=await (await request('/api/portal/local-admin',restore,adminCookie)).json();
      assert.equal(restored.deletedAt,null);assert.equal(restored.state,'Inativo');
      assert.equal((await (await request('/api/local/businesses')).json()).businesses.length,0);
      assert.equal((await request('/api/portal/local-admin',{...current,state:'Rascunho',version:restored.version},adminCookie)).status,200);
      assert.equal((await request('/api/local/customer/me',null,customerCookie)).status,200);
    });
    await t.test('logout encerra o acesso do cliente', async () => {
      assert.equal((await request('/api/local/customer/logout', {}, customerCookie)).status, 200);
      assert.equal((await request('/api/local/customer/me', null, customerCookie)).status, 401);
    });
  } finally {
    await server.portal.shutdown();
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(dataDir, {recursive: true, force: true});
  }
});
