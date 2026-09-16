import {createHash, createHmac, randomBytes, randomUUID, timingSafeEqual} from 'node:crypto';
import fs from 'node:fs';

const hash = value => createHash('sha256').update(value).digest('hex');
const parse = row => row ? {...JSON.parse(row.data), org: row.org_id, recordId: row.id} : null;
const fail = (text, status = 422) => { throw Object.assign(new Error(text), {status}); };
export function whatsappPhone(value) {
  let n = String(value || '').replace(/\D/g, '');
  if (n.length === 10 || n.length === 11) n = '55' + n;
  if (!/^[1-9]\d{9,14}$/.test(n)) fail('Informe o telefone com DDD e código do país.');
  return n;
}
// Meta can report Brazilian mobile numbers without the ninth digit.
const phoneKey = n => /^55\d{2}9\d{8}$/.test(n) ? n.slice(0,4) + n.slice(5) : n;

export function createWhatsAppChat({db, metadata, saveMetadata, conversation, assetPath, env = process.env, fetcher = fetch, now = Date.now}) {
  const officialPhone = whatsappPhone(env.HELPU_WHATSAPP_NUMBER || '5554999902688');
  const config = () => ({token: env.HELPU_WHATSAPP_ACCESS_TOKEN, phoneId: env.HELPU_WHATSAPP_PHONE_NUMBER_ID, secret: env.HELPU_WHATSAPP_APP_SECRET, verify: env.HELPU_WHATSAPP_VERIFY_TOKEN});
  const configured = () => Object.values(config()).every(Boolean);
  const key = user => 'whatsapp-chat:' + user;
  const claimId = phone => 'wa-phone:' + hash(phoneKey(phone));
  const getClaim = async phone => parse(await db.prepare("SELECT * FROM records WHERE id=? AND kind='whatsapp_chat_link'").get(claimId(phone)));
  const member = async link => !!await db.prepare('SELECT 1 FROM memberships WHERE org_id=? AND user_id=?').get(link.org, link.userId);
  async function put(kind, id, org, data) {
    const {org: ignoredOrg, recordId: ignoredId, ...clean} = data;
    await db.prepare('INSERT INTO records(id,org_id,kind,data,external_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET org_id=excluded.org_id,data=excluded.data,updated_at=excluded.updated_at').run(id, org, kind, JSON.stringify(clean), id, now(), now());
  }
  async function status(org, user) {
    const saved = await metadata(org, key(user.id));
    const link = saved.phone ? await getClaim(saved.phone) : null;
    const mine = link?.org === org && link.userId === user.id;
    const uncertain = mine && await db.prepare("SELECT 1 FROM records WHERE org_id=? AND kind='whatsapp_chat_outbox' AND json_extract(data,'$.generation')=? AND json_extract(data,'$.state') IN ('uncertain','sending') LIMIT 1").get(org,link.generation);
    return {officialPhone, configured: configured(), phone: saved.phone || '', verified: !!mine, enabled: !!(mine && link.enabled), threadId: mine ? link.threadId : '', mode: mine ? link.mode : saved.mode || 'execute', pending: !!saved.codeHash && saved.expiresAt > now(), lastError: uncertain ? 'Uma entrega não foi confirmada. Confira a conversa no painel; o envio não será repetido automaticamente.' : '', deliveryState: mine && Number(link.lastInboundAt)<now()-86400000 ? 'waiting_window' : ''};
  }
  async function save(org, user, input) {
    const old = await metadata(org, key(user.id)), phone = whatsappPhone(input.phone || old.phone);
    if (phoneKey(phone) === phoneKey(officialPhone)) fail('Informe seu WhatsApp pessoal de contato. O número oficial da Helpu recebe os pedidos.');
    const mode = input.mode === 'plan' ? 'plan' : 'execute';
    if (input.enabled === false) {
      const previous = old.phone ? await getClaim(old.phone) : null;
      if (previous?.org === org && previous.userId === user.id) await put('whatsapp_chat_link', previous.recordId, org, {...previous, enabled: false});
      await saveMetadata(org, key(user.id), {phone, mode});
      return status(org, user);
    }
    if (input.consent !== true) fail('Autorize a conversa e o envio das respostas para seu WhatsApp.');
    if (input.threadId && !await db.prepare('SELECT 1 FROM conversations WHERE id=? AND org_id=?').get(input.threadId, org)) fail('Conversa não encontrada.', 404);
    const existing = await getClaim(phone);
    if (existing?.org === org && existing.userId === user.id && existing.enabled && !input.reconnect) {
      await put('whatsapp_chat_link', existing.recordId, org, {...existing, mode, threadId: input.threadId || existing.threadId, since: input.threadId && input.threadId !== existing.threadId ? now() : existing.since});
      await saveMetadata(org, key(user.id), {phone, mode});
      return status(org, user);
    }
    // Re-enabling also proves current ownership. A saved telephone is never authorization.
    if (old.issuedAt && now() - old.issuedAt < 60000) fail('Aguarde um minuto antes de gerar outra confirmação.', 429);
    if (old.phone) {
      const previous = await getClaim(old.phone);
      if (previous?.org === org && previous.userId === user.id) await put('whatsapp_chat_link', previous.recordId, org, {...previous, enabled: false});
    }
    const code = randomBytes(16).toString('hex');
    await saveMetadata(org, key(user.id), {phone, mode, threadId: input.threadId || '', codeHash: hash(code), issuedAt: now(), expiresAt: now() + 600000});
    return {...await status(org, user), connectUrl: configured() ? 'https://wa.me/' + officialPhone + '?text=' + encodeURIComponent('HELPU ' + code) : '', message: configured() ? 'Envie a mensagem de confirmação pelo telefone informado. O link expira em dez minutos.' : 'Número salvo. A administração precisa conectar o WhatsApp oficial da Helpu antes da confirmação.'};
  }
  async function receive(value) {
    if (!configured() || String(value.metadata?.phone_number_id) !== String(config().phoneId)) return;
    if (value.metadata?.display_phone_number && phoneKey(whatsappPhone(value.metadata.display_phone_number)) !== phoneKey(officialPhone)) return;
    for (const msg of (value.messages || []).slice(0,100)) {
      if (!msg.id || !msg.from) continue;
      const phone = whatsappPhone(msg.from), time = Number(msg.timestamp)*1000;
      if (!Number.isFinite(time) || time < now()-86400000 || time > now()+300000) continue;
      const text = String(msg.text?.body || '').slice(0,16000), code = /^HELPU ([a-f0-9]{32})$/i.exec(text.trim());
      if (code) {
        const pending = await db.prepare("SELECT * FROM records WHERE kind='connection_validation' AND external_id LIKE 'whatsapp-chat:%' AND json_extract(data,'$.codeHash')=?").get(hash(code[1].toLowerCase()));
        if (!pending) continue;
        const saved = JSON.parse(pending.data), userId = Number(pending.external_id.slice('whatsapp-chat:'.length));
        if (saved.expiresAt < now() || phoneKey(saved.phone) !== phoneKey(phone) || !await member({org:pending.org_id,userId})) continue;
        // Atomic consumption and binding prevent replay and partial registration.
        await db.exec('BEGIN IMMEDIATE');
        try {
        const consumed = await db.prepare('UPDATE records SET data=?,updated_at=? WHERE id=? AND data=? RETURNING id').get(JSON.stringify({phone:saved.phone,mode:saved.mode}),now(),pending.id,pending.data);
        if (!consumed) {await db.exec('COMMIT');continue;}
        const threadId = saved.threadId || randomUUID();
        if (!saved.threadId) await db.prepare('INSERT INTO conversations VALUES(?,?,?,?,?)').run(threadId,pending.org_id,'Astra · WhatsApp',now(),now());
        const link = {phone,userId,threadId,mode:saved.mode,enabled:true,generation:randomUUID(),since:now(),lastInboundAt:time};
        await put('whatsapp_chat_link',claimId(phone),pending.org_id,link);
        await conversation.appendMessage(pending.org_id,threadId,'assistant','WhatsApp conectado. Você pode pedir criações por aqui e continuar esta conversa no painel. Para desativar, envie SAIR.');
        await db.exec('COMMIT');
        } catch(error) {await db.exec('ROLLBACK');throw error;}
        continue;
      }
      const link = await getClaim(phone);
      if (!link?.enabled || !await member(link)) continue;
      // Window updates are atomic so a concurrent opt-out cannot be undone.
      await db.prepare("UPDATE records SET data=json_set(data,'$.lastInboundAt',?),updated_at=? WHERE id=? AND json_extract(data,'$.generation')=? AND json_extract(data,'$.enabled')=1").run(String(Math.max(time,Number(link.lastInboundAt)||0)),now(),link.recordId,link.generation);
      if (/^(sair|parar|desativar)$/i.test(text.trim())) {
        await db.prepare("UPDATE records SET data=?,updated_at=? WHERE id=? AND json_extract(data,'$.generation')=?").run(JSON.stringify((({org,recordId,...rest})=>({...rest,enabled:false}))(link)),now(),link.recordId,link.generation);
        continue;
      }
      const eventId = 'wa-in:' + hash(msg.id);
      await db.prepare('INSERT INTO records(id,org_id,kind,data,external_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING').run(eventId,link.org,'whatsapp_chat_inbox',JSON.stringify({phone,threadId:link.threadId,generation:link.generation,mode:link.mode,text:msg.type==='text'?text:'',unsupported:msg.type!=='text',state:'queued'}),eventId,now(),now());
    }
  }
  async function webhook(req, res, url, readRaw) {
    const conf=config();
    if(req.method==='GET') {
      if(conf.verify && url.searchParams.get('hub.mode')==='subscribe' && url.searchParams.get('hub.verify_token')===conf.verify) res.writeHead(200,{'Content-Type':'text/plain'}).end(url.searchParams.get('hub.challenge')||'');
      else res.writeHead(403).end();
      return;
    }
    if(req.method!=='POST'){res.writeHead(405).end();return;}
    const raw=await readRaw(req,1048576), signature=req.headers['x-hub-signature-256'];
    if(!conf.secret||!/^sha256=[a-f0-9]{64}$/.test(signature||'')||!timingSafeEqual(createHmac('sha256',conf.secret).update(raw).digest(),Buffer.from(signature.slice(7),'hex'))){res.writeHead(403).end();return;}
    let data;try{data=JSON.parse(raw);}catch{res.writeHead(400).end();return;}
    for(const entry of data.entry||[])for(const change of entry.changes||[])await receive(change.value||{});
    res.writeHead(200,{'Content-Type':'application/json'}).end('{"received":true}');
  }
  async function graph(path, body, multipart=false) {
    const conf=config(), version=/^v\d+\.\d+$/.test(env.HELPU_WHATSAPP_API_VERSION||'')?env.HELPU_WHATSAPP_API_VERSION:'v24.0';
    const response=await fetcher('https://graph.facebook.com/'+version+'/'+path,{method:'POST',headers:{Authorization:'Bearer '+conf.token,...multipart?{}:{'Content-Type':'application/json'}},body:multipart?body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
    if(!response.ok)throw new Error('O WhatsApp não confirmou a entrega. Confira as credenciais e as permissões do número oficial.');
    return response.json();
  }
  async function sendPiece(link,piece) {
    const live=await getClaim(link.phone);
    if(!live?.enabled||live.generation!==link.generation||live.org!==link.org||!await member(live))return 'canceled';
    if(Number(live.lastInboundAt)<now()-86400000)return 'waiting_window';
    const body={messaging_product:'whatsapp',to:live.phone};
    if(piece.assetId) {
      const asset=await db.prepare('SELECT * FROM assets WHERE org_id=? AND id=?').get(link.org,piece.assetId);
      if(!asset)throw new Error('Arquivo não encontrado na empresa.');
      const maximum={'image/png':5,'image/jpeg':5,'video/mp4':16,'application/pdf':25}[asset.mime];
      if(!maximum||asset.size>maximum*1024*1024) {
        return sendPiece(link,{text:'O arquivo “'+asset.name+'” está disponível na Biblioteca da Helpu. Abra o painel para baixar este formato ou tamanho de arquivo.'});
      }
      const form=new FormData();form.set('messaging_product','whatsapp');form.set('file',new Blob([fs.readFileSync(await assetPath(link.org,asset.id))],{type:asset.mime}),asset.name);
      const media=await graph(config().phoneId+'/media',form,true);
      if(!media.id)throw new Error('O WhatsApp não confirmou o arquivo.');
      body.type=asset.mime==='video/mp4'?'video':['image/png','image/jpeg'].includes(asset.mime)?'image':'document';
      body[body.type]={id:media.id,...body.type==='document'?{filename:asset.name}:{}};
      const check=await getClaim(link.phone);if(!check?.enabled||check.generation!==link.generation)return 'canceled';
    }else{body.type='text';body.text={body:piece.text};}
    const result=await graph(config().phoneId+'/messages',body);
    if(!result.messages?.[0]?.id)throw new Error('O WhatsApp não confirmou a mensagem.');
    return 'sent';
  }
  async function tick() {
    if(!configured())return;
    // Bound network work so deliveries cannot consume the entire online worker lease.
    let totalSent=0;
    for(const row of await db.prepare("SELECT * FROM records WHERE kind='whatsapp_chat_inbox' AND json_extract(data,'$.state')='queued' ORDER BY created_at LIMIT 10").all()) {
      const event=parse(row),link=await getClaim(event.phone);
      if(!link?.enabled||link.org!==event.org||link.threadId!==event.threadId||link.generation!==event.generation||!await member(link)){await put(row.kind,row.id,row.org_id,{...event,state:'canceled'});continue;}
      try {
        if(event.unsupported) await conversation.appendMessage(link.org,link.threadId,'assistant','Por enquanto, envie os arquivos pelo painel da Helpu. Aqui no WhatsApp você já pode pedir criações e alterações por texto.');
        else await conversation.submitMessage(link.org,link.threadId,{id:link.userId},{text:event.text,mode:event.mode==='plan'||link.mode==='plan'?'plan':'execute',idempotencyKey:row.id,attachments:[]});
        await put(row.kind,row.id,row.org_id,{...event,state:'processed'});
      }catch(error){if(error.status===409)continue;await put(row.kind,row.id,row.org_id,{...event,state:'failed'});await conversation.appendMessage(link.org,link.threadId,'assistant','Não consegui iniciar esse pedido. Confira o andamento e os limites da empresa no painel.');}
    }
    for(const row of await db.prepare("SELECT * FROM records WHERE kind='whatsapp_chat_link' AND json_extract(data,'$.enabled')=1").all()) {
      const link=parse(row);if(!await member(link))continue;
      const donePrefix='wa-done:'+link.generation+':';
      const messages=await db.prepare("SELECT * FROM conversation_messages WHERE org_id=? AND conversation_id=? AND role='assistant' AND created_at>=? AND NOT EXISTS (SELECT 1 FROM records WHERE kind='whatsapp_chat_delivery' AND external_id=? || conversation_messages.id) ORDER BY created_at,rowid LIMIT 40").all(link.org,link.threadId,link.since,donePrefix);
      const dailyLimit=Math.max(1,Math.min(500,Number(env.HELPU_WHATSAPP_DAILY_MESSAGES)||60));
      let dailyCount=Number((await db.prepare("SELECT count(*) AS n FROM records WHERE org_id=? AND kind='whatsapp_chat_outbox' AND created_at>=?").get(link.org,now()-86400000)).n);
      let sent=0;
      for(const message of messages) {
        const pieces=[];for(let i=0;i<message.text.length;i+=3500)pieces.push({text:message.text.slice(i,i+3500)});
        for(const assetId of JSON.parse(message.attachments||'[]'))pieces.push({assetId});
        for(let i=0;i<pieces.length;i++) {
          if(totalSent>=3)return;
          if(sent>=10||dailyCount>=dailyLimit)break;
          const id='wa-out:'+hash(link.generation+':'+message.id+':'+i);
          if(await db.prepare('SELECT 1 FROM records WHERE id=?').get(id))continue;
          if(Number(link.lastInboundAt)<now()-86400000)break;
          const claim=await db.prepare('INSERT INTO records(id,org_id,kind,data,external_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING RETURNING id').get(id,link.org,'whatsapp_chat_outbox',JSON.stringify({state:'sending',generation:link.generation}),id,now(),now());
          if(!claim)continue;
          sent++;dailyCount++;totalSent++;
          try{const state=await sendPiece(link,pieces[i]);if(state==='waiting_window'){await db.prepare('DELETE FROM records WHERE id=?').run(id);return;}await put('whatsapp_chat_outbox',id,link.org,{state,generation:link.generation});}
          catch{await put('whatsapp_chat_outbox',id,link.org,{state:'uncertain',generation:link.generation});break;}
          if(totalSent>=3)return;
        }
        const done=[];for(let i=0;i<pieces.length;i++)done.push(await db.prepare('SELECT data FROM records WHERE id=?').get('wa-out:'+hash(link.generation+':'+message.id+':'+i)));
        if(done.every(Boolean))await put('whatsapp_chat_delivery',donePrefix+message.id,link.org,{complete:true});
        if(sent>=10||dailyCount>=dailyLimit)break;
      }
    }
  }
  return {status,save,receive,webhook,tick};
}
