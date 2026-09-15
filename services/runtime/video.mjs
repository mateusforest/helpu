import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const MAX_BYTES = 50 * 1024 * 1024;
const MAX_DURATION = 120;
const MAX_SCENES = 32;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const clone = value => structuredClone(value);
const now = () => new Date().toISOString();
const n = value => Number(Number(value).toFixed(6));
const fail = (message, status = 400) => Object.assign(new Error(message), { status, statusCode: status });
const uuid = value => { if (!UUID.test(String(value))) throw fail('Identificador inválido.'); return String(value).toLowerCase(); };
const color = (value, fallback) => { if (value === undefined) return fallback; if (!/^#[0-9a-f]{6}$/i.test(value)) throw fail('Use uma cor hexadecimal com seis dígitos.'); return value.toLowerCase(); };
const textValue = (value, max = 500) => String(value ?? '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').slice(0, max);
const filterPath = file => file.replaceAll('\\', '/').replaceAll(':', '\\:').replaceAll("'", "'\\''");

const fileLocks = new Map();
async function fileLock(file, fn) {
  const previous = fileLocks.get(file) || Promise.resolve();
  const next = previous.catch(() => {}).then(fn); fileLocks.set(file, next);
  try { return await next; } finally { if (fileLocks.get(file) === next) fileLocks.delete(file); }
}
async function readJSON(file) { return fileLock(file, async () => { try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } }); }
async function atomicJSON(file, value) {
  return fileLock(file, async () => {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, JSON.stringify(value), { flag: 'wx', mode: 0o600 });
    for (let attempt = 0; ; attempt++) {
      try { await fs.rename(temporary, file); break; }
      catch (error) { if (!['EPERM', 'EACCES', 'EBUSY'].includes(error.code) || attempt >= 24) throw error; await new Promise(resolve => setTimeout(resolve, 20)); }
    }
  }
  finally { await fs.rm(temporary, { force: true }); }
  });
}
async function files(dir) { try { return await fs.readdir(dir); } catch (e) { if (e.code === 'ENOENT') return []; throw e; } }

export function runCommand(binary, args, { signal, timeout = 240_000, cwd } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { cwd, windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'], signal });
    let stdout = '', stderr = '', settled = false;
    const finish = (error, result) => { if (settled) return; settled = true; clearTimeout(timer); error ? reject(error) : resolve(result); };
    const timer = setTimeout(() => { child.kill('SIGKILL'); finish(fail('A exportação excedeu o tempo disponível.', 504)); }, timeout);
    child.stdout.on('data', data => { stdout = (stdout + data).slice(-1024 * 1024); });
    child.stderr.on('data', data => { stderr = (stderr + data).slice(-8192); });
    child.on('error', error => finish(error));
    child.on('close', code => code === 0 ? finish(null, { stdout, stderr }) : finish(fail('O processamento de vídeo não foi concluído.', 502)));
  });
}

async function probeFile(file, { ffprobePath, signal }) {
  const { stdout } = await runCommand(ffprobePath, ['-v', 'error', '-protocol_whitelist', 'file,pipe', '-show_entries', 'format=format_name,duration:stream=codec_type,codec_name,width,height', '-of', 'json', file], { signal, timeout: 30_000 });
  let parsed;
  try { parsed = JSON.parse(stdout); } catch { throw fail('Não foi possível verificar o vídeo.', 422); }
  const video = parsed.streams?.find(stream => stream.codec_type === 'video');
  const duration = Number(parsed.format?.duration);
  if (!video || !Number.isFinite(duration) || duration <= 0 || duration > 600 || !/\b(mp4|mov)\b/.test(parsed.format?.format_name || '') || video.width < 2 || video.height < 2 || video.width > 4096 || video.height > 4096) throw fail('Envie um vídeo MP4 válido de até dez minutos e resolução máxima de 4096 pixels.', 422);
  return { duration, width: video.width, height: video.height, codec: video.codec_name, audio: parsed.streams.some(stream => stream.codec_type === 'audio') };
}

function wrappedText(text) {
  // Explicit wrapping is shared with the preview; user text never becomes filter syntax.
  return text.split('\n').flatMap(line => {
    const words = line.split(/\s+/), lines = []; let current = '';
    for (const word of words) {
      const chunks = word.match(/.{1,20}/gu) || [''];
      for (const chunk of chunks) { if (current && current.length + chunk.length + 1 > 20) { lines.push(current); current = ''; } current += (current ? ' ' : '') + chunk; }
    }
    lines.push(current); return lines;
  }).join('\n');
}

