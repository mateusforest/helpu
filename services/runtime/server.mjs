import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {timingSafeEqual} from 'node:crypto';
import {createBrowserService} from './browser.mjs';
import {createVideoService} from './video.mjs';

const uuid=/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const id=value=>uuid.test(String(value||''))?value:fail('Identificador inválido.');
async function read(req,limit){const chunks=[];let size=0;for await(const b of req){size+=b.length;if(size>limit)fail('Envio excede o limite.',413);chunks.push(b);}return Buffer.concat(chunks);}
async function input(req){try{const value=JSON.parse((await read(req,262144)).toString('utf8'));if(!value||typeof value!=='object'||Array.isArray(value))fail('Dados inválidos.');return value;}catch(e){if(e.status)throw e;fail('Dados inválidos.');}}
const json=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));};

export function createRuntimeServer({secret,browser,video,worker={status:()=>({configured:false})}}){
  if(String(secret||'').length<32)throw new Error('HELPU_RUNTIME_SECRET deve ter pelo menos 32 caracteres.');
  const expected=Buffer.from('Bearer '+secret);
  return http.createServer(async(req,res)=>{
    try{
      const token=Buffer.from(String(req.headers.authorization||''));
      if(token.length!==expected.length||!timingSafeEqual(token,expected))fail('Acesso não autorizado.',401);
      const org=id(req.headers['x-helpu-company']),actor=String(req.headers['x-helpu-actor']||''),job=req.headers['x-helpu-job'];
      const parts=new URL(req.url,'http://runtime.invalid').pathname.split('/').filter(Boolean),[version,group,target,action,extra]=parts;
      if(version!=='v1'||parts.length>6)fail('Recurso não encontrado.',404);
      const human=()=>{if(!/^[A-Za-z0-9_-]{1,80}$/.test(actor))fail('Usuário autenticado obrigatório.',403);return actor;};
      let value;
      if(group==='status'&&!target&&req.method==='GET'){const bc=await browser.capabilities?.(),vc=await video.capabilities?.();value={protocol:1,browser:bc===true||bc?.available===true,video:vc===true||vc?.available===true,videoCapabilities:vc,worker:worker.status()};}
      else if(group==='browser'){
        if(!target&&req.method==='GET')value={profiles:await browser.list(org,actor||undefined)};
        else if(target==='release'&&req.method==='POST'){await input(req);await browser.release(id(job));value={ok:true};}
        else if(target==='assets'&&action&&req.method==='PUT')value=await browser.importAsset(org,{id:id(action),name:decodeURIComponent(req.headers['x-helpu-filename']||'arquivo'),bytes:await read(req,50*1024*1024)});
        else{
          if(!['instagram','whatsapp','facebook','google'].includes(target))fail('Canal indisponível.',404);
          if(req.method==='GET'&&action==='frame')value=await browser.frame(org,target,human());
          else if(req.method==='GET'&&action==='observe'){await browser.claim(org,target,id(job));value=await browser.observe(org,target);}
          else if(req.method==='POST'){
            const d=await input(req);
            if(action==='open'){human();value=await browser.open(org,target);}
            else if(action==='human')value=await browser.human(org,target,human(),d);
            else if(action==='confirm')value=await browser.confirm(org,target,human(),{accountLabel:d.accountLabel,automationAllowed:d.automationAllowed===true});
            else if(action==='close'){human();await browser.close(org,target);value={ok:true};}
            else if(action==='act'){await browser.claim(org,target,id(job));value=await browser.act(org,target,job,d);}
            else if(action==='freeze'){id(job);await browser.freeze(org,target,'A interação exige conferência humana antes de continuar.');value={ok:true};}
          }
        }
      }else if(group==='video'){
        if(target==='assets'&&action&&req.method==='PUT')value=await video.importAsset(org,{id:id(action),name:decodeURIComponent(req.headers['x-helpu-filename']||'video.mp4'),bytes:await read(req,50*1024*1024)});
        else if(target==='projects'){
          if(!action&&req.method==='GET')value={projects:await video.list(org)};
          else if(!action&&req.method==='POST')value=await video.create(org,await input(req));
          else if(action&&!extra&&req.method==='GET')value=await video.get(org,id(action));
          else if(action&&!extra&&req.method==='PATCH')value=await video.update(org,id(action),await input(req));
          else if(action&&extra==='exports'&&req.method==='POST')value=await video.export(org,id(action),await input(req));
        }else if(target==='exports'&&action){
          if(!extra&&req.method==='GET')value=await video.job(org,id(action));
          else if(extra==='output'&&req.method==='GET'){
            const out=await video.output(org,id(action));
            res.writeHead(200,{'Content-Type':'video/mp4','Content-Length':out.size,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});
            fs.createReadStream(out.file).on('error',()=>res.destroy()).pipe(res);return;
          }
        }
      }
      if(value===undefined)fail('Recurso não encontrado.',404);
      json(res,200,value);
    }catch(e){if(res.headersSent){res.destroy();return;}const status=e.status||e.statusCode||(e.state==='blocked'?409:500);json(res,status,{error:status<500?String(e.message).slice(0,400):'O serviço não concluiu esta operação. Confira o andamento antes de repetir.'});}
  });
}

export function createWorkerClock({url,secret,fetcher=fetch,intervalMs=60000}){
  let endpoint;try{const u=new URL(url);if(u.protocol==='https:'&&!u.username&&!u.password&&!u.search&&!u.hash&&u.pathname==='/')endpoint=u.origin+'/api/worker';}catch{}
  const configured=!!endpoint&&String(secret||'').length>=32;let timer,running=false,closed=false,lastCheckedAt=null,lastState=null;
  const status=()=>({configured,running,lastCheckedAt,state:lastState});
  async function tick(){if(!configured||running||closed)return;running=true;try{const r=await fetcher(endpoint,{method:'POST',headers:{Authorization:'Bearer '+secret},redirect:'error',signal:AbortSignal.timeout(290000)});const v=await r.json();lastState=r.ok&&['checked','already_running','disabled'].includes(v.state)?v.state:'failed';lastCheckedAt=Date.now();}catch{lastState='failed';lastCheckedAt=Date.now();}finally{running=false;}}
  return{status,tick,start(){if(configured&&!timer){void tick();timer=setInterval(()=>void tick(),intervalMs);timer.unref();}},stop(){closed=true;clearInterval(timer);}};
}

async function main(){
  const dataDir=path.resolve(process.env.HELPU_RUNTIME_DATA||'/data');fs.mkdirSync(dataDir,{recursive:true,mode:0o700});
  const browser=await createBrowserService({dataDir:path.join(dataDir,'browser')}),video=await createVideoService({dataDir:path.join(dataDir,'video')});
  const worker=createWorkerClock({url:process.env.HELPU_PUBLIC_URL,secret:process.env.CRON_SECRET});
  const server=createRuntimeServer({secret:process.env.HELPU_RUNTIME_SECRET,browser,video,worker});
  server.requestTimeout=120000;server.headersTimeout=15000;
  server.listen(Number(process.env.PORT||8080),'0.0.0.0',()=>{worker.start();console.log('Serviço online Helpu iniciado.');});
  for(const sig of ['SIGINT','SIGTERM'])process.once(sig,async()=>{worker.stop();server.close();await Promise.allSettled([browser.shutdown(),video.shutdown()]);process.exit(0);});
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(()=>{console.error('Não foi possível iniciar o serviço. Confira configuração e permissões do volume.');process.exitCode=1;});
