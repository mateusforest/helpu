import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';

const require = createRequire(import.meta.url);
const MAX_ASSETS = 30 * 1024 * 1024;
const MAX_OUTPUT = 64 * 1024 * 1024;
const error = message => Object.assign(new Error(message), { state: 'blocked' });
const packageFile = (name, file) => { try { return path.join(path.dirname(require.resolve(name + '/package.json')), file); } catch { return ''; } };
const cleanColor = (value, fallback) => { if (value === undefined) return fallback; if (!/^#[a-f0-9]{6}$/i.test(value)) throw error('Use uma cor hexadecimal válida.'); return value; };
const round = value => Number(Number(value).toFixed(4));

export function normalizeReelScenes(input) {
  if (!Array.isArray(input) || !input.length || input.length > 8) throw error('Use de uma a oito cenas para o Reels.');
  let total = 0;
  const scenes = input.map(value => {
    if (!value || typeof value !== 'object') throw error('Cena inválida.');
    const duration = Number(value.duration), text = String(value.text || '');
    if (!Number.isFinite(duration) || duration < 0.2 || duration > 15) throw error('Cada cena deve durar entre 0,2 e 15 segundos.');
    if (text.length > 180 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) throw error('Use até 180 caracteres por cena.');
    const start = Number(value.in ?? 0);
    if (!Number.isFinite(start) || start < 0 || start > 600) throw error('O início do trecho de vídeo é inválido.');
    if (value.out !== undefined && Math.abs(Number(value.out) - start - duration) > 0.04) throw error('O corte deve corresponder à duração da cena.');
    const position = value.position || 'center';
    if (!['top', 'center', 'bottom'].includes(position)) throw error('Posição de texto inválida.');
    total += duration;
    return { duration: round(duration), text, background: cleanColor(value.background, '#ffffff'), textColor: cleanColor(value.textColor, value.sourceAssetId ? '#ffffff' : '#202020'), position, fade: value.fade !== false, sourceAssetId: value.sourceAssetId ? String(value.sourceAssetId) : null, in: start, loopSource: value.loopSource === true };
  });
  if (total > 30.01) throw error('O Reels pode ter até 30 segundos.');
  return scenes;
}

function wrap(text) {
  return text.split('\n').flatMap(line => {
    const lines = []; let current = '';
    for (const word of line.split(/\s+/)) for (const chunk of word.match(/.{1,26}/gu) || ['']) {
      if (current && current.length + chunk.length + 1 > 26) { lines.push(current); current = ''; }
      current += (current ? ' ' : '') + chunk;
    }
    lines.push(current); return lines;
  }).join('\n');
}

export function reelCaptions(scene, hasMedia = false) {
  const end = `0:00:${scene.duration.toFixed(2).padStart(5, '0')}`;
  const color = scene.textColor.slice(1).match(/../g).reverse().join('');
  // User text must not become ASS override tags or line-control sequences.
  const text = wrap(scene.text).replaceAll('\\', '＼').replaceAll('{', '｛').replaceAll('}', '｝').replaceAll('\n', '\\N');
  const alignment = { top: 8, center: 5, bottom: 2 }[scene.position];
  const fade = scene.fade ? `{\\fad(${Math.round(Math.min(0.3, scene.duration / 4) * 1000)},${Math.round(Math.min(0.3, scene.duration / 4) * 1000)})}` : '';
  return `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 2
[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,DejaVu Sans,60,&H00${color},&H00${color},&H94000000,&H94000000,0,0,0,0,100,100,0,0,${hasMedia ? 3 : 1},${hasMedia ? 12 : 0},0,${alignment},70,70,${scene.position === 'bottom' ? 320 : 240},1
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,${end},Default,,0,0,0,,${fade}${text}
`;
}

async function run(binary, args, { signal, cwd }) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { windowsHide: true, shell: false, cwd, signal, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', data => { output = (output + data).slice(-1024 * 1024); });
    let diagnostic = '';
    child.stderr.on('data', data => { diagnostic = (diagnostic + data).slice(-8192); });
    child.on('error', () => reject(error(signal.aborted ? 'O vídeo excedeu o tempo de processamento disponível.' : 'Não foi possível iniciar o processamento do vídeo.')));
    child.on('close', code => {
      if (code === 0) return resolve(output);
      // Log categories only: FFmpeg output may contain private paths or user text.
      const category = /No such filter/.test(diagnostic) ? 'missing_filter' : /Error loading.*font|fontselect.*failed/i.test(diagnostic) ? 'font_error' : /Invalid data found/.test(diagnostic) ? 'invalid_media' : 'process_failed';
      console.error('helpu_reels_process_failed', { binary: path.basename(binary), code, category, aborted: signal.aborted });
      reject(error(signal.aborted ? 'O vídeo excedeu o tempo de processamento disponível.' : 'Não foi possível concluir o processamento do vídeo.'));
    });
  });
}

