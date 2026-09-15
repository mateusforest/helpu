import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {lookup} from 'node:dns/promises';
import {BlockList, isIP} from 'node:net';

export const BROWSER_CHANNELS = Object.freeze([
  {id:'instagram',name:'Instagram',url:'https://www.instagram.com/',domains:['instagram.com','facebook.com'],resources:['instagram.com','facebook.com','fbcdn.net','cdninstagram.com']},
  {id:'whatsapp',name:'WhatsApp',url:'https://web.whatsapp.com/',domains:['whatsapp.com'],resources:['whatsapp.com','whatsapp.net','fbcdn.net']},
  {id:'facebook',name:'Facebook e anúncios',url:'https://business.facebook.com/',domains:['facebook.com'],resources:['facebook.com','fbcdn.net','fbsbx.com']},
  {id:'google',name:'Perfil da Empresa no Google',url:'https://business.google.com/',domains:['google.com','google.com.br'],resources:['google.com','google.com.br','googleusercontent.com','gstatic.com']}
]);
const HUMAN_TTL=5*60_000, SNAPSHOT_TTL=30_000, MAX_REFS=100, WIDTH=1280, HEIGHT=800;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const privateV4=new BlockList(), privateV6=new BlockList();
for(const [address,prefix] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]])privateV4.addSubnet(address,prefix,'ipv4');
for(const [address,prefix] of [['2001:db8::',32],['2001:10::',28],['2001:20::',28]])privateV6.addSubnet(address,prefix,'ipv6');
export function isPublicAddress(address){
  const family=isIP(address);
  if(family===4)return !privateV4.check(address,'ipv4');
  return family===6&&/^[23][a-f\d]{3}:/i.test(address)&&!privateV6.check(address,'ipv6');
}
export class BrowserServiceError extends Error{
  constructor(code,message,status=409){super(message);this.name='BrowserServiceError';this.code=code;this.status=status;}
}
const fail=(code,message,status)=>{throw new BrowserServiceError(code,message,status);};
const id=value=>{if(typeof value!=='string'||!UUID.test(value))fail('invalid_identifier','Identificador inválido.',400);return value;};
const actor=value=>{if(typeof value!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(value))fail('invalid_actor','Usuário inválido.',400);return value;};
const definition=channel=>{const value=BROWSER_CHANNELS.find(x=>x.id===channel);if(!value)fail('invalid_channel','Canal não disponível.',400);return value;};
const suffix=(host,allowed)=>allowed.some(domain=>host===domain||host.endsWith('.'+domain));
function channelUrl(value,channel,resource=false){
  try{const u=new URL(value),d=definition(channel);return (u.protocol==='https:'||(resource&&u.protocol==='wss:'))&&!u.username&&!u.password&&(!u.port||u.port==='443')&&suffix(u.hostname,resource?d.resources:d.domains);}catch{return false;}
}
function textInput(value){if(typeof value!=='string'||value.length>10_000)fail('invalid_input','Texto inválido ou muito longo.',400);return value;}
function keyInput(value){if(typeof value!=='string'||!['Enter','Tab','Shift+Tab','Escape','Backspace','Delete','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End','PageUp','PageDown','Control+A','Meta+A','Space'].includes(value))fail('invalid_key','Tecla não permitida.',400);return value;}

