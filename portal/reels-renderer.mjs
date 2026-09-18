import {normalizeVideoOptions,dimensions} from './video-styles.mjs';
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

function wrap(text,columns=26) {
  return text.split('\n').flatMap(line => {
    const lines = []; let current = '';
    for (const word of line.split(/\s+/)) for (const chunk of word.match(new RegExp('.{1,'+columns+'}','gu')) || ['']) {
      if (current && current.length + chunk.length + 1 > columns) { lines.push(current); current = ''; }
      current += (current ? ' ' : '') + chunk;
    }
    lines.push(current); return lines;
  }).join('\n');
}

export function reelCaptions(scene, hasMedia = false, rawOptions = {}) {
  const opts=normalizeVideoOptions(rawOptions),{width,height}=dimensions(opts);
  const family={sans:'DejaVu Sans',serif:'DejaVu Serif',condensed:'DejaVu Sans'}[opts.font];
  const end = `0:00:${scene.duration.toFixed(2).padStart(5, '0')}`;
  const color = scene.textColor.slice(1).match(/../g).reverse().join('');
  // User text must not become ASS override tags or line-control sequences.
  const columns=Math.max(14,Math.min(44,Math.floor((width-200)/(opts.fontSize*0.6))));
  const text = wrap(scene.text,columns).replaceAll('\\', '＼').replaceAll('{', '｛').replaceAll('}', '｝').replaceAll('\n', '\\N');
  const alignment = { top: 8, center: 5, bottom: 2 }[scene.position];
  const fade = scene.fade ? `{\\fad(${Math.round(Math.min(0.3, scene.duration / 4) * 1000)},${Math.round(Math.min(0.3, scene.duration / 4) * 1000)})}` : '';
  const y=scene.position==='top'?(height===1080?110:240):scene.position==='bottom'?height-(height===1080?110:320):height/2;
  const entrance=opts.textAnimation==='rise'?`{\\move(${width/2},${y+45},${width/2},${y},0,450)}`:opts.textAnimation==='pop'?'{\\fscx85\\fscy85\\t(0,280,\\fscx100\\fscy100)}':'';
  const accent=opts.accent.slice(1).match(/../g).reverse().join('');
  const rgb=scene.textColor.slice(1).match(/../g).map(x=>parseInt(x,16));
  const backing=rgb[0]*0.2126+rgb[1]*0.7152+rgb[2]*0.0722<140?'&H30FFFFFF':'&H40000000';
  const colored=text.replace(/(\S+)$/,`{\\c&H${accent}&}$1`);
  let events=`Dialogue: 0,0:00:00.00,${end},Default,,0,0,0,,${fade}${entrance}${colored}`;
  if(opts.textAnimation==='words'){
    const words=text.split(/\s+|\\N/).filter(Boolean),step=Math.min(0.32,scene.duration/Math.max(2,words.length+2));
    events=words.map((_,i)=>{
      const at=(i*step).toFixed(2).padStart(5,'0'),until=i===words.length-1?scene.duration:(i+1)*step;
      const line=wrap(words.slice(0,i+1).join(' '),columns).replaceAll('\n','\\N').replace(/(\S+)$/,`{\\c&H${accent}&}$1{\\c&H${color}&}`);
      return `Dialogue: 0,0:00:${at},0:00:${until.toFixed(2).padStart(5,'0')},Default,,0,0,0,,${line}`;
    }).join('\n');
  }
  return `[Script Info]
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}
WrapStyle: 2
[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${family},${opts.fontSize},&H00${color},&H00${color},${backing},${backing},0,0,0,0,${opts.font==='condensed'?80:100},100,0,0,${hasMedia ? 3 : 1},${hasMedia ? 12 : 0},0,${alignment},70,70,${height===1080?110:scene.position === 'bottom' ? 320 : 240},1
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${events}
`;
}