export function createReelsRenderer({ env = process.env, ffmpegPath, ffprobePath, fontPath, timeoutMs = 140000 } = {}) {
  const ffmpeg = ffmpegPath || env.HELPU_FFMPEG_PATH || packageFile('ffmpeg-static', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
  const ffprobe = ffprobePath || env.HELPU_FFPROBE_PATH || packageFile('@ffprobe-installer/linux-x64', 'ffprobe');
  const font = fontPath || env.HELPU_VIDEO_FONT_PATH || packageFile('dejavu-fonts-ttf', 'ttf/DejaVuSans.ttf');
  const configured = () => !!(ffmpeg && ffprobe && font && [ffmpeg, ffprobe, font].every(existsSync));
  const probe = async (file, signal, cwd) => {
    const raw = await run(ffprobe, ['-v', 'error', '-protocol_whitelist', 'file,pipe', '-show_entries', 'format=duration,format_name:stream=codec_type,codec_name,width,height', '-of', 'json', file], { signal, cwd });
    let result; try { result = JSON.parse(raw); } catch { throw error('O arquivo de vídeo não passou pela verificação.'); }
    const video = result.streams?.find(item => item.codec_type === 'video');
    if (!video || video.width < 2 || video.height < 2 || video.width * video.height > 16000000) throw error('Use uma mídia válida de até 16 megapixels.');
    return { ...video, duration: Number(result.format?.duration), audio: result.streams.some(item => item.codec_type === 'audio') };
  };
  const validateAssets = assets => {
    if (!Array.isArray(assets) || assets.length > 8) throw error('Use até oito arquivos no Reels.');
    let totalBytes = 0; const byId = new Map();
    for (const asset of assets) {
      if (!asset?.id || byId.has(String(asset.id)) || !Buffer.isBuffer(asset.bytes) || !asset.bytes.length || !['video/mp4', 'image/png', 'image/jpeg', 'image/webp'].includes(asset.mime)) throw error('Arquivo de referência inválido.');
      totalBytes += asset.bytes.length; byId.set(String(asset.id), asset);
    }
    if (totalBytes > MAX_ASSETS) throw error('Os arquivos do Reels devem somar até 30 MB.');
    return byId;
  };
  const inspectAsset = async (asset, file, signal, work) => {
    await fs.writeFile(file, asset.bytes, { mode: 0o600 });
    const meta = await probe(file, signal, work);
    if (asset.mime === 'video/mp4' ? !Number.isFinite(meta.duration) || meta.duration <= 0 || meta.duration > 600 || asset.bytes.subarray(4, 8).toString() !== 'ftyp' : !['png', 'mjpeg', 'webp'].includes(meta.codec_name)) throw error('A referência não corresponde a uma imagem ou vídeo compatível.');
    return meta;
  };
  return {
    configured,
    capabilities: () => ({ available: configured(), provider: 'astra-reels', width: 1080, height: 1920, maxDuration: 30, maxScenes: 8, features: ['text-scenes', 'image-backgrounds', 'image-motion', 'import-mp4', 'trim', 'loop-source', 'source-audio', 'export-mp4'], limitations: ['Sem geração de filmagens, voz ou música por IA.'] }),
    async preflight({ assets = [] } = {}) {
      const byId = validateAssets(assets);
      if (!byId.size) return [];
      if (!configured()) throw error('O processamento de vídeo não foi incluído nesta versão do servidor. Atualize a implantação da Helpu.');
      const work = await fs.mkdtemp(path.join(os.tmpdir(), 'helpu-reels-check-'));
      const signal = AbortSignal.timeout(15000), result = [];
      try {
        for (const [id, asset] of byId) {
          const meta = await inspectAsset(asset, path.join(work, `asset-${result.length}`), signal, work);
          result.push({ id, mime: asset.mime, width: meta.width, height: meta.height, duration: asset.mime === 'video/mp4' ? meta.duration : null, audio: meta.audio });
        }
        return result;
      } finally { await fs.rm(work, { recursive: true, force: true }); }
    },
    async render({ scenes: input, assets = [], name = 'Reels' } = {}) {
      const scenes = normalizeReelScenes(input);
      if (!configured()) throw error('O processamento de vídeo não foi incluído nesta versão do servidor. Atualize a implantação da Helpu.');
      const byId = validateAssets(assets);
      for (const scene of scenes) if (scene.sourceAssetId && !byId.has(scene.sourceAssetId)) throw error('Uma referência de mídia desta cena não está disponível.');
      const work = await fs.mkdtemp(path.join(os.tmpdir(), 'helpu-reels-'));
      const signal = AbortSignal.timeout(Math.max(1000, Math.min(timeoutMs, 140000)));
      try {
        const imported = new Map();
        for (const [id, asset] of byId) {
          const file = path.join(work, `asset-${imported.size}.${asset.mime === 'video/mp4' ? 'mp4' : asset.mime.split('/')[1]}`);
          const meta = await inspectAsset(asset, file, signal, work);
          imported.set(id, { ...meta, file, mime: asset.mime });
        }
        const parts = [], loopedSourceIds = new Set();
        for (const [index, scene] of scenes.entries()) {
          signal.throwIfAborted();
          const output = path.join(work, `scene-${index}.mp4`);
          const args = ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-threads', '2', '-filter_threads', '1'];
          const filters = [];
          const asset = scene.sourceAssetId && imported.get(scene.sourceAssetId);
          let audio = '1:a:0';
          if (asset?.mime === 'video/mp4') {
            if (scene.in + scene.duration > asset.duration + 0.05) {
              if (!scene.loopSource || scene.in !== 0) throw error('O corte solicitado ultrapassa a duração do vídeo enviado. Para repetir a referência inteira, autorize loopSource com início zero.');
              args.push('-stream_loop', '-1'); loopedSourceIds.add(scene.sourceAssetId);
            }
            args.push('-protocol_whitelist', 'file,pipe', '-ss', String(scene.in), '-t', String(scene.duration), '-i', asset.file);
            filters.push(`scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=${scene.background.replace('#', '0x')},setsar=1,fps=30,setpts=PTS-STARTPTS`);
            if (asset.audio) audio = '0:a:0'; else args.push('-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo');
          } else if (asset) {
            args.push('-protocol_whitelist', 'file,pipe', '-loop', '1', '-framerate', '30', '-i', asset.file, '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo');
            filters.push(`scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,zoompan=z='min(1.04,1+on/${Math.max(1, Math.round(scene.duration * 30))}*0.04)':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=1:s=1080x1920:fps=30,setsar=1`);
          } else {
            args.push('-f', 'lavfi', '-i', `color=c=${scene.background.replace('#', '0x')}:s=1080x1920:r=30:d=${scene.duration}`, '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo');
          }
          if (scene.text) {
            await fs.writeFile(path.join(work, `captions-${index}.ass`), reelCaptions(scene, !!asset), { mode: 0o600 });
            await fs.mkdir(path.join(work, 'fonts'), { recursive: true });
            await fs.copyFile(font, path.join(work, 'fonts', 'DejaVuSans.ttf'));
            filters.push(`ass=filename=captions-${index}.ass:fontsdir=fonts`);
          }
          filters.push('format=yuv420p');
          args.push('-vf', filters.join(','), '-map', '0:v:0', '-map', audio, '-af', 'aresample=48000,apad', '-t', String(scene.duration), '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '22', '-threads', '2', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-ac', '2', '-ar', '48000', '-map_metadata', '-1', '-movflags', '+faststart', output);
          await run(ffmpeg, args, { signal, cwd: work }); parts.push(`file 'scene-${index}.mp4'`);
        }
        await fs.writeFile(path.join(work, 'concat.txt'), parts.join('\n'), { mode: 0o600 });
        const output = path.join(work, 'reels.mp4');
        await run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-f', 'concat', '-safe', '1', '-i', 'concat.txt', '-c', 'copy', '-map_metadata', '-1', '-movflags', '+faststart', output], { signal, cwd: work });
        const metadata = await probe(output, signal, work), expected = scenes.reduce((sum, scene) => sum + scene.duration, 0);
        if (metadata.codec_name !== 'h264' || metadata.width !== 1080 || metadata.height !== 1920 || !Number.isFinite(metadata.duration) || Math.abs(metadata.duration - expected) > 0.3) throw error('O MP4 gerado não corresponde ao Reels solicitado.');
        const stat = await fs.stat(output);
        if (stat.size < 24 || stat.size > MAX_OUTPUT) throw error('O arquivo gerado ultrapassou o tamanho permitido.');
        const bytes = await fs.readFile(output);
        if (bytes.subarray(4, 8).toString() !== 'ftyp') throw error('O arquivo gerado não é um MP4 válido.');
        return { bytes, mime: 'video/mp4', name: `${String(name).replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 80) || 'Reels'}.mp4`, width: 1080, height: 1920, duration: metadata.duration, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), loopedSourceIds: [...loopedSourceIds] };
      } catch (cause) {
        if (cause.state) throw cause;
        throw error(signal.aborted ? 'O vídeo excedeu o tempo de processamento disponível.' : 'Não foi possível concluir o Reels. Tente um pedido mais curto.');
      } finally {
        // work is always a freshly created directory under the OS temporary directory.
        await fs.rm(work, { recursive: true, force: true });
      }
    },
  };
}