async function defaultFont() {
  const fonts = process.platform === 'win32' ? ['C:/Windows/Fonts/segoeui.ttf', 'C:/Windows/Fonts/arial.ttf'] : ['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf'];
  for (const font of fonts) { try { await fs.access(font); return font; } catch {} }
  throw fail('Instale a fonte DejaVu Sans no servidor de vídeo.', 503);
}

async function defaultRender({ project, assets, outputFile, workDir, signal, ffmpegPath }) {
  const font = await defaultFont();
  const parts = [];
  for (const [index, scene] of project.scenes.entries()) {
    const segment = path.join(workDir, `scene-${index}.mp4`);
    const textFile = path.join(workDir, `text-${index}.txt`);
    await fs.writeFile(textFile, wrappedText(scene.text), { mode: 0o600 });
    const args = ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-threads', '2'];
    const filters = [];
    let audio;
    if (scene.sourceAssetId) {
      const asset = assets[scene.sourceAssetId];
      args.push('-protocol_whitelist', 'file,pipe', '-ss', String(n(scene.in)), '-t', String(n(scene.duration)), '-i', asset.file);
      filters.push(`scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=${scene.background.replace('#', '0x')},setsar=1,fps=30,setpts=PTS-STARTPTS`);
      if (asset.audio) audio = '0:a:0';
      else { args.push('-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo'); audio = '1:a:0'; }
    } else {
      args.push('-f', 'lavfi', '-i', `color=c=${scene.background.replace('#', '0x')}:s=1080x1920:r=30:d=${n(scene.duration)}`, '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo');
      audio = '1:a:0';
    }
    if (scene.text) {
      const y = scene.position === 'top' ? '192' : scene.position === 'bottom' ? 'h-th-192' : '(h-th)/2';
      const fadeTime = Math.min(0.3, scene.duration / 4);
      const alpha = scene.fade ? `:alpha='min(1,min(t/${n(fadeTime)},(${n(scene.duration)}-t)/${n(fadeTime)}))'` : '';
      filters.push(`drawtext=fontfile='${filterPath(font)}':textfile='${filterPath(textFile)}':expansion=none:fontcolor=${scene.textColor.replace('#', '0x')}:fontsize=48:line_spacing=14:x=(w-tw)/2:y=${y}${alpha}`);
    }
    filters.push('format=yuv420p');
    args.push('-vf', filters.join(','), '-map', '0:v:0', '-map', audio, '-af', 'aresample=48000,apad', '-t', String(n(scene.duration)), '-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-threads', '2', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-ac', '2', '-ar', '48000', '-map_metadata', '-1', '-movflags', '+faststart', segment);
    await runCommand(ffmpegPath, args, { signal, cwd: workDir });
    parts.push(`file 'scene-${index}.mp4'`);
  }
  await fs.writeFile(path.join(workDir, 'concat.txt'), parts.join('\n'), { mode: 0o600 });
  await runCommand(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-f', 'concat', '-safe', '1', '-i', 'concat.txt', '-c', 'copy', '-map_metadata', '-1', '-movflags', '+faststart', outputFile], { signal, cwd: workDir });
}

export async function createVideoService({ dataDir, ffmpegPath = 'ffmpeg', ffprobePath = 'ffprobe', render = defaultRender, probe = probeFile } = {}) {
  if (!dataDir) throw fail('Diretório persistente obrigatório.');
  const root = path.resolve(dataDir);
  await fs.mkdir(root, { recursive: true });
  const locks = new Map(), waiting = [];
  let active = null, stopped = false, pumpPromise = null;
  const at = (org, group, id, extension = 'json') => path.join(root, uuid(org), group, `${uuid(id)}.${extension}`);
  const lock = async (org, fn) => {
    org = uuid(org);
    const previous = locks.get(org) || Promise.resolve();
    const next = previous.catch(() => {}).then(fn); locks.set(org, next);
    try { return await next; } finally { if (locks.get(org) === next) locks.delete(org); }
  };
  const read = async (org, group, id) => { const value = await readJSON(at(org, group, id)); if (!value) throw fail('Registro não encontrado.', 404); return value; };
  const publicJob = job => { const { snapshot, requestHash, idempotencyHash, ...result } = job; return clone(result); };
  const assetsFor = async (org, scenes) => {
    const assets = {};
    for (const scene of scenes) if (scene.sourceAssetId && !assets[scene.sourceAssetId]) { const asset = await read(org, 'assets', scene.sourceAssetId); assets[asset.id] = { ...asset, file: at(org, 'assets', asset.id, 'mp4') }; }
    return assets;
  };
  const scenesFor = async (org, input) => {
    if (!Array.isArray(input) || !input.length || input.length > MAX_SCENES) throw fail(`Use de uma a ${MAX_SCENES} cenas.`);
    const ids = new Set(); let total = 0;
    const result = [];
    for (const item of input) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) throw fail('Cena inválida.');
      const id = item.id ? uuid(item.id) : randomUUID();
      if (ids.has(id)) throw fail('Cada cena precisa de um identificador diferente.'); ids.add(id);
      const scene = { id, duration: Number(item.duration ?? 5), text: textValue(item.text, 280), background: color(item.background, '#ffffff'), textColor: color(item.textColor, '#202020'), position: item.position || 'center', fade: item.fade !== false };
      if (String(item.text ?? '').length > 280 || wrappedText(scene.text).split('\n').length > 24) throw fail('Use até 280 caracteres e 24 linhas de texto por cena.');
      if (!['top', 'center', 'bottom'].includes(scene.position)) throw fail('Posição de texto inválida.');
      if (item.sourceAssetId) {
        const asset = await read(org, 'assets', uuid(item.sourceAssetId));
        const start = Number(item.in ?? 0), end = Number(item.out ?? Math.min(asset.duration, start + scene.duration));
        if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end > asset.duration + 0.03 || end <= start) throw fail('Intervalo de corte fora do vídeo.');
        Object.assign(scene, { sourceAssetId: asset.id, in: n(start), out: n(end), duration: n(end - start) });
      }
      if (!Number.isFinite(scene.duration) || scene.duration < 0.2 || scene.duration > 60) throw fail('Cada cena deve durar entre 0,2 e 60 segundos.');
      scene.duration = n(scene.duration); total += scene.duration; result.push(scene);
    }
    if (total > MAX_DURATION) throw fail(`O vídeo deve durar até ${MAX_DURATION} segundos.`);
    return result;
  };
  const saveProject = async (org, value) => { await atomicJSON(at(org, 'projects', value.id), value); return clone(value); };
  const operations = (scenes, ops) => {
    if (!Array.isArray(ops) || !ops.length || ops.length > 64) throw fail('Lista de alterações inválida.');
    const result = clone(scenes);
    for (const op of ops) {
      if (!op || !['add', 'update', 'remove', 'move'].includes(op.type)) throw fail('Alteração de cena inválida.');
      const index = op.type === 'add' ? -1 : result.findIndex(scene => scene.id === op.sceneId);
      if (op.type !== 'add' && index < 0) throw fail('Cena não encontrada.', 404);
      if (op.type === 'add') { const pos = op.index ?? result.length; if (!Number.isInteger(pos) || pos < 0 || pos > result.length) throw fail('Posição de cena inválida.'); result.splice(pos, 0, op.scene); }
      if (op.type === 'update') result[index] = { ...result[index], ...op.changes, id: result[index].id };
      if (op.type === 'remove') result.splice(index, 1);
      if (op.type === 'move') { if (!Number.isInteger(op.index) || op.index < 0 || op.index >= result.length) throw fail('Posição de cena inválida.'); const [scene] = result.splice(index, 1); result.splice(op.index, 0, scene); }
    }
    return result;
  };
  const processJob = async ({ org, id }) => {
    const job = await read(org, 'jobs', id);
    if (job.status !== 'queued') return;
    const controller = new AbortController(); active = { controller, org, id };
    job.status = 'running'; job.startedAt = now(); await atomicJSON(at(org, 'jobs', id), job);
    const workDir = path.join(root, uuid(org), 'work', uuid(id));
    const outputFile = at(org, 'outputs', id, 'mp4');
    try {
      await fs.mkdir(workDir, { recursive: true }); await fs.mkdir(path.dirname(outputFile), { recursive: true });
      const temporaryOutput = path.join(workDir, 'result.mp4');
      const assets = await assetsFor(org, job.snapshot.scenes);
      if (controller.signal.aborted) throw fail('Exportação interrompida. Solicite uma nova exportação.', 503);
      await render({ project: clone(job.snapshot), assets, outputFile: temporaryOutput, workDir, signal: controller.signal, ffmpegPath, ffprobePath });
      if (controller.signal.aborted) throw fail('Exportação interrompida. Solicite uma nova exportação.', 503);
      const verified = await probe(temporaryOutput, { ffprobePath, signal: controller.signal });
      if (verified.width !== 1080 || verified.height !== 1920 || verified.codec !== 'h264' || Math.abs(verified.duration - job.snapshot.duration) > 0.5) throw fail('O arquivo exportado não corresponde ao projeto.', 422);
      const bytes = await fs.readFile(temporaryOutput);
      if (bytes.length < 24 || bytes.length > 250 * 1024 * 1024 || bytes.toString('ascii', 4, 8) !== 'ftyp') throw fail('Arquivo MP4 exportado inválido.', 422);
      await fs.rename(temporaryOutput, outputFile);
      job.status = 'completed'; job.output = { name: `${job.snapshot.name.replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 80) || 'video'}.mp4`, mime: 'video/mp4', size: bytes.length, sha256: hash(bytes), duration: verified.duration, width: verified.width, height: verified.height };
      job.completedAt = now();
    } catch (error) {
      job.status = 'failed'; job.error = controller.signal.aborted ? 'Exportação interrompida. Solicite uma nova exportação.' : error.status ? error.message : 'O servidor não conseguiu exportar o vídeo. Verifique o serviço e tente novamente.'; job.completedAt = now();
    } finally {
      await atomicJSON(at(org, 'jobs', id), job);
      await fs.rm(workDir, { recursive: true, force: true }); active = null;
    }
  };
  const pump = () => {
    if (pumpPromise || stopped) return;
    pumpPromise = (async () => { while (waiting.length && !stopped) { const next = waiting.shift(); try { await processJob(next); } catch (error) { console.error('[video-export-storage]', error.code || error.name, error.syscall || ''); } } })().finally(() => { pumpPromise = null; if (waiting.length && !stopped) pump(); });
  };
  // Only this single runtime process should own this persistent data volume.
  for (const org of await files(root)) {
    if (!UUID.test(org)) continue;
    for (const file of await files(path.join(root, org, 'jobs'))) {
      if (!file.endsWith('.json') || !UUID.test(file.slice(0, -5))) continue;
      const job = await readJSON(path.join(root, org, 'jobs', file));
      if (job?.status === 'queued') waiting.push({ org, id: job.id });
      if (job?.status === 'running') { job.status = 'failed'; job.error = 'A exportação foi interrompida pela reinicialização do servidor. Solicite uma nova exportação.'; job.completedAt = now(); await atomicJSON(at(org, 'jobs', job.id), job); }
    }
  }
  pump();

  return {
    async capabilities() {
      let available = true, reason = null;
      try { await Promise.all([runCommand(ffmpegPath, ['-version'], { timeout: 15_000 }), runCommand(ffprobePath, ['-version'], { timeout: 15_000 }), defaultFont()]); } catch { available = false; reason = 'O servidor precisa de FFmpeg, FFprobe e fonte DejaVu Sans instalados.'; }
      return { available, reason, version: 1, editor: 'astra-cloud-storyboard', format: 'mp4', codec: 'h264', width: 1080, height: 1920, previewWidth: 540, previewHeight: 960, fps: 30, maxScenes: MAX_SCENES, maxDuration: MAX_DURATION, maxImportBytes: MAX_BYTES, features: ['text-scenes', 'text-fade', 'scene-reorder', 'import-mp4', 'trim', 'source-audio', 'export-mp4'], limitations: ['Sem geração de filmagens por IA.', 'Sem clonagem de voz, trilha automática, legendas por transcrição ou composição de logotipo.', 'Fonte instalada no servidor; não substitui a validação da identidade da marca.'] };
    },
    async list(org) {
      org = uuid(org); const result = [];
      for (const file of await files(path.join(root, org, 'projects'))) if (file.endsWith('.json') && UUID.test(file.slice(0, -5))) result.push(await readJSON(path.join(root, org, 'projects', file)));
      return result.filter(Boolean).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },
    async create(org, { name, scenes, sourceAsset } = {}) {
      return lock(org, async () => {
        let input = scenes;
        if (!input && sourceAsset) { const asset = await read(org, 'assets', typeof sourceAsset === 'string' ? sourceAsset : sourceAsset.id); input = [{ sourceAssetId: asset.id, in: 0, out: Math.min(asset.duration, 60), text: '' }]; }
        const normalized = await scenesFor(org, input || [{ duration: 5, text: '' }]);
        return saveProject(org, { id: randomUUID(), orgId: uuid(org), name: textValue(name || 'Meu vídeo', 100), revision: 1, width: 1080, height: 1920, fps: 30, scenes: normalized, duration: n(normalized.reduce((sum, scene) => sum + scene.duration, 0)), createdAt: now(), updatedAt: now() });
      });
    },
    async get(org, id) { return clone(await read(org, 'projects', id)); },
    async update(org, id, { expectedRevision, name, scenes, operations: ops } = {}) {
      return lock(org, async () => {
        const project = await read(org, 'projects', id);
        if (!Number.isInteger(expectedRevision) || expectedRevision !== project.revision) throw fail('O projeto foi alterado. Atualize a tela antes de salvar.', 409);
        if (scenes !== undefined && ops !== undefined) throw fail('Envie cenas ou operações, separadamente.');
        project.scenes = await scenesFor(org, scenes ?? (ops ? operations(project.scenes, ops) : project.scenes));
        if (name !== undefined) project.name = textValue(name, 100) || 'Meu vídeo';
        project.duration = n(project.scenes.reduce((sum, scene) => sum + scene.duration, 0)); project.revision++; project.updatedAt = now();
        return saveProject(org, project);
      });
    },
    async export(org, id, { revision, idempotencyKey } = {}) {
      return lock(org, async () => {
        if (stopped) throw fail('Servidor de vídeo em reinicialização.', 503);
        if (typeof idempotencyKey !== 'string' || idempotencyKey.length < 8 || idempotencyKey.length > 200) throw fail('Chave de exportação inválida.');
        const project = await read(org, 'projects', id);
        const idempotencyHash = hash(idempotencyKey), requestHash = hash(JSON.stringify({ projectId: id, revision }));
        for (const file of await files(path.join(root, uuid(org), 'jobs'))) {
          if (!file.endsWith('.json') || !UUID.test(file.slice(0, -5))) continue;
          const prior = await readJSON(path.join(root, uuid(org), 'jobs', file));
          if (prior.idempotencyHash === idempotencyHash) { if (prior.requestHash !== requestHash) throw fail('Essa chave já foi usada para outra exportação.', 409); return publicJob(prior); }
        }
        if (!Number.isInteger(revision) || revision !== project.revision) throw fail('Atualize o projeto antes de exportar.', 409);
        const record = { id: randomUUID(), orgId: uuid(org), projectId: project.id, revision, status: 'queued', createdAt: now(), snapshot: clone(project), requestHash, idempotencyHash };
        await atomicJSON(at(org, 'jobs', record.id), record); waiting.push({ org: uuid(org), id: record.id }); pump(); return publicJob(record);
      });
    },
    async job(org, id) { return publicJob(await read(org, 'jobs', id)); },
    async output(org, id) {
      const job = await read(org, 'jobs', id);
      if (job.status !== 'completed' || !job.output) throw fail('O vídeo ainda não está disponível.', 409);
      const file = at(org, 'outputs', id, 'mp4');
      let bytes; try { bytes = await fs.readFile(file); } catch { throw fail('Arquivo de vídeo indisponível.', 404); }
      if (bytes.length !== job.output.size || hash(bytes) !== job.output.sha256) throw fail('A verificação do arquivo de vídeo falhou.', 409);
      return { file, ...clone(job.output) };
    },
    async importAsset(org, { id, name, bytes } = {}) {
      return lock(org, async () => {
        org = uuid(org); id = id ? uuid(id) : randomUUID();
        if (!Buffer.isBuffer(bytes) && !(bytes instanceof Uint8Array)) throw fail('Arquivo MP4 obrigatório.');
        bytes = Buffer.from(bytes);
        if (bytes.length < 24 || bytes.length > MAX_BYTES || bytes.toString('ascii', 4, 8) !== 'ftyp') throw fail('Envie um arquivo MP4 de até 50 MB.', 422);
        const digest = hash(bytes), existing = await readJSON(at(org, 'assets', id));
        if (existing) { if (existing.sha256 !== digest) throw fail('Esse arquivo já existe com outro conteúdo.', 409); return clone(existing); }
        const file = at(org, 'assets', id, 'mp4');
        await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, bytes, { flag: 'wx', mode: 0o600 });
        try {
          const verified = await probe(file, { ffprobePath });
          const asset = { id, name: textValue(path.basename(String(name || 'video.mp4')), 100), mime: 'video/mp4', size: bytes.length, sha256: digest, ...verified, createdAt: now() };
          await atomicJSON(at(org, 'assets', id), asset); return clone(asset);
        } catch (error) { await fs.rm(file, { force: true }); throw error; }
      });
    },
    async shutdown() { stopped = true; active?.controller.abort(); if (pumpPromise) await pumpPromise; },
  };
}
