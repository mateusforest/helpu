import {createReviewPreview} from './review-preview.mjs';
import {createTemplateCatalog} from './template-catalog.mjs';
import {adminOverview} from './admin-overview.mjs';
import {createFinance} from './finance.mjs';
import {createCommerce} from './commerce.mjs';
import {createAIManagement} from './ai-management.mjs';
import {createPricing} from './pricing.mjs';
import {createCommercial} from './commercial.mjs';
import {createConsultations} from './consultations.mjs';
import {createAssistedPublishing} from './assisted-publishing.mjs';
import {unlimited,parseUsageLimit,usageCount,usageSnapshot} from './usage.mjs';
import {recordProviderUsage} from './provider-usage.mjs';
import {createCreativeLibrary} from './creative-library.mjs';
import {createCreations,inlineVideoHash} from './creations.mjs';
import {createCreationSchedules} from './creation-schedules.mjs';
import {createReelsRenderer} from './reels-renderer.mjs';
import {createWhatsAppChat} from './whatsapp-chat.mjs';
import {createWhatsAppWelcome,signupWhatsAppInput} from './whatsapp-welcome.mjs';
import {resolveOpenAIConfig} from './openai-config.mjs';
import {createStripeBilling} from './stripe-billing.mjs';
import {createInstagramLogin} from './instagram-login.mjs';
import {filterAsync, mapAsync} from "./async-collections.mjs";
import fs from 'node:fs';
import {createStorage,hashFile} from './storage.mjs';
import {createStudio, dailyPriority} from './studio.mjs';
import {createImageWorkflow} from './image-generation.mjs';
import {createCloudRuntime} from './cloud-runtime.mjs';
import {createRuntimeTools} from './runtime-tools.mjs';
import {validateConnectionPatch} from './connection-validation.mjs';
import {createConversation} from './conversation.mjs';
import {createKernel} from './kernel.mjs';
import {inspectApprovedAsset, createPublicationWorkflow} from './publication.mjs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID, randomBytes, createCipheriv, createDecipheriv, createHmac, timingSafeEqual} from 'node:crypto';
import {AGENTS, CONNECTORS, KINDS, DEFAULT_POLICY, CONTENT_FORMATS, CHANNELS, LEAD_STAGES} from './catalog.mjs';
import {createProviders, ProviderError, publicUrl} from './providers.mjs';
const here = path.dirname(fileURLToPath(import.meta.url));
const parse = s => s ? JSON.parse(s) : {};
const escape = s => String(s ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
})[c]);
const fail = (message, status = 400) => {
  const e = new Error(message);
  e.status = status;
  throw e;
};
const str = (v, max = 10000) => typeof v === 'string' ? v.trim().slice(0, max) : '';
const finite = (v, min = 0, max = 1e12) => Number.isFinite(Number(v)) ? Math.max(min, Math.min(max, Number(v))) : 0;
const fields = {
  campaigns: ['name', 'objective', 'audience', 'offer', 'budget', 'startDate', 'endDate', 'channels', 'status', 'notes'],
  content: ['previousImageAssetId','referenceOnlyIds','imageLayout','slideIndex','slideCount','carouselOutline','referenceAssetIds','title', 'caption', 'visualPrompt', 'format', 'channel', 'campaignId', 'assetId', 'mediaUrl', 'mediaType', 'carouselUrls', 'scheduledAt', 'status', 'notes'],
  leads: ['name', 'email', 'phone', 'company', 'source', 'stage', 'value', 'consent', 'optOut', 'notes', 'nextAction', 'nextDate', 'campaignId'],
  messages: ['leadId', 'text', 'channel', 'direction', 'template', 'language', 'parameters', 'status'],
  tasks: ['title', 'description', 'dueDate', 'priority', 'status', 'campaignId'],
  metrics: ['date', 'channel', 'campaignId', 'impressions', 'reach', 'clicks', 'leads', 'sales', 'revenue', 'spend', 'notes'],
  pages: ['title', 'description', 'buttonLabel', 'active', 'campaignId'],
  knowledge: ['title', 'text', 'source']
};
const statuses = {
  campaigns: ['draft', 'planning', 'running', 'paused', 'complete'],
  content: ['draft', 'review', 'approved', 'scheduled'],
  messages: ['draft', 'recorded'],
  tasks: ['todo', 'doing', 'done']
};
export async function createPortal({db, dataDir, userFrom, json, safeOrigin, providers = createProviders(), startScheduler = true, browserLaunch, conversationRespond, publicationFetch, publicationResolve,cloud=false,storageClient,instagramLoginFetch,instagramLoginEnv,stripeFetch,stripeEnv,runtimeEnv,runtimeFetch,whatsappChatEnv=process.env,whatsappChatFetch,openaiEnv=process.env,deliveryOnly=true,creationRespond,reelsRenderer,operatorEnv=process.env,assistedNow=Date.now}) {
  const cloudRuntime=createCloudRuntime({env:runtimeEnv,fetcher:runtimeFetch});
  if(db.dialect==='postgres'){
    const migration=await db.prepare('SELECT version FROM portal_migrations ORDER BY version DESC LIMIT 1').get();
    if(migration?.version!==4)throw new Error('Supabase schema migration is required');
  }else await db.exec('CREATE TABLE IF NOT EXISTS portal_migrations(version INTEGER PRIMARY KEY,applied_at INTEGER NOT NULL)');
  if (!await db.prepare('SELECT 1 FROM portal_migrations WHERE version=1').get()) {
    await db.exec('BEGIN IMMEDIATE');
    try {
      await db.exec(fs.readFileSync(path.join(here, 'migrations/001.sql'), 'utf8'));
      await db.prepare('INSERT INTO portal_migrations VALUES(1,?)').run(Date.now());
      await db.exec('COMMIT');
    } catch (e) {
      await db.exec('ROLLBACK');
      throw e;
    }
  }
  if (!await db.prepare('SELECT 1 FROM portal_migrations WHERE version=2').get()) {
    await db.exec('BEGIN IMMEDIATE');
    try {
      await db.exec(fs.readFileSync(path.join(here, 'migrations/002.sql'), 'utf8'));
      await db.prepare('INSERT INTO portal_migrations VALUES(2,?)').run(Date.now());
      await db.exec('COMMIT');
    } catch (e) {
      await db.exec('ROLLBACK');
      throw e;
    }
  }
  if (!await db.prepare('SELECT 1 FROM portal_migrations WHERE version=3').get()) {
    await db.exec('BEGIN IMMEDIATE');
    try {
      await db.exec(fs.readFileSync(path.join(here, 'migrations/003.sql'), 'utf8'));
      await db.prepare('INSERT INTO portal_migrations VALUES(3,?)').run(Date.now());
      await db.exec('COMMIT');
    } catch (e) {
      await db.exec('ROLLBACK');
      throw e;
    }
  }
  if (!await db.prepare('SELECT 1 FROM portal_migrations WHERE version=4').get()) {
    await db.exec('BEGIN IMMEDIATE');
    try {
      await db.exec(fs.readFileSync(path.join(here, 'migrations/004.sql'), 'utf8'));
      await db.prepare('INSERT INTO portal_migrations VALUES(4,?)').run(Date.now());
      await db.exec('COMMIT');
    } catch (e) {
      await db.exec('ROLLBACK');
      throw e;
    }
  }
  const storage = path.join(dataDir, 'uploads');
  fs.mkdirSync(storage, {
    recursive: true
  });
  const keyPath = path.join(dataDir, 'integration.key');
  if(!cloud){
  try {
    fs.writeFileSync(keyPath, randomBytes(32), {
      flag: 'wx',
      mode: 0o600
    });
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
  }
  }
  const encryptionKey = cloud ? Buffer.from(process.env.HELPU_INTEGRATION_KEY||'','base64') : fs.readFileSync(keyPath);
  if (encryptionKey.length !== 32) throw new Error('Invalid integration key');
  const privateStorage=cloud?(storageClient||createStorage({url:process.env.SUPABASE_URL,key:process.env.SUPABASE_SERVICE_ROLE_KEY,directory:storage})):null;
  const seal = obj => {
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', encryptionKey, iv);
    const ciphertext = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
    return [iv, c.getAuthTag(), ciphertext].map(b => b.toString('base64')).join('.');
  };
  const unseal = value => {
    const [iv, tag, data] = value.split('.').map(x => Buffer.from(x, 'base64'));
    const c = createDecipheriv('aes-256-gcm', encryptionKey, iv);
    c.setAuthTag(tag);
    return JSON.parse(Buffer.concat([c.update(data), c.final()]).toString());
  };
  let stopped = false, busy = false, lastTick = null, kernel = null, publication = null, studio = null;
  async function metadata(org, key) {
    return parse((await db.prepare("SELECT data FROM records WHERE org_id=? AND kind='connection_validation' AND external_id=?").get(org, key))?.data);
  }
  async function saveMetadata(org, key, value) {
    const now = Date.now();
    await db.prepare("INSERT INTO records(id,org_id,kind,data,external_id,created_at,updated_at) VALUES(?,?,'connection_validation',?,?,?,?) ON CONFLICT(org_id,kind,external_id) DO UPDATE SET data=excluded.data,version=records.version+1,updated_at=excluded.updated_at").run(randomUUID(), org, JSON.stringify(value), key, now, now);
  }
  const billing=createStripeBilling({db,metadata,saveMetadata,company,fetcher:stripeFetch,env:stripeEnv});
  const instagramLogin=createInstagramLogin({db,access,fetcher:instagramLoginFetch,env:instagramLoginEnv,saveConnection:async(org,actor,value)=>{
    const existing=await integration(org,'instagram'),config={...existing,accessToken:value.accessToken,accountId:value.accountId,tokenExpiresAt:value.expiresAt,loginMethod:'instagram'};
    const time=Date.now();
    await db.exec('BEGIN IMMEDIATE');
    try{
      await db.prepare("INSERT INTO integrations(org_id,provider,sealed,verified_at,updated_at) VALUES(?,'instagram',?,?,?) ON CONFLICT(org_id,provider) DO UPDATE SET sealed=excluded.sealed,verified_at=excluded.verified_at,error=NULL,updated_at=excluded.updated_at").run(org,seal(config),time,time);
      await saveMetadata(org,'api:instagram',{status:'identity_detected',accountId:value.accountId,username:value.username,observedAt:time});
      await saveMetadata(org,'validation:instagram',{status:'identity_verified',provider:'instagram',completedAt:time,expiresAt:value.expiresAt});
      await audit(org,actor,'Instagram conectado com login oficial','instagram','@'+value.username);
      await db.exec('COMMIT');
    }catch(e){await db.exec('ROLLBACK');throw e;}
    await kernel.onBrand(org);
  }});
  async function assetPath(org, id, financialDownload=false) {
    const a = await db.prepare('SELECT * FROM assets WHERE id=? AND org_id=?').get(id, org);
    if (!a) fail('Arquivo não encontrado.', 404);
    if(a.source_url==='helpu:finance'&&!financialDownload)fail('Use a área Financeiro para acessar este documento.',403);
    if(privateStorage)return privateStorage.localPath(a);
    return path.join(storage, a.path);
  }
  const inspectAsset = async (org, id) => await inspectApprovedAsset(db, assetPath, org, id);
  async function writeProfile(org, input, actor, {source = 'supplied_by_user', reference = 'Marca e negócio', expectedUpdatedAt} = {}) {
    const c = await company(org);
    if (expectedUpdatedAt !== undefined && expectedUpdatedAt !== c.updatedAt) fail('O contexto mudou. Atualize e compare a versão atual antes de salvar.', 409);
    if (!['supplied_by_user', 'verified', 'inferred', 'unknown', 'needs_confirmation'].includes(source)) fail('Origem do contexto inválida.');
    const profile = {
      ...c.profile
    }, evidence = {
      ...c.profileEvidence
    };
    for (const key of ['description', 'audience', 'offer', 'differentials', 'tone', 'visualIdentity', 'goals', 'website', 'location', 'restrictions', 'competitors', 'salesProcess', 'positioning']) if (typeof input[key] === 'string' && str(input[key], 12000) !== profile[key]) {
      const next = str(input[key], 12000), previous = evidence[key];
      if (source === 'inferred' && profile[key]) continue;
      evidence[key] = {
        value: next,
        source,
        actor,
        reference,
        recordedAt: Date.now(),
        version: (previous?.version || 0) + 1
      };
      profile[key] = next;
      await saveRecord(org, 'knowledge', {
        title: 'Contexto: ' + key,
        text: JSON.stringify({
          field: key,
          previous: previous || ({
            value: c.profile[key] || null,
            source: 'unknown'
          }),
          current: evidence[key]
        }),
        source: reference
      }, actor);
    }
    const saved=await db.prepare('UPDATE companies SET profile=?,updated_at=? WHERE id=? AND updated_at=?').run(JSON.stringify({
      ...profile,
      _evidence: evidence
    }), Math.max(Date.now(), c.updatedAt + 1), org,c.updatedAt);
    if(saved.changes!==1)fail('O contexto mudou. Atualize antes de salvar.',409);
    await kernel?.onBrand(org);
    return await company(org);
  }
  async function updateProfile(...args) {
    await db.exec('SAVEPOINT profile_context');
    try {
      const result = await writeProfile(...args);
      await db.exec('RELEASE profile_context');
      return result;
    } catch (e) {
      await db.exec('ROLLBACK TO profile_context');
      await db.exec('RELEASE profile_context');
      throw e;
    }
  }
  async function audit(org, actor, action, resource = '', note = '') {
    await db.prepare('INSERT INTO audit VALUES(?,?,?,?,?,?,?)').run(randomUUID(), org, String(actor || 'sistema'), action, resource, str(note, 500), Date.now());
  }
  async function access(org, user) {
    if (!user) fail('Entre para acessar o portal.', 401);
    if (!await db.prepare('SELECT 1 FROM memberships WHERE org_id=? AND user_id=?').get(org, user.id)) fail('Empresa não encontrada.', 404);
  }
  async function company(org) {
    const row = await db.prepare('SELECT * FROM companies WHERE id=?').get(org);
    if (!row) fail('Empresa não encontrada.', 404);
    const profile = parse(row.profile), profileEvidence = profile._evidence || ({});
    delete profile._evidence;
    return {
      id: row.id,
      name: row.name,
      profile,
      profileEvidence,
      policy: {
        ...DEFAULT_POLICY,
        ...parse(row.policy),
        usageTestingEnabled:parse(row.policy).usageTestingEnabled===true||(process.env.HELPU_USAGE_TEST_ORGS||'').split(',').map(v=>v.trim()).includes(org)
      },
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
  async function newCompany(user, name) {
    const id = randomUUID(), now = Date.now();
    await db.exec('SAVEPOINT new_company');
    try {
      await db.prepare('INSERT INTO companies VALUES(?,?,?,?,?,?)').run(id, name, JSON.stringify({}), JSON.stringify(DEFAULT_POLICY), now, now);
      await db.prepare('INSERT INTO memberships VALUES(?,?,?)').run(id, user.id, 'owner');
      await db.exec('RELEASE SAVEPOINT new_company');
    } catch (e) {
      await db.exec('ROLLBACK TO SAVEPOINT new_company');
      await db.exec('RELEASE SAVEPOINT new_company');
      throw e;
    }
    await audit(id, user.id, 'Empresa criada', id, name);
    return await company(id);
  }
  async function companies(user) {
    let rows = await db.prepare('SELECT c.id,c.name FROM companies c JOIN memberships m ON m.org_id=c.id WHERE m.user_id=? ORDER BY c.created_at').all(user.id);
    if (!rows.length) {
      await newCompany(user, str(user.company, 120) || 'Minha empresa');
      rows = await db.prepare('SELECT c.id,c.name FROM companies c JOIN memberships m ON m.org_id=c.id WHERE m.user_id=? ORDER BY c.created_at').all(user.id);
    }
    return rows;
  }
  const decodeRecord = row => row ? {
    ...parse(row.data),
    id: row.id,
    kind: row.kind,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    version: row.version
  } : null;
  async function record(org, kind, id) {
    const r = decodeRecord(await db.prepare('SELECT * FROM records WHERE org_id=? AND kind=? AND id=?').get(org, kind, id));
    if (!r) fail('Registro não encontrado.', 404);
    return r;
  }
  async function list(org, kind, limit = 500) {
    return (await db.prepare('SELECT * FROM records WHERE org_id=? AND kind=? ORDER BY created_at DESC LIMIT ?').all(org, kind, limit)).map(decodeRecord);
  }
  async function storedIntegration(org, id) {
    const row = await db.prepare('SELECT sealed FROM integrations WHERE org_id=? AND provider=?').get(org, id);
    return row ? unseal(row.sealed) : {};
  }
  async function integration(org, id) {
    const saved = await storedIntegration(org, id);
    if(id!=='openai')return saved;
    const routing=await db.prepare("SELECT data FROM records WHERE org_id=? AND kind='ai_routing' AND id=?").get(org,'ai-routing:'+org);
    return {...resolveOpenAIConfig(saved,openaiEnv),aiRouting:parse(routing?.data)};
  }
  async function integrationState(org) {
    return await mapAsync(CONNECTORS, async def => {
      const row = await db.prepare('SELECT * FROM integrations WHERE org_id=? AND provider=?').get(org, def.id);
      const config = await integration(org, def.id), values = {}, configuredFields = {};
      for (const [f, , secret, fallback] of def.fields) {
        configuredFields[f] = Boolean(config[f]);
        if (!secret) values[f] = (config[f] ?? fallback) ?? '';
      }
      return {
        ...def,
        validation: await metadata(org, 'validation:' + def.id),
        identity: await metadata(org, 'api:' + def.id),
        values,
        configuredFields,
        configured: Boolean(def.fields.filter(f => f[2]).some(([f]) => config[f])),
        verifiedAt: row?.verified_at || null,
        error: row?.error || null
      };
    });
  }
  async function clean(org, kind, input, old = {}, internal = false) {
    if (!fields[kind]) fail('Tipo de registro inválido.');
    const result = {
      ...old
    };
    for (const field of fields[kind]) {
      if (!((field in input))) continue;
      let v = input[field];
      if(['slideIndex','slideCount'].includes(field)){v=Number(v);if(!Number.isInteger(v)||v<1||v>10)fail('Página de carrossel inválida.');}
      else if (['budget', 'value', 'impressions', 'reach', 'clicks', 'leads', 'sales', 'revenue', 'spend'].includes(field)) {
        if (v === null || v === '') v = null; else {
          if (!Number.isFinite(Number(v)) || Number(v) < 0) fail('Os valores numéricos precisam ser positivos.');
          v = finite(v);
        }
      } else if (['consent', 'optOut', 'active'].includes(field)) v = v === true; else if (['channels', 'parameters', 'carouselUrls','referenceAssetIds','referenceOnlyIds'].includes(field)) v = Array.isArray(v) ? v.slice(0, 12).map(x => str(x, 500)) : []; else v = str(v, field === 'text' || field === 'caption' || field === 'visualPrompt' || field === 'description' || field === 'notes' || field === 'carouselOutline' ? 20000 : 500);
      result[field] = v;
    }
    if (!internal && statuses[kind] && result.status && !statuses[kind].includes(result.status)) fail('Essa situação depende da confirmação do serviço.');
    if (kind === 'content') {
      if(result.imageLayout&&!['feed','story','carousel'].includes(result.imageLayout))fail('Formato de imagem inválido.');
      if(result.previousImageAssetId&&!await db.prepare('SELECT 1 FROM assets WHERE org_id=? AND id=?').get(org,result.previousImageAssetId))fail('Prévia anterior não encontrada nesta empresa.',404);
      if(result.referenceAssetIds){if(result.referenceAssetIds.length>(result.format==='video'?8:6))fail('Quantidade de referências excedida.');for(const assetId of result.referenceAssetIds)if(!await db.prepare('SELECT 1 FROM assets WHERE org_id=? AND id=?').get(org,assetId))fail('Referência não encontrada nesta empresa.',404);}
      result.format = result.format || 'image';
      result.channel = result.channel || 'instagram';
      if (!CONTENT_FORMATS.includes(result.format) || !CHANNELS.includes(result.channel)) fail('Formato ou canal inválido.');
      if (result.carouselUrls?.some(u => !publicUrl(u))) fail('As fotos do carrossel precisam de URLs HTTPS públicas.');
      if (result.mediaUrl && !publicUrl(result.mediaUrl)) fail('A mídia externa precisa de uma URL HTTPS pública.');
    }
    if (kind === 'content' && !internal && ['approved', 'scheduled'].includes(old.status) && ['caption', 'title', 'mediaUrl', 'assetId', 'format', 'channel', 'mediaType', 'carouselUrls'].some(k => (k in input) && input[k] !== old[k])) {
      result.status = 'review';
      result.scheduledAt = '';
    }
    if (kind === 'leads') {
      result.stage = result.stage || 'new';
      if (!LEAD_STAGES.includes(result.stage)) fail('Etapa inválida.');
      if (result.email && !(/^[^\s@]+@[^\s@]+\.[^\s@]+$/).test(result.email)) fail('E-mail inválido.');
      result.consent = Boolean(result.consent);
      result.optOut = Boolean(result.optOut);
    }
    if (kind === 'metrics' && !internal) result.source = 'manual';
    if (kind === 'messages' && !internal) {
      result.status = result.direction === 'incoming' ? 'recorded' : 'draft';
      result.source = 'manual';
      result.verifiedInboundAt = null;
    }
    for (const [field, k] of [['campaignId', 'campaigns'], ['leadId', 'leads']]) if (result[field]) await record(org, k, result[field]);
    if (result.assetId && !await db.prepare('SELECT 1 FROM assets WHERE id=? AND org_id=?').get(result.assetId, org)) fail('Arquivo não encontrado.', 404);
    if (kind === 'messages' && !result.leadId) fail('Selecione um contato.');
    const titleField = ({
      campaigns: 'name',
      content: 'title',
      leads: 'name',
      messages: 'text',
      tasks: 'title',
      pages: 'title',
      knowledge: 'title'
    })[kind];
    if (titleField && !result[titleField]) fail('Preencha os campos obrigatórios.');
    if (kind === 'pages' && result.active === undefined) result.active = true;
    if (kind === 'tasks') {
      result.status = result.status || 'todo';
      result.priority = result.priority || 'normal';
    }
    if (kind === 'campaigns' || kind === 'content') result.status = result.status || 'draft';
    return result;
  }
  async function saveRecord(org, kind, input, user, id = null, internal = false, externalId = null) {
    const old = id ? await record(org, kind, id) : {};
    if (!internal && input.version !== undefined && old.version && input.version !== old.version) fail('Este registro foi alterado. Atualize antes de salvar.', 409);
    const data = await clean(org, kind, input, old, internal), now = Date.now();
    for (const f of ['id', 'kind', 'createdAt', 'updatedAt', 'version']) delete data[f];
    id = id || randomUUID();
    if(old.id){const saved=await db.prepare('UPDATE records SET data=?,updated_at=?,version=version+1 WHERE id=? AND org_id=? AND version=?').run(JSON.stringify(data),now,id,org,old.version);if(saved.changes!==1)fail('Este registro foi alterado. Atualize antes de salvar.',409);}else await db.prepare('INSERT INTO records(id,org_id,kind,data,external_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(id, org, kind, JSON.stringify(data), externalId, now, now);
    await audit(org, user, old.id ? 'Registro atualizado' : 'Registro criado', id, kind);
    await kernel?.onRecord(org, kind, id, user);
    return await record(org, kind, id);
  }
  async function systemUpdate(org, kind, id, patch) {
    const r = await record(org, kind, id);
    const data = {
      ...r,
      ...patch
    };
    for (const f of ['id', 'kind', 'createdAt', 'updatedAt', 'version']) delete data[f];
    const saved=await db.prepare('UPDATE records SET data=?,updated_at=?,version=version+1 WHERE org_id=? AND id=? AND version=?').run(JSON.stringify(data),Date.now(),org,id,r.version);
    if(saved.changes!==1)fail('O registro mudou durante a operação. Confira a versão atual.',409);
    await kernel?.onRecord(org, kind, id, 'sistema');
    return await record(org, kind, id);
  }
  async function checkParent(org, payload) {
    const seen=new Set();
    while(payload.parentJobId){
      if(seen.has(payload.parentJobId)||seen.size>=12)throw new ProviderError('A origem deste pedido é inválida.','blocked');
      seen.add(payload.parentJobId);
      const parent=await db.prepare('SELECT cancel_requested,payload FROM jobs WHERE id=? AND org_id=?').get(payload.parentJobId,org);
      if(!parent)fail('Execução de origem não encontrada.',404);
      if(parent.cancel_requested)throw new ProviderError('A conversa foi pausada; esta ação derivada não será iniciada.','canceled');
      payload=parse(parent.payload);
      const operation=payload.operationId?await kernel.get(org,payload.operationId):null;
      if(operation&&(operation.paused||['cancelled','uncertain'].includes(operation.state)))throw new ProviderError('A operação de origem foi pausada ou exige conferência; esta ação não será iniciada.','canceled');
    }
  }
  async function queue(org, user, kind, payload = {}, scheduledAt = null, key = randomUUID(), options = {}) {
    if(kind==='creation'&&!options.explicitCreation)fail('Use a tela de criação para este pedido.',409);
    if(deliveryOnly && ['publish','insights','metaCampaign','googlePresence','send'].includes(kind)) fail('A Helpu entrega o conteúdo pelo WhatsApp vinculado; a publicação é manual. Esta ação não está disponível.',409);
    await checkParent(org, payload);
    payload={...payload};delete payload.mediaAuthorization;
    if(payload.purpose==='company_diagnosis'){
      if(kind!=='agent')fail('O diagnóstico precisa ser uma análise da empresa.');
      const brief=str(payload.brief,12000);if(!brief)fail('Informe a direção do diagnóstico.');
      payload={agent:'strategy',purpose:'company_diagnosis',brief};
    }
    if(kind==='image')payload.provider='openai';
    if (!['agent', 'image', 'video', 'publish', 'send', 'insights', 'metaCampaign', 'googlePresence', 'conversation','creation'].includes(kind)) fail('Ação inválida.');
    if (['image', 'video', 'publish'].includes(kind)) await record(org, 'content', payload.contentId);
    if (kind === 'send') await record(org, 'messages', payload.messageId);
    if (kind === 'metaCampaign') await record(org, 'campaigns', payload.campaignId);
    if (kind === 'agent' && payload.campaignId) await record(org, 'campaigns', payload.campaignId);
    if (kind === 'agent' && payload.leadId) await record(org, 'leads', payload.leadId);
    if (kind === 'agent' && !AGENTS.some(a => a.id === payload.agent)) fail('Agente inválido.');
    if (['publish', 'send', 'image', 'video', 'metaCampaign'].includes(kind)) {
      const field = kind === 'send' ? 'messageId' : kind === 'metaCampaign' ? 'campaignId' : 'contentId';
      const previous = await db.prepare("SELECT * FROM jobs WHERE org_id=? AND kind IN (?,?,?) AND json_extract(payload,?)=? AND state IN ('queued','working','waiting_provider','uncertain') ORDER BY created_at DESC LIMIT 1").get(org, kind, ...['image', 'video', 'publish'].includes(kind) ? ['image', 'video', 'publish'].filter(k => k !== kind) : [kind, kind], '$.' + field, payload[field]);
      if (previous) {
        if (previous.state === 'uncertain') fail('Confira a execução sem confirmação antes de repetir esta ação.', 409);
        if (kind !== previous.kind) fail('Aguarde a execução já vinculada a este conteúdo.', 409);
        if (kind === 'publish' && previous.state === 'queued' && scheduledAt) {
          const time = new Date(scheduledAt).getTime();
          if (!Number.isFinite(time)) fail('Data inválida.');
          await db.prepare('UPDATE jobs SET scheduled_at=?,updated_at=? WHERE id=?').run(time, Date.now(), previous.id);
          return decodeJob(await db.prepare('SELECT * FROM jobs WHERE id=?').get(previous.id));
        }
        return decodeJob(previous);
      }
    }
    if(kind==='image'){let prepared;try{prepared=await imageWorkflow.prepare(org,payload.contentId);}catch(e){if(e instanceof ProviderError)e.status=409;throw e;}if(options.explicitImage)payload.mediaAuthorization={actor:user,sourceHash:prepared.sourceHash};}
    if(kind==='video'&&payload.provider==='astra-inline'){if(!reels.configured())fail('O processamento de Reels não está disponível nesta hospedagem.',409);const content=await record(org,'content',payload.contentId);if(options.explicitVideo)payload.mediaAuthorization={actor:user,sourceHash:inlineVideoHash(content,payload)};}
    if(kind==='video'&&payload.provider==='astra-runtime'){
      const project=await runtimeTools.project(org,payload.projectId);
      if(project.revision!==payload.revision)fail('O projeto de vídeo mudou. Confira a versão antes de exportar.',409);
      if(options.explicitVideo)payload.mediaAuthorization={actor:user,projectId:project.id,revision:project.revision};
    }
    if (['video', 'publish'].includes(kind) && (await metadata(org, 'studio:' + payload.contentId)).version) {
      const check = await studio.inspect(org, payload.contentId);
      fail(check.blockers.map(b => b.message).join(' '), 409);
    }
    if (kind === 'publish' && payload.contentId) {
      const opId = (await record(org, 'content', payload.contentId)).operationId;
      if (opId && (await kernel.get(org, opId)).firstInstagram && payload.parentJobId) fail('A primeira publicação só pode ser iniciada pela aprovação final explícita.', 409);
    }
    if (kind === 'conversation' && !await db.prepare('SELECT 1 FROM conversations WHERE id=? AND org_id=?').get(payload.conversationId, org)) fail('Conversa não encontrada.', 404);
    const id = randomUUID(), now = Date.now(), when = scheduledAt ? new Date(scheduledAt).getTime() : now;
    if (!Number.isFinite(when)) fail('Data de agendamento inválida.');
    const cleaned = {
      ...payload
    };
    delete cleaned.org_id;
    delete cleaned.user_id;
    await kernel?.attachJob(org, {
      id,
      kind,
      payload: cleaned
    });
    await db.prepare('INSERT OR IGNORE INTO jobs(id,org_id,user_id,kind,payload,scheduled_at,idempotency_key,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').run(id, org, user || null, kind, JSON.stringify(cleaned), when, str(key, 180), now, now);
    const row = await db.prepare('SELECT * FROM jobs WHERE org_id=? AND idempotency_key=?').get(org, str(key, 180));
    if (!row) fail('Já existe uma execução pendente para este registro.', 409);
    if (row.id === id) await audit(org, user, 'Ação adicionada à fila', id, kind);
    await kernel?.attachJob(org, decodeJob(row));
    return decodeJob(await db.prepare('SELECT * FROM jobs WHERE id=?').get(row.id));
  }
  const decodeJob = r => ({
    id: r.id,
    kind: r.kind,
    state: r.state,
    payload: parse(r.payload),
    scheduledAt: r.scheduled_at,
    attempts: r.attempts,
    external: parse(r.external),
    output: parse(r.output),
    error: r.error,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  });
  async function jobTarget(job) {
    const p = parse(job.payload), kind = p.contentId ? 'content' : p.messageId ? 'messages' : p.campaignId ? 'campaigns' : null;
    const item = kind ? decodeRecord(await db.prepare('SELECT * FROM records WHERE org_id=? AND kind=? AND id=?').get(job.org_id, kind, p.contentId || p.messageId || p.campaignId)) : null;
    const channel = job.kind==='video'&&['astra-runtime','astra-inline'].includes(p.provider)?'other':job.kind==='image'&&p.provider==='openai'?'openai':['image', 'video'].includes(job.kind) ? 'higgsfield' : job.kind === 'googlePresence' ? 'google' : ['metaCampaign', 'insights'].includes(job.kind) ? 'metaAds' : job.kind === 'agent' ? 'openai' : item?.channel || p.channel || 'other';
    return {
      channel,
      item
    };
  }
  async function toolResult(job, state, {output = {}, external = {}, error} = {}) {
    const {channel} = await jobTarget(job), config = await integration(job.org_id, channel);
    const existing = output.result || ({});
    const externalId = existing.externalId || output.providerId || external.publishedId || external.request_id || external.containerId || null;
    const status = state === 'uncertain' ? 'uncertain' : ['failed', 'blocked'].includes(state) ? 'failed' : existing.status || (state === 'succeeded' ? job.kind === 'send' ? 'accepted' : 'verified' : state === 'waiting_provider' ? 'accepted' : 'failed');
    return {
      status,
      executor: 'api',
      companyId: job.org_id,
      channel,
      account: config.accountId || config.phoneNumberId || config.locationId || config.adAccountId || null,
      occurredAt: Date.now(),
      externalId,
      url: existing.url || output.url || null,
      message: existing.message || error || (state === 'succeeded' ? job.kind === 'send' ? 'O canal aceitou a mensagem; entrega ainda não confirmada.' : 'Resultado confirmado pelo executor.' : 'Aguardando confirmação do executor.'),
      evidence: existing.evidence || (state === 'succeeded' ? {
        type: job.kind === 'send' ? 'channel_acceptance' : 'provider_response',
        externalId,
        assetId: output.assetId || null
      } : null),
      error: error || null,
      uncertain: status === 'uncertain',
      retryable: status === 'failed' && !externalId
    };
  }
  async function setJob(id, state, {external, output, error, scheduledAt} = {}) {
    const row = await db.prepare('SELECT * FROM jobs WHERE id=?').get(id);
    const ext = external === undefined ? parse(row.external) : external;
    if (row.kind !== 'conversation' && ['succeeded', 'failed', 'blocked', 'uncertain', 'waiting_provider'].includes(state)) {
      output = output === undefined ? parse(row.output) : output;
      output = {
        ...output,
        result: await toolResult(row, state, {
          output,
          external: ext,
          error
        })
      };
    }
    await db.prepare('UPDATE jobs SET state=?,external=?,output=?,error=?,scheduled_at=?,lease_until=?,updated_at=? WHERE id=?').run(state, external === undefined ? row.external : JSON.stringify(external), output === undefined ? row.output : JSON.stringify(output), error || null, scheduledAt || row.scheduled_at, state === 'working' ? Date.now() + 180000 : null, Date.now(), id);
    if (['succeeded', 'failed', 'blocked', 'uncertain', 'canceled'].includes(state)) await audit(row.org_id, 'agente', `Execução: ${state}`, id, error || row.kind);
    await kernel?.afterJob(await db.prepare('SELECT * FROM jobs WHERE id=?').get(id), state, {
      output: output === undefined ? parse(row.output) : output,
      error,
      external: ext
    });
    if(['image','video'].includes(row.kind)&&['succeeded','blocked','failed','uncertain','canceled'].includes(state)){if(parse(row.payload).creationId&&state==='succeeded'){const content=await record(row.org_id,'content',parse(row.payload).contentId);const parent=await db.prepare('SELECT payload FROM jobs WHERE org_id=? AND id=?').get(row.org_id,parse(row.payload).creationId);const protectedReview=parse(parent?.payload).approvalRequired;output={...output,...protectedReview?{previewAssetId:output.assetId}:{},summary:(protectedReview?'Prévia protegida para aprovação. O arquivo final e o consumo do plano serão liberados após aprovar. ': '')+(parse(row.payload).slideIndex?'Página '+parse(row.payload).slideIndex+' · ':'')+(protectedReview?'Confira a prévia e aprove ou peça ajustes.':output?.summary||'Arquivo pronto.')+(content.caption?'\n\nLegenda:\n'+content.caption:'')};}await conversation.mediaResult(row,state,output||{},error);}
  }
  async function authorizeJob(job) {
    if (job.kind === 'publish' && parse(job.external).publishedId) return;
    if (job.kind === 'publish') {
      const op = await kernel.jobOperation(job);
      if (op?.firstInstagram) {
        if (job.id !== op.executionJobId || parse(job.payload).contentId !== op.publication?.artifactId) throw new ProviderError('A autorização pertence a outro alvo ou tentativa de publicação.', 'blocked');
        if (op.executionAuthorization?.trigger !== 'approve_publish') throw new ProviderError('Esta publicação exige Aprovar e publicar agora.', 'blocked');
        await publication.assertSnapshot(job.org_id, op);
      }
    }
    const target = await jobTarget(job), action = ({
      publish: 'publish',
      send: 'send',
      image: 'image',
      video: 'video',
      metaCampaign: 'alter_campaign',
      googlePresence: 'change_profile'
    })[job.kind];
    if (!action || job.kind === 'googlePresence' && ['read', 'accounts', 'locations', 'categories', 'status', 'reviews'].includes(parse(job.payload).action)) return;
    await kernel.authorize(job.org_id, {
      action,
      channel: target.channel,
      risk: ['image', 'video'].includes(job.kind) ? 'medium' : 'high',
      operationId: (await kernel.jobOperation(job))?.id,
      userId: job.user_id,
      approval: (job.kind==='video'&&parse(job.payload).provider==='astra-inline'&&parse(job.payload).mediaAuthorization?.actor===job.user_id&&parse(job.payload).mediaAuthorization?.sourceHash===inlineVideoHash(await record(job.org_id,'content',parse(job.payload).contentId),parse(job.payload)))||(job.kind==='image' && parse(job.payload).mediaAuthorization?.actor===job.user_id && parse(job.payload).mediaAuthorization?.sourceHash===(await imageWorkflow.prepare(job.org_id,parse(job.payload).contentId)).sourceHash)||(job.kind==='video'&&parse(job.payload).provider==='astra-runtime'&&parse(job.payload).mediaAuthorization?.actor===job.user_id&&parse(job.payload).mediaAuthorization?.projectId===parse(job.payload).projectId&&parse(job.payload).mediaAuthorization?.revision===parse(job.payload).revision)
    });
  }
  async function beforeMutation(job) {
    await commerce.guard(job);
    await checkParent(job.org_id, parse(job.payload));
    const current = await db.prepare('SELECT cancel_requested FROM jobs WHERE id=?').get(job.id), op = await kernel.jobOperation(job);
    if (current?.cancel_requested || op?.paused || op?.state === 'cancelled') throw new ProviderError('A operação foi pausada; esta ação não será iniciada.', 'canceled');
    if (op?.state === 'uncertain') throw new ProviderError('A operação exige conferência antes de novas ações.', 'uncertain');
    await authorizeJob(job);
  }
  async function readRaw(req, max = 262144) {
    let size = 0;
    const chunks = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > max) fail('O arquivo ou envio excede o limite permitido.', 413);
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }
  async function body(req) {
    const raw = await readRaw(req);
    try {
      const d = JSON.parse(raw.toString('utf8'));
      if (!d || typeof d !== 'object' || Array.isArray(d)) fail('Dados inválidos.');
      return d;
    } catch (e) {
      if (e.status) throw e;
      fail('Dados inválidos.');
    }
  }
  function assetType(buffer) {
    if (buffer.length >= 48 && buffer.subarray(0, 4).toString() === 'wOF2' && buffer.readUInt32BE(8) === buffer.length) return ['font/woff2', '.woff2'];
    if (buffer.length >= 12 && (buffer.subarray(0, 4).equals(Buffer.from([0, 1, 0, 0])) || buffer.subarray(0, 4).toString() === 'OTTO')) {
      const tables = buffer.readUInt16BE(4);
      if (tables > 0 && tables < 256 && buffer.length >= 12 + tables * 16) return buffer.subarray(0, 4).toString() === 'OTTO' ? ['font/otf', '.otf'] : ['font/ttf', '.ttf'];
    }
    if (buffer.length > 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return ['image/png', '.png'];
    if (buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) return ['image/jpeg', '.jpg'];
    if (buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP') return ['image/webp', '.webp'];
    if(buffer.subarray(0,4).toString()==='RIFF'&&buffer.subarray(8,12).toString()==='WAVE')return ['audio/wav','.wav'];
    if(buffer.subarray(0,4).toString()==='OggS')return ['audio/ogg','.ogg'];
    if(buffer.subarray(0,3).toString()==='ID3'||(buffer[0]===255&&(buffer[1]&0xe0)===0xe0))return ['audio/mpeg','.mp3'];
    if (buffer.subarray(4, 8).toString() === 'ftyp') return ['video/mp4', '.mp4'];
    if (buffer.subarray(0, 5).toString() === '%PDF-') return ['application/pdf', '.pdf'];
    return null;
  }
  async function storeAsset(org, name, buffer, sourceUrl = null, fixedId = null) {
    const type = assetType(buffer);
    if (!type) fail('Envie PNG, JPEG, WebP, MP4, MP3, WAV, OGG, PDF ou uma fonte WOFF2, TTF ou OTF.');
    if(fixedId&&!/^[a-f\d-]{36}$/i.test(fixedId))fail('Identificador de arquivo inválido.');
    const id = fixedId||randomUUID(), file = id + type[1];
    if(fixedId){const previous=await db.prepare('SELECT id,mime,size FROM assets WHERE id=? AND org_id=?').get(id,org);if(previous){if(previous.mime!==type[0]||previous.size!==buffer.length||hashFile(fs.readFileSync(await assetPath(org,id)))!==hashFile(buffer))fail('O arquivo existente não corresponde à exportação.',409);return {...previous,name,url:'/api/portal/files/'+id};}}
    if(!privateStorage){try{fs.writeFileSync(path.join(storage,file),buffer,{flag:'wx'});}catch(e){if(e.code!=='EEXIST'||!fixedId||hashFile(fs.readFileSync(path.join(storage,file)))!==hashFile(buffer))throw e;}}
    if(privateStorage){
      const stored=await privateStorage.put(org,file,buffer,type[0]);
      await db.prepare('INSERT INTO assets(id,org_id,name,mime,size,path,source_url,created_at,storage_bucket,storage_path,sha256,storage_verified_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING').run(id,org,str(name,150)||file,type[0],buffer.length,file,sourceUrl,Date.now(),stored.bucket,stored.path,stored.hash,new Date().toISOString());
    }else await db.prepare('INSERT INTO assets(id,org_id,name,mime,size,path,source_url,created_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING').run(id, org, str(name, 150) || file, type[0], buffer.length, file, sourceUrl, Date.now());
    if(fixedId&&!await db.prepare('SELECT id FROM assets WHERE id=? AND org_id=?').get(id,org))fail('Arquivo indisponível nesta empresa.',409);
    return {
      id,
      name,
      mime: type[0],
      size: buffer.length,
      sourceUrl,
      url: '/api/portal/files/' + id
    };
  }
  async function retainMedia(org, url, name) {
    const u = new URL(url);
    if (!publicUrl(url) || !(u.hostname.endsWith('.cloudfront.net') || u.hostname.endsWith('.higgsfield.ai') || u.hostname.endsWith('.higgsfieldapi.com') || u.hostname.endsWith('.fal.media'))) throw new ProviderError('A mídia foi criada, mas o armazenamento aguarda revisão do endereço de origem.', 'uncertain');
    const res = await fetch(url, {
      signal: AbortSignal.timeout(60000),
      redirect: 'error'
    });
    if (!res.ok) throw new ProviderError('A mídia foi criada, mas ainda não foi possível armazená-la.', 'uncertain');
    const chunks = [];
    let size = 0;
    for await (const chunk of res.body) {
      size += chunk.length;
      if (size > 50 * 1024 * 1024) throw new ProviderError('A mídia gerada excede 50 MB. Salve-a pelo provedor.', 'uncertain');
      chunks.push(chunk);
    }
    return await storeAsset(org, name, Buffer.concat(chunks), url);
  }
  async function files(org) {
    return (await db.prepare("SELECT id,name,mime,size,source_url AS sourceUrl,created_at AS createdAt FROM assets WHERE org_id=? AND (source_url IS NULL OR source_url NOT IN ('helpu:finance','helpu:review-preview')) ORDER BY created_at DESC").all(org)).map(a => ({
      ...a,
      url: '/api/portal/files/' + a.id
    }));
  }
  async function routinePriority(org) {
    return dailyPriority({
      contents: await list(org, 'content', 10000),
      operations: await kernel.list(org),
      tasks: await list(org, 'tasks', 10000),
      jobs: await db.prepare('SELECT id,kind,state,idempotency_key FROM jobs WHERE org_id=?').all(org)
    });
  }
  async function workerState() {
    const workerLease=cloud?await db.prepare('SELECT last_started_at,last_completed_at,last_error,expires_at FROM worker_leases WHERE id=?').get('operating-kernel'):null;
    return {
        lastTick: cloud?workerLease?.last_started_at||null:lastTick,
        running: cloud?!!workerLease?.last_completed_at&&Date.now()-workerLease.last_completed_at<180000&&!workerLease.last_error:!stopped&&startScheduler,
        local: !cloud,
        ...(cloud?{state:workerLease?.last_error?'failed':workerLease?.expires_at>Date.now()?'working':workerLease?.last_completed_at?'last_run_verified':'not_verified',lastCompletedAt:workerLease?.last_completed_at||null,error:workerLease?.last_error||null}:{})
      };
  }
  async function state(org) {
    const all = Object.fromEntries(await mapAsync(KINDS, async k => [k, await list(org, k)]));
    return {
      company: await company(org),
      usage: await usageSnapshot(db,org,(await company(org)).policy),
      routine: await routinePriority(org),
      brandMaterials: await metadata(org, 'brand:production'),
      creativeLibrary: await creativeLibrary.context(org),
      production: await mapAsync(await filterAsync(all.content, async c => (await metadata(org, 'studio:' + c.id)).version), async c => await studio.inspect(org, c.id)),
      records: all,
      operations: await kernel.list(org),
      assets: await files(org),
      integrations: await integrationState(org),
      connectionLogin: {instagram:instagramLogin.status()},
      runtime: await cloudRuntime.status(org),
      creationCapabilities: await creations.capabilities(org),
      agents: AGENTS,
      jobs: (await db.prepare('SELECT * FROM jobs WHERE org_id=? ORDER BY created_at DESC LIMIT 150').all(org)).map(decodeJob),
      audit: await db.prepare('SELECT * FROM audit WHERE org_id=? ORDER BY created_at DESC LIMIT 60').all(org),
      worker: await workerState()
    };
  }
  async function budget(org, kind, id, policy) {
    const category = ['image', 'video'].includes(kind) ? 'media' : kind === 'send' ? 'send' : 'agent';
    const cap = category === 'media' ? policy.dailyMedia : category === 'send' ? policy.dailyMessages : policy.dailyRuns;
    const day = new Intl.DateTimeFormat('en-CA', {
      timeZone: policy.timeZone || 'America/Sao_Paulo'
    }).format(new Date());
    await db.exec('BEGIN IMMEDIATE');
    try {
      if (!await db.prepare('SELECT 1 FROM usage_reservations WHERE job_id=?').get(id)) {
        const count = await usageCount(db,org,category,day,policy);
        if (!unlimited(cap) && count >= cap) throw new ProviderError('O limite diário desta operação foi atingido. Ajuste em Autonomia ou aguarde o próximo dia.', 'blocked');
        await db.prepare('INSERT INTO usage_reservations VALUES(?,?,?,?,?)').run(id, org, category, day, Date.now());
      }
      await db.exec('COMMIT');
    } catch (e) {
      await db.exec('ROLLBACK');
      throw e;
    }
  }
  kernel = await createKernel({
    db,
    company,
    record,
    list,
    saveRecord,
    systemUpdate,
    queue,
    audit,
    integration,
    integrationState,
    inspectAsset
  });
  studio = await createStudio({
    db,
    company,
    record,
    list,
    saveRecord,
    systemUpdate,
    kernel,
    metadata,
    saveMetadata,
    integrationState,
    assetPath,
    audit,
    storeAsset,
    assetType,
    providers,
    integration
  });
  const imageWorkflow=createImageWorkflow({db,record,company,metadata,saveMetadata,studio,integration,providers,storeAsset,assetPath,systemUpdate,setJob,beforeMutation});
  const reels=reelsRenderer||createReelsRenderer();
  const creativeLibrary=createCreativeLibrary({db,metadata,saveMetadata,company});
  const creations=createCreations({creativeLibrary,commerce:()=>commerce,db,company,integration,queue,saveRecord,record,assetPath,storeAsset,systemUpdate,setJob,beforeMutation,renderer:reels,respond:creationRespond,metadata,saveMetadata});
  const creationSchedules=createCreationSchedules({db,creations,company});
  const reviewPreview=createReviewPreview({db,metadata,storeAsset,assetPath,renderer:reels});
  const runtimeTools=createRuntimeTools({runtime:cloudRuntime,db,assetPath,storeAsset,saveRecord,record,metadata,saveMetadata,queue,systemUpdate,setJob,beforeMutation});
  publication = await createPublicationWorkflow({
    db,
    kernel,
    company,
    record,
    inspectAsset,
    integration,
    integrationMetadata: metadata,
    providers,
    queue,
    fetcher: publicationFetch,
    resolve: publicationResolve,
    readAsset: async (org, id) => fs.readFileSync(await assetPath(org, id)),
    async saveMetric(org, op, value, period) {
      const key = 'instagram:' + op.id + ':' + period, now = Date.now();
      const data = {
        operationId: op.id,
        campaignId: op.campaignId,
        channel: 'instagram',
        date: new Date().toISOString().slice(0, 10),
        source: 'instagram',
        externalId: op.result.externalId,
        snapshot: value,
        importedAt: now,
        period,
        notes: 'Snapshot retornado pelo Instagram; campos ausentes permanecem desconhecidos.'
      };
      await db.prepare("INSERT INTO records(id,org_id,kind,data,external_id,created_at,updated_at) VALUES(?,?,'metrics',?,?,?,?) ON CONFLICT(org_id,kind,external_id) DO NOTHING").run(randomUUID(), org, JSON.stringify(data), key, now, now);
      return (await db.prepare("SELECT id FROM records WHERE org_id=? AND kind='metrics' AND external_id=?").get(org, key)).id;
    }
  });
  const conversation = await createConversation({
    financeReply:async(org,user,text)=>await commerce.chat(org,user,text)||await finance.chat(org,user,text),
    deliveryOnly,creations,creationSchedules,creativeLibrary,
    db,
    dataDir,
    kernel,
    company,
    integration,
    list,
    saveRecord,
    queue,
    audit,
    json,
    browserLaunch,
    respond: conversationRespond,
    assetPath,
    updateProfile,
    integrationState,
    workerState,
    reviewPublication: publication.review,cloud,runtimeTools,
    browserOverride:cloudRuntime.configured?runtimeTools.browser:undefined
  });
  const assisted=await createAssistedPublishing({db,assetPath,env:operatorEnv,now:assistedNow});
  const consultations=createConsultations({db,operator:assisted.operator,storeAsset,now:assistedNow});
  const templateCatalog=createTemplateCatalog({db,operator:assisted.operator,access,storeAsset,assetPath,creativeLibrary});
  const pricing=createPricing({db,operator:assisted.operator,now:assistedNow});
  const commercial=createCommercial({db,operator:assisted.operator,now:assistedNow,pricing});
  const whatsappWelcome=createWhatsAppWelcome({db,env:whatsappChatEnv,fetcher:whatsappChatFetch});
  const whatsappChat=createWhatsAppChat({db,metadata,saveMetadata,conversation,assetPath,storeAsset,resolveDeliveryAsset:reviewPreview.resolve,env:whatsappChatEnv,fetcher:whatsappChatFetch,onInbound:whatsappWelcome.receive,onDelivery:whatsappWelcome.delivery});
  const finance=createFinance({db,operator:assisted.operator,storeAsset,now:assistedNow,deliver:whatsappChat.financeReminder});
  const commerce=createCommerce({db,operator:assisted.operator,finance,creations,now:assistedNow});
  const aiManagement=createAIManagement({db,operator:assisted.operator,integration,now:assistedNow});
  async function registerSignup(user,input) {
    const contact=signupWhatsAppInput(input,whatsappChatEnv);
    const [org]=await companies(user);
    await whatsappWelcome.register(org.id,user,contact);
    await saveMetadata(org.id,'onboarding:'+user.id,{state:'active',completed:[],goal:'',createdAt:Date.now()});
  }
  async function verifyPublication(job, content, external) {
    const org = job.org_id, providerId = external.publishedId;
    let evidence;
    try {
      if (content.channel === 'instagram') {
        if (!providers.instagramVerify) throw new Error('O executor não fornece conferência do Instagram.');
        const op = await kernel.jobOperation(job);
        const value = await providers.instagramVerify(await integration(org, 'instagram'), providerId, external.containerId, op?.firstInstagram ? {
          expectedCaption: external.snapshot.caption,
          expectedMediaType: 'IMAGE',
          expectedAccountId: op.publication.account.id,
          expectedPublishedAfter: external.publishStartedAt || (op.publication?.attempts || []).find(a => a.jobId === job.id && !a.verificationOnly)?.startedAt
        } : {});
        if (op?.firstInstagram && (!value.permalink || String(value.identity?.id) !== String(op.publication.account.id) || value.caption !== external.snapshot.caption)) throw new Error('A leitura não confirmou permalink, conta e legenda aprovados.');
        if (value?.id !== providerId || value.status_code !== 'PUBLISHED') throw new Error('O Instagram ainda não confirmou a publicação do contêiner.');
        evidence = {
          type: 'channel_readback',
          externalId: providerId,
          containerId: external.containerId,
          status: value.status_code,
          url: value.permalink || null,
          identity: value.identity || null,
          caption: value.caption,
          timestamp: value.timestamp,
          mediaType: value.mediaType,
          verification: value.evidence || null
        };
      } else if (content.channel === 'google') {
        if (!providers.googleVerify) throw new Error('O executor não fornece conferência do Google.');
        const value = await providers.googleVerify(await integration(org, 'google'), providerId);
        if (value?.name !== providerId || value.state !== 'LIVE') throw new Error('O Google ainda não confirmou que a publicação está visível.');
        evidence = {
          type: 'channel_readback',
          externalId: providerId,
          status: value.state,
          url: publicUrl(value.searchUrl) || null
        };
      } else throw new Error('Este canal não possui conferência de publicação.');
    } catch (e) {
      throw new ProviderError('O pedido de publicação possui identificador, mas a verificação permanece pendente. ' + str(e.message, 220), 'uncertain');
    }
    const publishedAt = content.publishedAt || (Number.isFinite(Date.parse(evidence.timestamp)) ? Date.parse(evidence.timestamp) : Date.now());
    await systemUpdate(org, 'content', content.id, {
      status: 'published',
      publishedAt,
      scheduledAt: content.scheduledAt || new Date(publishedAt).toISOString(),
      providerId
    });
    await setJob(job.id, 'succeeded', {
      output: {
        providerId,
        result: {
          status: 'verified',
          url: evidence.url || null,
          message: 'Publicação conferida por leitura do canal.',
          evidence
        }
      }
    });
    const op = await kernel.jobOperation(job);
    if (op?.firstInstagram) {
      for (const hours of [0, 1, 24, 168]) await queue(org, job.user_id, 'insights', {
        operationId: op.id,
        instagramMediaId: providerId,
        period: hours ? hours + 'h' : 'initial'
      }, new Date(Date.now() + hours * 3600000).toISOString(), 'instagram-metrics:' + op.id + ':' + hours);
    }
  }
  async function execute(job) {
    if(deliveryOnly && ['publish','insights','metaCampaign','googlePresence','send'].includes(job.kind)) throw new ProviderError('Ação anterior suspensa: a Helpu agora prepara e entrega conteúdo para publicação manual.','blocked');
    if (job.kind === 'agent' && job.idempotency_key.startsWith('daily-director:')) {
      const priority = await routinePriority(job.org_id);
      if (!priority.intelligenceRequired) throw new ProviderError(priority.message, 'blocked');
    }
    const org = job.org_id, payload = parse(job.payload), external = parse(job.external), c = await company(org), policy = c.policy;
    await checkParent(org, payload);
    await kernel.beforeJob(job);
    await authorizeJob(job);
    if (!external.publishedId && (external.request_id || external.containerId) && Date.now() - job.created_at > 86400000) throw new ProviderError('O prazo de acompanhamento terminou. Confira o serviço antes de repetir.', 'uncertain');
    if (['agent', 'conversation','creation', 'image', 'video', 'send'].includes(job.kind) && !external.request_id) await budget(org, job.kind, job.id, policy);
    if(job.kind==='creation'){await creations.run(job);return;}
    if (job.kind === 'conversation') {
      const result = await conversation.run(job);
      await setJob(job.id, 'succeeded', {
        output: result
      });
      return;
    }
    if (job.kind === 'agent') {
      if (!c.profile.description || !c.profile.audience) throw new ProviderError('Complete o que a empresa vende e quem ela atende em Marca e negócio.', 'blocked');
      let context = {
        campaigns: await list(org, 'campaigns', 10),
        metrics: await list(org, 'metrics', 50),
        knowledge: await list(org, 'knowledge', 20),
        pipeline: await mapAsync(LEAD_STAGES, async stage => ({
          stage,
          count: (await list(org, 'leads')).filter(l => l.stage === stage).length
        }))
      };
      if (payload.leadId) {
        await record(org, 'leads', payload.leadId);
        context.conversation = (await db.prepare("SELECT * FROM records WHERE org_id=? AND kind='messages' AND json_extract(data,'$.leadId')=? ORDER BY created_at DESC LIMIT 100").all(org, payload.leadId)).map(decodeRecord).reverse().map(m => ({
          direction: m.direction,
          text: m.text,
          source: m.source
        }));
      }
      const result = await providers.text(await integration(org, 'openai'), {
        onUsage: response=>recordProviderUsage(db,job,response,{operation:'agent',model:response.configuredModel}),
        agent: payload.agent,
        brief: str(payload.brief, 12000),
        company: {
          name: c.name,
          ...c.profile
        },
        records: context
      });
      await beforeMutation(job);
      // A company diagnosis is a report, even if the model returns unsolicited pieces.
      if(payload.agent==='strategy'&&payload.purpose==='company_diagnosis')result.pieces=[];
      const ids = [];
      for (const piece of result.pieces.slice(0, 3)) {
        const created = await saveRecord(org, 'content', {
          ...piece,
          campaignId: payload.campaignId || '',
          status: 'review',
          notes: result.questions.join('\n')
        }, 'agente');
        ids.push(created.id);
        const operation = await kernel.jobOperation(job);
        if (operation) await kernel.linkRecord(org, operation.id, 'content', created.id);
        if (policy.autoMedia && piece.format !== 'text') await queue(org, job.user_id, 'image', {
          contentId: created.id,
          ...payload.parentJobId ? {
            parentJobId: payload.parentJobId
          } : {}
        }, null, job.id + ':image:' + created.id);
      }
      if (payload.agent === 'relationship' && payload.leadId && result.summary) {
        const message = await saveRecord(org, 'messages', {
          leadId: payload.leadId,
          channel: payload.channel || 'whatsapp',
          text: result.summary,
          direction: 'outgoing',
          status: 'draft'
        }, 'agente');
        ids.push(message.id);
        const operation = await kernel.jobOperation(job);
        if (operation) await kernel.linkRecord(org, operation.id, 'messages', message.id);
        if (payload.autoReply && policy.autoReply && result.questions.length === 0) await queue(org, job.user_id, 'send', {
          messageId: message.id,
          ...payload.parentJobId ? {
            parentJobId: payload.parentJobId
          } : {}
        }, null, 'reply:' + payload.inboundId);
      }
      await setJob(job.id, 'succeeded', {
        output: {
          ...result,
          recordIds: ids
        }
      });
      return;
    }
    if(job.kind==='image'&&payload.provider==='openai'){const output=await imageWorkflow.run(job);await setJob(job.id,'succeeded',{output});return;}
    if(job.kind==='video'&&payload.provider==='astra-inline'){await creations.render(job);return;}
    if(job.kind==='video'&&payload.provider==='astra-runtime'){await runtimeTools.run(job);return;}
    if (job.kind === 'image' || job.kind === 'video') {
      const content = await record(org, 'content', payload.contentId), config = await integration(org, 'higgsfield');
      if (content.status === 'published') throw new ProviderError('Duplique o conteúdo publicado antes de gerar uma nova mídia.', 'blocked');
      let response;
      if (external.request_id) {
        response = await providers.pollMedia(config, external);
      } else {
        await beforeMutation(job);
        response = await providers.media(config, {
          kind: job.kind,
          prompt: [content.visualPrompt || content.caption, `Marca: ${c.name}. Identidade: ${c.profile.visualIdentity || ''}. Tom: ${c.profile.tone || ''}.`].join('\n'),
          imageUrl: content.mediaUrl
        });
        if (!response.request_id || !response.status_url) throw new ProviderError('O Higgsfield não confirmou o identificador do pedido.', 'uncertain');
        await setJob(job.id, 'waiting_provider', {
          external: response,
          scheduledAt: Date.now() + 10000
        });
        return;
      }
      if (['queued', 'in_progress'].includes(response.status)) {
        await setJob(job.id, 'waiting_provider', {
          scheduledAt: Date.now() + 10000
        });
        return;
      }
      if (response.status !== 'completed') throw new ProviderError('A geração não foi concluída pelo Higgsfield.');
      const url = response.video?.url || response.images?.[0]?.url;
      if (!url) throw new ProviderError('O provedor concluiu sem informar uma mídia.', 'uncertain');
      await setJob(job.id, 'working', {
        external: {
          ...external,
          resultUrl: url
        }
      });
      const asset = await retainMedia(org, url, content.title + (job.kind === 'video' ? '.mp4' : '.png'));
      await systemUpdate(org, 'content', content.id, {
        assetId: asset.id,
        mediaUrl: url,
        mediaType: job.kind,
        status: 'review'
      });
      await setJob(job.id, 'succeeded', {
        output: {
          assetId: asset.id,
          url
        }
      });
      return;
    }
    if (job.kind === 'publish') {
      const content = await record(org, 'content', payload.contentId);
      if (external.publishedId) {
        await verifyPublication(job, content, external);
        return;
      }
      if (!policy.allowPublishing) throw new ProviderError('Ative a publicação de conteúdos aprovados em Autonomia.', 'blocked');
      if (!['approved', 'scheduled'].includes(content.status)) throw new ProviderError('O conteúdo precisa estar aprovado para publicar.', 'blocked');
      if (content.channel === 'instagram') {
        const conf = await integration(org, 'instagram');
        const liveOp = await kernel.jobOperation(job);
        if (liveOp?.firstInstagram && !external.containerId) await publication.verifySource(org, liveOp);
        if (!external.containerId) {
          const children = external.children || [];
          if (content.format === 'carousel') {
            const urls = content.carouselUrls || [];
            if (urls.length < 2 || urls.length > 10) throw new ProviderError('Informe de 2 a 10 URLs de fotos JPEG no conteúdo.', 'blocked');
            if (children.length < urls.length) {
              await beforeMutation(job);
              const child = await providers.instagramChild(conf, urls[children.length]);
              if (!child.id) throw new ProviderError('O Instagram não confirmou a foto do carrossel.', 'uncertain');
              await setJob(job.id, 'waiting_provider', {
                external: {
                  ...external,
                  children: [...children, child.id],
                  snapshot: content
                },
                scheduledAt: Date.now() + 1000
              });
              return;
            }
            for (const id of children) {
              const child = await providers.instagramPoll(conf, id);
              if (child.status_code === 'IN_PROGRESS') {
                await setJob(job.id, 'waiting_provider', {
                  scheduledAt: Date.now() + 60000
                });
                return;
              }
              if (child.status_code !== 'FINISHED') throw new ProviderError('Uma foto do carrossel não concluiu o processamento.');
            }
          }
          await beforeMutation(job);
          const data = await providers.instagramContainer(conf, content, children);
          if (!data.id) throw new ProviderError('O Instagram não confirmou o contêiner.', 'uncertain');
          await setJob(job.id, 'waiting_provider', {
            external: {
              containerId: data.id,
              snapshot: content
            },
            scheduledAt: Date.now() + 10000
          });
          return;
        }
        const check = await providers.instagramPoll(conf, external.containerId);
        if (check.status_code === 'IN_PROGRESS') {
          await setJob(job.id, 'waiting_provider', {
            scheduledAt: Date.now() + 60000
          });
          return;
        }
        if (check.status_code === 'PUBLISHED') throw new ProviderError('O contêiner já foi publicado. Confira o Instagram antes de repetir.', 'uncertain');
        if (check.status_code !== 'FINISHED') throw new ProviderError('O Instagram não concluiu o processamento da mídia.');
        await beforeMutation(job);
        const attempted = {
          ...external,
          publishStartedAt: Date.now(),
          snapshot: content
        };
        await setJob(job.id, 'working', {
          external: attempted
        });
        const result = await providers.instagramPublish(conf, external.containerId);
        if (!result.id) throw new ProviderError('Publicação sem confirmação do Instagram.', 'uncertain');
        const pending = {
          ...attempted,
          publishedId: result.id
        };
        await setJob(job.id, 'working', {
          external: pending
        });
        await verifyPublication(job, content, pending);
        return;
      }
      if (content.channel === 'google') {
        await setJob(job.id, 'working', {
          external: {
            snapshot: content
          }
        });
        await beforeMutation(job);
        const result = await providers.googlePost(await integration(org, 'google'), content);
        if (!result.name) throw new ProviderError('Publicação sem confirmação do Google.', 'uncertain');
        const pending = {
          snapshot: content,
          publishedId: result.name
        };
        await setJob(job.id, 'working', {
          external: pending
        });
        await verifyPublication(job, content, pending);
        return;
      }
      throw new ProviderError('Este canal usa publicação manual. Exporte o conteúdo ou escolha Instagram ou Google.', 'blocked');
    }
    if (job.kind === 'send') {
      const message = await record(org, 'messages', payload.messageId), lead = await record(org, 'leads', message.leadId);
      if (message.status !== 'draft') throw new ProviderError('Esta mensagem já saiu do estado de rascunho.', 'blocked');
      if (lead.optOut) throw new ProviderError('O contato solicitou a interrupção das mensagens.', 'blocked');
      if (!['whatsapp', 'instagram'].includes(message.channel)) throw new ProviderError('Escolha WhatsApp ou Instagram para enviar.', 'blocked');
      const inbound = decodeRecord(await db.prepare("SELECT * FROM records WHERE org_id=? AND kind='messages' AND json_extract(data,'$.leadId')=? AND json_extract(data,'$.channel')=? AND json_extract(data,'$.verifiedInboundAt')>0 ORDER BY json_extract(data,'$.verifiedInboundAt') DESC LIMIT 1").get(org, lead.id, message.channel));
      const windowOpen = inbound && Date.now() - inbound.verifiedInboundAt < 86400000;
      if (message.channel === 'instagram' && !windowOpen) throw new ProviderError('O Instagram exige uma mensagem recebida do cliente nas últimas 24 horas.', 'blocked');
      if (message.channel === 'whatsapp' && !windowOpen && (!lead.consent || !message.template)) throw new ProviderError('Fora da janela de atendimento, use um modelo aprovado e um contato com autorização registrada.', 'blocked');
      const to = message.channel === 'instagram' ? lead.instagramId : lead.whatsappId || lead.phone?.replace(/\D/g, '');
      if (!to) throw new ProviderError('O contato não possui identificador válido neste canal.', 'blocked');
      await setJob(job.id, 'working', {
        external: {
          snapshot: message,
          recipient: to
        }
      });
      await beforeMutation(job);
      const result = await providers.send(await integration(org, message.channel), {
        channel: message.channel,
        to,
        text: message.text,
        template: message.template,
        language: message.language || 'pt_BR',
        parameters: message.parameters || []
      });
      const id = result.messages?.[0]?.id || result.message_id;
      if (!id) throw new ProviderError('O serviço não confirmou a aceitação da mensagem.', 'uncertain');
      await systemUpdate(org, 'messages', message.id, {
        status: 'accepted',
        providerId: id,
        acceptedAt: Date.now(),
        source: message.channel
      });
      await setJob(job.id, 'succeeded', {
        output: {
          providerId: id,
          status: 'accepted'
        }
      });
      return;
    }
    if (job.kind === 'insights' && payload.instagramMediaId) {
      await publication.metrics(org, payload.operationId, payload.instagramMediaId, payload.period);
      await setJob(job.id, 'succeeded', {
        output: {
          result: {
            status: 'recorded',
            message: 'Consulta de métricas concluída; consulte os campos retornados ou indisponíveis na operação.'
          }
        }
      });
      return;
    }
    if (job.kind === 'insights') {
      const since = payload.since, until = payload.until;
      if (!(/^\d{4}-\d{2}-\d{2}$/).test(since || '') || !(/^\d{4}-\d{2}-\d{2}$/).test(until || '')) throw new ProviderError('Informe um período válido.');
      const data = await providers.insights(await integration(org, 'metaAds'), {
        channel: 'metaAds',
        since,
        until
      });
      const imported = [];
      for (const row of data.data || []) {
        const key = `metaAds:${row.date_start}:${row.date_stop}`;
        const existing = await db.prepare("SELECT id FROM records WHERE org_id=? AND kind='metrics' AND external_id=?").get(org, key);
        const metric = await saveRecord(org, 'metrics', {
          date: row.date_stop,
          channel: 'metaAds',
          impressions: row.impressions === undefined ? null : Number(row.impressions),
          clicks: row.clicks === undefined ? null : Number(row.clicks),
          spend: row.spend === undefined ? null : Number(row.spend),
          notes: `Meta Ads: ${row.date_start} a ${row.date_stop}`
        }, 'agente', existing?.id, true, existing ? null : key);
        await systemUpdate(org, 'metrics', metric.id, {
          source: 'metaAds',
          periodStart: row.date_start,
          periodEnd: row.date_stop,
          importedAt: Date.now()
        });
        imported.push(metric.id);
      }
      await setJob(job.id, 'succeeded', {
        output: {
          imported: imported.length,
          metricIds: imported,
          result: {
            status: 'verified',
            message: 'Medições da conta importadas com a fonte; sem atribuição automática à campanha.',
            evidence: {
              type: 'provider_metrics',
              metricIds: imported,
              scope: 'ad_account'
            }
          }
        }
      });
      return;
    }
    if (job.kind === 'googlePresence') {
      await beforeMutation(job);
      const config = await integration(org, 'google'), input = payload.input || ({});
      const result = await providers.googlePresence(config, payload.action, input, job.id);
      if (!result || typeof result !== 'object' || Array.isArray(result)) throw new ProviderError('O Google não confirmou a ação.', 'uncertain');
      let evidence = {
        type: 'provider_read',
        action: payload.action
      };
      if (['create', 'update', 'reply'].includes(payload.action)) {
        if (payload.action === 'create') {
          if (!(/^locations\/[a-zA-Z0-9_-]+$/).test(result.name || '')) throw new ProviderError('Perfil criado sem identificador confirmado.', 'uncertain');
          config.locationId = result.name.split('/').at(-1);
          await db.prepare('UPDATE integrations SET sealed=?,updated_at=? WHERE org_id=? AND provider=?').run(seal(config), Date.now(), org, 'google');
        }
        await setJob(job.id, 'working', {
          external: {
            ...external,
            presenceId: result.name || config.locationId,
            action: payload.action
          }
        });
        try {
          if (payload.action === 'reply') {
            const read = await providers.googlePresence(config, 'reviews');
            const review = (read.reviews || []).find(r => r.reviewId === input.reviewId || r.name?.endsWith('/reviews/' + input.reviewId));
            if (!review || review.reviewReply?.comment !== input.comment) throw new Error('A resposta à avaliação ainda não foi confirmada na leitura.');
            evidence = {
              type: 'channel_readback',
              action: payload.action,
              reviewId: input.reviewId,
              comment: review.reviewReply.comment,
              updateTime: review.reviewReply.updateTime || null
            };
          } else {
            const read = await providers.googlePresence(config, 'read');
            if (read?.name !== 'locations/' + config.locationId) throw new Error('A leitura não confirmou o perfil alterado.');
            if (payload.action === 'update' && (Object.hasOwn(input, 'description') && (read.profile?.description || '') !== input.description || input.website && read.websiteUri !== input.website)) throw new Error('A alteração do perfil ainda não aparece na leitura.');
            evidence = {
              type: 'channel_readback',
              action: payload.action,
              externalId: read.name
            };
          }
        } catch (e) {
          throw new ProviderError('O pedido ao Google foi aceito, mas sua conferência permanece pendente. ' + str(e.message, 180), 'uncertain');
        }
      }
      await setJob(job.id, 'succeeded', {
        output: {
          google: result,
          action: payload.action,
          providerId: result.name || null,
          result: {
            status: 'verified',
            message: payload.action === 'create' ? 'Perfil registrado e relido na API; verificação pública continua com o Google.' : 'Resultado conferido pela leitura do Google.',
            evidence
          }
        }
      });
      return;
    }
    if (job.kind === 'metaCampaign') {
      const campaign = await record(org, 'campaigns', payload.campaignId);
      if (campaign.providerId) throw new ProviderError('Esta campanha já está vinculada ao Meta Ads.', 'blocked');
      await setJob(job.id, 'working', {
        external: {
          snapshot: campaign
        }
      });
      await beforeMutation(job);
      const result = await providers.metaCampaign(await integration(org, 'metaAds'), campaign);
      if (!result.id) throw new ProviderError('Campanha sem confirmação do Meta Ads.', 'uncertain');
      await systemUpdate(org, 'campaigns', campaign.id, {
        providerId: result.id,
        providerStatus: 'PAUSED_REQUESTED'
      });
      await setJob(job.id, 'succeeded', {
        output: {
          providerId: result.id,
          status: 'PAUSED_REQUESTED',
          result: {
            status: 'accepted',
            message: 'A API aceitou a criação da campanha com pausa solicitada. Confira o estado no Meta Ads.',
            evidence: {
              type: 'channel_acceptance',
              externalId: result.id,
              requestedStatus: 'PAUSED'
            }
          }
        }
      });
    }
  }
  async function tick() {
    if (stopped || busy) return;
    busy = true;
    lastTick = Date.now();
    try {
      await whatsappWelcome.tick();
      await finance.tick();
      await creationSchedules.tick();
      for (const expired of await db.prepare("SELECT * FROM jobs WHERE state='working' AND (lease_until IS NULL OR lease_until<?)").all(Date.now())) {
        if (expired.kind === 'conversation') await conversation.recover(expired);
        const recovery = await kernel.recover(expired);
        await setJob(expired.id, recovery === 'blocked' ? 'blocked' : 'uncertain', {
          error: recovery === 'blocked' ? 'Preparação interrompida. Retome pela operação.' : 'A execução foi interrompida. Confira o serviço antes de repetir.'
        });
      }
      for (const row of await db.prepare('SELECT id,policy FROM companies').all()) {
        const p = {
          ...DEFAULT_POLICY,
          ...parse(row.policy)
        };
        if (!p.enabled) continue;
        const priority = await routinePriority(row.id), previous = await metadata(row.id, 'routine:daily');
        if (JSON.stringify({
          ...previous,
          checkedAt: undefined
        }) !== JSON.stringify(priority)) {
          await saveMetadata(row.id, 'routine:daily', {
            ...priority,
            checkedAt: Date.now()
          });
          await audit(row.id, 'rotina', 'Prioridade local da rotina diária', 'routine:daily', priority.message);
        }
        if (!priority.intelligenceRequired) {
          for (const old of await db.prepare("SELECT id FROM jobs WHERE org_id=? AND kind='agent' AND state='queued' AND idempotency_key LIKE 'daily-director:%'").all(row.id)) await setJob(old.id, 'blocked', {
            error: priority.message
          });
          continue;
        }
        const owner = await db.prepare('SELECT user_id FROM memberships WHERE org_id=? LIMIT 1').get(row.id);
        if (!owner) continue;
        const date = new Intl.DateTimeFormat('en-CA', {
          timeZone: p.timeZone || 'America/Sao_Paulo'
        }).format(new Date());
        await queue(row.id, owner.user_id, 'agent', {
          agent: 'director',
          brief: 'Os registros locais não têm trabalho pendente. Revise lacunas e resultados antes de propor uma nova frente.'
        }, null, 'daily-director:' + date);
      }
      await whatsappChat.tick();
      const job = await db.prepare("UPDATE jobs SET state='working',attempts=attempts+1,lease_until=?,updated_at=? WHERE id=(SELECT id FROM jobs WHERE state IN ('queued','waiting_provider') AND scheduled_at<=? ORDER BY scheduled_at LIMIT 1) AND state IN ('queued','waiting_provider') RETURNING *").get(Date.now() + 180000, Date.now(), Date.now());
      if (!job) return;
      try {
        await execute(job);
      } catch (e) {
        if (job.kind === 'conversation') {
          const threadId = parse(job.payload).conversationId;
          // Preflight failures (including daily limits) happen before run() can
          // explain them. Persist a reply so the WhatsApp bridge can deliver it.
          const thread = await db.prepare('SELECT id FROM conversations WHERE org_id=? AND id=?').get(job.org_id, threadId);
          const replied = await db.prepare("SELECT 1 FROM conversation_messages WHERE org_id=? AND conversation_id=? AND job_id=? AND role='assistant'").get(job.org_id, threadId, job.id);
          if (thread && !replied) await conversation.appendMessage(job.org_id, threadId, 'assistant', e instanceof ProviderError ? e.message : 'Não consegui processar esse pedido. Os arquivos foram preservados; confira o andamento no painel.', job.id);
        }
        if ((e.state === 'blocked' && e.code !== 'conversation_step_limit') || e.providerRejected === true) await db.prepare('DELETE FROM usage_reservations WHERE job_id=?').run(job.id);
        if(e.providerDiagnostic)await audit(job.org_id,'agente','Solicitação recusada pela OpenAI',job.id,JSON.stringify(e.providerDiagnostic));
        if(e.processDiagnostic)await audit(job.org_id,'agente','Falha no processamento do vídeo',job.id,JSON.stringify(e.processDiagnostic));
        if (!stopped) await setJob(job.id, e.state || 'failed', {
          error: str(e.message, 500)
        });
      }
    } finally {
      busy = false;
    }
  }
  const timer = startScheduler && !cloud ? setInterval(() => {
    db.scope(tick).catch(() => {});
  }, 3000).unref() : null;
  const captureLimits = new Map();
  function captureAllowed(req) {
    const key = req.socket.remoteAddress || 'local';
    const now = Date.now();
    for (const [k, v] of captureLimits) if (v.time < now - 600000) captureLimits.delete(k);
    const entry = captureLimits.get(key) || ({
      time: now,
      count: 0
    });
    entry.count++;
    captureLimits.set(key, entry);
    return entry.count <= 15;
  }
  async function webhook(req, res, url, org, provider) {
    if (!['instagram', 'whatsapp'].includes(provider)) {
      json(res, 404, {
        error: 'Canal inválido.'
      });
      return;
    }
    const conf = await integration(org, provider);
    if (req.method === 'GET') {
      if (conf.verifyToken && url.searchParams.get('hub.mode') === 'subscribe' && url.searchParams.get('hub.verify_token') === conf.verifyToken) {
        res.writeHead(200, {
          'Content-Type': 'text/plain'
        }).end(url.searchParams.get('hub.challenge') || '');
      } else res.writeHead(403).end();
      return;
    }
    if (req.method !== 'POST') {
      res.writeHead(405).end();
      return;
    }
    const raw = await readRaw(req, 1048576), signature = req.headers['x-hub-signature-256'];
    if (!conf.appSecret || !(/^sha256=[a-f0-9]{64}$/).test(signature || '')) {
      res.writeHead(403).end();
      return;
    }
    const expected = createHmac('sha256', conf.appSecret).update(raw).digest();
    if (!timingSafeEqual(expected, Buffer.from(signature.slice(7), 'hex'))) {
      res.writeHead(403).end();
      return;
    }
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      res.writeHead(400).end();
      return;
    }
    const events = [];
    for (const entry of data.entry || []) {
      if (provider === 'whatsapp') {
        for (const change of entry.changes || []) {
          const value = change.value || ({});
          if (String(value.metadata?.phone_number_id) !== String(conf.phoneNumberId)) continue;
          for (const msg of value.messages || []) if (msg.type === 'text') events.push({
            id: msg.id,
            from: msg.from,
            text: msg.text.body,
            name: value.contacts?.find(c => c.wa_id === msg.from)?.profile?.name || msg.from,
            time: Number(msg.timestamp) * 1000
          });
          for (const status of value.statuses || []) {
            const row = await db.prepare("SELECT * FROM records WHERE org_id=? AND kind='messages' AND json_extract(data,'$.providerId')=?").get(org, status.id);
            if (row && ['sent', 'delivered', 'read', 'failed'].includes(status.status)) await systemUpdate(org, 'messages', row.id, {
              status: status.status,
              deliveryAt: Number(status.timestamp) * 1000
            });
          }
        }
      } else {
        if (String(entry.id) !== String(conf.accountId)) continue;
        for (const e of entry.messaging || []) if (e.message?.text && !e.message?.is_echo) events.push({
          id: e.message.mid,
          from: e.sender.id,
          text: e.message.text,
          name: e.sender.id,
          time: Number(e.timestamp)
        });
      }
    }
    for (const e of events) {
      if (!e.id || await db.prepare("SELECT 1 FROM records WHERE org_id=? AND kind='messages' AND external_id=?").get(org, e.id)) continue;
      const idKey = provider === 'whatsapp' ? 'whatsappId' : 'instagramId';
      let row = await db.prepare(`SELECT * FROM records WHERE org_id=? AND kind='leads' AND json_extract(data,'$.${idKey}')=?`).get(org, String(e.from));
      let lead = row ? decodeRecord(row) : await saveRecord(org, 'leads', {
        name: e.name,
        phone: provider === 'whatsapp' ? e.from : '',
        source: provider,
        stage: 'new',
        consent: false
      }, 'webhook');
      await systemUpdate(org, 'leads', lead.id, {
        [idKey]: String(e.from)
      });
      const message = await saveRecord(org, 'messages', {
        leadId: lead.id,
        text: e.text,
        direction: 'incoming',
        channel: provider,
        status: 'recorded'
      }, 'webhook', null, true, e.id);
      await systemUpdate(org, 'messages', message.id, {
        source: provider,
        verifiedInboundAt: Math.min(e.time || Date.now(), Date.now()),
        providerId: e.id
      });
      if ((await company(org)).policy.autoReply) await queue(org, null, 'agent', {
        agent: 'relationship',
        leadId: lead.id,
        channel: provider,
        brief: 'Responda à última mensagem do cliente usando os fatos da empresa.',
        autoReply: true,
        inboundId: e.id
      }, null, 'inbound:' + e.id);
    }
    json(res, 200, {
      received: true
    });
  }
  async function handle(req, res, pathname) {
    const url = new URL(req.url, 'http://localhost');
    if(pathname.startsWith('/api/presentations/')){
      const match=/^\/api\/presentations\/([a-f\d-]{36})(?:\/(interest|media)(?:\/(\d))?)?$/.exec(pathname);
      if(!match)fail('Apresentação indisponível.',404);
      const [,slug,action,index]=match;
      if(!action&&req.method==='GET'){json(res,200,commercial.publicDTO(await commercial.publicPage(slug)));return true;}
      if(action==='interest'&&!index&&req.method==='POST'){
        if(!safeOrigin(req))fail('Origem não permitida.',403);
        if(!captureAllowed(req))fail('Aguarde alguns minutos antes de tentar novamente.',429);
        json(res,200,await commercial.interest(slug,await body(req)));return true;
      }
      if(action==='media'&&index!==undefined&&['GET','HEAD'].includes(req.method)){
        const a=await commercial.publicMedia(slug,index),file=await assetPath(a.orgId,a.id),stat=fs.statSync(file);
        let start=0,end=stat.size-1,status=200;
        const headers={'Content-Type':a.mime,'Cache-Control':'no-store','X-Robots-Tag':'noindex','Accept-Ranges':'bytes','Content-Disposition':'inline'};
        if(req.headers.range){const range=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range);if(!range)fail('Faixa inválida.',416);start=Number(range[1]);end=range[2]?Math.min(Number(range[2]),end):end;if(start>end||start>=stat.size)fail('Faixa inválida.',416);status=206;headers['Content-Range']='bytes '+start+'-'+end+'/'+stat.size;}
        headers['Content-Length']=end-start+1;res.writeHead(status,headers);if(req.method==='HEAD')res.end();else fs.createReadStream(file,{start,end}).on('error',()=>res.destroy()).pipe(res);return true;
      }
      fail('Método não permitido.',405);
    }
    if(pathname==='/api/connect/instagram/callback'){try{await instagramLogin.callback(req,res);}catch{if(!res.headersSent)res.writeHead(303,{Location:'/retorno.html?connection=failed','Cache-Control':'no-store','Referrer-Policy':'no-referrer'}).end();}return true;}
    if(pathname==='/webhooks/helpu-whatsapp'){await whatsappChat.webhook(req,res,url,readRaw);return true;}
    if(pathname==='/webhooks/helpu-stripe'){
      if(req.method!=='POST')fail('Método não permitido.',405);
      const event=await billing.financialEvent(await readRaw(req,256*1024),req.headers['stripe-signature']);
      json(res,200,await finance.recordStripe(event));return true;
    }
    if (pathname.startsWith('/webhooks/')) {
      const [, , org, provider] = pathname.split('/');
      await webhook(req, res, url, org, provider);
      return true;
    }
    if (pathname.startsWith('/capture/') || pathname.startsWith('/api/capture/')) {
      const id = pathname.split('/').at(-1);
      const row = await db.prepare("SELECT * FROM records WHERE id=? AND kind='pages'").get(id);
      if (!row || !parse(row.data).active) {
        res.writeHead(404).end('Página indisponível.');
        return true;
      }
      const page = parse(row.data), c = await company(row.org_id);
      if (req.method === 'GET' && pathname.startsWith('/capture/')) {
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store'
        }).end(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(page.title)} — ${escape(c.name)}</title><link rel="stylesheet" href="/assets/portal.css"><script defer src="/assets/capture.js"></script></head><body class="capture-body"><main class="capture-card"><p class="overline">${escape(c.name)}</p><h1>${escape(page.title)}</h1><p>${escape(page.description)}</p><form id="capture-form" data-page="${escape(id)}"><label>Seu nome<input name="name" required maxlength="100" autocomplete="name"></label><label>E-mail<input name="email" type="email" required maxlength="254" autocomplete="email"></label><label>WhatsApp<input name="phone" maxlength="30" autocomplete="tel"></label><label class="checkline"><input name="consent" type="checkbox"> Autorizo esta empresa a entrar em contato sobre meu interesse.</label><p id="capture-status" role="status"></p><button class="p-button primary" type="submit">${escape(page.buttonLabel || 'Quero saber mais')}</button></form><small>Seus dados serão encaminhados para ${escape(c.name)}.</small></main></body></html>`);
        return true;
      }
      if (req.method !== 'POST' || !safeOrigin(req)) {
        res.writeHead(403).end();
        return true;
      }
      if (!captureAllowed(req)) fail('Aguarde alguns minutos e tente novamente.', 429);
      const d = await body(req);
      if (d.website) fail('Não foi possível receber.');
      await saveRecord(row.org_id, 'leads', {
        name: d.name,
        email: d.email,
        phone: d.phone,
        consent: d.consent === true,
        source: 'Página: ' + page.title,
        campaignId: page.campaignId || '',
        stage: 'new'
      }, 'formulário');
      json(res, 201, {
        ok: true
      });
      return true;
    }
    if (!pathname.startsWith('/api/portal')) return false;
    const user = await userFrom(req);
    if (!user) fail('Entre para acessar o portal.', 401);
    if (!['GET', 'HEAD'].includes(req.method) && !safeOrigin(req)) fail('Origem não permitida.', 403);
    if (pathname === '/api/portal/bootstrap' && req.method === 'GET') {
      json(res, 200, {
        user,
        companies: await companies(user),
        agents: AGENTS,
        operator: assisted.operator(user)
      });
      return true;
    }
    if(pathname==='/api/portal/template-catalog'){
      if(req.method==='GET')json(res,200,await templateCatalog.list(user,url.searchParams.get('admin')==='1'));
      else if(req.method==='POST')json(res,200,await templateCatalog.action(user,await body(req)));
      else fail('Método não permitido.',405);return true;
    }
    const templateAdopt=pathname.match(/^\/api\/portal\/([^/]+)\/template-catalog$/);
    if(templateAdopt){if(req.method!=='POST')fail('Método não permitido.',405);json(res,200,await templateCatalog.adopt(templateAdopt[1],user,(await body(req)).id));return true;}
    if(pathname==='/api/portal/ai-management'){
      const target=url.searchParams.get('org')||'';
      if(req.method==='GET')json(res,200,await aiManagement.listing(target,user));
      else if(req.method==='POST')json(res,200,await aiManagement.action(target,user,await body(req)));
      else fail('Método não permitido.',405);return true;
    }
    if(pathname==='/api/portal/commerce'){
      const admin=url.searchParams.get('admin')==='1',target=url.searchParams.get('org')||'';
      if(req.method==='GET')json(res,200,await commerce.listing(target,user,admin));
      else if(req.method==='POST')json(res,200,await commerce.action(target,user,await body(req),admin));
      else fail('Método não permitido.',405);return true;
    }
    if(pathname==='/api/portal/finance'||pathname==='/api/portal/finance/files'){
      const admin=url.searchParams.get('admin')==='1',financeOrg=url.searchParams.get('org')||'';
      if(pathname.endsWith('/files')){
        if(req.method!=='POST')fail('Método não permitido.',405);
        await finance.access(financeOrg,user,admin);
        const input={id:String(req.headers['x-finance-id']||''),version:Number(req.headers['x-record-version']),code:String(req.headers['x-payment-code']||''),bankReference:decodeURIComponent(String(req.headers['x-bank-reference']||''))};
        json(res,200,await finance.upload(financeOrg,user,input,decodeURIComponent(String(req.headers['x-file-name']||'documento.pdf')),await readRaw(req,3*1024*1024),admin));
      }else if(req.method==='GET')json(res,200,await finance.listing(financeOrg,user,admin));
      else if(req.method==='POST')json(res,200,await finance.action(financeOrg,user,await body(req),admin));
      else fail('Método não permitido.',405);
      return true;
    }
    if(pathname==='/api/portal/admin-overview'){
      if(!assisted.operator(user))fail('Acesso restrito à equipe autorizada.',403);
      if(req.method!=='GET')fail('Método não permitido.',405);
      json(res,200,await adminOverview(db));return true;
    }
    if(pathname==='/api/portal/pricing'){
      if(req.method==='GET')json(res,200,await pricing.listing(user,url.searchParams.get('orgId')));
      else if(req.method==='POST')json(res,200,await pricing.action(user,await body(req)));
      else fail('Método não permitido.',405);return true;
    }
    if(pathname==='/api/portal/commercial-preview'&&req.method==='GET'){json(res,200,await commercial.preview(user,url.searchParams.get('id')));return true;}
    if(pathname==='/api/portal/commercial-admin'){
      if(req.method==='GET')json(res,200,await commercial.adminList(user));
      else if(req.method==='POST'){const input=await body(req);if(input.kind==='page')json(res,200,await commercial.pageAction(user,input));else if(input.kind==='interest')json(res,200,await commercial.leadAction(user,input));else if(input.kind==='offer')json(res,200,await commercial.offerAction(user,input));else fail('Ação inválida.');}
      else fail('Método não permitido.',405);return true;
    }
    if(pathname==='/api/portal/commercial-proposals'){
      if(req.method==='GET')json(res,200,{offers:await commercial.offers(user)});
      else if(req.method==='POST')json(res,200,await commercial.customerAction(user,await body(req)));
      else fail('Método não permitido.',405);return true;
    }
    if(pathname==='/api/portal/consultations-admin/files'){
      if(req.method!=='POST')fail('Método não permitido.',405);
      if(!assisted.operator(user))fail('Acesso restrito à equipe Helpu.',403);
      const input={id:String(req.headers['x-consultation-id']||''),version:Number(req.headers['x-record-version'])};
      const bytes=await readRaw(req,3*1024*1024);
      json(res,200,await consultations.upload(String(req.headers['x-company-id']||''),user,input,decodeURIComponent(String(req.headers['x-file-name']||'arquivo')),bytes));return true;
    }
    if(pathname==='/api/portal/consultations-admin'){
      if(req.method==='GET')json(res,200,await consultations.listing(null,user,true));
      else if(req.method==='POST'){const input=await body(req);json(res,200,await consultations.action(input.orgId,user,input,true));}
      else fail('Método não permitido.',405);
      return true;
    }
    if(pathname==='/api/portal/assisted-admin'){
      if(req.method==='GET')json(res,200,await assisted.adminListing(user));
      else if(req.method==='POST'){const input=await body(req);json(res,200,await assisted.action(input.orgId,user,input,true));}
      else fail('Método não permitido.',405);
      return true;
    }
    if (pathname === '/api/portal/companies' && req.method === 'POST') {
      const d = await body(req), name = str(d.name, 120);
      if (!name) fail('Informe o nome da empresa.');
      json(res, 201, await newCompany(user, name));
      return true;
    }
    if (pathname.startsWith('/api/portal/files/')) {
      const id = pathname.split('/').at(-1);let asset = await db.prepare('SELECT * FROM assets WHERE id=?').get(id);
      if (!asset) fail('Arquivo não encontrado.', 404);
      if(asset.source_url==='helpu:finance')await finance.authorizeFile(user,asset);
      else if(!await templateCatalog.canReadAsset(user,asset)&&!await assisted.canReadAsset(user,asset)&&!await consultations.canReadAsset(user,asset)&&!await commercial.canReadAsset(user,asset))await access(asset.org_id, user);
      if (!['GET', 'HEAD'].includes(req.method)) fail('Método não permitido.', 405);
      asset=await reviewPreview.resolve(asset);
      if(privateStorage&&asset.size>3*1024*1024){res.writeHead(302,{Location:await privateStorage.signDownload(asset.org_id,asset.path),'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}).end();return true;}
      const file = await assetPath(asset.org_id,asset.id,true), stat = fs.statSync(file);
      let start = 0, end = stat.size - 1, status = 200;
      const headers = {
        'Content-Type': asset.mime,
        'Cache-Control': 'private, no-store',
        'Accept-Ranges': 'bytes',
        'Content-Disposition': `${asset.mime === 'application/pdf' ? 'attachment' : 'inline'}; filename="${encodeURIComponent(asset.name)}"`
      };
      if (req.headers.range) {
        const m = (/^bytes=(\d+)-(\d*)$/).exec(req.headers.range);
        if (!m) fail('Faixa inválida.', 416);
        start = Number(m[1]);
        end = m[2] ? Math.min(Number(m[2]), end) : end;
        if (start > end || start >= stat.size) fail('Faixa inválida.', 416);
        status = 206;
        headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`;
      }
      headers['Content-Length'] = end - start + 1;
      res.writeHead(status, headers);
      if (req.method === 'HEAD') res.end(); else fs.createReadStream(file, {
        start,
        end
      }).on('error', () => res.destroy()).pipe(res);
      return true;
    }
    const parts = pathname.split('/').filter(Boolean), org = parts[2], section = parts[3], kind = parts[4], id = parts[5];
    await access(org, user);
    if(section==='creative-library'){
      if(req.method==='GET')json(res,200,await creativeLibrary.context(org));
      else if(req.method==='POST'){const d=await body(req);if(d.action==='classify')json(res,200,await creativeLibrary.classify(org,user.id,d));else if(d.action==='direction')json(res,200,await creativeLibrary.direction(org,user.id,d.direction));else fail('Ação inválida.',400);}else fail('Método não permitido.',405);
      return true;
    }
    if(section==='consultations'){

      if(req.method==='GET')json(res,200,await consultations.listing(org,user));
      else if(req.method==='POST')json(res,200,await consultations.action(org,user,await body(req)));
      else fail('Método não permitido.',405);
      return true;
    }
    if(section==='assisted'){
      if(req.method==='GET')json(res,200,await assisted.listing(org,user));
      else if(req.method==='POST')json(res,200,await assisted.action(org,user,await body(req)));
      else fail('Método não permitido.',405);
      return true;
    }
    if(section==='creation-schedules'){if(req.method==='GET')json(res,200,{schedules:await creationSchedules.list(org,user.id)});else if(req.method==='POST'){const input=await body(req);json(res,200,kind?await creationSchedules.update(org,user.id,kind,input.action):await creationSchedules.create(org,user.id,input,input.conversationId));}else fail('Método não permitido.',405);return true;}
    if(section==='creations'){if(req.method==='GET')json(res,200,kind?{creation:await creations.get(org,kind)}:await creations.list(org));else if(req.method==='POST'&&!kind)json(res,201,{creation:await creations.submit(org,user.id,await body(req))});else if(req.method==='POST'&&kind)json(res,200,{creation:await creations.review(org,user.id,kind,await body(req))});else fail('Método não permitido.',405);return true;}
    if(section==='whatsapp-chat'){
      if(req.method==='GET'){
        const value=await whatsappChat.status(org,user),welcome=await whatsappWelcome.status(org,user);
        json(res,200,{...value,phone:value.phone||welcome.phone,welcome});
      }
      else if(req.method==='POST')json(res,200,await whatsappChat.save(org,user,await body(req)));
      else fail('Método não permitido.',405);
      return true;
    }
    if(section==='whatsapp-welcome'){
      if(req.method==='GET')json(res,200,await whatsappWelcome.status(org,user));
      else if(req.method==='POST'){
        const input=await body(req);
        if(input.action!=='revoke')fail('Ação inválida.',400);
        json(res,200,await whatsappWelcome.revoke(org,user));
      }else fail('Método não permitido.',405);
      return true;
    }
    if(section==='onboarding'){
      const key='onboarding:'+user.id,saved=await metadata(org,key);
      const steps=['company','brand','create','review','whatsapp'];
      if(req.method==='GET')json(res,200,{state:saved.state||'available',completed:saved.completed||[],goal:saved.goal||''});
      else if(req.method==='POST'){
        const input=await body(req),next={...saved,updatedAt:Date.now()};
        if(['start','resume'].includes(input.action)){next.state='active';if(saved.state==='completed'||input.action==='start')next.completed=[];}
        else if(input.action==='skip')next.state='paused';
        else if(input.action==='finish')next.state='completed';
        else if(input.action==='step' && steps.includes(input.step)){
          next.completed=[...new Set([...(saved.completed||[]),input.step])];
        }else if(input.action==='goal' && ['present','offer','educate'].includes(input.goal))next.goal=input.goal;
        else fail('Escolha uma etapa válida do guia.',400);
        await saveMetadata(org,key,next);
        json(res,200,{state:next.state||'active',completed:next.completed||[],goal:next.goal||''});
      }else fail('Método não permitido.',405);
      return true;
    }
    if(section==='billing'){
      if(req.method==='GET'&&!kind)json(res,200,await billing.state(org,user));
      else if(req.method==='POST'&&kind){const input=await body(req);json(res,200,await billing.action(org,user,kind,input));}
      else fail('Método não permitido.',405);
      return true;
    }
    if(section==='files'&&kind==='prepare'&&req.method==='POST'){
      if(!privateStorage){json(res,200,{mode:'local'});return true;}
      const input=await body(req),name=str(input.name,150),extension=path.extname(name).toLowerCase();
      if(!/^[a-f\d-]{36}$/.test(input.uploadId||'')||!['.png','.jpg','.jpeg','.webp','.mp4','.mp3','.wav','.ogg','.pdf','.woff2','.ttf','.otf'].includes(extension)||!Number.isInteger(input.size)||input.size<1||input.size>25*1024*1024)fail('Envie um arquivo válido de até 25 MB.');
      const key='upload:'+input.uploadId,previous=await metadata(org,key);
      if(previous.id&&(previous.name!==name||previous.size!==input.size||previous.actor!==user.id))fail('A autorização não corresponde a este arquivo.',409);
      const ticket={id:input.uploadId,name,size:input.size,file:input.uploadId+(extension==='.jpeg'?'.jpg':extension),actor:user.id,expiresAt:Date.now()+30*60*1000};
      await saveMetadata(org,key,ticket);
      json(res,200,{mode:'direct',uploadId:ticket.id,url:await privateStorage.signUpload(org,ticket.file)});return true;
    }
    if(section==='files'&&kind==='complete'&&req.method==='POST'){
      if(!privateStorage)fail('Envie o arquivo pela biblioteca local.');
      const input=await body(req),ticket=await metadata(org,'upload:'+input.uploadId);
      if(!ticket.id||ticket.actor!==user.id)fail('Autorização de arquivo não encontrada.',404);
      const existing=await db.prepare('SELECT id,name,mime,size FROM assets WHERE id=? AND org_id=?').get(ticket.id,org);
      if(existing){json(res,200,{...existing,url:'/api/portal/files/'+existing.id});return true;}
      if(ticket.expiresAt<Date.now())fail('A autorização expirou. Envie o arquivo novamente.',409);
      const bytes=await privateStorage.download(org,ticket.file),type=assetType(bytes);
      if(bytes.length!==ticket.size||!type||path.extname(ticket.file)!==type[1])fail('O conteúdo do arquivo não corresponde ao envio informado.');
      const hash=hashFile(bytes),stored=await db.prepare('INSERT INTO assets(id,org_id,name,mime,size,path,source_url,created_at,storage_bucket,storage_path,sha256,storage_verified_at) VALUES(?,?,?,?,?,?,NULL,?,?,?,?,?) ON CONFLICT(id) DO NOTHING').run(ticket.id,org,ticket.name,type[0],bytes.length,ticket.file,Date.now(),'helpu-private',org+'/'+ticket.file,hash,new Date().toISOString());
      if(stored.changes===1)await audit(org,user.id,'Arquivo armazenado e verificado',ticket.id,ticket.name);
      const verified=await db.prepare('SELECT id,name,mime,size,sha256 FROM assets WHERE id=? AND org_id=?').get(ticket.id,org);
      if(!verified||verified.sha256!==hash)fail('O arquivo não pôde ser confirmado.',409);
      json(res,201,{id:verified.id,name:verified.name,mime:verified.mime,size:verified.size,url:'/api/portal/files/'+verified.id});return true;
    }
    if(deliveryOnly && section==='runtime' && kind==='browser') fail('As telas de contas foram desativadas no fluxo de entrega.',409);
    if (await runtimeTools.handle(req,res,org,parts,user,body,json)) return true;
    if(deliveryOnly && section==='browser') fail('Acesso a contas pelo navegador não faz parte da entrega de conteúdo.',409);
    if (await conversation.handle(req, res, org, section, kind, id, user, body)) return true;
    if (section === 'studio') {
      try {
        if (kind === 'materials') {
          if (req.method === 'POST') {
            json(res, 200, await studio.saveMaterials(org, await body(req), user.id));
            return true;
          }
        } else if (kind) {
          if (req.method === 'GET') {
            json(res, 200, await studio.inspect(org, kind));
            return true;
          }
          if (req.method === 'POST' && id === 'preflight') {
            json(res, 200, await studio.preflight(org, kind, user.id));
            return true;
          }
          if (req.method === 'POST' && id === 'decision') {
            json(res, 200, await studio.saveDecision(org, kind, await body(req), user.id));
            return true;
          }
          if (req.method === 'POST' && id === 'check-openai') {
            json(res, 200, await studio.checkOpenAI(org, kind, user.id));
            return true;
          }
        }
        fail('Ação do Estúdio inválida.', 400);
      } catch (error) {
        if (error instanceof ProviderError) error.status = 409;
        throw error;
      }
    }
    if (section === 'operations') {
      if (req.method === 'GET') {
        json(res, 200, kind ? await kernel.get(org, kind) : {
          operations: await kernel.list(org)
        });
        return true;
      }
      if (req.method === 'POST' && kind) {
        const d = await body(req);
        delete d.explicitPublication;
        try {
          let result;
          if ((await kernel.get(org, kind)).production && ['resume', 'review', 'approve', 'execute', 'schedule'].includes(d.action)) {
            if (d.action === 'resume') {
              const op = await kernel.get(org, kind);
              await kernel.persist(org, kind, {
                paused: false
              });
              await studio.preflight(org, op.production.contentId, user.id);
              json(res, 200, await kernel.get(org, kind));
              return true;
            }
            fail('A peça visual ainda não passou por produção, revisão e aprovação da versão final. Consulte o Estúdio.', 409);
          }
          if (d.action === 'review_publication') result = await publication.review(org, kind, user.id); else if (d.action === 'approve_publish') result = await publication.approvePublish(org, kind, user.id, d); else if (d.action === 'link_publication') {
            const op = await kernel.get(org, kind);
            if (!op.firstInstagram || op.state !== 'uncertain' || !(/^\d{5,40}$/).test(d.externalId || '')) fail('Informe o identificador numérico da publicação encontrada para conferir a operação incerta.', 409);
            const job = await db.prepare("SELECT * FROM jobs WHERE org_id=? AND kind='publish' AND state='uncertain' AND json_extract(payload,'$.operationId')=? ORDER BY created_at DESC LIMIT 1").get(org, kind);
            const ext = parse(job?.external);
            if (!job || !ext.containerId || !ext.snapshot) fail('Faltam contêiner e versão de origem para vincular esta publicação com segurança.', 409);
            if (ext.publishedId && !ext.candidateSource && ext.publishedId !== d.externalId) fail('A tentativa já possui um identificador confirmado pelo executor. Use Conferir.', 409);
            await db.prepare("UPDATE jobs SET external=?,payload=json_set(payload,'$.verificationOnly',json('true')),state='queued',cancel_requested=0,scheduled_at=?,updated_at=? WHERE id=?").run(JSON.stringify({
              ...ext,
              publishedId: d.externalId,
              candidateSource: 'supplied_by_user',
              candidateActor: user.id
            }), Date.now(), Date.now(), job.id);
            await kernel.evidence(org, kind, {
              status: 'declared',
              executor: 'user',
              channel: 'instagram',
              message: 'Identificador informado para conferência; ainda não é confirmação.',
              evidence: {
                candidateId: d.externalId,
                actor: user.id,
                source: 'supplied_by_user'
              }
            }, job.id);
            result = await kernel.transition(org, kind, 'verifying', 'Identificador informado pelo usuário. A leitura do canal verificará a correspondência; não haverá nova publicação.', {
              paused: false
            });
          } else result = await kernel.action(org, kind, user.id, d);
          json(res, 200, result);
        } catch (e) {
          if (e instanceof ProviderError) e.status = 409;
          throw e;
        }
        return true;
      }
    }
    if (section === 'state' && req.method === 'GET') {
      json(res, 200, await state(org));
      return true;
    }
    if (section === 'integrations' && req.method === 'POST' && id === 'confirm' && kind === 'instagram') {
      const d = await body(req), identity = await metadata(org, 'api:instagram');
      if (identity.status !== 'identity_detected' || identity.accountId !== d.identityId || identity.username !== d.username || identity.accountId !== (await integration(org, 'instagram')).accountId) fail('Valide a conta atual antes de confirmar a identidade.', 409);
      const confirmed = {
        ...identity,
        status: 'identity_confirmed',
        confirmedAt: Date.now(),
        confirmedBy: user.id,
        method: 'api',
        companyId: org
      };
      await saveMetadata(org, 'api:instagram', confirmed);
      await audit(org, user.id, 'Identidade do Instagram confirmada', kind);
      await kernel.onBrand(org);
      json(res, 200, confirmed);
      return true;
    }
    if (section === 'integrations' && req.method === 'POST' && id === 'test' && (kind === 'openai' && providers.operationalValidation || kind === 'instagram' && providers.instagramIdentity)) {
      const config = await integration(org, kind), startedAt = Date.now(), validationId = randomUUID();
      let result, detectedIdentity;
      await saveMetadata(org, 'validation:' + kind, {
        status: 'validating',
        validationId,
        startedAt
      });
      try {
        if (kind === 'openai') result = await providers.operationalValidation(config, {
          tools: ['deliver_post'],
          onUsage: response=>recordProviderUsage(db,{org_id:org,operationId:validationId},response,{operation:'operational_validation',model:response.configuredModel})
        }); else {
          const identity = await providers.instagramIdentity(config);
          result = {
            provider: kind,
            status: 'validated',
            startedAt,
            completedAt: Date.now(),
            latencyMs: Date.now() - startedAt
          };
          detectedIdentity = {
            ...identity,
            accountId: identity.id,
            status: 'identity_detected',
            method: 'api',
            companyId: org,
            lastValidatedAt: Date.now()
          };
        }
      } catch (e) {
        result = {
          provider: kind,
          status: e.state === 'blocked' ? 'blocked' : 'failed',
          configuredModel: kind === 'openai' ? config.agentModel || 'gpt-6-astra' : undefined,
          model: null,
          responseId: null,
          startedAt,
          completedAt: Date.now(),
          latencyMs: Date.now() - startedAt,
          error: e instanceof ProviderError ? str(e.message, 500) : 'O provedor não confirmou a validação.'
        };
        if (kind === 'instagram') detectedIdentity = {
          status: 'blocked',
          lastValidatedAt: Date.now(),
          error: result.error
        };
      }
      if (JSON.stringify(config) !== JSON.stringify(await integration(org, kind))) result = {
        ...result,
        status: 'blocked',
        error: 'A configuração mudou durante a validação. Teste a versão atual.'
      };
      if ((await metadata(org, 'validation:' + kind)).validationId !== validationId) {
        json(res, 409, {
          verified: false,
          message: 'Outra configuração ou validação substituiu este teste.'
        });
        return true;
      }
      result.validationId = validationId;
      if (detectedIdentity) await saveMetadata(org, 'api:instagram', detectedIdentity);
      await saveMetadata(org, 'validation:' + kind, result);
      await db.prepare('UPDATE integrations SET verified_at=?,error=? WHERE org_id=? AND provider=?').run(result.status === 'validated' ? Date.now() : null, result.error || null, org, kind);
      await audit(org, user.id, 'Validação do provedor: ' + result.status, kind);
      json(res, result.status === 'validated' ? 200 : 422, {
        verified: result.status === 'validated',
        validation: result,
        identity: await metadata(org, 'api:' + kind),
        message: result.error || 'Chamada real ao serviço validada; confira a identidade da conta.'
      });
      return true;
    }
    if (section === 'usage' && req.method === 'POST' && kind === 'reset') {
      await body(req);
      if((await company(org)).policy.usageTestingEnabled!==true)fail('O reset está disponível apenas para empresas habilitadas para testes.',403);
      const membership=await db.prepare('SELECT role FROM memberships WHERE org_id=? AND user_id=?').get(org,user.id);
      if(!['owner','admin'].includes(membership?.role))fail('Somente a administração pode zerar o uso interno.',403);
      await db.exec('BEGIN IMMEDIATE');
      try {
        if(db.dialect==='postgres')await db.prepare('SELECT id FROM companies WHERE id=? FOR UPDATE').get(org);
        const c=await company(org),before=await usageSnapshot(db,org,c.policy),at=Date.now();
        const policy={...c.policy,usageResetAt:at};
        await db.prepare('UPDATE companies SET policy=?,updated_at=? WHERE id=?').run(JSON.stringify(policy),Math.max(at,c.updatedAt+1),org);
        await audit(org,user.id,'Uso interno zerado',org,JSON.stringify({before,resetAt:at}));
        await db.exec('COMMIT');
        json(res,200,await usageSnapshot(db,org,policy));
      }catch(e){await db.exec('ROLLBACK');throw e;}
      return true;
    }
    if (section === 'company' && req.method === 'PATCH') {
      const d = await body(req);
      if (d.expectedUpdatedAt !== undefined && d.expectedUpdatedAt !== (await company(org)).updatedAt) fail('O contexto mudou. Atualize antes de salvar.', 409);
      const c = await company(org), profile = {
        ...c.profile,
        _evidence: c.profileEvidence
      };
      const policy = {
        ...c.policy
      };
      for (const k of ['enabled', 'autoMedia', 'allowPublishing', 'autoReply']) if ((k in (d.policy || ({})))) policy[k] = d.policy[k] === true;
      if(['dailyRuns','dailyMedia','dailyMessages'].some(k=>k in (d.policy||{}))){
        const membership=await db.prepare('SELECT role FROM memberships WHERE org_id=? AND user_id=?').get(org,user.id);
        if(!['owner','admin'].includes(membership?.role))fail('Somente a administração pode alterar os limites.',403);
        for(const k of ['dailyRuns','dailyMedia','dailyMessages'])if(k in (d.policy||{})){
          if(unlimited(d.policy[k])&&policy.usageTestingEnabled!==true)fail('Uso sem limite está disponível apenas para empresas habilitadas para testes.',403);
          policy[k]=parseUsageLimit(d.policy[k]);
        }
      }
      if('monthlyAdBudget' in (d.policy||{}))policy.monthlyAdBudget=finite(d.policy.monthlyAdBudget,0,1000000);
      if (d.policy?.operationRules !== undefined) policy.operationRules = await kernel.validateRules(d.policy.operationRules);
      if (d.policy?.publicBaseUrl !== undefined) {
        if (d.policy.publicBaseUrl && !publicUrl(d.policy.publicBaseUrl)) fail('O endereço público precisa usar HTTPS.');
        policy.publicBaseUrl = str(d.policy.publicBaseUrl, 400).replace(/\/$/, '');
      }
      if (d.policy?.timeZone) {
        try {
          new Intl.DateTimeFormat('en', {
            timeZone: d.policy.timeZone
          });
        } catch {
          fail('Fuso horário inválido.');
        }
        policy.timeZone = d.policy.timeZone;
      }
      const name = str(d.name, 120) || c.name;
      let expectedCompanyVersion=c.updatedAt;
      if (d.profile) {
        const updated = await updateProfile(org, d.profile, user.id, {
          source: d.profileSource || 'supplied_by_user',
          reference: str(d.profileReference, 300) || 'Marca e negócio',
          expectedUpdatedAt: d.expectedUpdatedAt??c.updatedAt
        });
        Object.assign(profile, updated.profile, {
          _evidence: updated.profileEvidence
        });
        expectedCompanyVersion=updated.updatedAt;
      }
      const saved=await db.prepare('UPDATE companies SET name=?,profile=?,policy=?,updated_at=? WHERE id=? AND updated_at=?').run(name,JSON.stringify(profile),JSON.stringify(policy),Math.max(Date.now(),expectedCompanyVersion+1),org,expectedCompanyVersion);
      if(saved.changes!==1)fail('A empresa mudou. Atualize antes de salvar.',409);
      await audit(org, user.id, 'Base da empresa atualizada', org);
      if (name !== c.name || Object.keys(d.profile || ({})).length) await kernel.onBrand?.(org);
      json(res, 200, await company(org));
      return true;
    }
    if (section === 'records' && KINDS.includes(kind)) {
      if (req.method === 'GET') {
        json(res, 200, id ? await record(org, kind, id) : await list(org, kind));
        return true;
      }
      if (req.method === 'POST' && !id) {
        json(res, 201, await saveRecord(org, kind, await body(req), user.id));
        return true;
      }
      if (req.method === 'PATCH' && id) {
        const before = await record(org, kind, id);
        if (await db.prepare("SELECT 1 FROM jobs WHERE org_id=? AND state IN ('working','waiting_provider','uncertain') AND (json_extract(payload,'$.contentId')=? OR json_extract(payload,'$.messageId')=?)").get(org, id, id)) fail('Aguarde ou confira a execução vinculada antes de alterar este registro.', 409);
        if (kind === 'messages' && !['draft', 'recorded'].includes(before.status)) fail('Mensagens já enviadas preservam o histórico. Crie uma nova resposta.', 409);
        if (kind === 'metrics' && before.source && before.source !== 'manual') fail('Medições importadas preservam os dados do serviço.', 409);
        if (kind === 'content' && before.status === 'published') fail('Crie uma nova versão do conteúdo já publicado.');
        const change = await body(req);
        if (before.operationId && (kind === 'content' && ['approved', 'scheduled'].includes(change.status) || kind === 'tasks' && change.status !== undefined && (before.kernelStep || ['completed', 'learned', 'cancelled'].includes((await kernel.get(org, before.operationId)).state)) || kind === 'campaigns' && change.status !== undefined)) fail('Este andamento é controlado pela operação. Revise, aprove ou agende a operação pela conversa.', 409);
        json(res, 200, await saveRecord(org, kind, change, user.id, id));
        return true;
      }
      if (req.method === 'DELETE' && id) {
        const target = await record(org, kind, id);
        if (target.operationId) fail('O registro faz parte do histórico da operação e não pode ser excluído.', 409);
        try {
          await kernel.authorize(org, {
            action: kind === 'content' ? 'delete_content' : 'delete_record',
            channel: target.channel || 'other',
            risk: 'high',
            userId: user.id
          });
        } catch (e) {
          e.status = e.status || 409;
          throw e;
        }
        if (await db.prepare("SELECT 1 FROM jobs WHERE org_id=? AND state IN ('queued','working','waiting_provider') AND payload LIKE ?").get(org, '%' + id + '%')) fail('Cancele a execução pendente antes de remover.', 409);
        for (const k of ['campaignId', 'leadId']) if (await db.prepare(`SELECT 1 FROM records WHERE org_id=? AND json_extract(data,'$.${k}')=?`).get(org, id)) fail('Este registro está ligado a outros itens. Atualize esses itens antes de remover.', 409);
        await db.prepare('DELETE FROM records WHERE org_id=? AND id=?').run(org, id);
        await audit(org, user.id, 'Registro removido', id, kind);
        json(res, 200, {
          ok: true
        });
        return true;
      }
    }
    if (section === 'jobs') {
      if (req.method === 'POST' && !kind) {
        const d = await body(req);
        const key = str(d.idempotencyKey, 180) || randomUUID();
        json(res, 201, await queue(org, user.id, d.kind, d.payload || ({}), d.scheduledAt, key, {explicitImage:d.kind==='image'}));
        return true;
      }
      if (req.method === 'POST' && kind) {
        const row = await db.prepare('SELECT * FROM jobs WHERE id=? AND org_id=?').get(kind, org);
        if (!row) fail('Execução não encontrada.', 404);
        const d = await body(req);
        if (d.action === 'cancel') {
          if (!['queued', 'failed', 'blocked'].includes(row.state)) fail('Esta execução já foi concluída ou precisa de conferência.', 409);
          if (row.state === 'working') fail('A execução já começou. Aguarde a confirmação.', 409);
          if (row.state === 'waiting_provider') fail('O pedido já foi enviado ao serviço. Aguarde sua conclusão para evitar perder a confirmação.', 409);
          await setJob(row.id, 'canceled');
        } else if (d.action === 'verify') {
          const ext = parse(row.external);
          if (row.kind !== 'publish' || row.state !== 'uncertain' || !ext.publishedId) fail('Esta execução não possui identificador de publicação para conferir automaticamente.', 409);
          await db.prepare('UPDATE jobs SET payload=?,cancel_requested=0 WHERE id=?').run(JSON.stringify({
            ...parse(row.payload),
            verificationOnly: true
          }), row.id);
          await setJob(row.id, 'queued', {
            scheduledAt: Date.now()
          });
        } else if (d.action === 'retry') {
          if (parse(row.external).publishedId) fail('O pedido já possui identificador externo. Use Conferir para evitar repetir a publicação.', 409);
          if (row.kind === 'conversation' && parse(row.external).conversationEffectsStarted) fail('A conversa já iniciou alterações. Confira o histórico e continue com um novo pedido.', 409);
          if (!['blocked', 'failed'].includes(row.state)) fail('Esta execução precisa de conferência antes de repetir.', 409);
          await setJob(row.id, 'queued', {
            scheduledAt: Date.now()
          });
        } else fail('Ação inválida.');
        json(res, 200, {
          ok: true
        });
        return true;
      }
    }
    if (section === 'integrations') {
      if(kind==='instagram'&&id==='login'&&req.method==='POST'){json(res,200,await instagramLogin.start(req,res,org,user));return true;}
      const def = CONNECTORS.find(c => c.id === kind);
      if (!def) fail('Integração inválida.');
      if (req.method === 'PUT') {
        const d = await body(req), config = await storedIntegration(org, kind);
        if (kind === 'openai') delete config.environmentDisabled;
        const validation = validateConnectionPatch(kind, d);
        if (!validation.ok) fail(validation.errors[0].message, 400);
        for (const [f, , secret] of def.fields) if (d[f] !== undefined && (!secret || d[f] !== '')) config[f] = str(d[f], 10000);
        await db.prepare('INSERT INTO integrations(org_id,provider,sealed,updated_at) VALUES(?,?,?,?) ON CONFLICT(org_id,provider) DO UPDATE SET sealed=excluded.sealed,verified_at=NULL,error=NULL,updated_at=excluded.updated_at').run(org, kind, seal(config), Date.now());
        await saveMetadata(org, 'validation:' + kind, {
          status: 'not_configured'
        });
        await saveMetadata(org, 'api:' + kind, {
          status: 'not_configured'
        });
        await kernel.onBrand(org);
        await audit(org, user.id, 'Integração configurada', kind);
        json(res, 200, {
          ok: true
        });
        return true;
      }
      if (req.method === 'DELETE') {
        if (kind === 'openai') {
          // A disconnected company must not silently resume using the platform key.
          await db.prepare('INSERT INTO integrations(org_id,provider,sealed,updated_at) VALUES(?,?,?,?) ON CONFLICT(org_id,provider) DO UPDATE SET sealed=excluded.sealed,verified_at=NULL,error=NULL,updated_at=excluded.updated_at').run(org, kind, seal({environmentDisabled:true}), Date.now());
        } else await db.prepare('DELETE FROM integrations WHERE org_id=? AND provider=?').run(org, kind);
        await saveMetadata(org, 'validation:' + kind, {
          status: 'not_configured'
        });
        await saveMetadata(org, 'api:' + kind, {
          status: 'not_configured'
        });
        await kernel.onBrand(org);
        await audit(org, user.id, 'Integração desconectada', kind);
        json(res, 200, {
          ok: true
        });
        return true;
      }
      if (req.method === 'POST' && id === 'test') {
        try {
          const result = await providers.test(kind, await integration(org, kind));
          if (result !== null) await db.prepare('UPDATE integrations SET verified_at=?,error=NULL WHERE org_id=? AND provider=?').run(Date.now(), org, kind);
          json(res, 200, {
            verified: result !== null,
            message: result === null ? 'Credenciais salvas. A validação do Higgsfield ocorrerá no primeiro pedido.' : 'Acesso confirmado pelo serviço.',
            profile: kind === 'google' ? result : undefined
          });
        } catch (e) {
          await db.prepare('UPDATE integrations SET error=? WHERE org_id=? AND provider=?').run(str(e.message, 500), org, kind);
          fail(e.message, 422);
        }
        return true;
      }
    }
    if (section === 'bulk' && req.method === 'POST') {
      const d = await body(req);
      if (!Array.isArray(d.leadIds) || !d.leadIds.length || d.leadIds.length > 500 || !str(d.template) || !str(d.text)) fail('Selecione até 500 contatos, um modelo aprovado e o texto da mensagem.');
      const ids = [...new Set(d.leadIds)], batchKey = str(d.idempotencyKey, 100) || randomUUID();
      const leads = await mapAsync(ids, async id => await record(org, 'leads', id));
      if (leads.some(l => !l.consent || l.optOut || !(l.phone || l.whatsappId))) fail('A seleção inclui contatos sem autorização ou sem telefone.', 409);
      let added = 0;
      await db.exec('BEGIN IMMEDIATE');
      try {
        for (const lead of leads) {
          const key = 'bulk:' + batchKey + ':' + lead.id;
          if (await db.prepare('SELECT 1 FROM jobs WHERE org_id=? AND idempotency_key=?').get(org, key)) continue;
          const message = await saveRecord(org, 'messages', {
            leadId: lead.id,
            channel: 'whatsapp',
            direction: 'outgoing',
            status: 'draft',
            text: d.text,
            template: d.template,
            language: d.language || 'pt_BR',
            parameters: d.parameters || []
          }, user.id);
          await queue(org, user.id, 'send', {
            messageId: message.id
          }, null, key);
          added++;
        }
        await db.exec('COMMIT');
      } catch (e) {
        await db.exec('ROLLBACK');
        throw e;
      }
      json(res, 201, {
        queued: added
      });
      return true;
    }
    if (section === 'google' && req.method === 'POST') {
      const d = await body(req);
      if (!['read', 'accounts', 'locations', 'categories', 'status', 'reviews'].includes(d.action)) fail('Consulta inválida.');
      try {
        const result = await providers.googlePresence(await integration(org, 'google'), d.action, d.input || ({}));
        json(res, 200, result);
      } catch (e) {
        fail(e.message, 422);
      }
      return true;
    }
    if (section === 'files' && req.method === 'POST') {
      const buffer = await readRaw(req, 25 * 1024 * 1024);
      const name = decodeURIComponent(String(req.headers['x-file-name'] || 'arquivo'));
      const asset = await storeAsset(org, name, buffer);
      await audit(org, user.id, 'Arquivo armazenado', asset.id, name);
      json(res, 201, asset);
      return true;
    }
    if (section === 'import' && req.method === 'POST') {
      const d = await body(req);
      if (!Array.isArray(d.rows) || d.rows.length > 1000) fail('Importe até 1.000 contatos por vez.');
      const prepared = await mapAsync(d.rows, async r => await clean(org, 'leads', {
        ...r,
        consent: false,
        optOut: false,
        stage: r.stage || 'new',
        source: r.source || 'Importação CSV'
      }));
      await db.exec('BEGIN IMMEDIATE');
      try {
        for (const row of prepared) await saveRecord(org, 'leads', row, user.id);
        await db.exec('COMMIT');
      } catch (e) {
        await db.exec('ROLLBACK');
        throw e;
      }
      json(res, 201, {
        imported: prepared.length
      });
      return true;
    }
    if (section === 'export' && req.method === 'GET') {
      const k = url.searchParams.get('kind') || 'leads';
      if (!KINDS.includes(k)) fail('Tipo inválido.');
      const rows = await list(org, k, 10000), columns = fields[k], csvcell = v => '"' + String(Array.isArray(v) ? v.join(' | ') : v ?? '').replace(/^[=+@\-]/, "'$&").replace(/"/g, '""') + '"';
      const csv = '\uFEFF' + [columns.join(','), ...rows.map(row => columns.map(key => csvcell(row[key])).join(','))].join('\r\n');
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="helpu-${k}.csv"`,
        'Cache-Control': 'no-store'
      }).end(csv);
      return true;
    }
    json(res, 404, {
      error: 'Recurso não encontrado.'
    });
    return true;
  }
  return {
    handle,
    registerSignup,
    validateSignup:input=>signupWhatsAppInput(input,whatsappChatEnv),
    dispatchSignupWelcome:()=>whatsappWelcome.tick(),
    tick,
    queue,
    state,
    company,
    companies,
    record,
    list,
    conversation,
    kernel,
    studio,
    updateProfile,
    shutdown() {
      stopped = true;
      if (timer) clearInterval(timer);
      return conversation.close();
    },
    close() {
      stopped = true;
      if (timer) clearInterval(timer);
    },
    get busy() {
      return busy;
    }
  };
}
