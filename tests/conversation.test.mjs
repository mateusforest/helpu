import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHelpuServer} from '../server.mjs';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {createBrowserManager} from '../portal/browser.mjs';
test('conversa executa ferramentas autorizadas e preserva estado', async t => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'helpu-conversation-test-'));
  let responses = [], bodies = [], contexts = [], clicks = 0, challenge = false, clickFails = false;
  const launch = async profile => {
    const events = new Map();
    let url = 'https://www.instagram.com/';
    const page = {
      url: () => url,
      isClosed: () => false,
      title: async () => 'Instagram',
      bringToFront: async () => {},
      on() {},
      goto: async v => url = v,
      evaluate: async (fn, {passive} = {}) => ({
        challenge,
        text: challenge ? 'Login necessário' : 'Conta EME. Novo conteúdo.',
        elements: passive || challenge ? [] : [{
          ref: 'e0',
          role: 'button',
          label: 'Criar'
        }],
        identities: challenge ? [] : [{
          username: 'eme',
          profileUrl: 'https://www.instagram.com/eme/',
          source: 'visible_self_profile_link',
          label: 'Perfil'
        }]
      }),
      screenshot: async () => Buffer.from([255, 216, 255, 0]),
      mouse: {
        wheel: async () => {}
      },
      locator: () => ({
        count: async () => 1,
        evaluate: async () => false,
        click: async () => {
          clicks++;
          if (clickFails) throw new Error('Timeout after click');
        },
        fill: async () => {},
        press: async () => {},
        selectOption: async () => {},
        setInputFiles: async () => {}
      })
    };
    const context = {
      profile,
      pages: () => [page],
      newPage: async () => page,
      route: async () => {},
      on: (name, fn) => events.set(name, fn),
      close: async () => events.get('close')?.()
    };
    contexts.push(context);
    return context;
  };
  const server = await createHelpuServer({
    dataDir,
    portalOptions: {
      startScheduler: false,
      browserLaunch: launch,
      conversationRespond: async (config, body) => {
        bodies.push(structuredClone(body));
        const next = responses.shift();
        return typeof next === 'function' ? await next() : next || ({
          status: 'completed',
          output: [{
            type: 'message',
            content: [{
              type: 'output_text',
              text: 'Resposta de teste.'
            }]
          }]
        });
      }
    }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const req = async (url, method = 'GET', data, cookie = '') => {
    const r = await fetch(origin + url, {
      method,
      headers: {
        Origin: origin,
        'Content-Type': 'application/json',
        ...cookie ? {
          Cookie: cookie
        } : {}
      },
      body: data === undefined ? undefined : JSON.stringify(data),
      redirect: 'manual'
    });
    return {
      status: r.status,
      headers: r.headers,
      body: await r.json().catch(() => null)
    };
  };
  const testDb = new DatabaseSync(path.join(dataDir, 'helpu.sqlite'));
  let cookie, otherCookie, org, other, id;
  const api = async (tail, method = 'GET', data) => req('/api/portal/' + org + '/' + tail, method, data, cookie);
  const output = text => ({
    status: 'completed',
    output: [{
      type: 'message',
      content: [{
        type: 'output_text',
        text
      }]
    }]
  });
  const call = (name, args, id = 'call-test') => ({
    status: 'completed',
    output: [{
      type: 'function_call',
      name,
      arguments: JSON.stringify(args),
      call_id: id
    }]
  });
  const newThread = async title => (await api('conversations', 'POST', {
    title
  })).body.id;
  const send = async (text, mode = 'execute', attachments = []) => api('conversations/' + id + '/messages', 'POST', {
    text,
    mode,
    attachments
  });
  try {
    for (const email of ['one@example.test', 'two@example.test']) {
      const r = await req('/api/auth/signup', 'POST', {
        email,
        password: 'senha-longa-de-teste',
        name: 'Pessoa de teste',
        company: 'EME'
      });
      assert.equal(r.status, 201);
      const c = r.headers.get('set-cookie').split(';')[0];
      if (email.startsWith('one')) cookie = c; else otherCookie = c;
    }
    org = (await req('/api/portal/bootstrap', 'GET', undefined, cookie)).body.companies[0].id;
    other = (await req('/api/portal/bootstrap', 'GET', undefined, otherCookie)).body.companies[0].id;
    await t.test('conversa isolada, um pedido ativo e resultados gravados', async () => {
      id = await newThread('Plano EME');
      assert.equal((await req('/api/portal/' + other + '/conversations/' + id, 'GET', undefined, otherCookie)).status, 404);
      responses = [call('save_draft', {
        kind: 'tasks',
        dataJson: JSON.stringify({
          title: 'Preparar campanha'
        })
      }), output('A tarefa foi criada.')];
      assert.equal((await send('Crie uma tarefa para preparar a campanha')).status, 201);
      assert.equal((await send('Duplicado')).status, 409);
      await server.portal.tick();
      const st = (await api('conversations/' + id)).body;
      assert.equal(st.messages.length, 2);
      assert.equal(st.messages[1].text, 'A tarefa foi criada.');
      assert.ok(st.events.some(e => e.kind === 'operation_transition' && e.detail.to === 'understanding' && e.label === 'Entendendo seu pedido'));
      assert.match(bodies[0].instructions, /Converse com o cliente de forma natural/);
      assert.ok(st.operations[0].plan.some(step => step.title === 'Preparar campanha'));
      assert.equal(st.operations[0].state, 'ready');
      assert.equal(st.jobs[0].state, 'succeeded');
      assert.ok((await api('state')).body.records.tasks.some(t => t.title === 'Preparar campanha'));
      assert.ok(st.events.some(e => e.kind === 'completed'));
      assert.equal(bodies[0].model, 'gpt-6-astra');
      const localTask = (await api('state')).body.records.tasks.find(t => t.title === 'Preparar campanha');
      assert.equal(localTask.kernelStep, undefined);
      assert.equal((await api('records/tasks/' + localTask.id, 'PATCH', {
        status: 'done'
      })).status, 200);
      assert.equal((await api('conversations/' + id)).body.operations[0].state, 'completed');
    });
    await t.test('modo Planejar impede gravação solicitada pelo modelo', async () => {
      id = await newThread('Somente planejar');
      responses = [call('save_draft', {
        kind: 'tasks',
        dataJson: JSON.stringify({
          title: 'Não deve existir'
        })
      }), output('Aqui está a proposta.')];
      await send('Pense em uma tarefa', 'plan');
      await server.portal.tick();
      assert.ok(!(await api('state')).body.records.tasks.some(t => t.title === 'Não deve existir'));
      assert.ok((await api('conversations/' + id)).body.events.some(e => e.kind === 'attention'));
    });
    await t.test('parar uma execução antes do início preserva o pedido sem chamar IA', async () => {
      id = await newThread('Cancelar');
      await send('Prepare uma campanha');
      const n = bodies.length;
      await api('conversations/' + id + '/stop', 'POST', {});
      await server.portal.tick();
      assert.equal(bodies.length, n);
      assert.equal((await api('conversations/' + id)).body.jobs[0].state, 'canceled');
    });
    await t.test('imagem anexada entra como imagem da empresa, sem permitir arquivo de outra empresa', async () => {
      const bytes = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.alloc(20)]);
      const res = await fetch(origin + '/api/portal/' + org + '/files', {
        method: 'POST',
        headers: {
          Origin: origin,
          Cookie: cookie,
          'X-File-Name': 'referencia.png'
        },
        body: bytes
      });
      const asset = await res.json();
      const otherThread = (await req('/api/portal/' + other + '/conversations', 'POST', {
        title: 'Outra empresa'
      }, otherCookie)).body.id;
      assert.equal((await req('/api/portal/' + other + '/conversations/' + otherThread + '/messages', 'POST', {
        text: 'Leia',
        attachments: [asset.id]
      }, otherCookie)).status, 404);
      id = await newThread('Imagem');
      responses = [output('Análise da referência.')];
      await send('Analise a imagem', 'plan', [asset.id]);
      await server.portal.tick();
      const input = bodies.at(-1).input;
      assert.ok(input.some(m => Array.isArray(m.content) && m.content.some(c => c.type === 'input_image')));
    });
    await api('company', 'PATCH', {
      policy: {
        operationRules: [{
          channel: '*',
          action: 'browser_action',
          risk: 'high',
          policy: 'automatic'
        }]
      }
    });
    await t.test('sessões têm diretórios próprios e abrir não declara login concluído', async () => {
      assert.equal((await api('browser/instagram/open', 'POST', {})).status, 200);
      const p = (await api('browser')).body.profiles.find(p => p.id === 'instagram');
      assert.equal(p.open, true);
      assert.equal(p.confirmedAt, null);
      assert.equal(p.automationAllowed, false);
      assert.equal((await req('/api/portal/' + org + '/browser', 'GET', undefined, otherCookie)).status, 404);
      await req('/api/portal/' + other + '/browser/instagram/open', 'POST', {}, otherCookie);
      assert.notEqual(contexts[0].profile, contexts[1].profile);
      assert.ok(contexts[0].profile.includes(org));
    });
    await t.test('login pendente bloqueia autorização; prévia não invalida referência do agente', async () => {
      challenge = true;
      assert.equal((await api('browser/instagram/confirm', 'POST', {
        accountLabel: '@eme',
        automationAllowed: true
      })).status, 422);
      challenge = false;
      assert.equal((await api('browser/instagram/confirm', 'POST', {
        accountLabel: '@eme',
        automationAllowed: true
      })).status, 200);
      const observation = await server.portal.conversation.browser.observe(org, 'instagram');
      await server.portal.conversation.browser.observe(org, 'instagram', {
        image: true,
        passive: true
      });
      await server.portal.conversation.browser.action(org, 'instagram', {
        op: 'click',
        ref: 'e0',
        snapshotToken: observation.snapshotToken
      }, 'test-run');
      await server.portal.conversation.browser.release('test-run');
      assert.equal(clicks, 1);
    });
    await t.test('não aceita destino fora do canal nem ação sem observação atual', async () => {
      await assert.rejects(server.portal.conversation.browser.action(org, 'instagram', {
        op: 'navigate',
        url: 'https://attacker.example/'
      }, 'test-run'), e => e.state === 'blocked');
      await assert.rejects(server.portal.conversation.browser.action(org, 'instagram', {
        op: 'click',
        ref: 'e0',
        snapshotToken: 'expired'
      }, 'test-run'), e => e.state === 'blocked');
      await server.portal.conversation.browser.release('test-run');
    });
    await t.test('falha após clique pausa a sessão e não repete a ação', async () => {
      id = await newThread('Falha controlada');
      const observation = await server.portal.conversation.browser.observe(org, 'instagram');
      clickFails = true;
      responses = [call('browser_action', {
        channel: 'instagram',
        op: 'click',
        ref: 'e0',
        snapshotToken: observation.snapshotToken
      })];
      await send('Clique no controle informado');
      const before = clicks;
      await server.portal.tick();
      assert.equal(clicks, before + 1);
      const st = (await api('conversations/' + id)).body;
      assert.equal(st.jobs[0].state, 'uncertain');
      assert.equal((await api('browser')).body.profiles.find(p => p.id === 'instagram').automationAllowed, false);
      assert.equal((await api('browser/instagram/confirm', 'POST', {
        accountLabel: '@eme',
        automationAllowed: true
      })).status, 422);
      clickFails = false;
      assert.equal((await api('browser/instagram/confirm', 'POST', {
        accountLabel: '@eme',
        automationAllowed: true,
        reviewed: true
      })).status, 200);
    });
    await t.test('falha da inteligência após clique confirmado impede retry integral', async () => {
      id = await newThread('Conciliação');
      const observation = await server.portal.conversation.browser.observe(org, 'instagram');
      responses = [call('browser_action', {
        channel: 'instagram',
        op: 'click',
        ref: 'e0',
        snapshotToken: observation.snapshotToken
      }), () => {
        throw Error('Conexão interrompida após clique');
      }];
      await send('Clique uma vez');
      const before = clicks;
      await server.portal.tick();
      const st = (await api('conversations/' + id)).body;
      assert.equal(clicks, before + 1);
      assert.equal(st.jobs[0].state, 'uncertain');
      assert.equal((await api('jobs/' + st.jobs[0].id, 'POST', {
        action: 'retry'
      })).status, 409);
      assert.equal((await api('browser')).body.profiles.find(p => p.id === 'instagram').automationAllowed, false);
      responses = [output('Vou conferir o histórico antes de continuar.')];
      await send('Confira o que já foi feito', 'plan');
      await server.portal.tick();
      assert.ok(bodies.at(-1).instructions.includes('Interação aplicada'));
      assert.equal(clicks, before + 1);
      await api('browser/instagram/confirm', 'POST', {
        accountLabel: '@eme',
        automationAllowed: true,
        reviewed: true
      });
    });
    await t.test('pausar também cancela ações derivadas ainda pendentes', async () => {
      id = await newThread('Parar com filhos');
      responses = [call('queue_action', {
        kind: 'agent',
        payloadJson: JSON.stringify({
          agent: 'director',
          brief: 'Preparar plano'
        })
      }), async () => {
        await api('conversations/' + id + '/stop', 'POST', {});
        return output('Pausado.');
      }];
      const parent = (await send('Prepare o plano')).body;
      await server.portal.tick();
      const children = testDb.prepare("SELECT state FROM jobs WHERE json_extract(payload,'$.parentJobId')=?").all(parent.id);
      assert.equal(children.length, 1);
      assert.equal(children[0].state, 'canceled');
      assert.notEqual((await api('jobs', 'POST', {
        kind: 'agent',
        payload: {
          agent: 'director',
          parentJobId: parent.id
        }
      })).status, 201);
      assert.equal((await api('conversations/' + id)).body.jobs[0].state, 'canceled');
    });
    await t.test('conversas longas usam o pedido e eventos mais recentes', async () => {
      id = await newThread('Conversa longa');
      testDb.prepare('DELETE FROM usage_reservations WHERE org_id=?').run(org);
      const now = Date.now() - 10000;
      for (let n = 0; n < 260; n++) {
        testDb.prepare('INSERT INTO conversation_messages VALUES(?,?,?,?,?,?,?,?)').run(randomUUID(), id, org, 'user', 'Pedido antigo ' + n, '[]', null, now + n);
        testDb.prepare('INSERT INTO conversation_events VALUES(?,?,?,?,?,?,?,?)').run(randomUUID(), org, id, 'history-job', 'completed', 'Evento ' + n, '{}', now + n);
      }
      responses = [output('Recebi o pedido mais recente.')];
      await send('PEDIDO MAIS RECENTE', 'plan');
      await server.portal.tick();
      const body = bodies.at(-1), st = (await api('conversations/' + id)).body;
      assert.equal(body.input.at(-1).content, 'PEDIDO MAIS RECENTE');
      assert.equal(st.messages.at(-2).text, 'PEDIDO MAIS RECENTE');
      assert.equal(st.messages.length, 200);
      assert.equal(st.events.at(-1).label, 'Evento 259');
      assert.equal(st.events.length, 250);
    });
    await t.test('reinício protege interação persistida sem conclusão', async () => {
      testDb.prepare("UPDATE browser_profiles SET automation_allowed=1,uncertain_note=NULL,pending_job_id='interrompido' WHERE org_id=? AND channel='instagram'").run(org);
      const restored = await createBrowserManager({
        db: testDb,
        dataDir,
        launch
      });
      const profile = (await restored.list(org)).find(p => p.id === 'instagram');
      assert.equal(profile.automationAllowed, false);
      assert.match(profile.uncertainNote, /interrompida/);
      await restored.shutdown();
      await api('browser/instagram/confirm', 'POST', {
        accountLabel: '@eme',
        automationAllowed: true,
        reviewed: true
      });
    });
    await t.test('recovery de conversa expirada congela conta e cancela fila derivada', async () => {
      id = await newThread('Recovery');
      const parent = (await send('Pedido interrompido')).body;
      await api('jobs', 'POST', {
        kind: 'agent',
        payload: {
          agent: 'director',
          brief: 'Filho pendente',
          parentJobId: parent.id
        }
      });
      testDb.prepare("UPDATE jobs SET state='working',lease_until=0,external=? WHERE id=?").run(JSON.stringify({
        conversationEffectsStarted: true,
        browserChannels: ['instagram']
      }), parent.id);
      const restarted = await createBrowserManager({
        db: testDb,
        dataDir,
        launch
      });
      assert.equal((await restarted.list(org)).find(p => p.id === 'instagram').automationAllowed, false);
      await restarted.shutdown();
      await server.portal.tick();
      assert.equal((await api('conversations/' + id)).body.jobs[0].state, 'uncertain');
      assert.equal((await api('browser')).body.profiles.find(p => p.id === 'instagram').automationAllowed, false);
      assert.equal(testDb.prepare("SELECT state FROM jobs WHERE json_extract(payload,'$.parentJobId')=?").get(parent.id).state, 'canceled');
    });
  } finally {
    testDb.close();
    await server.portal.shutdown();
    await new Promise(r => server.close(r));
    assert.ok(path.resolve(dataDir).startsWith(path.resolve(os.tmpdir()) + path.sep + 'helpu-conversation-test-'));
    fs.rmSync(dataDir, {
      recursive: true,
      force: true
    });
  }
});
