import fs from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright-core';

function fail(message){process.stderr.write(message+'\n');process.exit(1);}
if(process.versions.node.split('.')[0]!=='22')fail('O runtime requer Node 22.');
if(process.getuid?.()===0)fail('O navegador deve executar como pwuser, sem root.');
if(String(process.env.HELPU_RUNTIME_SECRET||'').length<32||String(process.env.CRON_SECRET||'').length<32)fail('Configure segredos de runtime e worker com pelo menos 32 caracteres.');
try{const u=new URL(process.env.HELPU_PUBLIC_URL);if(u.protocol!=='https:'||u.username||u.password||u.pathname!=='/'||u.search||u.hash)throw Error();}catch{fail('HELPU_PUBLIC_URL deve ser a origem HTTPS da Helpu.');}
try{const marker=JSON.parse(await fs.readFile('/run/helpu-firewall/ready','utf8'));if(marker.runtimeIp!==process.env.HELPU_RUNTIME_IP||marker.version!==1)throw Error();}catch{fail('Aplique o firewall pelo serviço systemd antes de iniciar o runtime.');}
await fs.mkdir(process.env.HOME,{recursive:true,mode:0o700});
await fs.access('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf').catch(()=>fail('A fonte DejaVu não está instalada.'));
async function binary(name){return new Promise(resolve=>{const p=spawn(name,['-version'],{stdio:'ignore'});p.on('error',()=>resolve(false));p.on('exit',code=>resolve(code===0));});}
if(!await binary('ffmpeg')||!await binary('ffprobe'))fail('FFmpeg e FFprobe precisam estar instalados.');
let browser;
try{browser=await chromium.launch({headless:true,chromiumSandbox:true,args:['--disable-background-networking','--disable-quic','--force-webrtc-ip-handling-policy=disable_non_proxied_udp']});await browser.close();}catch{if(browser)await browser.close().catch(()=>{});fail('Chromium com sandbox não iniciou. Confira seccomp e suporte a user namespaces do host.');}
const child=spawn(process.execPath,['/app/services/runtime/server.mjs'],{stdio:'inherit'});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
child.on('error',()=>fail('Não foi possível iniciar o serviço da Helpu.'));
child.on('exit',(code,signal)=>process.exit(Number.isInteger(code)?code:signal==='SIGTERM'?0:1));
