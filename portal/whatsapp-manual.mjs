import {createHash} from 'node:crypto';
import fs from 'node:fs';
import {whatsappPhone,whatsappPhoneKey} from './whatsapp-chat.mjs';
import {receiveWhatsAppMedia} from './whatsapp-media.mjs';
const hash=v=>createHash('sha256').update(v).digest('hex');
const fail=(message,status=422)=>{throw Object.assign(new Error(message),{status});};
const parse=r=>r?{...JSON.parse(r.data),id:r.id,org:r.org_id,version:r.version}:null;
const clean=(v,max=4000)=>String(v??'').trim().slice(0,max);
const DAY=86400000,CONTACT='helpu_manual_contact',MESSAGE='helpu_manual_message',CONFIG='helpu-manual-inbox';
export function manualTemplates(env){
 try{const items=JSON.parse(env.HELPU_WHATSAPP_MANUAL_TEMPLATES_JSON||'[]');if(!Array.isArray(items)||items.length>20)return [];
 return items.filter(t=>/^[a-z0-9_]{1,512}$/.test(t.name||'')&&/^[a-z]{2}(?:_[A-Z]{2})?$/.test(t.language||'')&&Number.isInteger(t.parameters)&&t.parameters>=0&&t.parameters<=5&&typeof t.text==='string'&&t.text.length<=4000).map(t=>({name:t.name,language:t.language,parameters:t.parameters,text:t.text,label:clean(t.label||t.name,100)}));
 }catch{return [];}
}
export function createManualWhatsApp({db,operator,storeAsset,assetPath,assetType,env=process.env,fetcher=fetch,now=Date.now}){
 const get=async id=>parse(await db.prepare('SELECT * FROM records WHERE id=?').get(id));
 const config=()=>get(CONFIG);
 const contactId=phone=>'manual-contact:'+hash(whatsappPhoneKey(phone));
 const link=async phone=>parse(await db.prepare("SELECT * FROM records WHERE kind='whatsapp_chat_link' AND id=?").get('wa-phone:'+hash(whatsappPhoneKey(phone))));
 function access(user){if(!operator(user))fail('Acesso restrito à equipe Helpu.',403);}
 function ready(){return !!(env.HELPU_WHATSAPP_ACCESS_TOKEN&&env.HELPU_WHATSAPP_PHONE_NUMBER_ID&&env.HELPU_WHATSAPP_APP_SECRET&&env.HELPU_WHATSAPP_VERIFY_TOKEN&&env.HELPU_WHATSAPP_NUMBER);}
 const version=()=>/^v\d+\.\d+$/.test(env.HELPU_WHATSAPP_API_VERSION||'')?env.HELPU_WHATSAPP_API_VERSION:'v24.0';
 async function put(org,kind,id,value,expected){const {id:ignore,org:ignored,version:unused,...data}=value;
  if(expected!==undefined){const row=await db.prepare('UPDATE records SET data=?,updated_at=?,version=version+1 WHERE id=? AND version=? RETURNING id').get(JSON.stringify(data),now(),id,expected);if(!row)fail('O atendimento mudou. Atualize antes de continuar.',409);}
  else await db.prepare('INSERT INTO records(id,org_id,kind,data,external_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING').run(id,org,kind,JSON.stringify(data),id,now(),now());return get(id);
 }
 async function mutate(id,change){for(let attempt=0;attempt<5;attempt++){const v=await get(id);try{return await put(v.org,v.direction?MESSAGE:CONTACT,id,change(v),v.version);}catch(e){if(e.status!==409)throw e;}}fail('O atendimento mudou. Atualize antes de continuar.',409);}
 async function ensure(phone,name=''){
  const cfg=await config();if(!cfg?.enabled)fail('Ative a caixa de atendimento no administrativo.',409);
  return await get(contactId(phone))||put(cfg.org,CONTACT,contactId(phone),{phone,phoneKey:whatsappPhoneKey(phone),name:clean(name,120)||phone,mode:(await link(phone))?.enabled?'astra':'manual',lastInboundAt:0,createdAt:now(),suppressed:false});
 }
 async function held(phone){const cfg=await config();if(!cfg?.enabled)return false;const c=await get(contactId(phone));return c?.mode==='manual';}
 async function capture({phone,text,time,msg,name},linked){
  const cfg=await config();if(!cfg?.enabled)return false;
  const id='manual-in:'+hash(msg.id);if(await get(id))return true;
  let c=await get(contactId(phone));
  const stop=/^(sair|parar|desativar|stop|cancelar)$/i.test(text.trim());
  if(linked?.enabled&&c?.mode!=='manual'){if(stop){c=await ensure(phone,name);await mutate(c.id,v=>({...v,suppressed:true}));}return false;}
  c=await ensure(phone,name);
  const media=['image','video','document','audio'].includes(msg.type)&&msg[msg.type]?.id?{id:String(msg[msg.type].id),filename:msg[msg.type].filename,sha256:msg[msg.type].sha256}:null;
  await mutate(c.id,v=>({...v,lastInboundAt:Math.max(time,v.lastInboundAt||0),suppressed:stop||v.suppressed}));
  await put(cfg.org,MESSAGE,id,{contactId:c.id,direction:'incoming',text:clean(text||msg[msg.type]?.caption,16000),media,state:media?'pending_media':'received',unsupported:msg.type!=='text'&&!media,providerId:String(msg.id),sentAt:time,createdAt:now()});
  return true;
 }
 async function listing(user,phone){access(user);const cfg=await config();const templates=manualTemplates(env);
  const contacts=(await db.prepare('SELECT * FROM records WHERE kind=? ORDER BY updated_at DESC LIMIT 300').all(CONTACT)).map(parse);
  for(const row of await db.prepare("SELECT * FROM records WHERE kind='whatsapp_chat_link' AND json_extract(data,'$.enabled')=1 LIMIT 300").all()){
   const l=parse(row);if(!await db.prepare('SELECT 1 FROM memberships WHERE org_id=? AND user_id=?').get(l.org,l.userId))continue;
   if(!contacts.some(c=>c.phoneKey===whatsappPhoneKey(l.phone))){const u=await db.prepare('SELECT name FROM users WHERE id=?').get(l.userId);contacts.push({id:contactId(l.phone),phone:l.phone,phoneKey:whatsappPhoneKey(l.phone),name:u?.name||l.phone,mode:'astra',lastInboundAt:l.lastInboundAt,linked:true});}
  }
  let selected=null,messages=[];
  if(phone){phone=whatsappPhone(phone,{international:true});selected=contacts.find(c=>c.phoneKey===whatsappPhoneKey(phone));if(selected){const l=await link(phone);selected={...selected,linked:!!l?.enabled,insideWindow:Math.max(selected.lastInboundAt||0,l?.lastInboundAt||0)>now()-DAY};messages=(await db.prepare("SELECT * FROM records WHERE kind=? AND json_extract(data,'$.contactId')=? ORDER BY created_at DESC LIMIT 100").all(MESSAGE,selected.id)).map(parse).reverse().map(({media,...m})=>({...m,hasMedia:!!media,asset:m.asset?{id:m.asset.id,name:m.asset.name,mime:m.asset.mime,url:'/api/portal/files/'+encodeURIComponent(m.asset.id)}:null}));}}
  return {enabled:!!cfg?.enabled,configured:ready(),officialPhone:env.HELPU_WHATSAPP_NUMBER||'',welcomePersonalized:!!env.HELPU_WHATSAPP_WELCOME_TEMPLATE_V2,contacts:contacts.map(({consent,org,...c})=>c),selected,messages,templates};
 }
 async function action(user,d){access(user);
  if(d.action==='enable'){
   if(d.confirmed!==true)fail('Confirme a ativação da caixa manual.');const existing=await config();if(existing?.enabled)return {enabled:true};
   const member=await db.prepare('SELECT org_id FROM memberships WHERE user_id=? ORDER BY org_id LIMIT 1').get(user.id);if(!member)fail('Cadastre a empresa da equipe antes de ativar.',409);
   await put(member.org_id,'helpu_manual_config',CONFIG,{enabled:true,actor:user.id,createdAt:now()},existing?.version);return {enabled:true};
  }
  const known=await get(contactId(String(d.phone||'').replace(/\D/g,'')));const phone=whatsappPhone(d.phone,{international:!!known});if(env.HELPU_WHATSAPP_NUMBER&&whatsappPhoneKey(phone)===whatsappPhoneKey(whatsappPhone(env.HELPU_WHATSAPP_NUMBER,{international:true})))fail('Use o telefone do contato, não o número da Helpu.');
  if(d.action==='contact'){let c=await ensure(phone,d.name);if(d.consent===true){if(clean(d.evidence).length<10)fail('Registre onde e quando o contato autorizou mensagens.');if(c.suppressed)fail('Este contato pediu para sair. Aguarde uma nova autorização registrada pelo contato.',409);c=await put(c.org,CONTACT,c.id,{...c,name:clean(d.name,120)||c.name,consent:{at:now(),actor:user.id,evidence:clean(d.evidence,1000)}},c.version);}return c;}
  if(d.action==='take'){const c=await ensure(phone,d.name);await put(c.org,CONTACT,c.id,{...c,mode:'manual',operator:user.id,takenAt:now()},c.version);return {mode:'manual'};}
  const c=await get(contactId(phone));if(!c)fail('Contato não encontrado.',404);
  if(d.action==='resume'){
   const l=await link(phone);if(!l?.enabled)fail('O cliente precisa ativar e confirmar o WhatsApp no portal antes de usar o Astra.',409);
   if(d.confirmed!==true)fail('Confirme a retomada do Astra e das entregas pendentes.');
   await put(c.org,CONTACT,c.id,{...c,mode:'astra',operator:user.id,resumedAt:now()},c.version);return {mode:'astra'};
  }
  if(d.action==='send')return send(user,c,d);
  fail('Ação inválida.');
 }
 async function graph(route,body,multipart=false){const response=await fetcher('https://graph.facebook.com/'+version()+'/'+route,{method:'POST',headers:{Authorization:'Bearer '+env.HELPU_WHATSAPP_ACCESS_TOKEN,...multipart?{}:{'Content-Type':'application/json'}},body:multipart?body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});const result=await response.json();if(!response.ok)throw Object.assign(new Error('A Meta recusou o envio. Confira o modelo aprovado, a janela e a configuração do número.'),{rejected:true,providerCode:Number(result.error?.code)||null});return result;}
 async function send(user,c,d){
  if(!ready())fail('O WhatsApp oficial ainda não está configurado.',409);
  if(!/^[a-f0-9-]{36}$/i.test(d.requestId||''))fail('Identificador do envio inválido.');
  if(c.mode!=='manual')fail('Assuma o atendimento antes de enviar.',409);if(c.suppressed)fail('O contato pediu para sair. Não envie novas mensagens.',409);
  const body={messaging_product:'whatsapp',to:c.phone},text=clean(d.text,4096),templates=manualTemplates(env),l=await link(c.phone),inside=Math.max(c.lastInboundAt||0,l?.lastInboundAt||0)>now()-DAY;
  let asset=null,display=text;
  if(d.template){
   const t=templates.find(t=>t.name===d.template&&t.language===d.language);if(!t)fail('Escolha um modelo aprovado e configurado para atendimento.');
   if(!c.consent&&!inside)fail('Registre a autorização do contato antes de iniciar uma conversa.',409);
   if(!Array.isArray(d.parameters)||d.parameters.length!==t.parameters||d.parameters.some(p=>typeof p!=='string'||!p.trim()||p.length>500))fail('Preencha os campos do modelo.');
   body.type='template';body.template={name:t.name,language:{code:t.language},...t.parameters?{components:[{type:'body',parameters:d.parameters.map(p=>({type:'text',text:p.trim()}))}]}:{}};display=t.text.replace(/\{\{(\d+)\}\}/g,(_,n)=>d.parameters[+n-1]||'');
  }else{
   if(!inside)fail('Fora da janela de 24 horas, escolha um modelo aprovado. Aguardar uma resposta também reabre a janela.',409);
   if(!text&&!d.assetId)fail('Escreva uma mensagem ou anexe um arquivo.');
   if(d.assetId){asset=await db.prepare("SELECT * FROM assets WHERE id=? AND org_id=? AND source_url='helpu:manual-whatsapp'").get(d.assetId,c.org);if(!asset)fail('Arquivo indisponível para este atendimento.',404);if(text.length>1024)fail('Use até 1.024 caracteres com anexo.');}
   else{body.type='text';body.text={body:text};}
  }
  const id='manual-out:'+hash(d.requestId),fingerprint=hash(JSON.stringify([c.id,text,d.template||'',d.language||'',d.parameters||[],asset?.id||'']));
  const previous=await get(id);if(previous){if(previous.fingerprint!==fingerprint)fail('O identificador já pertence a outra mensagem.',409);return previous;}
  const claimed=await db.prepare("INSERT INTO records(id,org_id,kind,data,external_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING RETURNING id").get(id,c.org,MESSAGE,JSON.stringify({contactId:c.id,direction:'outgoing',text:display,asset:asset?{id:asset.id,name:asset.name,mime:asset.mime}:null,state:'sending',fingerprint,operator:user.id,createdAt:now()}),id,now(),now());
  if(!claimed)return get(id);
  try{
   if(asset){const type=asset.mime==='video/mp4'?'video':asset.mime.startsWith('image/')?'image':'document';const form=new FormData();form.set('messaging_product','whatsapp');form.set('file',new Blob([fs.readFileSync(await assetPath(c.org,asset.id,true))],{type:asset.mime}),asset.name);const uploaded=await graph(env.HELPU_WHATSAPP_PHONE_NUMBER_ID+'/media',form,true);if(!uploaded.id)throw Error('Arquivo não confirmado');body.type=type;body[type]={id:uploaded.id,...type==='document'?{filename:asset.name}:{},...text?{caption:text}:{}};}
   const current=await get(c.id),currentLink=await link(c.phone);
   if(current.mode!=='manual'||current.suppressed||!await held(c.phone)||!d.template&&Math.max(current.lastInboundAt||0,currentLink?.lastInboundAt||0)<=now()-DAY)throw Object.assign(Error('O atendimento mudou antes do envio.'),{rejected:true});
   const result=await graph(env.HELPU_WHATSAPP_PHONE_NUMBER_ID+'/messages',body),row=await get(id);
   return put(c.org,MESSAGE,id,{...row,state:result.messages?.[0]?.id?'accepted':'uncertain',providerId:String(result.messages?.[0]?.id||'')},row.version);
  }catch(e){const row=await get(id);return put(c.org,MESSAGE,id,{...row,state:e.rejected?'failed':'uncertain',error:e.rejected?e.message:'Envio sem confirmação. Confira com o contato antes de tentar novamente.',providerCode:e.providerCode||null},row.version);}
 }
 async function upload(user,phone,name,bytes){access(user);const c=await ensure(whatsappPhone(phone,{international:true}));if(bytes.length>3*1024*1024)fail('Envie arquivo de até 3 MB.');if(!['image/png','image/jpeg','video/mp4','application/pdf'].includes(assetType(bytes)?.[0]))fail('Envie JPG, PNG, PDF ou MP4.');const a=await storeAsset(c.org,name,bytes,'helpu:manual-whatsapp');return {id:a.id,name:a.name,mime:a.mime};}
 async function delivery(statuses){for(const status of statuses.slice(0,100)){if(!['sent','delivered','read','failed'].includes(status.status))continue;const row=parse(await db.prepare("SELECT * FROM records WHERE kind=? AND json_extract(data,'$.providerId')=?").get(MESSAGE,String(status.id||'')));if(!row||row.direction!=='outgoing')continue;const c=await get(row.contactId);if(status.recipient_id&&whatsappPhoneKey(String(status.recipient_id))!==c?.phoneKey)continue;const rank={sending:0,uncertain:0,accepted:1,sent:2,failed:3,delivered:4,read:5};if(rank[status.status]<=rank[row.state])continue;await put(row.org,MESSAGE,row.id,{...row,state:status.status},row.version);}}
 async function tick(){
  if(!(await config())?.enabled)return;
  for(const r of await db.prepare("SELECT * FROM records WHERE kind=? AND json_extract(data,'$.state') IN ('sending','downloading') AND updated_at<?").all(MESSAGE,now()-60000)){const m=parse(r);try{await put(m.org,MESSAGE,m.id,{...m,state:m.state==='sending'?'uncertain':'media_failed',error:'Processamento sem confirmação. Não foi repetido automaticamente.'},m.version);}catch(e){if(e.status!==409)throw e;}}
  for(const r of await db.prepare("SELECT * FROM records WHERE kind=? AND json_extract(data,'$.state')='pending_media' LIMIT 2").all(MESSAGE)){
   let m=parse(r);try{m=await put(m.org,MESSAGE,m.id,{...m,state:'downloading'},m.version);}catch(e){if(e.status===409)continue;throw e;}
   try{const file=await receiveWhatsAppMedia({media:m.media,token:env.HELPU_WHATSAPP_ACCESS_TOKEN,phoneId:env.HELPU_WHATSAPP_PHONE_NUMBER_ID,version:version(),fetcher});const asset=await storeAsset(m.org,file.name,file.bytes,'helpu:manual-whatsapp');await mutate(m.id,v=>({...v,state:'received',asset:{id:asset.id,name:asset.name,mime:asset.mime}}));}
   catch{await mutate(m.id,v=>({...v,state:'media_failed',error:'Não foi possível baixar este anexo. Peça o reenvio ao contato.'}));}
  }
 }
 return {action,listing,capture,held,delivery,tick,upload};
}
