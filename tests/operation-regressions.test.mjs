import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {Readable} from 'node:stream';
import {createHelpuServer} from '../server.mjs';
import {googlePresence} from '../portal/google-presence.mjs';
import {createProviders} from '../portal/providers.mjs';
import {suppliedAssetApproved, withSourceDeadline} from '../portal/publication.mjs';
test('Google altera apenas os campos pedidos e recusa truncamento silencioso', async () => {
  const calls = [], run = googlePresence(async (url, options) => {
    calls.push({
      url,
      options
    });
    return {};
  }, async () => 'test', () => ({}));
  await run({
    locationId: 'test'
  }, 'update', {
    website: 'https://example.com'
  });
  assert.deepEqual(calls[0].options.body, {
    websiteUri: 'https://example.com'
  });
  assert.equal(new URL(calls[0].url).searchParams.get('updateMask'), 'websiteUri');
  await run({
    locationId: 'test'
  }, 'update', {
    description: ''
  });
  assert.deepEqual(calls[1].options.body, {
    profile: {
      description: ''
    }
  });
  await assert.rejects(run({
    locationId: 'test'
  }, 'update', {}));
  await assert.rejects(run({
    locationId: 'test'
  }, 'update', {
    description: ('x').repeat(751)
  }));
  assert.equal(calls.length, 2);
});
test('mídia desaprovada e publicações antigas não viram confirmação', async () => {
  assert.equal(suppliedAssetApproved('Publique a imagem desaprovada anexada.'), false);
  assert.equal(suppliedAssetApproved('Esta é a imagem aprovada.'), true);
  const started = Date.now();
  let timestamp = new Date(started).toISOString();
  const provider = createProviders(async url => Response.json(url.includes('/account?') ? {
    id: 'account',
    username: 'fixture'
  } : url.includes('/container?') ? {
    status_code: 'PUBLISHED'
  } : {
    id: 'post',
    username: 'fixture',
    caption: 'Fixture',
    media_type: 'IMAGE',
    permalink: 'https://www.instagram.com/p/fixture/',
    timestamp
  }));
  const verify = () => provider.instagramVerify({
    accountId: 'account',
    accessToken: 'fake'
  }, 'post', 'container', {
    expectedPublishedAfter: started
  });
  assert.equal((await verify()).id, 'post');
  for (const value of ['2001-01-01T00:00:00Z', new Date(started + 3600000).toISOString()]) {
    timestamp = value;
    await assert.rejects(verify(), e => e.state === 'uncertain');
  }
});
test('prazo absoluto encerra DNS e stream sem atividade conclusiva', async () => {
  let release, continued = false;
  await assert.rejects(withSourceDeadline(async signal => {
    await new Promise(r => release = r);
    signal.throwIfAborted();
    continued = true;
  }, 15), e => e.state === 'blocked');
  release();
  await Promise.resolve();
  assert.equal(continued, false);
  const stream = new Readable({
    read() {}
  });
  await assert.rejects(withSourceDeadline(async signal => {
    signal.addEventListener('abort', () => stream.destroy(), {
      once: true
    });
    for await (const chunk of stream) signal.throwIfAborted();
    signal.throwIfAborted();
  }, 15), e => e.state === 'blocked');
  assert.equal(stream.destroyed, true);
});
test('operação preserva entregas, retomadas, rascunhos e progresso de cada publicação', async t => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'helpu-regression-'));
  let responses = [], published = 0, sent = 0;
  const answer = text => ({
    status: 'completed',
    output: [{
      type: 'message',
      content: [{
        type: 'output_text',
        text
      }]
    }]
  });
  const call = (name, args) => ({
    status: 'completed',
    output: [{
      type: 'function_call',
      call_id: randomUUID(),
      name,
      arguments: JSON.stringify(args)
    }]
  });
  const draft = (kind, data) => call('save_draft', {
    kind,
    dataJson: JSON.stringify(data)
  });
  const providers = {
    instagramContainer: async () => ({
      id: 'container-' + randomUUID()
    }),
    instagramPoll: async () => ({
      status_code: 'FINISHED'
    }),
    instagramPublish: async () => ({
      id: 'post-' + ++published
    }),
    instagramVerify: async (c, id) => ({
      id,
      status_code: 'PUBLISHED'
    }),
    send: async () => {
      sent++;
      return {
        messages: [{
          id: 'message-test'
        }]
      };
    }
  };
  const server = await createHelpuServer({
    dataDir,
    portalOptions: {
      startScheduler: false,
      providers,
      conversationRespond: async () => responses.shift() || answer('Resposta preservada.')
    }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const origin = 'http://127.0.0.1:' + server.address().port, db = new DatabaseSync(path.join(dataDir, 'helpu.sqlite'));
  let cookie = '', org;
  const request = async (route, method = 'GET', data) => {
    const res = await fetch(origin + route, {
      method,
      redirect: 'manual',
      headers: {
        Origin: origin,
        Cookie: cookie,
        'Content-Type': 'application/json'
      },
      body: data === undefined ? undefined : JSON.stringify(data)
    });
    return {
      status: res.status,
      headers: res.headers,
      body: await res.json().catch(() => null)
    };
  };
  const api = async (route, method, data) => request('/api/portal/' + org + '/' + route, method, data);
  const action = async (id, name) => api('operations/' + id + '/action', 'POST', {
    action: name
  });
  const state = async () => (await api('state')).body;
  const begin = async (text = 'Organize os materiais solicitados.') => {
    const thread = (await api('conversations', 'POST', {
      title: 'Regressão'
    })).body.id;
    const job = await api('conversations/' + thread + '/messages', 'POST', {
      text,
      mode: 'execute'
    });
    assert.equal(job.status, 201);
    return {
      thread,
      job: job.body
    };
  };
  const snapshot = async thread => (await api('conversations/' + thread)).body;
  try {
    const user = await request('/api/auth/signup', 'POST', {
      name: 'Teste',
      company: 'Fixture',
      email: 'regression@example.test',
      password: 'test-password-long'
    });
    cookie = user.headers.get('set-cookie').split(';')[0];
    org = (await request('/api/portal/bootstrap')).body.companies[0].id;
    await api('company', 'PATCH', {
      profile: {
        description: 'Empresa fictícia.',
        audience: 'Pessoas de teste.',
        visualIdentity: 'Azul e branco.'
      },
      policy: {
        dailyRuns: 100,
        allowPublishing: true
      }
    });
    await t.test('resposta textual de uma ordem continua na conversa', async () => {
      responses = [answer('Estratégia detalhada: priorizar a proposta de valor do negócio.')];
      const {thread} = await begin('Crie uma estratégia detalhada');
      await server.portal.tick();
      const s = await snapshot(thread);
      assert.match(s.messages.at(-1).text, /Estratégia detalhada/);
      assert.equal(s.operations[0].state, 'ready');
      assert.equal(s.jobs[0].state, 'succeeded');
      assert.ok(!s.operations[0].evidence.some(e => e.status === 'verified'));
    });
    await t.test('limite de etapas é bloqueio recuperável, sem sucesso inventado', async () => {
      const used = db.prepare("SELECT count(*) AS n FROM usage_reservations WHERE org_id=? AND category='agent'").get(org).n;
      await api('company', 'PATCH', {
        policy: {
          dailyRuns: used + 1
        }
      });
      responses = Array.from({
        length: 10
      }, () => call('read_records', {
        kind: 'knowledge'
      }));
      const {thread} = await begin('Crie uma estratégia detalhada');
      await server.portal.tick();
      let s = await snapshot(thread);
      const id = s.operations[0].id;
      assert.equal(s.jobs[0].state, 'blocked');
      assert.equal(s.operations[0].state, 'blocked');
      const next = await begin('Crie outra estratégia detalhada');
      await server.portal.tick();
      assert.match((await snapshot(next.thread)).jobs[0].error, /limite diário/);
      await api('company', 'PATCH', {
        policy: {
          dailyRuns: 100
        }
      });
      assert.equal((await action(id, 'resume')).status, 200);
      responses = [answer('Plano retomado com os registros existentes.')];
      await server.portal.tick();
      s = await snapshot(thread);
      assert.equal(s.operations.length, 1);
      assert.equal(s.operations[0].state, 'ready');
      assert.match(s.messages.at(-1).text, /Plano retomado/);
    });
    await t.test('rascunho de captação passa revisão sem se tornar público', async () => {
      responses = [draft('pages', {
        title: 'Página de teste',
        description: 'Descrição de teste.',
        active: true
      }), answer('Página preparada para revisão.')];
      const {thread} = await begin();
      await server.portal.tick();
      const s = await snapshot(thread), page = (await state()).records.pages.find(p => p.operationId === s.operations[0].id);
      assert.equal(page.active, false);
      assert.equal((await request('/capture/' + page.id)).status, 404);
      assert.equal(s.operations[0].state, 'awaiting_approval');
      assert.equal((await action(s.operations[0].id, 'approve')).status, 200);
      assert.equal((await state()).records.pages.find(p => p.id === page.id).active, false);
    });
    await t.test('duas peças exigem duas confirmações e não republicam após revisão', async () => {
      await api('integrations/instagram', 'PUT', {
        accessToken: 'fake',
        accountId: 'fixture'
      });
      responses = [...['Primeira', 'Segunda'].map(title => draft('content', {
        title,
        caption: 'Legenda ' + title,
        visualPrompt: 'Briefing',
        format: 'image',
        channel: 'instagram',
        mediaUrl: 'https://example.com/test.jpg'
      })), answer('Duas peças preparadas.')];
      const {thread} = await begin();
      await server.portal.tick();
      let s = await snapshot(thread), op = s.operations[0];
      assert.equal(op.artifactIds.length, 2);
      assert.equal((await action(op.id, 'approve')).status, 200);
      const publishNext = async () => {
        const result = await action(op.id, 'execute');
        assert.equal(result.status, 200, JSON.stringify(result.body));
        await server.portal.tick();
        db.prepare("UPDATE jobs SET scheduled_at=0 WHERE org_id=? AND state='waiting_provider'").run(org);
        await server.portal.tick();
      };
      await publishNext();
      s = await snapshot(thread);
      assert.equal(published, 1);
      assert.equal(s.operations[0].state, 'ready');
      const first = (await state()).records.content.find(c => c.status === 'published');
      assert.ok(first);
      await api('company', 'PATCH', {
        profile: {
          tone: 'Tom atualizado para teste.'
        }
      });
      assert.equal((await state()).records.content.find(c => c.id === first.id).status, 'published');
      assert.equal((await action(op.id, 'approve')).status, 200);
      await publishNext();
      s = await snapshot(thread);
      assert.equal(published, 2);
      assert.equal(s.operations[0].state, 'completed');
      assert.equal((await state()).records.content.filter(c => c.operationId === op.id && c.status === 'published').length, 2);
    });
    await t.test('janela de atendimento sobrevive a mais de 500 mensagens de outros contatos', async () => {
      const lead = (await api('records/leads', 'POST', {
        name: 'Contato A',
        phone: '5511999999999'
      })).body;
      const message = (await api('records/messages', 'POST', {
        leadId: lead.id,
        direction: 'outgoing',
        channel: 'whatsapp',
        text: 'Resposta de teste'
      })).body;
      const insert = db.prepare("INSERT INTO records(id,org_id,kind,data,created_at,updated_at) VALUES(?,?,'messages',?,?,?)"), now = Date.now();
      insert.run(randomUUID(), org, JSON.stringify({
        leadId: lead.id,
        channel: 'whatsapp',
        direction: 'incoming',
        text: 'Entrada verificada',
        verifiedInboundAt: now
      }), now - 1000, now - 1000);
      for (let i = 0; i < 501; i++) insert.run(randomUUID(), org, JSON.stringify({
        leadId: 'outro',
        channel: 'whatsapp',
        text: 'Outro contato'
      }), now + i, now + i);
      await api('integrations/whatsapp', 'PUT', {
        accessToken: 'fake',
        phoneNumberId: 'fixture'
      });
      assert.equal((await api('jobs', 'POST', {
        kind: 'send',
        payload: {
          messageId: message.id
        }
      })).status, 201);
      await server.portal.tick();
      assert.equal(sent, 1);
    });
    await t.test('mais de seis anexos são recusados antes de criar uma execução', async () => {
      const thread = (await api('conversations', 'POST', {
        title: 'Anexos'
      })).body.id;
      const response = await api('conversations/' + thread + '/messages', 'POST', {
        text: 'Leia os anexos.',
        attachments: Array.from({
          length: 7
        }, () => randomUUID())
      });
      assert.equal(response.status, 422);
      assert.equal((await snapshot(thread)).jobs.length, 0);
    });
  } finally {
    db.close();
    await server.portal.shutdown();
    await new Promise(r => server.close(r));
    assert.equal(path.dirname(path.resolve(dataDir)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(dataDir).startsWith('helpu-regression-'));
    fs.rmSync(dataDir, {
      recursive: true,
      force: true
    });
  }
});
