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
