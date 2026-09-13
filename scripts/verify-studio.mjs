import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {loadConfiguration} from './runtime.mjs';
import {createPortal} from '../portal/core.mjs';
const contentId = process.argv.find(value => value.startsWith('--content='))?.slice(10);
if (!contentId || !(/^[a-f\d-]{36}$/i).test(contentId)) throw new Error('Informe --content=ID da entrega existente.');
const save = process.argv.includes('--record'), {dataDir} = loadConfiguration();
const db = new DatabaseSync(path.join(dataDir, 'helpu.sqlite'), {
  readOnly: !save
});
let portal;
try {
  const row = db.prepare("SELECT * FROM records WHERE id=? AND kind='content'").get(contentId);
  if (!row) throw new Error('Entrega existente não encontrada.');
  const org = row.org_id;
  if (save && db.prepare("SELECT 1 FROM jobs WHERE state IN ('queued','working','waiting_provider')").get()) throw new Error('Aguarde as execuções em andamento antes de registrar a revisão técnica.');
  const count = table => db.prepare('SELECT count(*) AS n FROM ' + table).get().n;
  const businessHash = () => createHash('sha256').update(JSON.stringify(db.prepare("SELECT id,data FROM records WHERE org_id=? AND kind='content' ORDER BY id").all(org).map(r => {
    const c = JSON.parse(r.data);
    return {
      id: r.id,
      title: c.title,
      caption: c.caption,
      visualPrompt: c.visualPrompt,
      format: c.format,
      channel: c.channel,
      campaignId: c.campaignId || null
    };
  }))).digest('hex');
  const before = {
    contents: db.prepare("SELECT count(*) AS n FROM records WHERE org_id=? AND kind='content'").get(org).n,
    assets: count('assets'),
    jobs: count('jobs'),
    usage: count('usage_reservations'),
    businessHash: businessHash()
  };
  let result;
  if (save) {
    const forbidden = async () => {
      throw new Error('Este diagnóstico não pode chamar serviços externos.');
    };
    portal = await createPortal({
      db,
      dataDir,
      userFrom: () => undefined,
      json: () => {},
      safeOrigin: () => false,
      startScheduler: false,
      providers: new Proxy({}, {
        get: () => forbidden
      }),
      conversationRespond: forbidden,
      browserLaunch: forbidden
    });
    result = await portal.studio.preflight(org, contentId, 'revisao_tecnica');
  } else result = JSON.parse(db.prepare("SELECT data FROM records WHERE org_id=? AND external_id=? AND kind='connection_validation'").get(org, 'studio:' + contentId)?.data || '{}');
  const after = {
    contents: db.prepare("SELECT count(*) AS n FROM records WHERE org_id=? AND kind='content'").get(org).n,
    assets: count('assets'),
    jobs: count('jobs'),
    usage: count('usage_reservations'),
    businessHash: businessHash()
  };
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('A verificação alterou conteúdo comercial, arquivos, chamadas ou execuções inesperadamente.');
  console.log(JSON.stringify({
    recorded: save,
    checkedAt: new Date().toISOString(),
    contentId,
    companyId: org,
    before,
    after,
    database: db.prepare('PRAGMA quick_check').get(),
    result
  }, null, 2));
} finally {
  await portal?.shutdown();
  db.close();
}