// Only fixed labels and bounded numeric values leave the renderer. Never retain
// stderr: it may contain user captions, file names, or private media paths.
export function reelProcessDiagnostic(stderr, { code = null, stage = '', aborted = false, signal = null } = {}) {
  const text=String(stderr||'');
  const categories=[
    ['missing_filter', /No such filter/i],
    ['font_error', /Error loading.*font|fontselect.*failed/i],
    ['invalid_media', /Invalid data found/i],
    ['resource_limit', /pthread_create|Resource temporarily unavailable|Cannot allocate memory|out of memory/i],
    ['frame_rate_mismatch', /frame rate|frame_rate|framerate|constant frame rate/i],
    ['timeline_mismatch', /timebase|time base/i],
    ['dimensions_mismatch', /do not match.*(width|height|size)|parameters.*do not match|size.*does not match/i],
    ['pixel_format_mismatch', /pixel format|pix_fmt/i],
    ['invalid_filter_configuration', /Invalid argument|Error initializing|Failed to configure/i],
  ];
  const category=categories.find(([,pattern])=>pattern.test(text))?.[0]||'process_failed';
  const filters=['xfade','acrossfade','auto_scale','scale','fps','settb','setpts','format','ass','aresample','apad','atrim','amix','alimiter'].filter(name=>new RegExp('(?:Parsed_|\\b)'+name+'(?:_\\d+|\\b)').test(text));
  const safeStage=/^(?:scene-\d+|reels|effects|mixed|preview)\.mp4$/.test(stage)?stage:'media-check';
  return {code:Number.isInteger(code)?code:null,category,stage:safeStage,aborted:aborted===true,signal:['SIGKILL','SIGTERM','SIGABRT','SIGSEGV'].includes(signal)?signal:null,filters};
}

async function run(binary, args, { signal, cwd }) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { windowsHide: true, shell: false, cwd, signal, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', data => { output = (output + data).slice(-1024 * 1024); });
    let diagnostic = '';
    child.stderr.on('data', data => { diagnostic = (diagnostic + data).slice(-8192); });
    child.on('error', () => reject(error(signal.aborted ? 'O vídeo excedeu o tempo de processamento disponível.' : 'Não foi possível iniciar o processamento do vídeo.')));
    child.on('close', (code, terminationSignal) => {
      if (code === 0) return resolve(output);
      const processDiagnostic=reelProcessDiagnostic(diagnostic,{code,stage:path.basename(String(args.at(-1))),aborted:signal.aborted,signal:terminationSignal});
      console.error('helpu_reels_process_failed',processDiagnostic);
      reject(Object.assign(error(signal.aborted ? 'O vídeo excedeu o tempo de processamento disponível.' : 'Não foi possível concluir o processamento do vídeo.'),{processDiagnostic}));
    });
  });
}

