import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {createHelpuServer} from '../server.mjs';
import {ProviderError} from '../portal/providers.mjs';
const fixtureProfile = {
  description: 'TEST ONLY: empresa fictícia usada para verificar o kernel.',
  audience: 'TEST ONLY: pessoas que participam de testes de software.',
  tone: 'TEST ONLY: claro e direto.',
  visualIdentity: 'TEST ONLY: azul #123456 e branco, sem imagens de pessoas.',
  restrictions: 'TEST ONLY: não inventar preços, benefícios, clientes ou métricas.'
};
const fixtureDeliverable = {
  title: 'TEST ONLY: publicação de demonstração técnica',
  concept: 'TEST ONLY: apresentar a identidade cadastrada no ambiente de teste.',
  caption: 'TEST ONLY: conheça a nossa identidade. Consulte as informações da empresa.',
  visualBrief: 'TEST ONLY: fundo branco, título em azul #123456, composição simples sem pessoas.'
};
const objective = 'Prepare uma publicação para a EME seguindo a identidade da empresa.';
const delivery = () => ({
  status: 'completed',
  output: [{
    type: 'function_call',
    name: 'deliver_post',
    call_id: randomUUID(),
    arguments: JSON.stringify(fixtureDeliverable)
  }]
});
test('kernel: chat, registros compartilhados e continuidade sem publicação fictícia', async t => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'helpu-kernel-test-'));
  let server, origin, db, cookie, otherCookie, org, otherOrg;
  let modelCalls = 0, providerCalls = 0, publishCalls = 0, respond = delivery, publicationFailure = null, verificationFailure = null, onPublishing = null, onPolling = null;
  const modelBodies = [];
  const providers = {
    instagramContainer: async () => {
      providerCalls++;
      return {
        id: 'TEST-ONLY-container'
      };
    },
    instagramPoll: async () => {
      providerCalls++;
      if (onPolling) await onPolling();
      return {
        status_code: 'FINISHED'
      };
    },
    instagramPublish: async () => {
      providerCalls++;
      publishCalls++;
      if (onPublishing) await onPublishing();
      if (publicationFailure) throw publicationFailure;
      return {
        id: 'TEST-ONLY-post'
      };
    },
    instagramVerify: async (config, id, containerId) => {
      providerCalls++;
      if (verificationFailure) throw verificationFailure;
      return {
        id,
        status_code: 'PUBLISHED',
        containerId
      };
    },
    test: async () => ({
      id: 'TEST-ONLY-account'
    })
  };
  const start = async () => {
    server = await createHelpuServer({
      dataDir,
      portalOptions: {deliveryOnly:false,
        startScheduler: false,
        providers,
        conversationRespond: async (config, body) => {
          modelCalls++;
          modelBodies.push(structuredClone(body));
          return respond(config, body);
        }
      }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    origin = 'http://127.0.0.1:' + server.address().port;
    db = new DatabaseSync(path.join(dataDir, 'helpu.sqlite'));
  };
  const stop = async () => {
    db.close();
    await server.portal.shutdown();
    await new Promise(resolve => server.close(resolve));
  };
  const request = async (url, method = 'GET', data, session = cookie) => {
    const response = await fetch(origin + url, {
      method,
      headers: {
        Origin: origin,
        'Content-Type': 'application/json',
        ...session ? {
          Cookie: session
        } : {}
      },
      body: data === undefined ? undefined : JSON.stringify(data),
      redirect: 'manual'
    });
    return {
      status: response.status,
      headers: response.headers,
      body: await response.json().catch(() => null)
    };
  };
  const api = async (tail, method = 'GET', data) => request('/api/portal/' + org + '/' + tail, method, data);
  const state = async () => (await api('state')).body;
  const operation = async id => {
    const value = (await state()).operations.find(item => item.id === id);
    assert.ok(value, 'operation remains visible in company state');
    return value;
  };
  const newThread = async () => {
    const response = await api('conversations', 'POST', {
      title: 'TEST ONLY: kernel'
    });
    assert.equal(response.status, 201);
    return response.body.id;
  };
  const send = async (thread, text = objective, options = {}) => api('conversations/' + thread + '/messages', 'POST', {
    text,
    mode: 'execute',
    ...options
  });
  const action = async (id, action, values = {}) => api('operations/' + id + '/action', 'POST', {
    action,
    ...values
  });
  const create = async () => {
    const thread = await newThread(), response = await send(thread);
    assert.equal(response.status, 201, JSON.stringify(response.body));
    assert.ok(response.body.payload.operationId, 'the conversation job references its operation');
    return {
      thread,
      job: response.body,
      id: response.body.payload.operationId
    };
  };
  const prepared = async () => {
    const created = await create();
    await server.portal.tick();
    assert.equal((await operation(created.id)).state, 'awaiting_approval');
    return created;
  };
  const contentFor = async id => {
    const value = (await state()).records.content.find(item => item.operationId === id);
    assert.ok(value, 'a linked content artifact exists in the existing studio records');
    return value;
  };
  await start();
  try {
    for (const email of ['kernel@example.test', 'kernel-other@example.test']) {
      const response = await request('/api/auth/signup', 'POST', {
        name: 'TEST ONLY operator',
        company: 'EME',
        email,
        password: 'test-only-kernel-password'
      }, '');
      assert.equal(response.status, 201);
      const session = response.headers.get('set-cookie').split(';')[0];
      if (email === 'kernel@example.test') cookie = session; else otherCookie = session;
    }
    org = (await request('/api/portal/bootstrap')).body.companies[0].id;
    otherOrg = (await request('/api/portal/bootstrap', 'GET', undefined, otherCookie)).body.companies[0].id;
    assert.equal((await api('company', 'PATCH', {
      policy: {
        dailyRuns: 100
      }
    })).status, 200);
    await t.test('contexto essencial ausente bloqueia a operação sem chamar o modelo', async () => {
      const created = await create(), before = modelCalls;
      await server.portal.tick();
      const op = await operation(created.id);
      assert.equal(op.state, 'blocked');
      assert.equal(modelCalls, before);
      assert.equal(providerCalls, 0);
      assert.equal((await state()).records.content.filter(item => item.operationId === op.id).length, 0);
      const thread = (await api('conversations/' + created.thread)).body;
      assert.equal(thread.operations.find(item => item.id === op.id).state, 'blocked');
      assert.ok(thread.messages.some(item => item.role === 'assistant' && (/marca|identidade|público|empresa/i).test(item.text)));
    });
    assert.equal((await api('company', 'PATCH', {
      profile: fixtureProfile
    })).status, 200);
    await t.test('pedido cria plano, campanha, tarefas e artefato nos registros existentes', async () => {
      const created = await create(), before = await operation(created.id);
      assert.equal(before.state, 'requested');
      assert.equal(db.prepare("SELECT count(*) AS n FROM records WHERE org_id=? AND kind='operations' AND id=?").get(org, created.id).n, 1);
      await server.portal.tick();
      const st = await state(), op = await operation(created.id), content = await contentFor(op.id);
      assert.equal(op.state, 'awaiting_approval');
      assert.equal(content.status, 'review');
      assert.equal(content.caption, fixtureDeliverable.caption);
      assert.equal(content.visualPrompt, fixtureDeliverable.visualBrief);
      assert.ok(st.records.campaigns.some(item => item.operationId === op.id && item.id === content.campaignId));
      assert.ok(st.records.tasks.filter(item => item.operationId === op.id).length >= 3);
      assert.equal(st.records.metrics.length, 0);
      assert.equal(providerCalls, 0);
      assert.ok(JSON.stringify(modelBodies.at(-1)).includes(fixtureProfile.visualIdentity));
      const thread = (await api('conversations/' + created.thread)).body;
      assert.equal(thread.operations.find(item => item.id === op.id).state, op.state);
      assert.ok(thread.messages.some(item => item.role === 'assistant' && (/aprova/i).test(item.text)));
      assert.ok(st.audit.some(item => item.resource_id === op.id));
      const transitions = thread.events.filter(item => item.kind === 'operation_transition' && item.detail.operationId === op.id).map(item => item.detail.to);
      for (const value of ['understanding', 'planning', 'producing', 'reviewing', 'awaiting_approval']) assert.ok(transitions.includes(value), 'transition persisted: ' + value);
      assert.ok(op.competencies.every(item => item.responsibility && item.input && item.expected && item.criteria));
      assert.ok(op.quality.checks.some(item => item.requiresHuman && !item.passed));
    });
    await t.test('pedido com Preciso ativa a mesma vertical de publicação', async () => {
      const thread = await newThread(), alias = 'Preciso de uma publicação para a EME', sent = await send(thread, alias);
      assert.equal(sent.status, 201);
      assert.ok(sent.body.payload.operationId);
      await server.portal.tick();
      const op = await operation(sent.body.payload.operationId);
      assert.equal(op.type, 'post');
      assert.equal(op.objective, alias);
      assert.equal(op.state, 'awaiting_approval');
      assert.equal((await contentFor(op.id)).caption, fixtureDeliverable.caption);
    });
    await t.test('ferramenta operacional cria ordem mesmo quando a frase não usa os verbos reconhecidos', async () => {
      const thread = await newThread(), sent = await send(thread, 'Um lembrete na lista de tarefas, por favor.');
      assert.equal(sent.status, 201);
      assert.equal(sent.body.payload.operationId, undefined);
      const responses = [{
        status: 'completed',
        output: [{
          type: 'function_call',
          name: 'save_draft',
          call_id: 'TEST-ONLY-lazy-save',
          arguments: JSON.stringify({
            kind: 'tasks',
            dataJson: JSON.stringify({
              title: 'TEST ONLY: lembrete criado pela ferramenta'
            })
          })
        }]
      }, {
        status: 'completed',
        output: [{
          type: 'function_call',
          name: 'read_records',
          call_id: 'TEST-ONLY-lazy-read',
          arguments: JSON.stringify({
            kind: 'tasks'
          })
        }]
      }, {
        status: 'completed',
        output: [{
          type: 'message',
          content: [{
            type: 'output_text',
            text: 'TEST ONLY: tarefa registrada.'
          }]
        }]
      }];
      respond = () => responses.shift();
      try {
        await server.portal.tick();
      } finally {
        respond = delivery;
      }
      const st = await state(), job = st.jobs.find(item => item.id === sent.body.id);
      assert.ok(job.payload.operationId);
      const op = await operation(job.payload.operationId);
      assert.equal(op.type, 'general');
      assert.equal(op.state, 'ready');
      assert.ok(st.records.tasks.some(item => item.title === 'TEST ONLY: lembrete criado pela ferramenta' && item.operationId === op.id));
      assert.ok(op.evidence.some(item => item.status === 'recorded' && item.evidence.callId === 'TEST-ONLY-lazy-save'));
      assert.ok(op.evidence.some(item => item.status === 'observed' && item.evidence.callId === 'TEST-ONLY-lazy-read'));
      assert.equal((await api('conversations/' + thread)).body.operations.find(item => item.id === op.id).state, 'ready');
    });
    await t.test('idempotência preserva uma ordem e não mistura conversas ou empresas', async () => {
      const thread = await newThread(), key = 'TEST-ONLY-idempotency', first = await send(thread, objective, {
        idempotencyKey: key
      });
      assert.equal(first.status, 201);
      const repeated = await send(thread, objective, {
        idempotencyKey: key
      });
      assert.equal(repeated.status, 200);
      assert.equal(repeated.body.id, first.body.id);
      assert.equal((await send(thread, objective + ' TEST ONLY: outro pedido.', {
        idempotencyKey: key
      })).status, 409);
      assert.equal((await send(thread, objective, {
        idempotencyKey: key,
        mode: 'plan'
      })).status, 409);
      const bytes = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.alloc(24)]);
      const upload = await fetch(origin + '/api/portal/' + org + '/files', {
        method: 'POST',
        headers: {
          Origin: origin,
          Cookie: cookie,
          'X-File-Name': 'TEST-ONLY-reference.png'
        },
        body: bytes
      });
      assert.equal(upload.status, 201);
      const asset = await upload.json();
      assert.equal((await send(thread, objective, {
        idempotencyKey: key,
        attachments: [asset.id]
      })).status, 409);
      const another = await newThread();
      assert.equal((await send(another, objective, {
        idempotencyKey: key
      })).status, 409);
      const id = first.body.payload.operationId;
      assert.equal((await request('/api/portal/' + org + '/operations/' + id, 'GET', undefined, otherCookie)).status, 404);
      assert.equal((await request('/api/portal/' + otherOrg + '/operations/' + id + '/action', 'POST', {
        action: 'approve'
      }, otherCookie)).status, 404);
      await server.portal.tick();
      assert.equal((await state()).operations.filter(item => item.id === id).length, 1);
      assert.equal((await api('conversations/' + thread)).body.messages.filter(item => item.role === 'user').length, 1);
    });
    await t.test('aprovação real libera a entrega e alteração da copy invalida a aprovação', async () => {
      const created = await prepared();
      assert.equal((await action(created.id, 'approve')).status, 200);
      assert.equal((await operation(created.id)).state, 'ready');
      let content = await contentFor(created.id);
      assert.equal(content.status, 'approved');
      const changed = await api('records/content/' + content.id, 'PATCH', {
        caption: fixtureDeliverable.caption + ' TEST ONLY: revisão.',
        version: content.version
      });
      assert.equal(changed.status, 200);
      assert.equal(changed.body.status, 'review');
      assert.notEqual((await operation(created.id)).state, 'ready');
      assert.equal((await action(created.id, 'approve')).status, 200);
      assert.equal((await api('company', 'PATCH', {
        profile: {
          tone: fixtureProfile.tone + ' TEST ONLY: nova orientação.'
        }
      })).status, 200);
      assert.notEqual((await operation(created.id)).state, 'ready');
      assert.equal((await contentFor(created.id)).status, 'review');
      assert.equal((await api('company', 'PATCH', {
        profile: {
          tone: fixtureProfile.tone
        }
      })).status, 200);
      assert.equal((await action(created.id, 'approve')).status, 200);
      const fingerprint = (await operation(created.id)).approval.fingerprint;
      assert.equal((await api('company', 'PATCH', {
        name: 'TEST ONLY: EME revisada'
      })).status, 200);
      assert.equal((await operation(created.id)).state, 'awaiting_approval');
      assert.equal((await contentFor(created.id)).status, 'review');
      assert.notEqual((await operation(created.id)).reviewHash, fingerprint);
      assert.equal((await api('company', 'PATCH', {
        name: 'EME'
      })).status, 200);
      assert.equal(providerCalls, 0);
    });
    await t.test('mudança de contexto durante produção bloqueia a proposta antiga e retomada usa a marca atual', async () => {
      const created = await create(), newIdentity = fixtureProfile.visualIdentity + ' TEST ONLY: adicionar margem maior.';
      respond = async () => {
        assert.equal((await api('company', 'PATCH', {
          profile: {
            visualIdentity: newIdentity
          }
        })).status, 200);
        return delivery();
      };
      try {
        await server.portal.tick();
      } finally {
        respond = delivery;
      }
      assert.equal((await operation(created.id)).state, 'blocked');
      assert.equal((await state()).records.content.filter(item => item.operationId === created.id).length, 0);
      assert.equal((await action(created.id, 'resume')).status, 200);
      await server.portal.tick();
      assert.equal((await operation(created.id)).state, 'awaiting_approval');
      assert.equal((await state()).records.content.filter(item => item.operationId === created.id).length, 1);
      assert.ok(JSON.stringify(modelBodies.at(-1)).includes(newIdentity));
      assert.equal((await api('company', 'PATCH', {
        profile: {
          visualIdentity: fixtureProfile.visualIdentity
        }
      })).status, 200);
    });
    await t.test('autonomia e conta ausente impedem publicação sem gerar evidência falsa', async () => {
      const created = await prepared();
      await action(created.id, 'approve');
      await api('company', 'PATCH', {
        policy: {
          allowPublishing: true,
          operationRules: [{
            channel: 'instagram',
            action: 'publish',
            risk: 'high',
            policy: 'forbidden'
          }]
        }
      });
      const before = providerCalls;
      await action(created.id, 'execute');
      await server.portal.tick();
      assert.equal((await operation(created.id)).state, 'blocked');
      assert.equal(providerCalls, before);
      assert.notEqual((await contentFor(created.id)).status, 'published');
      await api('company', 'PATCH', {
        policy: {
          operationRules: [{
            channel: 'instagram',
            action: 'publish',
            risk: 'high',
            policy: 'automatic'
          }]
        }
      });
      const disconnected = await prepared();
      await action(disconnected.id, 'approve');
      await action(disconnected.id, 'execute');
      await server.portal.tick();
      assert.equal((await operation(disconnected.id)).state, 'blocked');
      assert.equal(providerCalls, before);
      assert.notEqual((await contentFor(disconnected.id)).status, 'published');
      await api('company', 'PATCH', {
        policy: {
          allowPublishing: false,
          operationRules: []
        }
      });
    });
    await t.test('autorização prévia não pode ser contornada pela fila e regras inválidas são recusadas', async () => {
      const created = await prepared();
      await action(created.id, 'approve');
      assert.equal((await api('company', 'PATCH', {
        policy: {
          allowPublishing: true,
          operationRules: [{
            channel: 'instagram',
            action: 'publish',
            risk: 'high',
            policy: 'preauthorized'
          }]
        }
      })).status, 200);
      const content = await contentFor(created.id), before = providerCalls;
      const queued = await api('jobs', 'POST', {
        kind: 'publish',
        payload: {
          contentId: content.id
        }
      });
      assert.equal(queued.status, 201);
      await server.portal.tick();
      const job = (await state()).jobs.find(item => item.id === queued.body.id);
      assert.equal(job.state, 'blocked');
      assert.match(job.error, /autoriz/i);
      assert.equal(providerCalls, before);
      assert.equal((await api('company', 'PATCH', {
        policy: {
          operationRules: [{
            channel: 'instagram',
            action: 'publish',
            risk: 'high',
            policy: 'accept_anything'
          }]
        }
      })).status, 400);
      assert.equal((await api('company', 'PATCH', {
        policy: {
          operationRules: [{
            channel: 'instagram',
            action: 'publish',
            risk: 'high',
            policy: 'approval_required'
          }]
        }
      })).status, 200);
      const unapproved = await prepared();
      assert.equal((await action(unapproved.id, 'execute')).status, 409);
      await api('company', 'PATCH', {
        policy: {
          allowPublishing: false,
          operationRules: []
        }
      });
    });
    await t.test('falha do modelo é persistida e não cria uma entrega aprovada', async () => {
      const created = await create();
      respond = async () => {
        throw new ProviderError('TEST ONLY: provider unavailable', 'failed');
      };
      try {
        await server.portal.tick();
      } finally {
        respond = delivery;
      }
      assert.equal((await operation(created.id)).state, 'failed');
      assert.equal((await state()).records.content.filter(item => item.operationId === created.id).length, 0);
      assert.ok((await api('conversations/' + created.thread)).body.messages.some(item => item.role === 'assistant' && (/TEST ONLY: provider unavailable/).test(item.text)));
    });
    await t.test('texto genérico de sucesso e entrega incompleta não são evidência de produção', async () => {
      for (const result of [{
        status: 'completed',
        output: [{
          type: 'message',
          content: [{
            type: 'output_text',
            text: 'TEST ONLY: publiquei com sucesso.'
          }]
        }]
      }, {
        status: 'completed',
        output: [{
          type: 'function_call',
          name: 'deliver_post',
          call_id: randomUUID(),
          arguments: JSON.stringify({
            ...fixtureDeliverable,
            caption: ''
          })
        }]
      }]) {
        const created = await create(), before = providerCalls;
        respond = () => result;
        try {
          await server.portal.tick();
        } finally {
          respond = delivery;
        }
        assert.equal((await operation(created.id)).state, 'failed');
        assert.equal(providerCalls, before);
        assert.equal((await state()).records.content.filter(item => item.operationId === created.id).length, 0);
      }
    });
    await t.test('pausa antes de produzir impede novos efeitos e retomada reutiliza a ordem', async () => {
      const created = await create(), before = modelCalls;
      assert.equal((await action(created.id, 'pause')).status, 200);
      await server.portal.tick();
      assert.equal(modelCalls, before);
      assert.equal((await state()).records.content.filter(item => item.operationId === created.id).length, 0);
      assert.equal((await action(created.id, 'resume')).status, 200);
      await server.portal.tick();
      assert.equal((await operation(created.id)).state, 'awaiting_approval');
      assert.equal((await state()).records.content.filter(item => item.operationId === created.id).length, 1);
      assert.equal((await state()).operations.filter(item => item.id === created.id).length, 1);
    });
    await t.test('interrupção local preserva o plano e retoma sem duplicar registros', async () => {
      const created = await create(), before = modelCalls;
      await server.portal.kernel.preparePost(db.prepare('SELECT * FROM jobs WHERE id=?').get(created.job.id));
      const planned = await operation(created.id), taskIds = planned.plan.map(item => item.taskId).sort();
      assert.equal(planned.state, 'producing');
      assert.equal(taskIds.length, 4);
      db.prepare("UPDATE jobs SET state='working',lease_until=0 WHERE id=?").run(created.job.id);
      await server.portal.tick();
      const interrupted = (await state()).jobs.find(item => item.id === created.job.id);
      assert.equal(interrupted.state, 'blocked');
      assert.equal((await operation(created.id)).state, 'blocked');
      assert.equal(modelCalls, before);
      assert.equal((await action(created.id, 'resume')).status, 200);
      await server.portal.tick();
      const restored = await operation(created.id);
      assert.equal(restored.state, 'awaiting_approval');
      assert.equal(restored.campaignId, planned.campaignId);
      assert.deepEqual(restored.plan.map(item => item.taskId).sort(), taskIds);
      assert.notEqual(restored.currentJobId, created.job.id);
      assert.equal(restored.rootJobId, created.job.id);
      const st = await state();
      assert.equal(st.records.content.filter(item => item.operationId === created.id).length, 1);
      assert.equal(st.records.tasks.filter(item => item.operationId === created.id).length, 4);
      assert.ok(st.jobs.some(item => item.id === created.job.id && item.state === 'blocked'));
    });
    await t.test('estado de operação não pode ser falsificado editando uma área vinculada', async () => {
      const created = await prepared(), st = await state(), content = await contentFor(created.id);
      const task = st.records.tasks.find(item => item.operationId === created.id), campaign = st.records.campaigns.find(item => item.operationId === created.id);
      assert.equal((await api('records/content/' + content.id, 'PATCH', {
        status: 'approved'
      })).status, 409);
      assert.equal((await api('records/tasks/' + task.id, 'PATCH', {
        status: 'done'
      })).status, 409);
      assert.equal((await api('records/campaigns/' + campaign.id, 'PATCH', {
        status: 'complete'
      })).status, 409);
      assert.equal((await operation(created.id)).state, 'awaiting_approval');
    });
    await t.test('fila recusa vincular conteúdo à operação errada sem deixar execução órfã', async () => {
      const first = await prepared(), second = await prepared(), content = await contentFor(first.id), count = (await state()).jobs.length;
      const forged = await api('jobs', 'POST', {
        kind: 'publish',
        payload: {
          contentId: content.id,
          operationId: second.id
        }
      });
      assert.equal(forged.status, 409);
      assert.equal((await state()).jobs.length, count);
      const missing = await api('jobs', 'POST', {
        kind: 'publish',
        payload: {
          contentId: content.id,
          operationId: randomUUID()
        }
      });
      assert.ok([404, 409].includes(missing.status));
      assert.equal((await state()).jobs.length, count);
      assert.equal((await operation(first.id)).state, 'awaiting_approval');
      assert.equal((await operation(second.id)).state, 'awaiting_approval');
    });
    await api('integrations/instagram', 'PUT', {
      accessToken: 'TEST-ONLY-token',
      accountId: '17841400000000001'
    });
    assert.equal((await api('integrations/instagram/test', 'POST', {})).status, 200);
    await api('company', 'PATCH', {
      policy: {
        allowPublishing: true,
        operationRules: [{
          channel: 'instagram',
          action: 'publish',
          risk: 'high',
          policy: 'automatic'
        }]
      }
    });
    const executionReady = async () => {
      const created = await prepared(), content = await contentFor(created.id);
      assert.equal((await api('records/content/' + content.id, 'PATCH', {
        mediaUrl: 'https://example.test/TEST-ONLY-image.jpg',
        version: content.version
      })).status, 200);
      assert.equal((await action(created.id, 'approve')).status, 200);
      return created;
    };
    const publishJob = async id => {
      const found = (await state()).jobs.find(item => item.kind === 'publish' && item.payload.operationId === id);
      assert.ok(found, 'execution shares the original operation');
      return found;
    };
    const due = id => db.prepare('UPDATE jobs SET scheduled_at=? WHERE id=?').run(Date.now() - 1000, id);
    await t.test('calendário agenda o mesmo conteúdo e pausa impede envio do item agendado', async () => {
      const created = await executionReady(), scheduledAt = new Date(Date.now() + 3600000).toISOString(), before = publishCalls;
      assert.equal((await action(created.id, 'schedule', {
        scheduledAt
      })).status, 200);
      assert.equal((await operation(created.id)).state, 'scheduled');
      const content = await contentFor(created.id);
      assert.equal(content.status, 'scheduled');
      assert.equal(new Date(content.scheduledAt).getTime(), new Date(scheduledAt).getTime());
      const job = await publishJob(created.id);
      assert.equal(job.scheduledAt, new Date(scheduledAt).getTime());
      assert.equal((await action(created.id, 'pause')).status, 200);
      due(job.id);
      await server.portal.tick();
      assert.equal(publishCalls, before);
      assert.notEqual((await contentFor(created.id)).status, 'published');
      assert.equal((await action(created.id, 'resume')).status, 200);
      assert.equal((await action(created.id, 'approve')).status, 200);
      assert.equal((await action(created.id, 'schedule', {
        scheduledAt
      })).status, 200);
      const resumed = await publishJob(created.id);
      assert.equal(resumed.id, job.id);
      assert.equal(resumed.state, 'queued');
      assert.equal((await action(created.id, 'cancel')).status, 200);
    });
    await t.test('somente leitura confirmada do canal registra publicação e evidência estruturada', async () => {
      const created = await executionReady(), before = publishCalls;
      assert.equal((await action(created.id, 'execute')).status, 200);
      await server.portal.tick();
      const job = await publishJob(created.id);
      assert.equal(job.state, 'waiting_provider');
      assert.notEqual((await contentFor(created.id)).status, 'published');
      due(job.id);
      await server.portal.tick();
      const completed = await publishJob(created.id), op = await operation(created.id);
      assert.equal(publishCalls, before + 1);
      assert.equal(completed.state, 'succeeded');
      assert.equal((await contentFor(created.id)).status, 'published');
      assert.equal(op.state, 'completed');
      assert.equal(completed.output.result.status, 'verified');
      assert.equal(completed.output.result.companyId, org);
      assert.equal(completed.output.result.channel, 'instagram');
      assert.equal(completed.output.result.executor, 'api');
      assert.equal(completed.output.result.externalId, 'TEST-ONLY-post');
      assert.equal(completed.output.result.evidence.type, 'channel_readback');
      assert.ok(completed.output.result.occurredAt);
      assert.ok(JSON.stringify(op.evidence).includes('TEST-ONLY-post'));
      assert.equal((await action(created.id, 'execute')).status, 409);
      await server.portal.tick();
      assert.equal(publishCalls, before + 1);
      const duplicate = await api('jobs', 'POST', {
        kind: 'publish',
        payload: {
          contentId: (await contentFor(created.id)).id
        }
      });
      assert.equal(duplicate.status, 409);
      await server.portal.tick();
      assert.equal((await operation(created.id)).state, 'completed');
      assert.equal(publishCalls, before + 1);
      assert.equal((await state()).records.metrics.length, 0);
      assert.equal((await action(created.id, 'measure')).status, 200);
      assert.equal((await operation(created.id)).state, 'measuring');
      assert.deepEqual((await operation(created.id)).result.metricIds, []);
      assert.equal((await action(created.id, 'learn', {
        note: 'TEST ONLY: no numbers can support a conclusion yet.'
      })).status, 409);
    });
    await t.test('pausa durante publicação preserva confirmação que chega depois e impede repetição', async () => {
      const created = await executionReady(), before = publishCalls;
      await action(created.id, 'execute');
      await server.portal.tick();
      const job = await publishJob(created.id);
      onPublishing = async () => {
        assert.equal((await action(created.id, 'pause')).status, 200);
        assert.equal((await operation(created.id)).paused, true);
      };
      try {
        due(job.id);
        await server.portal.tick();
      } finally {
        onPublishing = null;
      }
      const op = await operation(created.id);
      assert.equal(op.state, 'completed');
      assert.equal((await contentFor(created.id)).status, 'published');
      assert.ok(op.evidence.some(item => item.status === 'verified' && item.externalId === 'TEST-ONLY-post'));
      assert.equal(publishCalls, before + 1);
      assert.equal((await action(created.id, 'execute')).status, 409);
      await server.portal.tick();
      assert.equal(publishCalls, before + 1);
    });
    await t.test('mudança da marca durante conferência do contêiner revoga a publicação mesmo em política automática', async () => {
      const created = await executionReady(), before = publishCalls;
      await action(created.id, 'execute');
      await server.portal.tick();
      const job = await publishJob(created.id);
      onPolling = async () => {
        assert.equal((await api('company', 'PATCH', {
          profile: {
            tone: fixtureProfile.tone + ' TEST ONLY: atualização durante conferência.'
          }
        })).status, 200);
      };
      try {
        due(job.id);
        await server.portal.tick();
      } finally {
        onPolling = null;
      }
      const op = await operation(created.id);
      assert.equal(op.state, 'blocked');
      assert.notEqual(op.approval.status, 'approved');
      assert.equal(publishCalls, before);
      assert.notEqual((await contentFor(created.id)).status, 'published');
      assert.equal((await api('company', 'PATCH', {
        profile: {
          tone: fixtureProfile.tone
        }
      })).status, 200);
    });
    await t.test('verificação incerta mantém identificador, impede retry e confere sem republicar', async () => {
      const created = await executionReady(), before = publishCalls;
      await action(created.id, 'execute');
      await server.portal.tick();
      const job = await publishJob(created.id);
      verificationFailure = new ProviderError('TEST ONLY: readback unavailable', 'uncertain');
      try {
        due(job.id);
        await server.portal.tick();
      } finally {
        verificationFailure = null;
      }
      assert.equal((await operation(created.id)).state, 'uncertain');
      assert.equal((await publishJob(created.id)).external.publishedId, 'TEST-ONLY-post');
      assert.notEqual((await contentFor(created.id)).status, 'published');
      assert.equal(publishCalls, before + 1);
      assert.equal((await action(created.id, 'resume')).status, 409);
      assert.equal((await action(created.id, 'cancel')).status, 409);
      assert.equal((await api('jobs/' + job.id, 'POST', {
        action: 'retry'
      })).status, 409);
      assert.equal((await action(created.id, 'verify')).status, 200);
      await server.portal.tick();
      assert.equal((await operation(created.id)).state, 'completed');
      assert.equal(publishCalls, before + 1);
      assert.equal((await publishJob(created.id)).id, job.id);
    });
    await t.test('falha da ferramenta não declara conclusão nem perde a execução original', async () => {
      const created = await executionReady();
      await action(created.id, 'execute');
      await server.portal.tick();
      const job = await publishJob(created.id);
      publicationFailure = new ProviderError('TEST ONLY: publication rejected', 'failed');
      try {
        due(job.id);
        await server.portal.tick();
      } finally {
        publicationFailure = null;
      }
      const failed = await publishJob(created.id);
      assert.equal(failed.state, 'failed');
      assert.equal((await operation(created.id)).state, 'failed');
      assert.notEqual((await contentFor(created.id)).status, 'published');
      assert.equal(failed.output.result.status, 'failed');
      assert.match(failed.output.result.error, /publication rejected/);
      assert.equal((await action(created.id, 'resume')).status, 200);
      assert.equal((await action(created.id, 'approve')).status, 200);
      assert.equal((await action(created.id, 'execute')).status, 200);
      await server.portal.tick();
      const retried = await publishJob(created.id);
      assert.equal(retried.id, job.id);
      assert.ok(retried.attempts > failed.attempts);
      assert.equal(retried.state, 'succeeded');
      assert.equal((await operation(created.id)).state, 'completed');
    });
    await t.test('recuperação de executor interrompido conserva estado incerto e não repete ação', async () => {
      const created = await executionReady();
      await action(created.id, 'execute');
      await server.portal.tick();
      const job = await publishJob(created.id), before = publishCalls;
      db.prepare("UPDATE jobs SET state='working',lease_until=0 WHERE id=?").run(job.id);
      await server.portal.tick();
      assert.equal((await publishJob(created.id)).state, 'uncertain');
      assert.equal((await operation(created.id)).state, 'uncertain');
      assert.equal((await action(created.id, 'resume')).status, 409);
      assert.equal((await action(created.id, 'execute')).status, 409);
      assert.equal(publishCalls, before);
    });
    await t.test('reinício preserva sessão, ordem, entregas e identidade dos vínculos', async () => {
      const created = await prepared(), before = await operation(created.id), content = await contentFor(created.id), key = fs.readFileSync(path.join(dataDir, 'integration.key'));
      const taskIds = (await state()).records.tasks.filter(item => item.operationId === created.id).map(item => item.id).sort();
      await stop();
      await start();
      const restored = await operation(created.id);
      assert.equal(restored.state, before.state);
      assert.equal((await contentFor(created.id)).id, content.id);
      assert.deepEqual((await state()).records.tasks.filter(item => item.operationId === created.id).map(item => item.id).sort(), taskIds);
      assert.deepEqual(fs.readFileSync(path.join(dataDir, 'integration.key')), key);
      assert.equal((await api('conversations/' + created.thread)).body.operations.find(item => item.id === created.id).state, restored.state);
      assert.equal((await state()).records.metrics.length, 0);
    });
  } finally {
    await stop();
    const resolved = path.resolve(dataDir);
    assert.ok(resolved.startsWith(path.resolve(os.tmpdir()) + path.sep + 'helpu-kernel-test-'));
    fs.rmSync(resolved, {
      recursive: true,
      force: true
    });
  }
});