// Runs in Chromium. Never include input values, passwords, URLs or storage in its result.
function inspectPage({nonce=null,maxRefs=100,channel}={}){
  const visible=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden';};
  const body=(document.body?.innerText||'').slice(0,100_000);
  const sensitive='input[type=password],input[autocomplete=current-password],input[autocomplete=new-password],input[autocomplete=one-time-code],input[name*=password i],input[name*=senha i],input[name*=token i],input[name*=otp i],input[name*=verification i],input[name*=captcha i],iframe[src*=captcha i],[data-sitekey]';
  const challenge=[...document.querySelectorAll(sensitive)].some(visible)||/scan (this |the )?qr|escaneie.{0,50}qr|enter.{0,30}(verification|security) code|insira.{0,30}código (de verificação|de segurança)|confirme que você é humano|verify you are human|two.factor authentication|autenticação de dois fatores/i.test(body)||/\/(challenge|checkpoint|two_factor|accounts\/login|login|signin)(?:[/?]|$)/i.test(location.pathname);
  if(challenge)return {challenge:true,elements:[],text:''};
  const usernames=channel==='instagram'?[...new Set([...document.querySelectorAll('a[href]')].filter(visible).flatMap(e=>{
    const label=(e.getAttribute('aria-label')||e.innerText||'').trim().replace(/\s+/g,' ');
    if(!/^(?:your |seu )?(?:profile|perfil)$/i.test(label))return [];
    try{const u=new URL(e.href),match=/^\/([a-zA-Z0-9_.]{1,30})\/?$/.exec(u.pathname);return ['instagram.com','www.instagram.com'].includes(u.hostname)&&match&&!['accounts','explore','direct','reels','stories','p'].includes(match[1].toLowerCase())?[match[1].toLowerCase()]:[];}catch{return [];}
  }))]:[];
  const identity=usernames.length===1?{username:usernames[0],source:'visible_self_profile_link'}:null;
  if(!nonce)return {challenge:false,identity};
  document.querySelectorAll('[data-helpu-runtime-ref]').forEach(e=>e.removeAttribute('data-helpu-runtime-ref'));
  const elements=[...document.querySelectorAll('a,button,input,textarea,select,[role=button],[role=textbox],[contenteditable=true]')].filter(visible).slice(0,maxRefs).map((e,index)=>{
    const ref=nonce+'-'+index;e.setAttribute('data-helpu-runtime-ref',ref);
    return {ref,role:e.getAttribute('role')||e.tagName.toLowerCase(),label:(e.getAttribute('aria-label')||e.getAttribute('placeholder')||e.innerText||e.getAttribute('name')||'').slice(0,160),type:e.getAttribute('type')||''};
  });
  return {challenge:false,text:body.slice(0,12_000),elements,identity};
}

/** A private gateway must authenticate tenant/user/job before every method call.
 * Profiles require a persistent private volume. State never restores automation consent.
 * resolveHost is injectable for deterministic tests; production defaults to system DNS.
 */
