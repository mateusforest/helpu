import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createHmac} from 'node:crypto';
import {createHelpuServer} from '../server.mjs';
import {testPng} from './image-fixture.mjs';
import {createProviders, ProviderError} from '../portal/providers.mjs';
test('portal: isolamento, persistência e operação verificável', async t => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'helpu-portal-test-'));
  let mediaCalls = 0, sendCalls = 0, publishCalls = 0;
  const providers = {
    text: async () => ({
      summary: 'Plano preparado com as informações confirmadas.',
      recommendations: ['Revisar a oferta'],
      questions: [],
      pieces: [{
        title: 'Apresentação',
        caption: 'Conheça nossos serviços.',
        visualPrompt: 'Composição editorial.',
        format: 'image',
        channel: 'instagram'
      }]
    }),
    generateImage:async()=>{mediaCalls++;return {base64:testPng().toString('base64'),requestId:'openai-test'};},
    media: async () => {
      mediaCalls++;
      return {
        request_id: 'hf-test',
        status_url: 'https://api.higgsfield.ai/requests/hf-test/status',
        status: 'queued'
      };
    },
    pollMedia: async () => ({
      status: 'failed'
    }),
    instagramContainer: async () => ({
      id: 'container-test'
    }),
    instagramPoll: async () => ({
      status_code: 'FINISHED'
    }),
    instagramPublish: async () => {
      publishCalls++;
      return {
        id: 'post-test'
      };
    },
    instagramVerify: async (config, id, containerId) => ({
      id,
      status_code: 'PUBLISHED',
      containerId
    }),
    send: async () => {
      sendCalls++;
      await new Promise(r => setTimeout(r, 20));
      return {
        messages: [{
          id: 'wamid.test'
        }]
      };
    },
    metaCampaign: async () => ({
      id: 'campaign-test'
    }),
    test: async () => null,
    insights: async () => ({
      data: []
    }),
    googlePresence: async () => ({
      name: 'locations/profile-test'
    })
  };
  let server = await createHelpuServer({
    dataDir,
    portalOptions: {
      startScheduler: false,
      providers
    }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  let origin = 'http://127.0.0.1:' + server.address().port;
  let db = new DatabaseSync(path.join(dataDir, 'helpu.sqlite'));
  const request = async (url, method = 'GET', data, cookie = '', extra = {}) => {
    const res = await fetch(origin + url, {
      method,
      headers: {
        Origin: origin,
        ...data === undefined ? {} : {
          'Content-Type': 'application/json'
        },
        ...cookie ? {
          Cookie: cookie
        } : {},
        ...extra
      },
      body: data === undefined ? undefined : JSON.stringify(data),
      redirect: 'manual'
    });
    return {
      status: res.status,
      headers: res.headers,
      body: await res.json().catch(() => null)
    };
  };
  let a, b, org, other, campaign, content, lead, message, asset, scheduled;
  const api = async (tail, method = 'GET', data) => request('/api/portal/' + org + '/' + tail, method, data, a);
  const due = id => db.prepare('UPDATE jobs SET scheduled_at=? WHERE id=?').run(Date.now() - 1000, id);
  const state = async () => (await api('state')).body;
  try {
    await t.test('login abre portal protegido e organizações de mesmo nome ficam separadas', async () => {
      assert.equal((await request('/api/portal/bootstrap')).status, 401);
      assert.equal((await fetch(origin + '/portal.html', {
        redirect: 'manual'
      })).status, 302);
      for (const [email, key] of [['a@example.test', 'a'], ['b@example.test', 'b']]) {
        const res = await request('/api/auth/signup', 'POST', {
          name: 'Operador ' + key,
          company: 'EME',
          email,
          password: 'senha-de-teste-longa'
        });
        assert.equal(res.status, 201);
        if (key === 'a') a = res.headers.get('set-cookie').split(';')[0]; else b = res.headers.get('set-cookie').split(';')[0];
      }
      org = (await request('/api/portal/bootstrap', 'GET', undefined, a)).body.companies[0].id;
      other = (await request('/api/portal/bootstrap', 'GET', undefined, b)).body.companies[0].id;
      assert.notEqual(org, other);
      assert.equal((await request('/api/portal/' + org + '/state', 'GET', undefined, b)).status, 404);
      assert.equal((await request('/api/portal/' + org + '/company', 'PATCH', {
        name: 'Invasão'
      }, a, {
        Origin: 'https://untrusted.example'
      })).status, 403);
    });
    await t.test('marca, campanha e conteúdo persistem sem permitir fatos de execução forjados', async () => {
      assert.equal((await api('company', 'PATCH', {
        profile: {
          description: 'Serviços da EME',
          audience: 'Empresas locais',
          tone: 'Direto'
        },
        policy: {
          allowPublishing: true,
          dailyMedia: 1
        }
      })).status, 200);
      campaign = (await api('records/campaigns', 'POST', {
        name: 'Oferta de teste',
        objective: 'Captação',
        channels: ['instagram']
      })).body;
      content = (await api('records/content', 'POST', {
        title: 'Conteúdo de teste',
        caption: 'Oferta confirmada',
        campaignId: campaign.id,
        status: 'approved',
        mediaUrl: 'https://cdn.example.com/photo.jpg'
      })).body;
      assert.equal((await api('records/content', 'POST', {
        title: 'Falso',
        status: 'published'
      })).status, 400);
      const changed = await api('records/content/' + content.id, 'PATCH', {
        caption: 'Legenda revisada',
        version: content.version,
        status: 'approved'
      });
      assert.equal(changed.body.status, 'review');
      assert.equal((await api('records/content/' + content.id, 'PATCH', {
        title: 'Conflito',
        version: content.version
      })).status, 409);
      assert.equal((await request('/api/portal/' + other + '/records/content', 'POST', {
        title: 'Cruzado',
        campaignId: campaign.id
      }, b)).status, 404);
      content = (await api('records/content/' + content.id, 'PATCH', {
        status: 'approved'
      })).body;
    });
    await t.test('segredos ficam criptografados e não reaparecem após desconectar', async () => {
      const value = 'secret-test-not-for-client';
      await api('integrations/openai', 'PUT', {
        apiKey: value,
        model: 'gpt-5-mini'
      });
      assert.ok(!JSON.stringify(await state()).includes(value));
      assert.ok(!db.prepare("SELECT sealed FROM integrations WHERE org_id=? AND provider='openai'").get(org).sealed.includes(value));
      await api('integrations/openai', 'DELETE');
      assert.equal((await state()).integrations.find(i => i.id === 'openai').configured, false);
    });
    await t.test('arquivos são privados, têm tipo validado e permitem vídeo parcial', async () => {
      const bytes = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.alloc(64)]);
      const response = await fetch(origin + '/api/portal/' + org + '/files', {
        method: 'POST',
        headers: {
          Origin: origin,
          Cookie: a,
          'X-File-Name': 'marca.png'
        },
        body: bytes
      });
      assert.equal(response.status, 201);
      asset = await response.json();
      assert.equal((await request(asset.url, 'GET', undefined, b)).status, 404);
      assert.equal((await request(asset.url)).status, 401);
      const partial = await fetch(origin + asset.url, {
        headers: {
          Cookie: a,
          Range: 'bytes=0-7'
        }
      });
      assert.equal(partial.status, 206);
      assert.equal((await partial.arrayBuffer()).byteLength, 8);
      assert.equal((await fetch(origin + '/api/portal/' + org + '/files', {
        method: 'POST',
        headers: {
          Cookie: a,
          Origin: origin
        },
        body: '<script>bad()</script>'
      })).status, 400);
    });
    await t.test('captação alimenta funil, escapa HTML e importação não cria consentimento', async () => {
      const page = (await api('records/pages', 'POST', {
        title: '<script>alert(1)</script>',
        description: 'Receba a oferta',
        campaignId: campaign.id
      })).body;
      const html = await (await fetch(origin + '/capture/' + page.id)).text();
      assert.ok(html.includes('&lt;script&gt;'));
      assert.ok(!html.includes('<script>alert'));
      assert.equal((await request('/api/capture/' + page.id, 'POST', {
        name: 'Cliente interessado',
        email: 'client@example.test',
        phone: '5511999999999',
        consent: true
      })).status, 201);
      assert.equal((await api('import', 'POST', {
        rows: [{
          name: 'Contato CSV',
          consent: true,
          optOut: true
        }]
      })).status, 201);
      const leads = (await state()).records.leads;
      assert.equal(leads.find(l => l.name === 'Contato CSV').consent, false);
      lead = leads.find(l => l.name === 'Cliente interessado');
      assert.equal(lead.campaignId, campaign.id);
    });
    await t.test('o agente usa a marca e vincula os conteúdos à campanha', async () => {
      const j = (await api('jobs', 'POST', {
        kind: 'agent',
        payload: {
          agent: 'creative',
          brief: 'Criar conteúdos',
          campaignId: campaign.id
        },
        idempotencyKey: 'brief-test'
      })).body;
      await server.portal.tick();
      const st = await state();
      assert.equal(st.jobs.find(x => x.id === j.id).state, 'succeeded');
      assert.ok(st.records.content.some(c => c.title === 'Apresentação' && c.campaignId === campaign.id));
    });
    await t.test('reagendamento atualiza uma única execução e bloqueia edição durante envio', async () => {
      scheduled = (await api('jobs', 'POST', {
        kind: 'publish',
        payload: {
          contentId: content.id
        },
        scheduledAt: new Date(Date.now() + 60000),
        idempotencyKey: 'publish-a'
      })).body;
      const second = (await api('jobs', 'POST', {
        kind: 'publish',
        payload: {
          contentId: content.id
        },
        scheduledAt: new Date(Date.now() + 120000),
        idempotencyKey: 'publish-b'
      })).body;
      assert.equal(second.id, scheduled.id);
      due(scheduled.id);
      await server.portal.tick();
      assert.equal((await state()).jobs.find(j => j.id === scheduled.id).state, 'waiting_provider');
      assert.equal((await api('records/content/' + content.id, 'PATCH', {
        caption: 'Alteração durante envio'
      })).status, 409);
      due(scheduled.id);
      await server.portal.tick();
      assert.equal(publishCalls, 1);
      const posted = (await state()).records.content.find(c => c.id === content.id);
      assert.equal(posted.status, 'published');
      assert.equal(posted.providerId, 'post-test');
    });
    await t.test('registro manual não abre janela de atendimento; webhook assinado abre e deduplica', async () => {
      await api('records/messages', 'POST', {
        leadId: lead.id,
        text: 'Olá',
        channel: 'whatsapp',
        direction: 'incoming'
      });
      message = (await api('records/messages', 'POST', {
        leadId: lead.id,
        text: 'Podemos ajudar?',
        channel: 'whatsapp',
        direction: 'outgoing'
      })).body;
      const j = (await api('jobs', 'POST', {
        kind: 'send',
        payload: {
          messageId: message.id
        }
      })).body;
      await server.portal.tick();
      assert.equal((await state()).jobs.find(x => x.id === j.id).state, 'blocked');
      assert.equal(sendCalls, 0);
      await api('integrations/whatsapp', 'PUT', {
        accessToken: 'test',
        phoneNumberId: '123456789000001',
        appSecret: 'hook-secret',
        verifyToken: 'verify-test'
      });
      const event = {
        entry: [{
          changes: [{
            value: {
              metadata: {
                phone_number_id: '123456789000001'
              },
              contacts: [{
                wa_id: '5511888888888',
                profile: {
                  name: 'Cliente via canal'
                }
              }],
              messages: [{
                id: 'inbound-1',
                from: '5511888888888',
                timestamp: String(Math.floor(Date.now() / 1000)),
                type: 'text',
                text: {
                  body: 'Quero conhecer o serviço'
                }
              }]
            }
          }]
        }]
      };
      assert.equal((await request('/webhooks/' + org + '/whatsapp', 'POST', event)).status, 403);
      const sig = 'sha256=' + createHmac('sha256', 'hook-secret').update(JSON.stringify(event)).digest('hex');
      for (let i = 0; i < 2; i++) assert.equal((await request('/webhooks/' + org + '/whatsapp', 'POST', event, '', {
        'X-Hub-Signature-256': sig
      })).status, 200);
      const st = await state();
      assert.equal(st.records.messages.filter(m => m.providerId === 'inbound-1').length, 1);
      lead = st.records.leads.find(l => l.whatsappId === '5511888888888');
      assert.ok(lead);
    });
    await t.test('dois executores e cliques repetidos produzem um envio', async () => {
      message = (await api('records/messages', 'POST', {
        leadId: lead.id,
        text: 'Aqui estão as informações.',
        channel: 'whatsapp',
        direction: 'outgoing'
      })).body;
      const one = (await api('jobs', 'POST', {
        kind: 'send',
        payload: {
          messageId: message.id
        },
        idempotencyKey: 'send-one'
      })).body;
      const two = (await api('jobs', 'POST', {
        kind: 'send',
        payload: {
          messageId: message.id
        },
        idempotencyKey: 'send-two'
      })).body;
      assert.equal(one.id, two.id);
      const second = await createHelpuServer({
        dataDir,
        portalOptions: {
          startScheduler: false,
          providers
        }
      });
      await new Promise(r => second.listen(0, '127.0.0.1', r));
      try {
        await Promise.all([await server.portal.tick(), await second.portal.tick()]);
      } finally {
        await new Promise(r => second.close(r));
      }
      assert.equal(sendCalls, 1);
      assert.equal((await state()).records.messages.find(m => m.id === message.id).status, 'accepted');
      assert.equal((await api('records/messages/' + message.id, 'PATCH', {
        text: 'Reescrever enviada'
      })).status, 409);
    });
    await t.test('limite diário conta execuções de hoje mesmo que criadas ontem', async () => {
      await api('integrations/openai','PUT',{apiKey:'TEST-ONLY'});
      const items = [];
      for (let i = 0; i < 2; i++) {
        const c = (await api('records/content', 'POST', {
          title: 'Mídia ' + i,
          visualPrompt: 'Imagem de teste'
        })).body;
        const j = (await api('jobs', 'POST', {
          kind: 'image',
          payload: {
            contentId: c.id
          }
        })).body;
        items.push(j);
        db.prepare('UPDATE jobs SET created_at=? WHERE id=?').run(Date.now() - 86400000, j.id);
      }
      await server.portal.tick();
      await server.portal.tick();
      assert.equal(mediaCalls, 1);
      assert.equal((await state()).jobs.find(j => j.id === items[1].id).state, 'blocked');
    });
    await t.test('execução interrompida torna-se incerta e não pode ser repetida nem cancelada', async () => {
      const c = (await api('records/content', 'POST', {
        title: 'Recuperação', visualPrompt:'Imagem de teste'
      })).body;
      const j = (await api('jobs', 'POST', {
        kind: 'image',
        payload: {
          contentId: c.id
        }
      })).body;
      db.prepare("UPDATE jobs SET state='working',lease_until=? WHERE id=?").run(Date.now() - 100, j.id);
      await server.portal.tick();
      assert.equal((await state()).jobs.find(x => x.id === j.id).state, 'uncertain');
      assert.equal((await api('jobs/' + j.id, 'POST', {
        action: 'retry'
      })).status, 409);
      assert.equal((await api('jobs/' + j.id, 'POST', {
        action: 'cancel'
      })).status, 409);
      assert.equal((await api('jobs', 'POST', {
        kind: 'image',
        payload: {
          contentId: c.id
        }
      })).status, 409);
    });
    await t.test('reiniciar mantém sessão, memória, registros e chave de criptografia', async () => {
      const key = fs.readFileSync(path.join(dataDir, 'integration.key'));
      db.close();
      await new Promise(r => server.close(r));
      server = await createHelpuServer({
        dataDir,
        portalOptions: {
          startScheduler: false,
          providers
        }
      });
      await new Promise(r => server.listen(0, '127.0.0.1', r));
      origin = 'http://127.0.0.1:' + server.address().port;
      db = new DatabaseSync(path.join(dataDir, 'helpu.sqlite'));
      const st = await state();
      assert.equal(st.company.profile.description, 'Serviços da EME');
      assert.ok(st.records.campaigns.some(c => c.id === campaign.id));
      assert.deepEqual(fs.readFileSync(path.join(dataDir, 'integration.key')), key);
      assert.equal(db.prepare('SELECT count(*) AS n FROM portal_migrations').get().n, 4);
    });
    await t.test('alteração do Google exige leitura compatível, sem sucesso por objeto genérico', async () => {
      await api('integrations/google', 'PUT', {
        accessToken: 'test-google',
        accountId: 'account',
        locationId: 'profile-test'
      });
      let mutations = 0;
      providers.googlePresence = async (config, action) => {
        if (action === 'update') {
          mutations++;
          return {};
        }
        return {
          name: 'locations/profile-test',
          profile: {
            description: 'Descrição anterior'
          }
        };
      };
      const job = (await api('jobs', 'POST', {
        kind: 'googlePresence',
        payload: {
          action: 'update',
          input: {
            description: 'Descrição revisada'
          }
        }
      })).body;
      await server.portal.tick();
      const current = (await state()).jobs.find(j => j.id === job.id);
      assert.equal(current.state, 'uncertain');
      assert.equal(current.output.result.status, 'uncertain');
      assert.equal(mutations, 1);
      assert.equal((await api('jobs/' + job.id, 'POST', {
        action: 'retry'
      })).status, 409);
    });
  } finally {
    db.close();
    await new Promise(r => server.close(r));
    assert.ok(path.resolve(dataDir).startsWith(path.resolve(os.tmpdir()) + path.sep + 'helpu-portal-test-'));
    fs.rmSync(dataDir, {
      recursive: true,
      force: true
    });
  }
});
test('contratos dos provedores e ausência de confirmação não viram sucesso', async t => {
  const calls = [];
  const mock = async (url, options) => {
    calls.push({
      url,
      options,
      body: options.body ? JSON.parse(options.body) : undefined
    });
    return Response.json({
      request_id: 'request-test',
      status_url: 'https://api.higgsfield.ai/requests/test/status'
    });
  };
  const p = createProviders(mock);
  await t.test('Higgsfield usa os contratos de imagem e vídeo documentados', async () => {
    await p.media({
      keyId: 'id',
      keySecret: 'secret'
    }, {
      kind: 'image',
      prompt: 'Composição'
    });
    await p.media({
      keyId: 'id',
      keySecret: 'secret'
    }, {
      kind: 'video',
      prompt: 'Movimento',
      imageUrl: 'https://cdn.example.com/image.png'
    });
    assert.equal(calls[0].url, 'https://api.higgsfield.ai/higgsfield-ai/soul/v2/standard');
    assert.equal(calls[1].url, 'https://platform.higgsfield.ai/v1/image2video/dop');
    assert.equal(calls[1].body.model, 'dop-turbo');
    assert.deepEqual(calls[1].body.input_images, [{
      type: 'image_url',
      image_url: 'https://cdn.example.com/image.png'
    }]);
  });
  await t.test('sem credenciais ou mídia pública não faz pedido', async () => {
    const before = calls.length;
    await assert.rejects(p.media({}, {
      kind: 'image',
      prompt: 'x'
    }), e => e.state === 'blocked');
    await assert.rejects(p.media({
      keyId: 'x',
      keySecret: 'y'
    }, {
      kind: 'video',
      imageUrl: 'http://localhost/image.png'
    }), e => e.state === 'blocked');
    assert.equal(calls.length, before);
  });
  await t.test('HTTP 5xx e perda da conexão em mutações exigem conferência', async () => {
    const config = {
      accessToken: 'x',
      phoneNumberId: '123456789000002'
    };
    for (const fetcher of [async () => Response.json({
      error: 'bad'
    }, {
      status: 502
    }), async () => {
      throw new Error('network');
    }]) {
      const provider = createProviders(fetcher);
      await assert.rejects(provider.send(config, {
        channel: 'whatsapp',
        to: '5511999999999',
        text: 'Mensagem'
      }), e => e instanceof ProviderError && e.state === 'uncertain');
    }
  });
  await t.test('polling não encaminha segredo para outro domínio', async () => {
    await assert.rejects(p.pollMedia({
      keyId: 'x',
      keySecret: 'y'
    }, {
      status_url: 'https://attacker.example/status'
    }));
  });
  await t.test('conferência do Instagram lê contêiner, identidade e publicação sem publicar novamente', async () => {
    const requests = [];
    const provider = createProviders(async (url, options) => {
      requests.push({
        url,
        method: options.method
      });
      const id = new URL(url).pathname.split('/').at(-1);
      return Response.json(id === 'container-1' ? {
        status_code: 'PUBLISHED'
      } : id === '17841400000000001' ? {
        id: '17841400000000001',
        username: 'eme.test'
      } : {
        id: 'media-1',
        username: 'eme.test',
        caption: 'Legenda aprovada.',
        media_type: 'IMAGE',
        permalink: 'https://www.instagram.com/p/test/',
        timestamp: '2026-09-11T12:00:00Z'
      });
    });
    const result = await provider.instagramVerify({
      accessToken: 'private-token',
      accountId: '17841400000000001'
    }, 'media-1', 'container-1');
    assert.equal(result.id, 'media-1');
    assert.equal(result.status_code, 'PUBLISHED');
    assert.equal(result.containerId, 'container-1');
    assert.equal(result.identity.id, '17841400000000001');
    assert.equal(result.permalink, 'https://www.instagram.com/p/test/');
    assert.equal(result.caption, 'Legenda aprovada.');
    assert.equal(result.mediaType, 'IMAGE');
    assert.equal(result.evidence.type, 'instagram_media_readback');
    assert.equal(requests.length, 3);
    assert.ok(requests.every(r => r.method === 'GET' && !r.url.includes('private-token')));
    assert.match(requests[0].url, /container-1\?fields=status_code,status$/);
  });
  await t.test('conferência do Google permanece no perfil configurado e usa leitura', async () => {
    const requests = [];
    const provider = createProviders(async (url, options) => {
      requests.push({
        url,
        method: options.method
      });
      return Response.json({
        name: 'accounts/a/locations/l/localPosts/post-1',
        state: 'LIVE'
      });
    });
    const config = {
      accessToken: 'private-token',
      accountId: 'a',
      locationId: 'l'
    };
    for (const name of ['accounts/other/locations/l/localPosts/post-1', 'accounts/a/locations/l/localPosts/../../tokens', 'https://attacker.example/post']) await assert.rejects(provider.googleVerify(config, name), e => e.state === 'uncertain');
    assert.equal(requests.length, 0);
    const result = await provider.googleVerify(config, 'accounts/a/locations/l/localPosts/post-1');
    assert.equal(result.state, 'LIVE');
    assert.equal(requests[0].method, 'GET');
    assert.equal(requests[0].url, 'https://mybusiness.googleapis.com/v4/accounts/a/locations/l/localPosts/post-1');
    assert.ok(!requests[0].url.includes('private-token'));
  });
});
