import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { createHelpuServer } from '../server.mjs';

// The runtime's actual FFmpeg/FFprobe verification is tested separately. Here the
// provider is simulated, including its verified metadata and byte fingerprint.
const mp4Fixture = () => { const bytes = Buffer.alloc(64); bytes.writeUInt32BE(24); bytes.write('ftypisom', 4); bytes.write('synthetic-runtime-integration-fixture', 24); return bytes; };
const result = text => ({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text }] }] });
const tool = (name, args, callId = name) => ({ status: 'completed', output: [{ type: 'function_call', name, call_id: callId, arguments: JSON.stringify(args) }] });
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });

function fakeRuntime() {
  const projects = new Map(), exports = new Map(), calls = [], bytes = mp4Fixture();
  let corrupt = false;
  const owned = (map, id, org) => { const value = map.get(id); return value?.orgId === org ? value : null; };
  return {
    calls, projects, exports, bytes,
    corrupt(value) { corrupt = value; },
    async fetch(url, options = {}) {
      const parsed = new URL(url), method = options.method || 'GET', headers = new Headers(options.headers), org = headers.get('X-Helpu-Company');
      assert.equal(parsed.origin, 'https://runtime.example.test');
      assert.equal(headers.get('Authorization'), 'Bearer ' + 'runtime-test-secret-'.repeat(3));
      assert.match(org, /^[a-f\d-]{36}$/i); assert.equal(options.redirect, 'error');
      const route = parsed.pathname.replace(/^\/v1/, ''), body = options.body ? JSON.parse(String(options.body)) : {};
      calls.push({ org, route, method, body });
      if (route === '/status') return json({ protocol: 1, browser: false, video: { available: true, width: 1080, height: 1920, features: ['text-scenes', 'trim', 'export-mp4'] } });
      if (route === '/browser') return json({ profiles: [] });
      if (route === '/video/projects' && method === 'GET') return json([...projects.values()].filter(project => project.orgId === org));
      if (route === '/video/projects' && method === 'POST') {
        const project = { id: randomUUID(), orgId: org, revision: 1, name: body.name || 'Vídeo QA', scenes: body.scenes || [], width: 1080, height: 1920, fps: 30, duration: (body.scenes || []).reduce((sum, scene) => sum + Number(scene.duration), 0), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
        projects.set(project.id, project); return json(project);
      }
      const projectRoute = route.match(/^\/video\/projects\/([a-f\d-]+)(\/exports)?$/i);
      if (projectRoute) {
        const project = owned(projects, projectRoute[1], org); if (!project) return json({ error: 'Projeto não encontrado.' }, 404);
        if (!projectRoute[2] && method === 'GET') return json(project);
        if (!projectRoute[2] && method === 'PATCH') { if (body.expectedRevision !== project.revision) return json({ error: 'O projeto foi alterado. Atualize a tela.' }, 409); Object.assign(project, { revision: project.revision + 1, scenes: body.scenes ?? project.scenes }); return json(project); }
        if (projectRoute[2] && method === 'POST') {
          if (body.revision !== project.revision) return json({ error: 'A versão do projeto mudou.' }, 409);
          const prior = [...exports.values()].find(job => job.orgId === org && job.idempotencyKey === body.idempotencyKey); if (prior) return json(prior);
          const job = { id: randomUUID(), orgId: org, projectId: project.id, revision: project.revision, idempotencyKey: body.idempotencyKey, status: 'queued', output: { name: 'video-qa.mp4', mime: 'video/mp4', width: 1080, height: 1920, duration: project.duration || 1, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') } };
          exports.set(job.id, job); return json(job);
        }
      }
      const exportRoute = route.match(/^\/video\/exports\/([a-f\d-]+)(\/output)?$/i);
      if (exportRoute) {
        const job = owned(exports, exportRoute[1], org); if (!job) return json({ error: 'Exportação não encontrada.' }, 404);
        if (exportRoute[2]) { const returned = Buffer.from(bytes); if (corrupt) returned[returned.length - 1] ^= 1; return new Response(returned, { headers: { 'Content-Type': 'video/mp4' } }); }
        job.status = 'completed'; return json(job);
      }
      return json({ error: 'Recurso não encontrado.' }, 404);
    },
  };
}

test('Astra online: chat, fila, vídeo na Biblioteca e proteção de permissões', async t => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'helpu-runtime-integration-'));
  const remote = fakeRuntime();
  let responses = [], autoExport = false, projectId, org, cookie = '';
  const server = await createHelpuServer({ dataDir, portalOptions: {deliveryOnly:false,
    startScheduler: false,
    runtimeEnv: { HELPU_RUNTIME_URL: 'https://runtime.example.test', HELPU_RUNTIME_SECRET: 'runtime-test-secret-'.repeat(3) },
    runtimeFetch: remote.fetch,
    conversationRespond: async (_, body) => {
      if (responses.length) return responses.shift();
      if (autoExport) {
        const saved = body.input.find(item => item.type === 'function_call_output' && item.call_id === 'create-video');
        if (saved && !body.input.some(item => item.type === 'function_call' && item.call_id === 'export-video')) {
          const project = JSON.parse(saved.output); projectId = project.id;
          return tool('video_export', { projectId, revision: project.revision }, 'export-video');
        }
      }
      return result('O vídeo está na fila de exportação.');
    },
  } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const request = async (route, method = 'GET', data, session = cookie) => {
    const response = await fetch(origin + route, { method, headers: { Origin: origin, Cookie: session, 'Content-Type': 'application/json' }, body: data === undefined ? undefined : JSON.stringify(data) });
    return { status: response.status, headers: response.headers, body: await response.json() };
  };
  const api = (route, method, data) => request('/api/portal/' + org + '/' + route, method, data);
  const db = new DatabaseSync(path.join(dataDir, 'helpu.sqlite'));
  const forceDue = () => db.prepare("UPDATE jobs SET scheduled_at=? WHERE org_id=? AND state='waiting_provider'").run(Date.now() - 1000, org);
  const exportPosts = () => remote.calls.filter(call => call.method === 'POST' && /\/exports$/.test(call.route));
  let thread, exportId, assetId;
  try {
    const signup = await request('/api/auth/signup', 'POST', { name: 'Teste', company: 'Vídeo QA', email: 'runtime@example.test', password: 'local-test-only-password' });
    assert.equal(signup.status, 201); cookie = signup.headers.get('set-cookie').split(';')[0]; org = (await request('/api/portal/bootstrap')).body.companies[0].id;
    await api('company', 'PATCH', { profile: { description: 'Empresa sintética de testes', visualIdentity: 'Fundo branco e tipografia escura' }, policy: { autoMedia: false, dailyMedia: 30, dailyRuns: 30 } });
    await api('integrations/openai', 'PUT', { apiKey: 'openai-local-test-secret' });

    await t.test('pedido explícito no chat cria projeto e exporta sem exigir autoMedia', async () => {
      thread = (await api('conversations', 'POST', { title: 'Vídeo' })).body;
      autoExport = true; responses = [tool('video_project', { action: 'create', dataJson: JSON.stringify({ name: 'Vídeo da empresa', scenes: [{ duration: 1, text: 'Texto sintético', background: '#ffffff', textColor: '#202020' }] }) }, 'create-video')];
      const sent = await api('conversations/' + thread.id + '/messages', 'POST', { text: 'Crie e exporte um vídeo de texto para minha empresa.', mode: 'execute' }); assert.equal(sent.status, 201);
      await server.portal.tick();
      const snapshot = (await api('conversations/' + thread.id)).body;
      assert.equal(snapshot.mediaJobs.length, 1, JSON.stringify(snapshot.events)); exportId = snapshot.mediaJobs[0].id;
      assert.equal(exportPosts().length, 0); assert.ok(projectId);
      await server.portal.tick();
      let state = (await api('state')).body, queued = state.jobs.find(job => job.id === exportId);
      assert.equal(queued.state, 'waiting_provider', queued.error); assert.equal(exportPosts().length, 1);
      assert.equal(queued.payload.mediaAuthorization.revision, 1); assert.equal(state.company.policy.autoMedia, false);
      forceDue(); await server.portal.tick();
      state = (await api('state')).body; const complete = state.jobs.find(job => job.id === exportId);
      assert.equal(complete.state, 'succeeded', complete.error); assetId = complete.output.assetId;
      assert.equal(state.assets.find(asset => asset.id === assetId)?.mime, 'video/mp4');
      const content = state.records.content.find(item => item.assetId === assetId); assert.equal(content.status, 'review');
      assert.equal(state.jobs.some(job => job.kind === 'publish'), false);
      const transcript = (await api('conversations/' + thread.id)).body;
      assert.equal(transcript.mediaJobs.length, 0); assert.ok(transcript.messages.some(message => message.attachments.includes(assetId)), 'Vídeo entregue na mesma conversa');
      assert.doesNotMatch(JSON.stringify(transcript), /runtime-test-secret|openai-local-test-secret|Bearer /);
      const file = await fetch(origin + '/api/portal/files/' + assetId, { headers: { Cookie: cookie } }); assert.equal(file.status, 200); assert.deepEqual(Buffer.from(await file.arrayBuffer()), remote.bytes);
      await server.portal.tick(); assert.equal(exportPosts().length, 1, 'Polling não reenvia exportação'); autoExport = false;
    });

    await t.test('projeto e exportação são acessíveis pelo painel e respeitam revisão', async () => {
      const inspected = await api('runtime/video/projects/' + projectId); assert.equal(inspected.status, 200); assert.equal(inspected.body.latestExport.state, 'complete');
      const exportView = await api('runtime/video/exports/' + exportId); assert.equal(exportView.body.assetId, assetId);
      assert.equal((await api('runtime/video/exports/' + exportId + '/import', 'POST', {})).body.assetId, assetId);
      const before = exportPosts().length;
      assert.equal((await api('runtime/video/projects/' + projectId, 'PATCH', { expectedRevision: 99, scenes: [] })).status, 409);
      assert.equal((await api('runtime/video/projects/' + projectId + '/exports', 'POST', { revision: 99, idempotencyKey: randomUUID() })).status, 409);
      assert.equal(exportPosts().length, before);
      const revisionProject=(await api('runtime/video/projects','POST',{name:'Revisões',scenes:[{duration:1,text:'Versão inicial'}]})).body;
      const revisionId=revisionProject.id,key=randomUUID();
      const queued=await api('runtime/video/projects/'+revisionId+'/exports','POST',{revision:1,idempotencyKey:key});
      assert.equal(queued.status,200);
      const repeated=await api('runtime/video/projects/'+revisionId+'/exports','POST',{revision:1,idempotencyKey:key});
      assert.equal(repeated.body.id,queued.body.id);
      const next=await api('runtime/video/projects/'+revisionId,'PATCH',{expectedRevision:1,scenes:[{duration:2,text:'Nova versão'}]});
      assert.equal(next.body.revision,2);
      assert.equal((await api('runtime/video/projects/'+revisionId+'/exports','POST',{revision:2,idempotencyKey:key})).status,409);
      await server.portal.tick();
      assert.equal((await api('runtime/video/exports/'+queued.body.id)).body.state,'failed');
      const nextJob=await api('runtime/video/projects/'+revisionId+'/exports','POST',{revision:2,idempotencyKey:randomUUID()});
      await server.portal.tick();forceDue();await server.portal.tick();
      assert.equal((await api('runtime/video/exports/'+nextJob.body.id)).body.state,'complete');
    });

    await t.test('outra empresa não acessa projeto, job nem arquivo', async () => {
      const signup = await request('/api/auth/signup', 'POST', { name: 'Outro', company: 'Outra empresa', email: 'runtime-other@example.test', password: 'local-test-only-password' }, '');
      const otherCookie = signup.headers.get('set-cookie').split(';')[0], other = (await request('/api/portal/bootstrap', 'GET', undefined, otherCookie)).body.companies[0].id;
      assert.equal((await request('/api/portal/' + other + '/runtime/video/projects/' + projectId, 'GET', undefined, otherCookie)).status, 404);
      assert.equal((await request('/api/portal/' + other + '/runtime/video/exports/' + exportId, 'GET', undefined, otherCookie)).status, 404);
      assert.equal((await request('/api/portal/files/' + assetId, 'GET', undefined, otherCookie)).status, 404);
      assert.equal((await request('/api/portal/' + other + '/runtime/video/projects/' + projectId + '/exports', 'POST', { revision: 1, idempotencyKey: randomUUID() }, otherCookie)).status, 404);
      assert.equal((await request('/api/portal/' + org + '/runtime/video/projects/' + projectId, 'GET', undefined, otherCookie)).status, 404);
    });

    await t.test('modo Planejar impede criar projetos e exportar', async () => {
      const planned = (await api('conversations', 'POST', { title: 'Só planejar' })).body, before = remote.calls.filter(call => call.method !== 'GET').length;
      responses = [tool('video_project', { action: 'create', dataJson: JSON.stringify({ name: 'Não salvar', scenes: [{ duration: 1, text: 'Planejamento' }] }) }), tool('video_export', { projectId, revision: 1 }), result('Apenas uma proposta.')];
      await api('conversations/' + planned.id + '/messages', 'POST', { text: 'Planeje um vídeo.', mode: 'plan' }); await server.portal.tick(); await server.portal.tick();
      assert.equal(remote.calls.filter(call => call.method !== 'GET').length, before);
      const snapshot = (await api('conversations/' + planned.id)).body; assert.ok(snapshot.events.some(event => event.kind === 'attention'));
    });

    await t.test('política proibida impede export mesmo com pedido explícito', async () => {
      await api('company', 'PATCH', { policy: { operationRules: [{ channel: 'other', action: 'video', risk: '*', policy: 'forbidden' }] } });
      const blockedThread = (await api('conversations', 'POST', { title: 'Vídeo proibido' })).body, before = exportPosts().length;
      responses = [tool('video_export', { projectId, revision: 1 }), result('Pedido recebido.')];
      await api('conversations/' + blockedThread.id + '/messages', 'POST', { text: 'Exporte o vídeo.', mode: 'execute' }); await server.portal.tick(); await server.portal.tick();
      assert.equal(exportPosts().length, before);
      const snapshot = (await api('conversations/' + blockedThread.id)).body; assert.ok(snapshot.messages.some(message => /proibida|proibido/i.test(message.text)), JSON.stringify(snapshot));
      await api('company', 'PATCH', { policy: { operationRules: [] } });
    });

    await t.test('arquivo com hash divergente não é importado como entrega', async () => {
      remote.corrupt(true);
      const created = (await api('runtime/video/projects', 'POST', { name: 'Teste de integridade', scenes: [{ duration: 1, text: 'QA' }] })).body;
      const queued = await api('runtime/video/projects/' + created.id + '/exports', 'POST', { revision: 1, idempotencyKey: randomUUID() }); assert.equal(queued.status, 200);
      await server.portal.tick(); forceDue(); await server.portal.tick();
      const state = (await api('state')).body, failed = state.jobs.find(job => job.id === queued.body.id);
      assert.equal(failed.state, 'blocked'); assert.match(failed.error, /arquivo|vídeo/i); assert.ok(!failed.output.assetId);
      assert.equal((await api('runtime/video/exports/' + queued.body.id + '/import', 'POST', {})).status, 409); remote.corrupt(false);
    });
  } finally { db.close(); await server.portal.shutdown(); await new Promise(resolve => server.close(resolve)); }
});

test('sem runtime configurado o chat não anuncia ferramentas de vídeo nem executa chamada inventada', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'helpu-runtime-missing-'));
  let calls = 0, turns = 0, cookie = '';
  const server = await createHelpuServer({ dataDir, portalOptions: {deliveryOnly:false,
    startScheduler: false, runtimeEnv: {}, runtimeFetch: async () => { calls++; throw new Error('Runtime ausente não deve ser chamado.'); },
    conversationRespond: async (_, body) => {
      assert.equal(body.tools.some(item => item.name.startsWith('video_')), false);
      return turns++ === 0 ? tool('video_project', { action: 'create', dataJson: JSON.stringify({ name: 'Não criar', scenes: [{ duration: 1, text: 'Teste' }] }) }) : result('O editor online precisa ser configurado.');
    },
  } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const request = async (route, method = 'GET', data) => { const response = await fetch(origin + route, { method, headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json' }, body: data === undefined ? undefined : JSON.stringify(data) }); return { status: response.status, headers: response.headers, body: await response.json() }; };
  try {
    const signup = await request('/api/auth/signup', 'POST', { name: 'Teste', company: 'Sem runtime', email: 'runtime-missing@example.test', password: 'local-test-only-password' }); cookie = signup.headers.get('set-cookie').split(';')[0];
    const org = (await request('/api/portal/bootstrap')).body.companies[0].id;
    await request('/api/portal/' + org + '/company', 'PATCH', {profile:{visualIdentity:'Fundo branco e tipografia escura'}});
    await request('/api/portal/' + org + '/integrations/openai', 'PUT', { apiKey: 'openai-local-test-secret' });
    const thread = (await request('/api/portal/' + org + '/conversations', 'POST', { title: 'Sem editor' })).body;
    await request('/api/portal/' + org + '/conversations/' + thread.id + '/messages', 'POST', { text: 'Crie um vídeo.', mode: 'execute' }); await server.portal.tick();
    assert.equal(calls, 0); assert.ok(turns > 0);
    const snapshot = (await request('/api/portal/' + org + '/conversations/' + thread.id)).body; assert.ok(snapshot.events.some(event => event.kind === 'attention'));
    assert.equal((await request('/api/portal/' + org + '/runtime/status')).body.configured, false);
  } finally { await server.portal.shutdown(); await new Promise(resolve => server.close(resolve)); }
});
