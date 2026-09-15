import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { createVideoService } from '../services/runtime/video.mjs';

const org = randomUUID(), other = randomUUID();
const fakeMP4 = meta => { const header = Buffer.alloc(24); header.writeUInt32BE(24); header.write('ftypisom', 4); return Buffer.concat([header, Buffer.from(JSON.stringify(meta))]); };
const probe = async file => JSON.parse((await fs.readFile(file)).subarray(24).toString());
const scene = (text = 'Olá') => ({ duration: 1, text, background: '#ffffff', textColor: '#102030' });
const waitFor = async (service, id, status = 'completed') => {
  for (let attempt = 0; attempt < 200; attempt++) { const job = await service.job(org, id); if (job.status === status) return job; if (job.status === 'failed' && status !== 'failed') assert.fail(job.error); await new Promise(resolve => setTimeout(resolve, 5)); }
  assert.fail('Export did not reach expected status');
};
async function setup(t, options = {}) {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'helpu-video-test-'));
  let calls = 0;
  const render = options.render || (async ({ project, outputFile }) => { calls++; await fs.writeFile(outputFile, fakeMP4({ duration: project.duration, width: 1080, height: 1920, codec: 'h264', audio: true })); });
  const service = await createVideoService({ dataDir, render, probe });
  t.after(async () => { await service.shutdown(); await fs.rm(dataDir, { recursive: true, force: true }); });
  return { service, dataDir, render, calls: () => calls };
}

test('project, asset, export and output isolate organizations', async t => {
  const { service } = await setup(t);
  const project = await service.create(org, { name: 'Meu vídeo', scenes: [scene()] });
  assert.equal(project.revision, 1); assert.equal(project.duration, 1); assert.equal((await service.list(other)).length, 0);
  await assert.rejects(service.get(other, project.id), { status: 404 });
  await assert.rejects(service.get('../outside', project.id), { status: 400 });
  const asset = await service.importAsset(org, { name: '../clip.mp4', bytes: fakeMP4({ duration: 10, width: 1920, height: 1080, codec: 'h264', audio: true }) });
  await assert.rejects(service.create(other, { scenes: [{ sourceAssetId: asset.id, in: 1, out: 2 }] }), { status: 404 });
  const job = await service.export(org, project.id, { revision: 1, idempotencyKey: randomUUID() });
  await waitFor(service, job.id);
  await assert.rejects(service.job(other, job.id), { status: 404 });
  await assert.rejects(service.output(other, job.id), { status: 404 });
  const output = await service.output(org, job.id); assert.equal(output.mime, 'video/mp4'); assert.equal(output.sha256.length, 64);
  await fs.appendFile(output.file, 'changed');
  await assert.rejects(service.output(org, job.id), { status: 409 });
});

