import fs from 'node:fs/promises';
import {spawn} from 'node:child_process';
const fail=message=>{console.error(message);process.exit(1);};
if(process.getuid?.()===0)fail('Execute o serviço de vídeo sem root.');
for(const key of ['HELPU_RUNTIME_SECRET','CRON_SECRET'])if(String(process.env[key]||'').length<32)fail('Configure '+key+' com pelo menos 32 caracteres.');
try{const u=new URL(process.env.HELPU_PUBLIC_URL);if(u.protocol!=='https:'||u.username||u.password||u.pathname!=='/'||u.search||u.hash)throw Error();}catch{fail('HELPU_PUBLIC_URL deve ser a origem HTTPS do painel.');}
process.env.HELPU_RUNTIME_MODE='video';
const dir=process.env.HELPU_RUNTIME_DATA||'/data';
try{await fs.mkdir(dir,{recursive:true,mode:0o700});await fs.access(dir,fs.constants.W_OK);}catch{fail('O volume persistente precisa permitir escrita pelo usuário node.');}
const binary=name=>new Promise(resolve=>{const p=spawn(name,['-version'],{stdio:'ignore'});p.on('error',()=>resolve(false));p.on('exit',c=>resolve(c===0));});
if(!await binary('ffmpeg')||!await binary('ffprobe'))fail('FFmpeg ou FFprobe não está disponível.');
await fs.access('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf').catch(()=>fail('Fonte DejaVu indisponível.'));
const child=spawn(process.execPath,['/app/services/runtime/server.mjs'],{stdio:'inherit'});
for(const sig of ['SIGTERM','SIGINT'])process.on(sig,()=>child.kill(sig));
child.on('error',()=>fail('Não foi possível iniciar o vídeo.'));
child.on('exit',(code,signal)=>process.exit(Number.isInteger(code)?code:signal==='SIGTERM'?0:1));
