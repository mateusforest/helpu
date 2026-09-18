import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { gzipSync } from 'node:zlib';
import { prepareReelsBinaries, verifyReelsBinary } from '../scripts/prepare-reels-binaries.mjs';

test('Reels packaging rejects substituted executable even when gzip is valid', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'reels-package-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  let calls = 0;
  await assert.rejects(prepareReelsBinaries({ platform: 'linux', arch: 'x64', packageRoot: root, fetcher: async (url, options) => {
    calls++; assert.equal(url, 'https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/ffmpeg-linux-x64.gz');
    assert.equal(options.redirect, 'manual'); return new Response(gzipSync(Buffer.from('substituted executable')));
  } }), /checksum mismatch/);
  assert.equal(calls, 1);
  await assert.rejects(fs.stat(path.join(root, 'ffmpeg')), { code: 'ENOENT' });
  assert.throws(() => verifyReelsBinary(Buffer.from('ELF')), /checksum mismatch/);
});

test('Reels packaging refuses unexpected download hosts before following redirects', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'reels-package-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  let calls = 0;
  await assert.rejects(prepareReelsBinaries({ platform: 'linux', arch: 'x64', packageRoot: root, fetcher: async () => { calls++; return new Response(null, { status: 302, headers: { location: 'https://example.com/ffmpeg' } }); } }), /download location/);
  assert.equal(calls, 1);
});

test('Reels packaging skips desktop platforms and refuses unsupported Linux architectures', async () => {
  const fetcher = async () => { throw new Error('Unexpected request'); };
  assert.equal((await prepareReelsBinaries({ platform: 'win32', fetcher })).skipped, true);
  await assert.rejects(prepareReelsBinaries({ platform: 'linux', arch: 'arm64', fetcher }), /Linux x64/);
});


test('Vercel Reels glob fits the schema and retains binaries, licenses and all fonts', async () => {
  const config=JSON.parse(await fs.readFile(new URL('../vercel.json',import.meta.url),'utf8'));
  const pattern=config.functions['api/**/*.mjs'].includeFiles;
  assert.ok(pattern.length<=256,'Vercel rejects includeFiles before the build when it exceeds 256 characters');
  for(const file of [
    'portal/migrations/001_core.sql',
    'node_modules/ffmpeg-static/ffmpeg',
    'node_modules/ffmpeg-static/ffmpeg.LICENSE',
    'node_modules/ffmpeg-static/ffmpeg.README',
    'node_modules/ffmpeg-static/package.json',
    'node_modules/@ffprobe-installer/linux-x64/ffprobe',
    'node_modules/@ffprobe-installer/linux-x64/package.json',
    'node_modules/@ffprobe-installer/linux-x64/README.md',
    'node_modules/dejavu-fonts-ttf/package.json',
    'node_modules/dejavu-fonts-ttf/LICENSE',
    ...['DejaVuSans','DejaVuSans-Bold','DejaVuSerif'].map(font=>'node_modules/dejavu-fonts-ttf/ttf/'+font+'.ttf')
  ])assert.ok(path.matchesGlob(file,pattern),'Missing packaged asset: '+file);
  for(const file of ['.env','runtime-data/integration.key','node_modules/another-package/index.js'])assert.equal(path.matchesGlob(file,pattern),false);
});
