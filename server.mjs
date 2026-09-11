import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes,scrypt as scryptCallback,timingSafeEqual,createHash} from 'node:crypto';
import {promisify} from 'node:util';
import {DatabaseSync} from 'node:sqlite';
import {createPortal} from './portal/core.mjs';
const scrypt=promisify(scryptCallback);
const project=path.dirname(fileURLToPath(import.meta.url));
const MIME={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.mp4':'video/mp4','.woff2':'font/woff2'};
const hashToken=token=>createHash('sha256').update(token).digest('hex');
const emailPattern=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const sessionAge=7*24*60*60;
export function createHelpuServer({dataDir=process.env.HELPU_DATA_DIR||path.join(project,'.local-data'),root=path.join(project,'dist'),portalOptions={}}={}){
  fs.mkdirSync(dataDir,{recursive:true});
  const publicOrigin=process.env.HELPU_PUBLIC_URL?new URL(process.env.HELPU_PUBLIC_URL):null;
  if(publicOrigin&&(publicOrigin.protocol!=='https:'||publicOrigin.username||publicOrigin.password||publicOrigin.pathname!=='/'))throw new Error('HELPU_PUBLIC_URL deve ser uma origem HTTPS, sem caminho ou credenciais.');
  const secureCookie=publicOrigin?'; Secure':'';
  const db=new DatabaseSync(path.join(dataDir,'helpu.sqlite'));
  db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,name TEXT NOT NULL,email TEXT NOT NULL UNIQUE COLLATE NOCASE,company TEXT NOT NULL DEFAULT \'\',salt TEXT NOT NULL,password_hash TEXT NOT NULL,created_at INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires_at INTEGER NOT NULL);');
  const findUser=db.prepare('SELECT * FROM users WHERE email = ?');
  const addUser=db.prepare('INSERT INTO users(name,email,company,salt,password_hash,created_at) VALUES(?,?,?,?,?,?)');
  const addSession=db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)');
  const findSession=db.prepare('SELECT users.id,users.name,users.email,users.company FROM sessions JOIN users ON users.id=sessions.user_id WHERE token_hash=? AND expires_at>?');
  const removeSession=db.prepare('DELETE FROM sessions WHERE token_hash=?');
  const cleanSessions=db.prepare('DELETE FROM sessions WHERE expires_at<=?');
  const attempts=new Map();
  const throttleTimer=setInterval(()=>{const now=Date.now();for(const[key,value]of attempts)if(value.until<=now)attempts.delete(key);cleanSessions.run(now);},60000).unref();
  const dummySalt=randomBytes(16).toString('hex');
  const dummyHash=randomBytes(64);
  function limited(key,max=12,windowMs=15*60*1000){const now=Date.now();let entry=attempts.get(key);if(!entry||entry.until<now){entry={count:0,until:now+windowMs};attempts.set(key,entry);}entry.count++;return entry.count>max;}
  function tokenFrom(req){const cookies=(req.headers.cookie||'').split(';').map(part=>part.trim());return cookies.find(part=>part.startsWith('helpu_session='))?.slice('helpu_session='.length)||'';}
  function userFrom(req){const token=tokenFrom(req);return /^[a-f0-9]{64}$/.test(token)?findSession.get(hashToken(token),Date.now()):undefined;}
  function session(res,id){const token=randomBytes(32).toString('hex');addSession.run(hashToken(token),id,Date.now()+sessionAge*1000);res.setHeader('Set-Cookie',`helpu_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${sessionAge}${secureCookie}`);}
  function json(res,status,body){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}).end(JSON.stringify(body));}
  async function readBody(req){let data='';for await(const chunk of req){data+=chunk;if(Buffer.byteLength(data)>16384){const error=new Error('Envio muito grande.');error.status=413;throw error;}}try{return JSON.parse(data);}catch{const error=new Error('Dados inválidos.');error.status=400;throw error;}}
  function safeOrigin(req){const origin=req.headers.origin;const expected=publicOrigin&&req.headers.host===publicOrigin.host?publicOrigin.origin:'http://'+req.headers.host;return origin===expected&&req.headers['sec-fetch-site']!=='cross-site';}
  const portal=createPortal({db,dataDir,userFrom,json,safeOrigin,...portalOptions});
  const server=http.createServer(async(req,res)=>{
    if(!/^(?:localhost|127\.0\.0\.1)(?::\d+)?$/i.test(req.headers.host||'')&&(!publicOrigin||req.headers.host!==publicOrigin.host)){res.writeHead(403,{'Content-Type':'text/plain; charset=utf-8'}).end('Este acesso é local.');return;}
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');res.setHeader('X-Frame-Options','DENY');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self'; font-src 'self'; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");
    let pathname;try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{json(res,400,{error:'Endereço inválido.'});return;}
    try{
      if(await portal.handle(req,res,pathname))return;
      if(pathname.startsWith('/api/')){
        if(req.method==='GET'&&pathname==='/api/auth/me'){const user=userFrom(req);json(res,user?200:401,user?{user}:{error:'Entre para acessar sua conta.'});return;}
        if(req.method!=='POST'){json(res,405,{error:'Método não permitido.'});return;}
        if(!safeOrigin(req)){json(res,403,{error:'Origem da solicitação não permitida.'});return;}
        if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||'')){json(res,415,{error:'Formato de envio inválido.'});return;}
        if(!['/api/auth/login','/api/auth/signup','/api/auth/logout'].includes(pathname)){json(res,404,{error:'Recurso não encontrado.'});return;}
        const body=await readBody(req);if(!body||typeof body!=='object'||Array.isArray(body)){json(res,400,{error:'Dados inválidos.'});return;}
        if(pathname==='/api/auth/logout'){const token=tokenFrom(req);if(token)removeSession.run(hashToken(token));res.setHeader('Set-Cookie','helpu_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0'+secureCookie);json(res,200,{ok:true});return;}
        const email=typeof body.email==='string'?body.email.trim().toLowerCase():'';const password=typeof body.password==='string'?body.password:'';
        if(!emailPattern.test(email)||email.length>254||password.length<10||password.length>128){json(res,400,{error:'Confira o e-mail e use uma senha de 10 a 128 caracteres.'});return;}
        const address=req.socket.remoteAddress||'local';
        if(limited(address+':'+pathname,25)||limited(email+':'+pathname,10)){res.setHeader('Retry-After','900');json(res,429,{error:'Muitas tentativas. Aguarde alguns minutos e tente novamente.'});return;}
        if(pathname==='/api/auth/signup'){
          const name=typeof body.name==='string'?body.name.trim():'';const company=typeof body.company==='string'?body.company.trim():'';
          if(name.length<2||name.length>100||company.length>120){json(res,400,{error:'Informe seu nome e confira o nome da empresa.'});return;}
          const salt=randomBytes(16).toString('hex');const passwordHash=(await scrypt(password,salt,64)).toString('hex');
          let record;try{record=addUser.run(name,email,company,salt,passwordHash,Date.now());}catch(error){if(String(error.message).includes('UNIQUE')){json(res,409,{error:'Não foi possível criar a conta com esse e-mail. Se já tem uma conta, entre na Helpu.'});return;}throw error;}
          const previousToken=tokenFrom(req);if(previousToken)removeSession.run(hashToken(previousToken));session(res,record.lastInsertRowid);json(res,201,{user:{name,email,company}});return;
        }
        const user=findUser.get(email);const passwordHash=await scrypt(password,user?.salt||dummySalt,64);const expected=user?Buffer.from(user.password_hash,'hex'):dummyHash;
        if(!timingSafeEqual(passwordHash,expected)||!user){json(res,401,{error:'E-mail ou senha incorretos.'});return;}
        const previousToken=tokenFrom(req);if(previousToken)removeSession.run(hashToken(previousToken));session(res,user.id);json(res,200,{user:{name:user.name,email:user.email,company:user.company}});return;
      }
      if(!['GET','HEAD'].includes(req.method)){res.writeHead(405).end();return;}
      const resolvedRoot=path.resolve(root);const target=path.resolve(resolvedRoot,'.'+(pathname==='/'?'/index.html':pathname));
      if(!target.startsWith(resolvedRoot+path.sep)||pathname.includes('\\')){res.writeHead(403).end();return;}
      let stat;try{stat=fs.statSync(target);}catch{res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'}).end('Página não encontrada. Volte para o início da Helpu.');return;}
      if(!stat.isFile()){res.writeHead(404).end();return;}
      if(['conta.html','portal.html'].some(name=>target===path.join(resolvedRoot,name))&&!userFrom(req)){res.writeHead(302,{'Location':'/entrar.html','Cache-Control':'no-store'}).end();return;}
      const contentType=MIME[path.extname(target)]||'application/octet-stream';const headers={'Content-Type':contentType,'Cache-Control':path.extname(target)==='.html'?'no-store':'no-cache','Accept-Ranges':'bytes'};
      let start=0,end=stat.size-1,status=200;
      if(req.headers.range){const range=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range);if(!range){res.writeHead(416,{'Content-Range':`bytes */${stat.size}`}).end();return;}start=Number(range[1]);end=range[2]?Math.min(Number(range[2]),end):end;if(start>end||start>=stat.size){res.writeHead(416,{'Content-Range':`bytes */${stat.size}`}).end();return;}status=206;headers['Content-Range']=`bytes ${start}-${end}/${stat.size}`;}
      headers['Content-Length']=end-start+1;res.writeHead(status,headers);if(req.method==='HEAD'){res.end();return;}const stream=fs.createReadStream(target,{start,end});stream.on('error',()=>res.destroy());stream.pipe(res);
    }catch(error){if(!res.headersSent)json(res,error.status||500,{error:error.status?error.message:'Não foi possível concluir agora. Tente novamente.'});else res.destroy();}
  });
  server.portal=portal;
  server.on('close',()=>{portal.close();clearInterval(throttleTimer);if(!portal.busy)db.close();});return server;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  import('./scripts/start.mjs').then(({run})=>run());
}
