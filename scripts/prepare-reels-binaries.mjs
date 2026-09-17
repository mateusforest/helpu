import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createHash, randomUUID } from 'node:crypto';
import { gunzipSync } from 'node:zlib';

const require = createRequire(import.meta.url);
const RELEASE = 'https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/';
export const FFMPEG_SHA256 = 'e7e7fb30477f717e6f55f9180a70386c62677ef8a4d4d1a5d948f4098aa3eb99';
export const FFMPEG_BYTES = 79826272;
const safeURL = value => {
  const u = new URL(value);
  if (u.protocol !== 'https:' || u.username || u.password || !['github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com'].includes(u.hostname)) throw new Error('Invalid FFmpeg release download location');
  return u.href;
};
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export function verifyReelsBinary(bytes) {
  if (bytes.length !== FFMPEG_BYTES || digest(bytes) !== FFMPEG_SHA256 || bytes.subarray(0, 4).toString('hex') !== '7f454c46') throw new Error('FFmpeg release checksum mismatch; refusing to package executable');
}

async function download(url, limit, fetcher) {
  const signal = AbortSignal.timeout(120000); let target = safeURL(url);
  for (let redirects = 0; redirects <= 5; redirects++) {
    const response = await fetcher(target, { signal, redirect: 'manual' });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location || redirects === 5) throw new Error('Invalid FFmpeg download redirect');
      target = safeURL(new URL(location, target).href); continue;
    }
    if (!response.ok || !response.body) throw new Error('FFmpeg release download failed: HTTP ' + response.status);
    if (Number(response.headers.get('content-length')) > limit) throw new Error('FFmpeg release download exceeds its size limit');
    let size = 0; const chunks = [];
    for await (const chunk of response.body) { size += chunk.length; if (size > limit) throw new Error('FFmpeg release download exceeds its size limit'); chunks.push(chunk); }
    return Buffer.concat(chunks);
  }
  throw new Error('FFmpeg release could not be downloaded');
}

export async function prepareReelsBinaries({ platform = process.platform, arch = process.arch, packageRoot, fetcher = fetch } = {}) {
  if (platform !== 'linux') return { skipped: true, reason: 'Linux deployment assets are prepared on Linux.' };
  if (arch !== 'x64') throw new Error('The packaged Reels renderer requires Linux x64.');
  const root = packageRoot || path.dirname(require.resolve('ffmpeg-static/package.json'));
  const binary = path.join(root, 'ffmpeg');
  let valid = false;
  try { verifyReelsBinary(await fs.readFile(binary)); valid = true; } catch (cause) { if (cause.code && cause.code !== 'ENOENT') throw cause; }
  if (!valid) {
    const compressed = await download(RELEASE + 'ffmpeg-linux-x64.gz', 40 * 1024 * 1024, fetcher);
    const bytes = gunzipSync(compressed, { maxOutputLength: 100 * 1024 * 1024 });
    verifyReelsBinary(bytes);
    await fs.mkdir(root, { recursive: true });
    const temporary = path.join(root, '.ffmpeg-' + randomUUID());
    try { await fs.writeFile(temporary, bytes, { mode: 0o755, flag: 'wx' }); await fs.rename(temporary, binary); }
    finally { await fs.rm(temporary, { force: true }); }
  }
  await fs.chmod(binary, 0o755);
  for (const file of ['README', 'LICENSE']) {
    const target = binary + '.' + file;
    try { const stat = await fs.stat(target); if (stat.size > 0 && stat.size <= 1024 * 1024) continue; } catch (cause) { if (cause.code !== 'ENOENT') throw cause; }
    const bytes = await download(RELEASE + 'linux-x64.' + file, 1024 * 1024, fetcher);
    if (!bytes.length) throw new Error('Missing FFmpeg release documentation');
    await fs.writeFile(target, bytes, { mode: 0o644 });
  }
  return { version: '6.1.1', bytes: FFMPEG_BYTES, sha256: FFMPEG_SHA256, verified: true };
}