test('revision conflicts prevent concurrent overwrite; operations preserve identifiers', async t => {
  const { service } = await setup(t);
  const project = await service.create(org, { scenes: [scene('Primeira'), scene('Segunda')] });
  const calls = await Promise.allSettled([service.update(org, project.id, { expectedRevision: 1, name: 'Novo nome' }), service.update(org, project.id, { expectedRevision: 1, name: 'Outro nome' })]);
  assert.equal(calls.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(calls.find(result => result.status === 'rejected').reason.status, 409);
  const updated = await service.update(org, project.id, { expectedRevision: 2, operations: [{ type: 'update', sceneId: project.scenes[0].id, changes: { text: 'Editado', id: randomUUID() } }, { type: 'move', sceneId: project.scenes[0].id, index: 1 }] });
  assert.equal(updated.scenes[1].id, project.scenes[0].id); assert.equal(updated.scenes[1].text, 'Editado');
  await assert.rejects(service.export(org, project.id, { revision: 1, idempotencyKey: randomUUID() }), { status: 409 });
});

test('same export key is durable and prevents duplicate rendering', async t => {
  const { service, dataDir, render, calls } = await setup(t);
  const project = await service.create(org, { scenes: [scene()] }), idempotencyKey = randomUUID();
  const [first, second] = await Promise.all([service.export(org, project.id, { revision: 1, idempotencyKey }), service.export(org, project.id, { revision: 1, idempotencyKey })]);
  assert.equal(first.id, second.id); await waitFor(service, first.id); assert.equal(calls(), 1);
  assert.equal((await service.export(org, project.id, { revision: 1, idempotencyKey })).id, first.id);
  await service.update(org, project.id, { expectedRevision: 1, scenes: [scene('Nova')] });
  await assert.rejects(service.export(org, project.id, { revision: 2, idempotencyKey }), { status: 409 });
  await service.shutdown();
  const restarted = await createVideoService({ dataDir, render, probe });
  t.after(() => restarted.shutdown());
  assert.equal((await restarted.export(org, project.id, { revision: 1, idempotencyKey })).status, 'completed'); assert.equal(calls(), 1);
});

test('MP4 imports are verified; trimmed scenes honor source duration', async t => {
  const { service } = await setup(t);
  await assert.rejects(service.importAsset(org, { bytes: Buffer.from('not a video') }), { status: 422 });
  await assert.rejects(service.importAsset(org, { bytes: Buffer.alloc(50 * 1024 * 1024 + 1) }), { status: 422 });
  const bytes = fakeMP4({ duration: 10, width: 1920, height: 1080, codec: 'h264', audio: true }), id = randomUUID();
  const asset = await service.importAsset(org, { id, name: 'clip.mp4', bytes });
  assert.equal((await service.importAsset(org, { id, name: 'again.mp4', bytes })).id, id);
  await assert.rejects(service.importAsset(org, { id, bytes: fakeMP4({ duration: 9 }) }), { status: 409 });
  const project = await service.create(org, { scenes: [{ sourceAssetId: asset.id, in: 2, out: 4 }] });
  assert.equal(project.duration, 2); assert.equal(project.scenes[0].in, 2);
  await assert.rejects(service.update(org, project.id, { expectedRevision: 1, scenes: [{ sourceAssetId: asset.id, in: 0, out: 15 }] }), { status: 400 });
});

test('invalid output is failed; repeat key does not automatically retry', async t => {
  let count = 0;
  const { service } = await setup(t, { render: async ({ outputFile }) => { count++; await fs.writeFile(outputFile, fakeMP4({ width: 10, height: 10, duration: 1, codec: 'h264' })); } });
  const project = await service.create(org, { scenes: [scene()] }), idempotencyKey = randomUUID();
  const job = await service.export(org, project.id, { revision: 1, idempotencyKey });
  await waitFor(service, job.id, 'failed');
  assert.equal((await service.export(org, project.id, { revision: 1, idempotencyKey })).status, 'failed'); assert.equal(count, 1);
  await assert.rejects(service.output(org, job.id), { status: 409 });
});

test('recovery resumes queued exports and leaves interrupted exports failed', async t => {
  const { service, dataDir } = await setup(t, { render: async ({ signal }) => new Promise((resolve, reject) => { signal.addEventListener('abort', () => reject(new Error('shutdown')), { once: true }); }) });
  const project = await service.create(org, { scenes: [scene()] });
  const first = await service.export(org, project.id, { revision: 1, idempotencyKey: randomUUID() });
  await waitFor(service, first.id, 'running');
  const second = await service.export(org, project.id, { revision: 1, idempotencyKey: randomUUID() });
  await service.shutdown(); assert.equal((await service.job(org, first.id)).status, 'failed'); assert.equal((await service.job(org, second.id)).status, 'queued');
  // Also simulate a hard process exit: a persisted running job must not resume silently.
  const firstFile = path.join(dataDir, org, 'jobs', `${first.id}.json`), record = JSON.parse(await fs.readFile(firstFile)); record.status = 'running'; await fs.writeFile(firstFile, JSON.stringify(record));
  let calls = 0;
  const restarted = await createVideoService({ dataDir, probe, render: async ({ project, outputFile }) => { calls++; await fs.writeFile(outputFile, fakeMP4({ duration: project.duration, width: 1080, height: 1920, codec: 'h264' })); } });
  t.after(() => restarted.shutdown());
  await waitFor(restarted, second.id); assert.equal(calls, 1); assert.equal((await restarted.job(org, first.id)).status, 'failed');
});

test('scene limits, positions and colors reject filter/path injection', async t => {
  const { service } = await setup(t);
  await assert.rejects(service.create(org, { scenes: [{ ...scene(), background: 'black, movie=/etc/passwd' }] }), { status: 400 });
  await assert.rejects(service.create(org, { scenes: [{ ...scene(), sourceAssetId: '../secret' }] }), { status: 400 });
  await assert.rejects(service.create(org, { scenes: [{ ...scene(), position: 'w*2' }] }), { status: 400 });
  await assert.rejects(service.create(org, { scenes: Array.from({ length: 33 }, () => scene()) }), { status: 400 });
  await assert.rejects(service.create(org, { scenes: [{ duration: 60 }, { duration: 60 }, { duration: 1 }] }), { status: 400 });
});
