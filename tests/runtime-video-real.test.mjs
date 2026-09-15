import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { createVideoService, runCommand } from '../services/runtime/video.mjs';

test('real FFmpeg exports synthetic text and imported trim as verified H264 MP4', { skip: !process.env.HELPU_TEST_FFMPEG || !process.env.HELPU_TEST_FFPROBE, timeout: 120_000 }, async t => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'helpu-video-real-'));
  const service = await createVideoService({ dataDir, ffmpegPath: process.env.HELPU_TEST_FFMPEG, ffprobePath: process.env.HELPU_TEST_FFPROBE });
  t.after(async () => { await service.shutdown(); await fs.rm(dataDir, { recursive: true, force: true }); });
  const org = randomUUID();
  assert.equal((await service.capabilities()).available, true);
  const source = path.join(dataDir, 'synthetic-source.mp4');
  await runCommand(process.env.HELPU_TEST_FFMPEG, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-f', 'lavfi', '-i', 'color=c=blue:s=320x240:r=30:d=1', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', source]);
  const asset = await service.importAsset(org, { name: 'qa-synthetic.mp4', bytes: await fs.readFile(source) });
  const project = await service.create(org, { name: 'Verificação sintética', scenes: [{ duration: 0.5, text: "Texto: 100% 'seguro' [teste]", background: '#ffffff', textColor: '#121212' }, { sourceAssetId: asset.id, in: 0.2, out: 0.7, text: 'Corte de teste', position: 'bottom', background: '#181818', textColor: '#ffffff' }] });
  const job = await service.export(org, project.id, { revision: 1, idempotencyKey: randomUUID() });
  let completed;
  for (let i = 0; i < 200; i++) { completed = await service.job(org, job.id); if (['completed', 'failed'].includes(completed.status)) break; await new Promise(resolve => setTimeout(resolve, 250)); }
  assert.equal(completed.status, 'completed', completed.error);
  const output = await service.output(org, job.id); assert.equal(output.width, 1080); assert.equal(output.height, 1920); assert.ok(output.size > 1000); assert.ok(Math.abs(output.duration - 1) < 0.1);
});
