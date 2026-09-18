import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { createReelsRenderer, normalizeReelScenes, reelCaptions } from '../portal/reels-renderer.mjs';
const command = promisify(execFile);

test('Reels subtitles preserve accents and neutralize ASS control injection', () => {
  const [scene] = normalizeReelScenes([{duration:4,text:'Olá {\\p1} imóvel\\N seguro',position:'bottom',textColor:'#123456'}]);
  const ass = reelCaptions(scene,true);
  assert.ok(ass.includes('&H00563412'));
  assert.ok(ass.includes('0:00:04.00'));
  assert.ok(ass.includes('Olá ｛＼p1｝'));
  assert.ok(!ass.includes('{\\p1}'));
  assert.ok(ass.includes('\\fad(300,300)'));
});

test('Reels validates bounded scene plans before accessing media or rendering', () => {
  assert.throws(() => normalizeReelScenes([]), /oito cenas/);
  assert.throws(() => normalizeReelScenes(Array.from({ length: 9 }, () => ({ duration: 1 }))), /oito cenas/);
  assert.throws(() => normalizeReelScenes([{ duration: 15 }, { duration: 15 }, { duration: 1 }]), /30 segundos/);
  for (const duration of [0, Infinity, NaN, 16]) assert.throws(() => normalizeReelScenes([{ duration }]), /durar/);
  assert.throws(() => normalizeReelScenes([{ duration: 1, background: 'white;movie=http://local' }]), /cor/);
  assert.throws(() => normalizeReelScenes([{ duration: 1, text: 'x'.repeat(181) }]), /180/);
  assert.throws(() => normalizeReelScenes([{ duration: 2, in: 1, out: 30 }]), /corte/);
  assert.throws(() => normalizeReelScenes([{ duration: 2, position: 'h;foo' }]), /Posição/);
  const result = normalizeReelScenes([{ duration: 5, text: "100% pronto: 'Olá' [mundo]", background: '#fF8000' }]);
  assert.equal(result[0].text, "100% pronto: 'Olá' [mundo]");
  assert.equal(result[0].background, '#fF8000');
});

test('Reels availability requires both native binaries and the bundled font', async () => {
  const renderer = createReelsRenderer({ env: {}, ffmpegPath: '/not-installed/ffmpeg', ffprobePath: '/not-installed/ffprobe' });
  assert.equal(renderer.configured(), false);
  assert.equal(renderer.capabilities().available, false);
  await assert.rejects(renderer.render({ scenes: [{ duration: 1 }] }), /não foi incluído/);
});

test('real Reels renders text, image motion, MP4 cuts and source audio into verified 30s vertical MP4', { skip: !process.env.HELPU_TEST_FFMPEG || !process.env.HELPU_TEST_FFPROBE, timeout: 160000 }, async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'helpu-reels-test-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const ffmpeg = process.env.HELPU_TEST_FFMPEG, ffprobe = process.env.HELPU_TEST_FFPROBE;
  const imageFile = path.join(directory, 'image.png'), videoFile = path.join(directory, 'source.mp4');
  await command(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=540x960:rate=1', '-frames:v', '1', imageFile], { windowsHide: true });
  await command(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=blue:s=320x240:r=30:d=2', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', videoFile], { windowsHide: true });
  const renderer = createReelsRenderer({ env: {}, ffmpegPath: ffmpeg, ffprobePath: ffprobe });
  assert.equal(renderer.configured(), true);
  const checked = await renderer.preflight({ assets: [{ id: 'video', mime: 'video/mp4', bytes: await fs.readFile(videoFile) }] });
  assert.equal(checked[0].id, 'video'); assert.equal(checked[0].audio, true); assert.ok(Math.abs(checked[0].duration - 2) < 0.1);
  await assert.rejects(renderer.preflight({ assets: [{ id: 'bad', mime: 'image/png', bytes: Buffer.from('not a file') }] }), /processamento|mídia válida/);
  const started = Date.now();
  const result = await renderer.render({ name: 'Reels sintético', assets: [{ id: 'image', mime: 'image/png', bytes: await fs.readFile(imageFile) }, { id: 'video', mime: 'video/mp4', bytes: await fs.readFile(videoFile) }], scenes: [
    { duration: 5, text: "Texto: 100% 'seguro' [teste]", background: '#FF5318' },
    { duration: 15, sourceAssetId: 'image', text: 'Imagem enviada pelo usuário', position: 'bottom', textColor: '#ffffff' },
    { duration: 5, sourceAssetId: 'video', in: 0, loopSource: true, text: 'Referência curta com áudio', textColor: '#ffffff', position: 'top' },
    { duration: 5, text: 'Pronto para publicar', background: '#222222', textColor: '#ffffff' },
  ] });
  assert.ok(Date.now() - started < 140000);
  assert.equal(result.mime, 'video/mp4'); assert.equal(result.width, 1080); assert.equal(result.height, 1920);
  assert.ok(Math.abs(result.duration - 30) < 0.1); assert.equal(result.size, result.bytes.length);
  assert.equal(result.sha256, createHash('sha256').update(result.bytes).digest('hex'));
  assert.equal(result.bytes.subarray(4, 8).toString(), 'ftyp');
  assert.deepEqual(result.loopedSourceIds, ['video']);
  const output = path.join(directory, 'result.mp4'); await fs.writeFile(output, result.bytes);
  const decoded = await command(ffmpeg, ['-v', 'error', '-i', output, '-f', 'null', '-'], { windowsHide: true });
  assert.equal(decoded.stderr, '');
  const webpFile = path.join(directory, 'reference.webp');
  await command(ffmpeg, ['-v','error','-y','-i',imageFile,'-frames:v','1',webpFile], {windowsHide:true});
  const short = await renderer.render({scenes:[{duration:4,sourceAssetId:'photo',text:'Conheça este imóvel',fade:false}],assets:[{id:'photo',mime:'image/webp',bytes:await fs.readFile(webpFile)}]});
  assert.ok(Math.abs(short.duration-4)<0.1);
  // Decode the output; a successful encoder exit alone is insufficient.
  await fs.writeFile(output,short.bytes);
  assert.equal((await command(ffmpeg,['-v','error','-i',output,'-f','null','-'],{windowsHide:true})).stderr,'');
  await assert.rejects(renderer.render({ scenes: [{ duration: 5, sourceAssetId: 'video' }], assets: [{ id: 'video', mime: 'video/mp4', bytes: await fs.readFile(videoFile) }] }), /ultrapassa/);
  await assert.rejects(renderer.render({ scenes: [{ duration: 1, sourceAssetId: 'missing' }] }), /referência/);
  await assert.rejects(renderer.render({ scenes: [{ duration: 1 }], assets: [{ id: 'bad', mime: 'image/png', bytes: Buffer.from('not an image') }] }), /processamento|mídia válida/);
  t.diagnostic(`Render real de 30s + verificação concluído em ${Date.now() - started}ms.`);
});