export function createReelsRenderer({ env = process.env, ffmpegPath, ffprobePath, fontPath, timeoutMs = 140000, previewThresholdBytes = 15 * 1024 * 1024 } = {}) {
  const ffmpeg = ffmpegPath || env.HELPU_FFMPEG_PATH || packageFile('ffmpeg-static', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
  const ffprobe = ffprobePath || env.HELPU_FFPROBE_PATH || packageFile('@ffprobe-installer/linux-x64', 'ffprobe');
  const font = fontPath || env.HELPU_VIDEO_FONT_PATH || packageFile('dejavu-fonts-ttf', 'ttf/DejaVuSans.ttf');
  const configured = () => !!(ffmpeg && ffprobe && font && [ffmpeg, ffprobe, font].every(existsSync));
  const probe = async (file, signal, cwd) => {
    const raw = await run(ffprobe, ['-v', 'error', '-protocol_whitelist', 'file,pipe', '-show_entries', 'format=duration,format_name:stream=codec_type,codec_name,width,height', '-of', 'json', file], { signal, cwd });
    let result; try { result = JSON.parse(raw); } catch { throw error('O arquivo de vídeo não passou pela verificação.'); }
    const video = result.streams?.find(item => item.codec_type === 'video');
    if (!video && result.streams?.some(item=>item.codec_type==='audio')) return {audio:true,format:result.format?.format_name,duration:Number(result.format?.duration)};
    if (!video || video.width < 2 || video.height < 2 || video.width * video.height > 16000000) throw error('Use uma mídia válida de até 16 megapixels.');
    return { ...video, format:result.format?.format_name, duration: Number(result.format?.duration), audio: result.streams.some(item => item.codec_type === 'audio') };
  };
  const validateAssets = assets => {
    if (!Array.isArray(assets) || assets.length > 8) throw error('Use até oito arquivos no Reels.');
    let totalBytes = 0; const byId = new Map();
    for (const asset of assets) {
      if (!asset?.id || byId.has(String(asset.id)) || !Buffer.isBuffer(asset.bytes) || !asset.bytes.length || !['video/mp4', 'image/png', 'image/jpeg', 'image/webp','audio/mpeg','audio/wav','audio/ogg'].includes(asset.mime)) throw error('Arquivo de referência inválido.');
      totalBytes += asset.bytes.length; byId.set(String(asset.id), asset);
    }
    if (totalBytes > MAX_ASSETS) throw error('Os arquivos do Reels devem somar até 30 MB.');
    return byId;
  };
  const inspectAsset = async (asset, file, signal, work) => {
    await fs.writeFile(file, asset.bytes, { mode: 0o600 });
    const meta = await probe(file, signal, work);
    if(asset.mime.startsWith('audio/')) {if(!meta.audio||meta.format!=={'audio/mpeg':'mp3','audio/wav':'wav','audio/ogg':'ogg'}[asset.mime]||!Number.isFinite(meta.duration)||meta.duration<=0||meta.duration>600)throw error('Use MP3, WAV ou OGG válido de até dez minutos.');return meta;}
    if (asset.mime === 'video/mp4' ? !Number.isFinite(meta.duration) || meta.duration <= 0 || meta.duration > 600 || asset.bytes.subarray(4, 8).toString() !== 'ftyp' : !['png', 'mjpeg', 'webp'].includes(meta.codec_name)) throw error('A referência não corresponde a uma imagem ou vídeo compatível.');
    return meta;
  };
  return {
    configured,
    capabilities: () => ({ available: configured(), provider: 'astra-reels', width: 1080, height: 1920, maxDuration: 30, maxScenes: 8, features: ['text-scenes', 'image-backgrounds', 'image-motion', 'import-mp4', 'trim', 'loop-source', 'source-audio', 'export-mp4','landscape','music-upload','animated-type','smooth-transitions','visual-reference-sampling'], limitations: ['Sem geração de filmagens, voz ou música por IA.'] }),
    async preflight({ assets = [] } = {}) {
      const byId = validateAssets(assets);
      if (!byId.size) return [];
      if (!configured()) throw error('O processamento de vídeo não foi incluído nesta versão do servidor. Atualize a implantação da Helpu.');
      const work = await fs.mkdtemp(path.join(os.tmpdir(), 'helpu-reels-check-'));
      const signal = AbortSignal.timeout(15000), result = [];
      try {
        for (const [id, asset] of byId) {
          const meta = await inspectAsset(asset, path.join(work, `asset-${result.length}`), signal, work);
          result.push({ id, mime: asset.mime, width: meta.width, height: meta.height, duration: (asset.mime === 'video/mp4'||asset.mime.startsWith('audio/')) ? meta.duration : null, audio: meta.audio });
        }
        return result;
      } finally { await fs.rm(work, { recursive: true, force: true }); }
    },
    async sampleReferences({assets=[]}={}){
      const byId=validateAssets(assets),work=await fs.mkdtemp(path.join(os.tmpdir(),'helpu-reference-')),signal=AbortSignal.timeout(45000),result=[];
      try{
        for(const [id,asset] of byId){
          if(asset.mime.startsWith('audio/'))continue;
          const file=path.join(work,`input-${result.length}`),meta=await inspectAsset(asset,file,signal,work);
          const times=asset.mime==='video/mp4'?[Math.min(0.5,meta.duration/4),meta.duration*0.55]:[0];
          for(const time of times){const out=path.join(work,`frame-${result.length}.jpg`);await run(ffmpeg,['-v','error','-y','-protocol_whitelist','file,pipe','-ss',String(time),'-i',file,'-frames:v','1','-vf','scale=512:512:force_original_aspect_ratio=decrease','-q:v','4',out],{signal,cwd:work});result.push({id,time,duration:meta.duration||null,image:'data:image/jpeg;base64,'+(await fs.readFile(out)).toString('base64')});}
        }
        return result;
      }finally{await fs.rm(work,{recursive:true,force:true});}
    },
    async render({ scenes: input, assets = [], name = 'Reels', options } = {}) {
      const opts=normalizeVideoOptions(options||{transition:'cut'}),{width,height}=dimensions(opts);
      const scenes = normalizeReelScenes(input);
      const expected = round(scenes.reduce((sum, scene) => sum + scene.duration, 0));
      const overlap=opts.transition==='cut'?0:Math.min(0.35,...scenes.map(s=>s.duration/2));
      if (!configured()) throw error('O processamento de vídeo não foi incluído nesta versão do servidor. Atualize a implantação da Helpu.');
      const byId = validateAssets(assets);
      for (const scene of scenes) if (scene.sourceAssetId && (!byId.has(scene.sourceAssetId)||byId.get(scene.sourceAssetId).mime.startsWith('audio/'))) throw error('Uma referência de mídia desta cena não está disponível.');
      const work = await fs.mkdtemp(path.join(os.tmpdir(), 'helpu-reels-'));
      const signal = AbortSignal.timeout(Math.max(1000, Math.min(timeoutMs, 140000)));
      try {
        const imported = new Map();
        for (const [id, asset] of byId) {
          const file = path.join(work, `asset-${imported.size}.${asset.mime === 'video/mp4' ? 'mp4' : asset.mime.split('/')[1]}`);
          const meta = await inspectAsset(asset, file, signal, work);
          imported.set(id, { ...meta, file, mime: asset.mime });
        }
        await fs.mkdir(path.join(work,'fonts'),{recursive:true});
        for(const file of ['DejaVuSans.ttf','DejaVuSerif.ttf','DejaVuSans-Bold.ttf']){const source=packageFile('dejavu-fonts-ttf','ttf/'+file);if(source&&existsSync(source))await fs.copyFile(source,path.join(work,'fonts',file));}
        const parts = [], loopedSourceIds = new Set();
        for (const [index, scene] of scenes.entries()) {
          signal.throwIfAborted();
          const output = path.join(work, `scene-${index}.mp4`);
          const args = ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-threads', '2', '-filter_threads', '1'];
          const filters = [];
          const asset = scene.sourceAssetId && imported.get(scene.sourceAssetId);
          const extra=index<scenes.length-1?overlap:0,partDuration=scene.duration+extra;
          let audio = '1:a:0';
          if (asset?.mime === 'video/mp4') {
            if (scene.in + scene.duration > asset.duration + 0.05) {
              if (!scene.loopSource || scene.in !== 0) throw error('O corte solicitado ultrapassa a duração do vídeo enviado. Para repetir a referência inteira, autorize loopSource com início zero.');
              args.push('-stream_loop', '-1'); loopedSourceIds.add(scene.sourceAssetId);
            }
            args.push('-protocol_whitelist', 'file,pipe', '-ss', String(scene.in), '-t', String(scene.duration), '-i', asset.file);
            filters.push(`${opts.fit==='cover'?`scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`:`scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=${scene.background.replace('#','0x')}`},setsar=1,fps=30,setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration=${extra}`);
            if(opts.motion!=='none'){
              const p=`min(1,on/${Math.max(1,Math.round(partDuration*30)-1)})`,e=`(${p})*(${p})*(3-2*(${p}))`;
              const z=opts.motion==='pan'?'1.10':opts.motion==='zoom-out'?`1.10-0.10*(${e})`:`1+0.10*(${e})`;
              filters.push(`zoompan=z='${z}':x='${opts.motion==='pan'?`(iw-iw/zoom)*(${e})`:'iw/2-iw/zoom/2'}':y='ih/2-ih/zoom/2':d=1:s=${width}x${height}:fps=30`);
            }
            if (asset.audio) audio = '0:a:0'; else args.push('-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo');
          } else if (asset) {
            args.push('-protocol_whitelist', 'file,pipe', '-loop', '1', '-framerate', '30', '-i', asset.file, '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo');
            const progress=`min(1,on/${Math.max(1,Math.round(partDuration*30)-1)})`,ease=`(${progress})*(${progress})*(3-2*(${progress}))`;
            const zoom=opts.motion==='none'?'1':opts.motion==='pan'?'1.12':opts.motion==='zoom-out'?`1.10-0.10*(${ease})`:`1+0.10*(${ease})`;
            const x=opts.motion==='pan'?`(iw-iw/zoom)*(${ease})`:'iw/2-iw/zoom/2';
            const layout=opts.fit==='contain'?`scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=${scene.background.replace('#','0x')}`:`scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`;
            filters.push(`${layout},zoompan=z='${zoom}':x='${x}':y='ih/2-ih/zoom/2':d=1:s=${width}x${height}:fps=30,setsar=1`);
          } else {
            args.push('-f', 'lavfi', '-i', `color=c=${scene.background.replace('#', '0x')}:s=${width}x${height}:r=30:d=${partDuration}`, '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo');
          }
          if (scene.text) {
            await fs.writeFile(path.join(work, `captions-${index}.ass`), reelCaptions({...scene,duration:partDuration}, !!asset,opts), { mode: 0o600 });
            await fs.mkdir(path.join(work, 'fonts'), { recursive: true });
            await fs.copyFile(font, path.join(work, 'fonts', 'DejaVuSans.ttf'));
            filters.push(`ass=filename=captions-${index}.ass:fontsdir=fonts`);
          }
          filters.push('format=yuv420p');
          args.push('-vf', filters.join(','), '-map', '0:v:0', '-map', audio, '-af', `aresample=48000,apad,volume=${opts.sourceAudio?1:0}`, '-t', String(partDuration), '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', opts.quality==='high'?'18':'23', '-threads', '2', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-ac', '2', '-ar', '48000', '-map_metadata', '-1', '-movflags', '+faststart', output);
          await run(ffmpeg, args, { signal, cwd: work }); parts.push(`file 'scene-${index}.mp4'`);
        }
        await fs.writeFile(path.join(work, 'concat.txt'), parts.join('\n'), { mode: 0o600 });
        let output = path.join(work, 'reels.mp4');
        if(overlap&&scenes.length>1){
          const args=['-v','error','-y','-threads','2','-filter_complex_threads','1'];for(let i=0;i<scenes.length;i++)args.push('-threads','2','-i',`scene-${i}.mp4`);
          // MP4 edit lists, AAC priming and source frame rates can leave different
          // clocks on the segments. Normalize both tracks before combining them.
          const filters=[];
          for(let i=0;i<scenes.length;i++){
            const duration=round(scenes[i].duration+(i<scenes.length-1?overlap:0));
            filters.push(`[${i}:v]fps=30,settb=AVTB,setpts=PTS-STARTPTS[clipv${i}]`,`[${i}:a]aresample=48000,apad,atrim=duration=${duration},asetpts=PTS-STARTPTS[clipa${i}]`);
          }
          let video='clipv0',audio='clipa0',offset=0;
          for(let i=1;i<scenes.length;i++){offset=round(offset+scenes[i-1].duration);filters.push(`[${video}][clipv${i}]xfade=transition=${opts.transition}:duration=${overlap}:offset=${offset}[v${i}]`,`[${audio}][clipa${i}]acrossfade=d=${overlap}[a${i}]`);video=`v${i}`;audio=`a${i}`;}
          args.push('-filter_complex',filters.join(';'),'-map',`[${video}]`,'-map',`[${audio}]`,'-r','30','-fps_mode','cfr','-t',String(expected),'-c:v','libx264','-preset','ultrafast','-crf',opts.quality==='high'?'18':'23','-threads','2','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-movflags','+faststart',output);
          await run(ffmpeg,args,{signal,cwd:work});
        }else await run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-f', 'concat', '-safe', '1', '-i', 'concat.txt', '-c', 'copy', '-t', String(expected), '-map_metadata', '-1', '-movflags', '+faststart', output], { signal, cwd: work });
        if(opts.soundEffects==='subtle'&&scenes.length>1){
          const filters=[],labels=[];let at=0;
          for(let i=0;i<scenes.length-1;i++){
            at+=scenes[i].duration;const delay=Math.max(0,Math.round((at-0.1)*1000));
            filters.push(`anoisesrc=color=pink:duration=0.35:sample_rate=48000:seed=42,highpass=f=500,lowpass=f=4500,afade=t=in:d=0.08,afade=t=out:st=0.1:d=0.25,volume=0.09,adelay=${delay}|${delay}[s${i}]`);labels.push(`[s${i}]`);
          }
          filters.push(`[0:a]${labels.join('')}amix=inputs=${labels.length+1}:duration=first:normalize=0,alimiter=limit=0.95[a]`);
          const withEffects=path.join(work,'effects.mp4');
          await run(ffmpeg,['-v','error','-y','-i',output,'-filter_complex',filters.join(';'),'-map','0:v','-map','[a]','-t',String(expected),'-c:v','copy','-c:a','aac','-b:a','192k','-movflags','+faststart',withEffects],{signal,cwd:work});output=withEffects;
        }
        if(opts.musicAssetId){
          const music=imported.get(opts.musicAssetId);if(!music?.audio||!(music.mime.startsWith('audio/')||music.mime==='video/mp4'))throw error('Escolha um áudio ou um vídeo com faixa de áudio para a trilha.');
          const mixed=path.join(work,'mixed.mp4'),duration=scenes.reduce((n,s)=>n+s.duration,0);
          await run(ffmpeg,['-v','error','-y','-i',output,'-stream_loop','-1','-protocol_whitelist','file,pipe','-i',music.file,'-filter_complex',`[1:a]volume=${opts.musicVolume},afade=t=in:d=0.5,afade=t=out:st=${Math.max(0,duration-1)}:d=1[m];[0:a][m]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95[a]`,'-map','0:v','-map','[a]','-c:v','copy','-c:a','aac','-b:a','192k','-t',String(duration),'-movflags','+faststart',mixed],{signal,cwd:work});output=mixed;
        }
        const metadata = await probe(output, signal, work);
        if (metadata.codec_name !== 'h264' || metadata.width !== width || metadata.height !== height || !Number.isFinite(metadata.duration) || Math.abs(metadata.duration - expected) > 0.3) {
          console.error('helpu_reels_validation_failed', {expected:{width,height,duration:expected},actual:{codec:metadata.codec_name,width:metadata.width,height:metadata.height,duration:metadata.duration}});
          throw error('O MP4 gerado não corresponde ao Reels solicitado.');
        }
        const stat = await fs.stat(output);
        if (stat.size < 24 || stat.size > MAX_OUTPUT) throw error('O arquivo gerado ultrapassou o tamanho permitido.');
        const bytes = await fs.readFile(output);
        if (bytes.subarray(4, 8).toString() !== 'ftyp') throw error('O arquivo gerado não é um MP4 válido.');
        let previewBytes;
        if(bytes.length>Math.max(1,Math.min(previewThresholdBytes,15*1024*1024))){
          const preview=path.join(work,'preview.mp4'),size=width>height?'1280:720':'720:1280';
          await run(ffmpeg,['-v','error','-y','-i',output,'-vf','scale='+size,'-r','24','-c:v','libx264','-preset','ultrafast','-crf','26','-maxrate','2200k','-bufsize','4400k','-threads','2','-c:a','aac','-b:a','96k','-movflags','+faststart',preview],{signal,cwd:work});
          const checked=await probe(preview,signal,work);previewBytes=await fs.readFile(preview);
          if(checked.codec_name!=='h264'||checked.width!==(width>height?1280:720)||checked.height!==(width>height?720:1280)||!Number.isFinite(checked.duration)||previewBytes.length>16*1024*1024||Math.abs(checked.duration-expected)>0.3)throw error('A prévia não passou pela verificação.');
        }
        return { bytes, previewBytes, mime: 'video/mp4', name: `${String(name).replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 80) || 'Reels'}.mp4`, width, height, duration: metadata.duration, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), loopedSourceIds: [...loopedSourceIds] };
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
