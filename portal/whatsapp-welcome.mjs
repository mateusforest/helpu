import {createHash} from 'node:crypto';
import {whatsappPhone, whatsappPhoneKey} from './whatsapp-chat.mjs';

export const WELCOME_CONSENT_VERSION = 'signup-welcome-2026-09-19';
export const WELCOME_CONSENT_TEXT = 'Quero receber uma mensagem de boas-vindas da Helpu neste WhatsApp. Isso não ativa a operação pelo WhatsApp nem me inscreve em campanhas.';
export const WELCOME_TEMPLATE_TEXT = 'Boas-vindas à Helpu! Organize o marketing da sua empresa e crie conteúdos com apoio de inteligência artificial. Para pedir criações e receber arquivos por aqui, entre no portal, abra Conversa na tela inicial e selecione Ativar WhatsApp. Confirme o vínculo pelo seu telefone. Até concluir essa etapa, a operação por aqui permanece desativada. Se não solicitou esta mensagem ou não deseja recebê-la, responda SAIR.';
const DAY = 86400000;
const kind = 'signup_whatsapp_contact';
const idFor = userId => 'signup-wa:' + userId;
const fail = message => {throw Object.assign(new Error(message), {status:400});};
const hash = value => createHash('sha256').update(value).digest('hex');

export function signupWhatsAppInput(input, env = process.env) {
  const consent = input.whatsappWelcomeConsent === true;
  if (input.whatsappWelcomeConsent !== undefined && typeof input.whatsappWelcomeConsent !== 'boolean') fail('Confira a autorização para receber as boas-vindas.');
  if (input.phone !== undefined && typeof input.phone !== 'string') fail('Informe um telefone válido.');
  const raw = (input.phone || '').trim();
  if (!raw) {
    if (consent) fail('Informe seu WhatsApp para receber as boas-vindas ou desmarque a autorização.');
    return {phone:'', consent:false};
  }
  if (raw.length > 32 || !/^\+?[\d\s().-]+$/.test(raw)) fail('Informe seu WhatsApp com DDD; para outros países, inclua + e o código do país.');
  let phone;
  try {phone = whatsappPhone(raw);} catch {fail('Informe seu WhatsApp com DDD; para outros países, inclua + e o código do país.');}
  if (env.HELPU_WHATSAPP_NUMBER && whatsappPhoneKey(phone) === whatsappPhoneKey(whatsappPhone(env.HELPU_WHATSAPP_NUMBER, {international:true}))) fail('Informe seu telefone de contato, não o número oficial da Helpu.');
  return {phone, consent};
}

