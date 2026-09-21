import {randomBytes,randomUUID,createHash,timingSafeEqual} from 'node:crypto';

const digest=value=>createHash('sha256').update(String(value)).digest('hex');
const cookie=req=>(req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith('helpu_instagram_oauth='))?.slice(22)||'';
const sessionToken=req=>(req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith('helpu_session='))?.slice(14)||'';
const fail=(message,status=400)=>{const e=new Error(message);e.status=status;throw e;};
export function instagramLoginConfig(env=process.env){
 let origin;try{const url=new URL(env.HELPU_PUBLIC_URL);if(url.protocol==='https:'&&!url.username&&!url.password&&url.pathname==='/')origin=url.origin;}catch{}
 return {ready:!!(origin&&env.HELPU_INSTAGRAM_APP_ID&&env.HELPU_INSTAGRAM_APP_SECRET),redirectUri:origin?origin+'/api/connect/instagram/callback':null,appId:env.HELPU_INSTAGRAM_APP_ID,appSecret:env.HELPU_INSTAGRAM_APP_SECRET};
}
export function createInstagramLogin({db,access,saveConnection,env=process.env,fetcher=fetch,now=Date.now}){
 async function remote(url,options={}){
  let response;try{response=await fetcher(url,{...options,redirect:'error',signal:AbortSignal.timeout(30000)});}catch{fail('O Instagram não respondeu. Tente conectar novamente.',502);}
  let data;try{const text=await response.text();data=JSON.parse(text.replace(/("user_id"\s*:\s*)(\d+)/g,'$1"$2"'));}catch{fail('O Instagram retornou uma resposta inválida.',502);}
  if(!response.ok||data.error)fail('O Instagram não autorizou a conexão. Confira o aplicativo e as permissões.',400);
  return data;
 }
 return {
  status(){const config=instagramLoginConfig(env);return {available:config.ready,redirectUri:config.redirectUri,missing:[!config.redirectUri&&'HELPU_PUBLIC_URL',!config.appId&&'HELPU_INSTAGRAM_APP_ID',!config.appSecret&&'HELPU_INSTAGRAM_APP_SECRET'].filter(Boolean)};},
  async start(req,res,org,user,{internalMarketing=false}={}){
   const config=instagramLoginConfig(env);if(!config.ready)fail('O login do Instagram ainda precisa ser configurado no aplicativo da Meta e na hospedagem.',409);
   const token=sessionToken(req);if(!token)fail('Entre novamente no Helpu.',401);
   const state=randomBytes(32).toString('hex'),proof=randomBytes(32).toString('hex'),time=now();
   const data={internalMarketing,actor:user.id,expiresAt:time+600000,proofHash:digest(proof),sessionHash:digest(token),redirectUri:config.redirectUri};
   await db.prepare("DELETE FROM records WHERE kind='oauth_state' AND org_id=? AND (json_extract(data,'$.expiresAt')<? OR json_extract(data,'$.actor')=?)").run(org,time,user.id);
   await db.prepare("INSERT INTO records(id,org_id,kind,data,external_id,created_at,updated_at) VALUES(?,?,'oauth_state',?,?,?,?)").run(randomUUID(),org,JSON.stringify(data),'instagram:'+digest(state),time,time);
   const url=new URL('https://www.instagram.com/oauth/authorize');
   url.search=new URLSearchParams({client_id:config.appId,redirect_uri:config.redirectUri,response_type:'code',scope:internalMarketing?'instagram_business_basic,instagram_business_content_publish,instagram_business_manage_insights':'instagram_business_basic,instagram_business_content_publish,instagram_business_manage_comments,instagram_business_manage_messages',state,enable_fb_login:'0',force_authentication:'1'}).toString();
   res.setHeader('Set-Cookie',`helpu_instagram_oauth=${proof}; Path=/api/connect/instagram; HttpOnly; SameSite=Lax; Secure; Max-Age=600`);
   return {url:url.href};
  },
  async callback(req,res){
   if(req.method!=='GET')fail('Método não permitido.',405);
   const params=new URL(req.url,'https://helpu.invalid').searchParams,state=params.get('state')||'',proof=cookie(req);
   if(!/^[a-f\d]{64}$/.test(state)||!/^[a-f\d]{64}$/.test(proof))fail('A conexão expirou ou não pertence a este navegador. Volte ao Helpu e tente novamente.',400);
   const row=await db.prepare("SELECT * FROM records WHERE kind='oauth_state' AND external_id=?").get('instagram:'+digest(state));
   if(!row)fail('Esta solicitação de conexão não está mais disponível.',400);
   const saved=JSON.parse(row.data),proofHash=digest(proof);
   if(saved.expiresAt<now()||!timingSafeEqual(Buffer.from(saved.proofHash),Buffer.from(proofHash)))fail('Esta solicitação de conexão expirou ou é inválida.',400);
   const session=await db.prepare('SELECT user_id FROM sessions WHERE token_hash=? AND expires_at>?').get(saved.sessionHash,now());
   if(!session||session.user_id!==saved.actor)fail('Sua sessão do Helpu terminou. Entre novamente antes de conectar.',401);
   await access(row.org_id,{id:saved.actor});
   const consumed=await db.prepare("DELETE FROM records WHERE id=? AND kind='oauth_state' RETURNING id").get(row.id);
   if(!consumed)fail('Esta conexão já foi processada.',409);
   res.setHeader('Set-Cookie','helpu_instagram_oauth=; Path=/api/connect/instagram; HttpOnly; SameSite=Lax; Secure; Max-Age=0');
   if(params.has('error')){res.writeHead(303,{Location:'/retorno.html?connection=cancelled','Cache-Control':'no-store','Referrer-Policy':'no-referrer'}).end();return;}
   const code=params.get('code');if(!code||code.length>4096)fail('O Instagram não retornou uma autorização válida.');
   const config=instagramLoginConfig(env);if(!config.ready||config.redirectUri!==saved.redirectUri)fail('A configuração do login mudou. Tente conectar novamente.',409);
   const short=await remote('https://api.instagram.com/oauth/access_token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:config.appId,client_secret:config.appSecret,grant_type:'authorization_code',redirect_uri:config.redirectUri,code})});
   if(typeof short.access_token!=='string')fail('O Instagram não concedeu o acesso solicitado.');
   const exchange=new URL('https://graph.instagram.com/access_token');exchange.search=new URLSearchParams({grant_type:'ig_exchange_token',client_secret:config.appSecret,access_token:short.access_token}).toString();
   const long=await remote(exchange.href);
   if(typeof long.access_token!=='string'||!Number.isFinite(long.expires_in)||long.expires_in<=0)fail('Não foi possível manter a conexão com o Instagram.');
   const profile=await remote('https://graph.instagram.com/me?fields=user_id,username',{headers:{Authorization:'Bearer '+long.access_token}});
   const accountId=profile.user_id;
   if(!/^\d+$/.test(accountId||'')||!/^\w[\w.]{0,29}$/.test(profile.username||''))fail('Não foi possível identificar a conta profissional.');
   if(saved.internalMarketing&&profile.username.toLowerCase()!=='helpumarketing')fail('A criação da Helpu aceita somente a conta @helpumarketing. A conexão anterior foi preservada.',409);
   await saveConnection(row.org_id,saved.actor,{accessToken:long.access_token,accountId:String(accountId),expiresAt:now()+long.expires_in*1000,username:profile.username});
   res.writeHead(303,{Location:saved.internalMarketing?'/admin.html#/marketing':'/retorno.html?connection=connected&company='+encodeURIComponent(row.org_id),'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}).end();
  }
 };
}