export function createBrowserService({dataDir,launch,now=Date.now,resolveHost=lookup,maxSessions=Number(process.env.HELPU_BROWSER_MAX_SESSIONS||4)}={}){
  if(typeof dataDir!=='string'||!path.isAbsolute(dataDir))throw new TypeError('dataDir must be absolute');
  if(!Number.isInteger(maxSessions)||maxSessions<1||maxSessions>16)throw new TypeError('maxSessions must be between 1 and 16');
  const root=path.join(dataDir,'browser-profiles'),sessions=new Map(),opening=new Map(),dnsCache=new Map(),assetWrites=new Map();
  let stopped=false;
  const key=(org,channel)=>id(org)+':'+definition(channel).id;
  const profilePath=(org,channel)=>path.join(root,id(org),definition(channel).id);
  const invalidate=s=>{s.snapshot=null;};
  const expire=s=>{if(s.human&&s.human.until<=now()){s.human=null;invalidate(s);}};
  const session=(org,channel)=>{const s=sessions.get(key(org,channel));if(!s)fail('session_closed','Abra a sessão para continuar.');expire(s);return s;};
  async function exclusive(s,work){const previous=s.pending;let done;s.pending=new Promise(resolve=>{done=resolve;});await previous;try{expire(s);if(s.closed)fail('session_closed','A sessão foi encerrada.');return await work();}finally{done();}}
  function metadata(d,s,persisted={},viewerId){
    if(s)expire(s);
    return {id:d.id,name:d.name,accountLabel:s?.accountLabel||persisted.accountLabel||'',open:!!s,saved:!!(s||persisted.updatedAt),confirmedAt:s?.confirmedAt||null,automationAllowed:!!s?.automationAllowed,busy:!!(s?.human||s?.owner),humanControl:!!s?.human,humanOwned:!!(s?.human&&viewerId&&s.human.userId===viewerId),humanControlExpiresAt:s?.human?.until||null,challenge:!!s?.challenge,identity:s?.identity||null,uncertainNote:s?.uncertain?'Confira a última interação antes de liberar a sessão.':null,local:false,executorAvailable:false,operationalReady:false,connectionState:!s?'disconnected':s.uncertain?'uncertain':s.challenge?'authentication_required':s.confirmedAt?(d.id==='instagram'?'identity_confirmed':'identity_declared'):'identity_unconfirmed'};
  }
  async function readState(org,channel){
    try{const p=JSON.parse(await fs.readFile(path.join(profilePath(org,channel),'helpu-state.json'),'utf8'));return {accountLabel:typeof p.accountLabel==='string'?p.accountLabel.slice(0,100):'',updatedAt:typeof p.updatedAt==='number'?p.updatedAt:null};}catch(error){if(error.code==='ENOENT'||error instanceof SyntaxError)return {};throw error;}
  }
  async function persist(s){
    const file=path.join(s.profile,'helpu-state.json'),temp=file+'.'+randomUUID()+'.tmp';
    // Consent, tokens, job/user identifiers, input and captured frames are memory-only.
    await fs.writeFile(temp,JSON.stringify({version:1,accountLabel:s.accountLabel,updatedAt:now()}),{mode:0o600});
    try{await fs.rename(temp,file);}catch(error){await fs.rm(temp,{force:true});throw error;}
  }
  async function publicHost(host){
    const old=dnsCache.get(host);if(old&&old.until>now())return old.public;
    let publicAddress=false;
    try{const records=await resolveHost(host,{all:true,verbatim:true});publicAddress=Array.isArray(records)&&records.length>0&&records.every(r=>isPublicAddress(r.address));}catch{}
    if(dnsCache.size>=256)dnsCache.delete(dnsCache.keys().next().value);
    dnsCache.set(host,{public:publicAddress,until:now()+30_000});return publicAddress;
  }
  async function allowRequest(value,channel,navigation){
    if(!channelUrl(value,channel,!navigation))return false;
    return publicHost(new URL(value).hostname);
  }
  function wirePage(s,page){
    page.on('download',download=>{Promise.resolve(download.cancel()).catch(()=>{});});
    page.on('framenavigated',frame=>{if(frame===page.mainFrame())invalidate(s);});
    page.on('dialog',dialog=>{Promise.resolve(dialog.dismiss()).catch(()=>{});});
    page.on('filechooser',chooser=>{s.chooser=chooser;});
    page.on('close',()=>{if(s.page===page)invalidate(s);});
  }
  function activePage(s){
    if(s.page.isClosed()){const remaining=s.context.pages().filter(p=>!p.isClosed()&&channelUrl(p.url(),s.channel));if(!remaining.length)fail('session_closed','A página foi encerrada.');s.page=remaining.at(-1);invalidate(s);}
    if(!channelUrl(s.page.url(),s.channel))fail('navigation_blocked','A sessão está fora do canal permitido.');
    return s.page;
  }
  function demandHuman(s,userId){actor(userId);expire(s);if(!s.human||s.human.userId!==userId)fail('human_control_required','Assuma o controle da sessão para continuar.');s.human.until=now()+HUMAN_TTL;invalidate(s);}
  function demandAgent(s){expire(s);if(s.human)fail('human_control_active','O usuário está controlando esta sessão.');if(!s.confirmedAt||!s.automationAllowed)fail('automation_not_allowed','Confirme a conta e libere a interação assistida.');}
  function authenticationRequired(s){s.challenge=true;s.automationAllowed=false;s.confirmedAt=null;invalidate(s);return {challenge:true,requiresHuman:true,elements:[],text:'A sessão exige login ou confirmação pelo usuário.'};}
  async function inspect(s,nonce){return activePage(s).evaluate(inspectPage,{nonce,maxRefs:MAX_REFS,channel:s.channel});}
  function checkIdentity(s,observation){if(s.channel==='instagram'&&(!observation.identity||observation.identity.username!==s.identity?.username)){s.automationAllowed=false;s.confirmedAt=null;invalidate(s);fail('identity_mismatch','A conta observada mudou. Confirme a conta antes de continuar.');}}
  async function capabilities(){
    if(stopped)return false;
    if(launch)return true;
    try{const {chromium}=await import('playwright-core'),executable=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||chromium.executablePath();return !!executable&&(await fs.stat(executable)).isFile();}catch{return false;}
  }
  async function list(org,userId){id(org);if(userId!==undefined)actor(userId);return Promise.all(BROWSER_CHANNELS.map(async d=>metadata(d,sessions.get(key(org,d.id)),await readState(org,d.id),userId)));}
  async function open(org,channel){
    const k=key(org,channel);if(stopped)fail('service_stopped','O serviço foi encerrado.',503);
    if(sessions.has(k))return metadata(definition(channel),sessions.get(k));
    if(opening.has(k))return opening.get(k);
    if(sessions.size+opening.size>=maxSessions)fail('session_limit','O limite de sessões abertas foi atingido. Feche uma sessão e tente novamente.',429);
    const promise=(async()=>{
      const profile=profilePath(org,channel);await fs.mkdir(profile,{recursive:true,mode:0o700});
      await fs.chmod(profile,0o700).catch(error=>{if(process.platform!=='win32')throw error;});
      const persisted=await readState(org,channel),options={headless:true,chromiumSandbox:true,viewport:{width:WIDTH,height:HEIGHT},acceptDownloads:false,serviceWorkers:'block',permissions:[],args:['--disable-background-networking','--disable-quic','--force-webrtc-ip-handling-policy=disable_non_proxied_udp']};
      if(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH)options.executablePath=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
      let context,s;
      try{
        if(launch)context=await launch(profile,options);else{const {chromium}=await import('playwright-core');context=await chromium.launchPersistentContext(profile,options);}
        if(stopped){await context.close();fail('service_stopped','O serviço foi encerrado.',503);}
        const page=context.pages()[0]||await context.newPage();
        s={org,channel,profile,context,page,accountLabel:persisted.accountLabel||'',confirmedAt:null,automationAllowed:false,owner:null,human:null,snapshot:null,identity:null,uncertain:false,chooser:null,challenge:false,pending:Promise.resolve(),closed:false};
        await context.route('**/*',async route=>{try{const req=route.request();if(!await allowRequest(req.url(),channel,req.isNavigationRequest()))return await route.abort('blockedbyclient');return await route.continue();}catch{await route.abort('blockedbyclient').catch(()=>{});}});
        if(typeof context.routeWebSocket==='function')await context.routeWebSocket('**/*',async socket=>{try{if(!await allowRequest(socket.url(),channel,false)){await socket.close();return;}socket.connectToServer();}catch{await Promise.resolve(socket.close()).catch(()=>{});}});
        wirePage(s,page);
        context.on('page',p=>{wirePage(s,p);s.page=p;invalidate(s);});
        context.on('close',()=>{s.closed=true;s.human=null;s.owner=null;invalidate(s);if(sessions.get(k)===s)sessions.delete(k);});
        await page.goto(definition(channel).url,{waitUntil:'domcontentloaded',timeout:30_000});
        if(stopped)fail('service_stopped','O serviço foi encerrado.',503);
        await persist(s);sessions.set(k,s);return metadata(definition(channel),s);
      }catch(error){if(context)await context.close().catch(()=>{});if(error instanceof BrowserServiceError)throw error;fail('browser_unavailable','Não foi possível abrir a sessão online. Confira o serviço de navegador.',503);}
    })().finally(()=>opening.delete(k));
    opening.set(k,promise);return promise;
  }
  async function human(org,channel,userId,action){
    actor(userId);const s=session(org,channel);
    if(!action||typeof action!=='object')fail('invalid_action','Ação inválida.',400);
    return exclusive(s,async()=>{
      if(action.type==='take'){
        if(s.human&&s.human.userId!==userId)fail('human_control_active','Outro usuário está controlando esta sessão.');
        s.owner=null;s.chooser=null;s.human={userId,until:now()+HUMAN_TTL};invalidate(s);return {taken:true,expiresAt:s.human.until};
      }
      demandHuman(s,userId);
      if(action.type==='release'){s.human=null;return {released:true};}
      const page=activePage(s);
      if(action.type==='click'){
        if(!Number.isFinite(action.x)||!Number.isFinite(action.y)||action.x<0||action.y<0||action.x>=WIDTH||action.y>=HEIGHT)fail('invalid_coordinates','Coordenadas inválidas.',400);
        await page.mouse.click(action.x,action.y);
      }else if(action.type==='type')await page.keyboard.insertText(textInput(action.text));
      else if(action.type==='key')await page.keyboard.press(keyInput(action.key));
      else if(action.type==='scroll'){
        if(!Number.isFinite(action.dy)||Math.abs(action.dy)>2000)fail('invalid_scroll','Rolagem inválida.',400);
        await page.mouse.wheel(0,action.dy);
      }else fail('invalid_action','Ação não permitida.',400);
      return {applied:true};
    });
  }
  async function frame(org,channel,userId){const s=session(org,channel);return exclusive(s,async()=>{demandHuman(s,userId);const image=await activePage(s).screenshot({type:'jpeg',quality:70,animations:'disabled'});return {image:image.toString('base64'),width:WIDTH,height:HEIGHT};});}
  async function confirm(org,channel,userId,{accountLabel,automationAllowed}={}){
    const s=session(org,channel);return exclusive(s,async()=>{
      demandHuman(s,userId);
      if(typeof accountLabel!=='string'||!accountLabel.trim()||accountLabel.length>100||/[\r\n\x00-\x1f]|https?:\/\//i.test(accountLabel)||typeof automationAllowed!=='boolean')fail('invalid_confirmation','Informe a conta e a permissão de interação.',400);
      const observation=await inspect(s);
      if(observation.challenge){authenticationRequired(s);fail('authentication_required','Conclua o login antes de confirmar a conta.');}
      if(channel==='instagram'&&(!observation.identity||observation.identity.username!==accountLabel.trim().replace(/^@/,'').toLowerCase()))fail('identity_mismatch','A conta informada não coincide com o perfil próprio observado no Instagram.');
      s.accountLabel=accountLabel.trim();s.confirmedAt=now();s.identity=observation.identity||null;s.automationAllowed=automationAllowed;s.challenge=false;s.uncertain=false;await persist(s);return metadata(definition(channel),s,{},userId);
    });
  }
  async function claim(org,channel,jobId){id(jobId);const s=session(org,channel);return exclusive(s,async()=>{demandAgent(s);if(s.owner&&s.owner!==jobId)fail('session_busy','A sessão está ocupada por outra operação.');if(s.owner!==jobId)invalidate(s);s.owner=jobId;return {claimed:true};});}
  async function release(jobId){id(jobId);for(const s of sessions.values())await exclusive(s,async()=>{if(s.owner===jobId){s.owner=null;invalidate(s);}});return {released:true};}
  async function observe(org,channel){
    const s=session(org,channel);return exclusive(s,async()=>{
      demandAgent(s);const nonce=randomUUID(),observation=await inspect(s,nonce);
      if(observation.challenge)return authenticationRequired(s);
      checkIdentity(s,observation);
      const page=activePage(s),observedUrl=page.url(),image=await page.screenshot({type:'jpeg',quality:65,animations:'disabled'});
      const latest=await inspect(s);if(latest.challenge)return authenticationRequired(s);checkIdentity(s,latest);
      if(page.url()!==observedUrl)fail('snapshot_stale','A página mudou. Observe novamente.');
      const snapshotToken=randomUUID(),expiresAt=now()+SNAPSHOT_TTL;
      s.snapshot={token:snapshotToken,expiresAt,refs:new Set(observation.elements.map(e=>e.ref)),owner:s.owner,url:observedUrl};
      return {...observation,snapshotToken,expiresAt,image:image.toString('base64'),width:WIDTH,height:HEIGHT};
    });
  }
  async function act(org,channel,jobId,args){
    id(jobId);const s=session(org,channel);return exclusive(s,async()=>{
      demandAgent(s);if(s.owner!==jobId)fail('job_ownership_required','A operação não controla esta sessão.');
      const snap=s.snapshot,page=activePage(s);
      if(!args||typeof args!=='object'||!snap||snap.token!==args.snapshotToken||snap.expiresAt<=now()||snap.owner!==jobId||snap.url!==page.url())fail('snapshot_stale','Observe a página novamente antes de interagir.');
      const observation=await inspect(s);if(observation.challenge){authenticationRequired(s);fail('authentication_required','A sessão exige confirmação pelo usuário.');}checkIdentity(s,observation);
      if(!['navigate','click','type','select','key','scroll','upload'].includes(args.type))fail('invalid_action','Ação não permitida.',400);
      let target;
      if(!['scroll','navigate'].includes(args.type)&&!(args.type==='upload'&&s.chooser)){
        if(typeof args.ref!=='string'||!snap.refs.has(args.ref))fail('invalid_reference','Elemento fora da observação atual.',400);
        target=page.locator('[data-helpu-runtime-ref="'+args.ref+'"]');
        if(await target.count()!==1)fail('snapshot_stale','O elemento mudou. Observe novamente.');
        const field=await target.evaluate(e=>({sensitive:e.matches('input[type=password],input[autocomplete=current-password],input[autocomplete=new-password],input[autocomplete=one-time-code],input[name*=password i],input[name*=senha i],input[name*=token i],input[name*=otp i],input[name*=verification i],input[name*=captcha i]'),restricted:/password|senha|security|segurança|delete account|excluir conta|desativar conta|purchase|checkout|comprar|pagar|payment|pagamento|billing|faturamento|budget|orçamento|adicionar saldo/i.test((e.getAttribute('aria-label')||'')+' '+(e.innerText||'')+' '+(e.getAttribute('name')||'')),href:e.tagName==='A'?e.href:null}));
        if(field.sensitive){authenticationRequired(s);fail('authentication_required','O agente não pode preencher campos de autenticação.');}
        if(field.restricted)fail('restricted_action','Esta ação exige o controle direto do usuário.');
        if(field.href&&!channelUrl(field.href,channel))fail('navigation_blocked','O destino não pertence ao canal permitido.');
      }
      if(args.type==='navigate'&&(!channelUrl(args.url,channel)||/\/(?:password|security|billing|payments?|checkout|delete|deactivate)(?:[/?]|$)/i.test(new URL(args.url).pathname)))fail('navigation_blocked','O destino não pertence à navegação permitida.');
      const file=args.type==='upload'?await importedAsset(org,args.sourceAssetId):null;
      // Consume before any side effect. A timeout must not replay the same interaction.
      invalidate(s);
      try{
        if(args.type==='navigate')await page.goto(args.url,{waitUntil:'domcontentloaded',timeout:30_000});
        else if(args.type==='click')await target.click({timeout:10_000});
        else if(args.type==='type')await target.fill(textInput(args.text),{timeout:10_000});
        else if(args.type==='select')await target.selectOption(textInput(args.text),{timeout:10_000});
        else if(args.type==='upload'){if(s.chooser){const chooser=s.chooser;s.chooser=null;await chooser.setFiles(file,{timeout:10_000});}else await target.setInputFiles(file,{timeout:10_000});}
        else if(args.type==='key')await target.press(keyInput(args.key),{timeout:10_000});
        else{if(!Number.isFinite(args.dy)||Math.abs(args.dy)>2000)fail('invalid_scroll','Rolagem inválida.',400);await page.mouse.wheel(0,args.dy);}
      }catch(error){if(error instanceof BrowserServiceError)throw error;s.automationAllowed=false;s.confirmedAt=null;s.uncertain=true;s.chooser=null;fail('interaction_uncertain','A interação foi interrompida. Confira a conta antes de continuar.');}
      return {applied:true,verified:false};
    });
  }
  async function close(org,channel){const k=key(org,channel);if(opening.has(k))await opening.get(k);const s=sessions.get(k);if(!s)return {closed:true};return exclusive(s,async()=>{s.closed=true;s.human=null;s.owner=null;s.automationAllowed=false;s.confirmedAt=null;invalidate(s);await s.context.close();sessions.delete(k);return {closed:true};});}
  async function freeze(org,channel){const s=sessions.get(key(org,channel));if(!s)return {frozen:true};return exclusive(s,async()=>{s.automationAllowed=false;s.confirmedAt=null;s.owner=null;s.chooser=null;s.uncertain=true;invalidate(s);return {frozen:true};});}
  const assetDirectory=org=>path.join(dataDir,'browser-assets',id(org));
  function assetType(bytes){
    if(bytes.length>=24&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&bytes.toString('ascii',12,16)==='IHDR')return {extension:'png',mimeType:'image/png'};
    if(bytes.length>=4&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255&&bytes.at(-2)===255&&bytes.at(-1)===217)return {extension:'jpg',mimeType:'image/jpeg'};
    if(bytes.length>=16&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'&&bytes.readUInt32LE(4)+8===bytes.length)return {extension:'webp',mimeType:'image/webp'};
    if(bytes.length>=24&&bytes.toString('ascii',4,8)==='ftyp'&&['isom','iso2','mp41','mp42','avc1','M4V '].includes(bytes.toString('ascii',8,12)))return {extension:'mp4',mimeType:'video/mp4'};
    fail('invalid_asset','Envie um arquivo PNG, JPEG, WebP ou MP4 válido.',400);
  }
  async function importAsset(org,{id:assetId,name,bytes}={}){
    id(org);id(assetId);if(!(Buffer.isBuffer(bytes)||bytes instanceof Uint8Array)||!bytes.length||bytes.length>50*1024*1024)fail('invalid_asset','O arquivo deve ter até 50 MB.',400);
    if(typeof name!=='string'||!name.trim()||name.length>160||/[\\/\x00-\x1f]/.test(name))fail('invalid_asset','Nome de arquivo inválido.',400);
    const content=Buffer.from(bytes),type=assetType(content),sha256=createHash('sha256').update(content).digest('hex'),directory=assetDirectory(org),k=org+':'+assetId;
    const previous=assetWrites.get(k)||Promise.resolve();
    const write=previous.catch(()=>{}).then(async()=>{
      await fs.mkdir(directory,{recursive:true,mode:0o700});const manifest=path.join(directory,assetId+'.json');
      let existing;try{existing=JSON.parse(await fs.readFile(manifest,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
      if(existing){if(existing.sha256!==sha256)fail('asset_conflict','Este arquivo já foi importado com outro conteúdo.');return existing;}
      const record={id:assetId,name:name.trim(),...type,size:content.length,sha256},file=path.join(directory,assetId+'.'+type.extension),temp=file+'.'+randomUUID()+'.tmp';
      await fs.writeFile(temp,content,{mode:0o600});await fs.rename(temp,file);const metaTemp=manifest+'.'+randomUUID()+'.tmp';await fs.writeFile(metaTemp,JSON.stringify(record),{mode:0o600});await fs.rename(metaTemp,manifest);return record;
    });
    assetWrites.set(k,write);try{return await write;}finally{if(assetWrites.get(k)===write)assetWrites.delete(k);}
  }
  async function importedAsset(org,assetId){
    id(assetId);const directory=assetDirectory(org);let record;
    try{record=JSON.parse(await fs.readFile(path.join(directory,assetId+'.json'),'utf8'));}catch{fail('asset_missing','Importe o arquivo desta empresa antes de anexá-lo.');}
    if(record.id!==assetId||!['png','jpg','webp','mp4'].includes(record.extension))fail('invalid_asset','O arquivo importado está inválido.');
    const file=path.join(directory,assetId+'.'+record.extension);let bytes;try{bytes=await fs.readFile(file);}catch{fail('asset_missing','O arquivo importado não está disponível.');}
    if(bytes.length!==record.size||bytes.length>50*1024*1024||createHash('sha256').update(bytes).digest('hex')!==record.sha256)fail('invalid_asset','O arquivo importado foi alterado.');
    return file;
  }
  async function shutdown(){stopped=true;await Promise.allSettled([...opening.values()]);await Promise.allSettled([...sessions.values()].map(s=>close(s.org,s.channel)));}
  return {capabilities,list,open,human,frame,observe,act,claim,release,confirm,close,freeze,importAsset,shutdown};
}