export function createWhatsAppWelcome({db, env=process.env, fetcher=fetch, now=Date.now}) {
  function configuration() {
    const template = env.HELPU_WHATSAPP_WELCOME_TEMPLATE || '';
    const language = env.HELPU_WHATSAPP_WELCOME_LANGUAGE || 'pt_BR';
    return {template, language, ready:!!(env.HELPU_WHATSAPP_ACCESS_TOKEN && env.HELPU_WHATSAPP_PHONE_NUMBER_ID && env.HELPU_WHATSAPP_NUMBER && env.HELPU_WHATSAPP_APP_SECRET && env.HELPU_WHATSAPP_VERIFY_TOKEN && /^[a-z0-9_]{1,512}$/.test(template) && /^[a-z]{2}(?:_[A-Z]{2})?$/.test(language))};
  }
  const get = userId => db.prepare('SELECT * FROM records WHERE id=? AND kind=?').get(idFor(userId),kind);
  async function replace(row, data) {
    return db.prepare('UPDATE records SET data=?,updated_at=?,version=version+1 WHERE id=? AND data=? RETURNING id').get(JSON.stringify(data),now(),row.id,row.data);
  }
  async function register(org, user, input) {
    if (!input.phone) return;
    const time=now();
    const data={userId:Number(user.id),phone:input.phone,phoneKey:whatsappPhoneKey(input.phone),phoneVerified:false,
      consent:{granted:input.consent,version:WELCOME_CONSENT_VERSION,text:WELCOME_CONSENT_TEXT,source:'signup',at:time},
      state:input.consent?'queued':'not_requested',expiresAt:time+DAY};
    await db.prepare('INSERT INTO records(id,org_id,kind,data,external_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING').run(idFor(user.id),org,kind,JSON.stringify(data),idFor(user.id),time,time);
  }
  async function status(org,user) {
    const row=await get(user.id);
    if (!row || row.org_id!==org) return {phone:'',consent:false,state:'not_requested',operationEnabled:false};
    const contact=JSON.parse(row.data);
    let state=contact.state;
    if(state==='queued' && contact.expiresAt<=now()) state='expired';
    else if(state==='queued' && !configuration().ready) state='waiting_configuration';
    return {phone:contact.phone,consent:contact.consent.granted && !contact.revokedAt,state,operationEnabled:false};
  }
  async function revokeRow(row) {
    for(let attempt=0;row && attempt<4;attempt++) {
      const data=JSON.parse(row.data);
      if(data.revokedAt)return;
      if(await replace(row,{...data,revokedAt:now(),state:['queued','sending'].includes(data.state)?'canceled':data.state}))return;
      row=await get(data.userId);
    }
    if(row)throw Object.assign(new Error('Não foi possível cancelar a autorização. Tente novamente.'),{status:409});
  }
  async function revoke(org,user) {
    const row=await get(user.id);
    if (row?.org_id===org) {
      await revokeRow(row);
    }
    return status(org,user);
  }
  async function receive({phone,text}) {
    if (!/^(sair|parar|desativar|stop|cancelar)$/i.test(text.trim())) return;
    // Applies even before an operational chat link exists. Retain the opt-out
    // as suppression for later signups with this same telephone.
    const rows=await db.prepare("SELECT * FROM records WHERE kind=? AND json_extract(data,'$.phoneKey')=?").all(kind,whatsappPhoneKey(phone));
    for(const row of rows)await revokeRow(row);
  }
  async function delivery(statuses) {
    for(const event of statuses.slice(0,100)) {
      if(!event.id || !['sent','delivered','read','failed'].includes(event.status)) continue;
      const row=await db.prepare("SELECT * FROM records WHERE kind=? AND json_extract(data,'$.messageId')=?").get(kind,String(event.id));
      if(!row)continue;
      const data=JSON.parse(row.data);
      if(event.recipient_id && whatsappPhoneKey(String(event.recipient_id))!==data.phoneKey)continue;
      const rank={accepted:0,sent:1,failed:2,delivered:3,read:4};
      if((rank[event.status]??-1)<=(rank[data.state]??-1))continue;
      await replace(row,{...data,state:event.status,deliveryUpdatedAt:now()});
    }
  }
  async function suppressed(phoneKey) {
    return !!await db.prepare("SELECT 1 FROM records WHERE kind=? AND json_extract(data,'$.phoneKey')=? AND json_extract(data,'$.revokedAt') IS NOT NULL LIMIT 1").get(kind,phoneKey);
  }
  async function tick() {
    // A process can die after the provider accepted the request. Do not resend.
    const stale=await db.prepare("SELECT * FROM records WHERE kind=? AND json_extract(data,'$.state')='sending' AND updated_at<?").all(kind,now()-60000);
    for(const row of stale)await replace(row,{...JSON.parse(row.data),state:'uncertain'});
    const conf=configuration();
    const rows=await db.prepare("SELECT * FROM records WHERE kind=? AND json_extract(data,'$.state')='queued' ORDER BY created_at,id LIMIT 3").all(kind);
    for(const row of rows) {
      const data=JSON.parse(row.data);
      if(!data.consent.granted || data.revokedAt || await suppressed(data.phoneKey) || !await db.prepare('SELECT 1 FROM memberships WHERE org_id=? AND user_id=?').get(row.org_id,data.userId)) {
        await replace(row,{...data,state:'canceled'});continue;
      }
      if(data.expiresAt<=now()){await replace(row,{...data,state:'expired'});continue;}
      if(!conf.ready)continue;
      const sending={...data,state:'sending',attemptedAt:now(),template:conf.template,language:conf.language};
      if(!await replace(row,sending))continue;
      // One attempt per telephone per day across accounts and worker instances.
      const claimId='signup-wa-phone:'+hash(data.phoneKey);
      const claim=await db.prepare('INSERT INTO records(id,org_id,kind,data,external_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET org_id=excluded.org_id,data=excluded.data,updated_at=excluded.updated_at WHERE records.updated_at<? RETURNING id').get(claimId,row.org_id,'signup_whatsapp_dispatch',JSON.stringify({userId:data.userId}),claimId,now(),now(),now()-DAY);
      let live=await get(data.userId);
      if(!claim){if(live && JSON.parse(live.data).state==='sending')await replace(live,{...JSON.parse(live.data),state:'suppressed'});continue;}
      if(!live || JSON.parse(live.data).state!=='sending' || JSON.parse(live.data).revokedAt || await suppressed(data.phoneKey))continue;
      try {
        const version=/^v\d+\.\d+$/.test(env.HELPU_WHATSAPP_API_VERSION||'')?env.HELPU_WHATSAPP_API_VERSION:'v24.0';
        const response=await fetcher('https://graph.facebook.com/'+version+'/'+encodeURIComponent(env.HELPU_WHATSAPP_PHONE_NUMBER_ID)+'/messages',{
          method:'POST',headers:{Authorization:'Bearer '+env.HELPU_WHATSAPP_ACCESS_TOKEN,'Content-Type':'application/json'},
          body:JSON.stringify({messaging_product:'whatsapp',to:data.phone,type:'template',template:{name:conf.template,language:{code:conf.language}}}),
          signal:AbortSignal.timeout(10000)
        });
        const result=await response.json();
        const state=!response.ok?'failed':result.messages?.[0]?.id?'accepted':'uncertain';
        live=await get(data.userId);
        // Preserve revocation racing with the request; delivery already in flight
        // cannot be recalled, but no further communication is authorized.
        await replace(live,{...JSON.parse(live.data),state,messageId:response.ok?String(result.messages?.[0]?.id||''):'',providerCode:Number(result.error?.code)||null,completedAt:now()});
      } catch {
        live=await get(data.userId);
        await replace(live,{...JSON.parse(live.data),state:'uncertain',completedAt:now()});
      }
    }
  }
  return {register,status,revoke,receive,delivery,tick};
}
