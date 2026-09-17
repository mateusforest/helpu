import {everyAsync, mapAsync} from "./async-collections.mjs";
import {randomUUID, createHash} from 'node:crypto';
import {ProviderError} from './providers.mjs';
import {suppliedAssetApproved} from './publication.mjs';
export const OPERATION_STATES = ['requested', 'understanding', 'planning', 'producing', 'reviewing', 'awaiting_approval', 'ready', 'scheduled', 'executing', 'verifying', 'completed', 'measuring', 'learned', 'blocked', 'uncertain', 'failed', 'cancelled'];
const operationLabels = {requested:'Pedido recebido',understanding:'Entendendo seu pedido',planning:'Organizando os próximos passos',producing:'Preparando sua criação',reviewing:'Conferindo os detalhes',awaiting_approval:'Aguardando sua aprovação',ready:'Pronto para o próximo passo',scheduled:'Agendado',executing:'Executando seu pedido',verifying:'Conferindo o resultado',completed:'Concluído',measuring:'Acompanhando os resultados',learned:'Aprendizado registrado',blocked:'Preciso de um ajuste para continuar',uncertain:'O resultado precisa de conferência',failed:'Não foi possível concluir',cancelled:'Pedido cancelado'};
export const COMPETENCIES = [{
  id: 'strategy',
  name: 'Estratégia',
  responsibility: 'Relacionar o objetivo aos fatos da marca',
  input: 'Objetivo e Marca e negócio',
  expected: 'Direção de conteúdo',
  criteria: 'Público e contexto informados'
}, {
  id: 'director',
  name: 'Direção de marketing',
  responsibility: 'Coordenar etapas e dependências',
  input: 'Objetivo, recursos e permissões',
  expected: 'Plano executável',
  criteria: 'Etapas vinculadas a tarefas'
}, {
  id: 'creative',
  name: 'Direção criativa',
  responsibility: 'Aplicar a identidade visual',
  input: 'Identidade e conceito',
  expected: 'Briefing criativo',
  criteria: 'Briefing com identidade e restrições'
}, {
  id: 'copy',
  name: 'Conteúdo e copy',
  responsibility: 'Produzir texto fundamentado',
  input: 'Fatos da empresa e público',
  expected: 'Conceito e legenda',
  criteria: 'Texto completo para revisão humana'
}, {
  id: 'distribution',
  name: 'Distribuição',
  responsibility: 'Programar e executar ações autorizadas',
  input: 'Entrega aprovada e conta disponível',
  expected: 'Publicação verificável',
  criteria: 'Confirmação específica do canal'
}, {
  id: 'relationship',
  name: 'Relacionamento',
  responsibility: 'Preparar mensagens com contexto',
  input: 'Contato e conversa existente',
  expected: 'Resposta adequada',
  criteria: 'Consentimento e janela do canal respeitados'
}, {
  id: 'analyst',
  name: 'Performance',
  responsibility: 'Interpretar medições reais',
  input: 'Métricas com fonte',
  expected: 'Aprendizado fundamentado',
  criteria: 'Referências às medições analisadas'
}, {
  id: 'quality',
  name: 'Controle de qualidade',
  responsibility: 'Conferir completude e encaminhar revisão',
  input: 'Entregas e contexto usado',
  expected: 'Checklist e aprovação pendente',
  criteria: 'Revisão humana dos fatos antes de publicar'
}];
const parse = value => value ? JSON.parse(value) : {};
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const error = (message, status = 409) => {
  const e = new Error(message);
  e.status = status;
  throw e;
};
const text = (value, max = 20000) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const policies = ['automatic', 'preauthorized', 'approval_required', 'forbidden'];
const actions = ['*', 'publish', 'send', 'image', 'video', 'alter_campaign', 'delete_content', 'delete_record', 'change_profile', 'browser_action'];
const channels = ['*', 'openai', 'instagram', 'whatsapp', 'google', 'higgsfield', 'metaAds', 'website', 'other'];
const risks = ['*', 'low', 'medium', 'high'];
const terminal = ['cancelled', 'learned'];
const edges = {
  requested: ['understanding'],
  understanding: ['planning'],
  planning: ['producing', 'ready'],
  producing: ['reviewing'],
  reviewing: ['awaiting_approval', 'ready', 'producing'],
  awaiting_approval: ['ready', 'producing', 'reviewing'],
  ready: ['scheduled', 'executing', 'reviewing', 'completed'],
  scheduled: ['executing', 'ready', 'reviewing'],
  executing: ['verifying', 'producing'],
  verifying: ['completed', 'executing', 'ready'],
  completed: ['measuring'],
  measuring: ['learned'],
  blocked: ['understanding', 'planning', 'producing', 'reviewing', 'awaiting_approval', 'ready', 'scheduled', 'executing', 'verifying'],
  failed: ['understanding', 'planning', 'producing', 'reviewing', 'awaiting_approval', 'ready', 'executing', 'verifying'],
  uncertain: ['verifying'],
  cancelled: [],
  learned: []
};
export function createKernel({db, company, record, list: records, saveRecord, systemUpdate, queue, audit, integration, integrationState, inspectAsset}) {
  let syncing = false;
  let transactionId = 0;
  async function atomic(fn) {
    const name = 'kernel_' + ++transactionId;
    await db.exec('SAVEPOINT ' + name);
    try {
      const result = await fn();
      await db.exec('RELEASE ' + name);
      return result;
    } catch (e) {
      await db.exec('ROLLBACK TO ' + name);
      await db.exec('RELEASE ' + name);
      throw e;
    }
  }
  const decode = row => row ? {
    ...parse(row.data),
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    version: row.version
  } : null;
  const get = async (org, id) => {
    const op = decode(await db.prepare("SELECT * FROM records WHERE id=? AND org_id=? AND kind='operations'").get(id, org));
    if (!op) error('Operação não encontrada.', 404);
    return op;
  };
  const list = async (org, threadId) => (await db.prepare("SELECT * FROM records WHERE org_id=? AND kind='operations' ORDER BY created_at DESC LIMIT 200").all(org)).map(decode).filter(op => !threadId || op.threadId === threadId);
  async function persist(org, id, patch) {
    const previous=await get(org,id);
    const op = {
      ...previous,
      ...patch
    };
    for (const key of ['id', 'createdAt', 'updatedAt', 'version']) delete op[key];
    const saved=await db.prepare('UPDATE records SET data=?,version=version+1,updated_at=? WHERE org_id=? AND id=? AND version=?').run(JSON.stringify(op),Date.now(),org,id,previous.version);
    if(saved.changes!==1)error('A operação mudou. Confira a versão atual antes de continuar.',409);
    return await get(org, id);
  }
  async function event(op, kind, label, detail = {}, jobId = op.currentJobId) {
    await db.prepare('INSERT INTO conversation_events VALUES(?,?,?,?,?,?,?,?)').run(randomUUID(), op.companyId, op.threadId, jobId || op.rootJobId, kind, label, JSON.stringify({
      ...detail,
      operationId: op.id
    }), Date.now());
    await audit(op.companyId, 'kernel', label, op.id, kind);
  }
  async function sync(op) {
    if (syncing) return;
    syncing = true;
    try {
      if (op.campaignId) await systemUpdate(op.companyId, 'campaigns', op.campaignId, {
        operationId: op.id,
        status: op.paused || ['blocked', 'uncertain', 'failed', 'cancelled'].includes(op.state) ? 'paused' : ['completed', 'measuring', 'learned'].includes(op.state) ? 'complete' : ['scheduled', 'executing', 'verifying'].includes(op.state) ? 'running' : 'planning'
      });
      for (const step of op.plan || []) if (step.taskId) await systemUpdate(op.companyId, 'tasks', step.taskId, {
        operationId: op.id,
        ...op.type === 'post' ? {
          kernelStep: step.id
        } : {},
        status: step.status === 'completed' ? 'done' : step.status === 'working' ? 'doing' : 'todo'
      });
    } finally {
      syncing = false;
    }
  }
  async function transition(org, id, next, note = '', patch = {}) {
    const before = await get(org, id);
    if (!OPERATION_STATES.includes(next)) error('Estado operacional inválido.');
    if (before.state !== next && !(edges[before.state] || []).includes(next) && !(!terminal.includes(before.state) && ['blocked', 'uncertain', 'failed', 'cancelled'].includes(next))) error(`Transição operacional inválida: ${before.state} → ${next}.`);
    const op = await persist(org, id, {
      ...patch,
      state: next
    });
    if (before.state !== next) await event(op, 'operation_transition', operationLabels[next], {
      from: before.state,
      to: next,
      note
    });
    await sync(op);
    return op;
  }
  async function register(org, userId, threadId, jobId, objective, {force = false, manualPublication = false} = {}) {
    if (!force && !(/\b(prepare|preparar|crie|criar|produza|produzir|planeje|planejar|publique|publicar|agende|agendar|envie|enviar|execute|organize|faça|fazer|monte|preciso|quero|gostaria|vamos)\b/i).test(objective)) return null;
    const existing = await db.prepare("SELECT * FROM records WHERE org_id=? AND kind='operations' AND external_id=?").get(org, jobId);
    if (existing) return decode(existing);
    const firstInstagram = !manualPublication && (/\binstagram\b/i).test(objective) && (/\b(publique|publicar|publique|publica[çc][aã]o)\b/i).test(objective);
    const id = randomUUID(), now = Date.now(), type = !manualPublication && !force && ((/\b(publica[çc][aã]o|postagem|post)\b/i).test(objective) || firstInstagram) ? 'post' : 'general';
    const data = {
      companyId: org,
      threadId,
      rootJobId: jobId,
      currentJobId: jobId,
      objective,
      type,
      state: 'requested',
      paused: false,
      plan: [],
      competencies: COMPETENCIES.filter(c => c.id === 'director'),
      artifactIds: [],
      approval: {
        status: 'pending'
      },
      blockers: [],
      evidence: [],
      result: {},
      createdBy: userId
    };
    if (firstInstagram) data.firstInstagram = true;
    await db.prepare('INSERT INTO records(id,org_id,kind,data,external_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(id, org, 'operations', JSON.stringify(data), jobId, now, now);
    await db.prepare("UPDATE jobs SET payload=json_set(payload,'$.operationId',?) WHERE id=? AND org_id=?").run(id, jobId, org);
    const op = await get(org, id);
    await event(op, 'operation_created', 'Ordem de trabalho criada', {
      objective
    });
    return op;
  }
  async function jobOperation(job) {
    const payload = typeof job.payload === 'string' ? parse(job.payload) : job.payload || ({});
    if (!payload.operationId) return null;
    return await get(job.org_id || job.companyId, payload.operationId);
  }
  async function block(org, id, message, state = 'blocked', code = null) {
    const op = await get(org, id);
    if (op.state === 'uncertain' && state !== 'uncertain') return op;
    return await transition(org, id, state, message, {
      blockers: [{
        message,
        ...code ? {
          code
        } : {}
      }],
      result: {
        ...op.result,
        summary: message
      }
    });
  }
  async function begin(job) {
    let op = await jobOperation(job);
    if (!op) return null;
    if (op.paused || terminal.includes(op.state)) throw new ProviderError('A operação está pausada ou cancelada.', 'canceled');
    if (op.state === 'uncertain') throw new ProviderError('Confira a execução incerta antes de continuar.', 'uncertain');
    if (['requested', 'blocked', 'failed'].includes(op.state)) op = await transition(op.companyId, op.id, 'understanding', 'Consultando o contexto da empresa', {
      blockers: [],
      currentJobId: job.id
    });
    return op;
  }
  async function linkRecord(org, operationId, kind, id) {
    const op = await get(org, operationId), r = await record(org, kind, id);
    if (r.operationId && r.operationId !== op.id) error('Este registro pertence a outra operação.');
    syncing = true;
    try {
      await systemUpdate(org, kind, id, {
        operationId
      });
    } finally {
      syncing = false;
    }
    const patch = {};
    if (kind === 'campaigns' && !op.campaignId) patch.campaignId = id;
    if (['content', 'messages', 'knowledge', 'pages'].includes(kind)) patch.artifactIds = [...new Set([...op.artifactIds, id])];
    if (kind === 'tasks' && !op.plan.some(s => s.taskId === id)) patch.plan = [...op.plan, {
      id: randomUUID(),
      title: r.title,
      status: r.status === 'done' ? 'completed' : 'pending',
      competency: 'director',
      taskId: id
    }];
    const updated = await persist(org, operationId, patch);
    await event(updated, 'operation_artifact', 'Registro vinculado à operação', {
      recordId: id,
      kind
    });
    return await record(org, kind, id);
  }
  async function preparePost(job) {
    let op = await begin(job);
    if (!op) return null;
    const org = op.companyId, c = await company(org);
    if (op.firstInstagram && (/\bEME\b/i).test(op.objective) && c.name.trim().toLowerCase() !== 'eme') return {
      blocked: await block(org, op.id, 'O pedido menciona a EME, mas outra empresa está ativa. Selecione a EME antes de preparar a publicação.', 'blocked', 'blocked_company_mismatch')
    };
    const missing = [['description', 'o que a empresa oferece'], ['audience', 'o público'], ['visualIdentity', 'a identidade visual']].filter(([key]) => !text(c.profile[key])).map(([, label]) => label);
    if (missing.length) return {
      blocked: await block(org, op.id, 'Complete em Marca e negócio: ' + missing.join(', ') + '.')
    };
    if (op.artifactIds.length) {
      await review(org, op.id);
      return {
        existing: true,
        operation: await get(org, op.id)
      };
    }
    if (op.state === 'understanding') op = await transition(org, op.id, 'planning');
    if (!op.campaignId) {
      const campaign = await saveRecord(org, 'campaigns', {
        name: 'Publicação — ' + c.name,
        objective: op.objective,
        audience: c.profile.audience,
        channels: [(/\bgoogle\b/i).test(op.objective) ? 'google' : 'instagram'],
        status: 'planning'
      }, job.user_id);
      await linkRecord(org, op.id, 'campaigns', campaign.id);
    }
    op = await get(org, op.id);
    if (!op.plan.length) {
      const steps = [['direction', 'Definir conceito', 'strategy'], ['copy', 'Produzir legenda e briefing', 'copy'], ['review', 'Revisar e aprovar conteúdo', 'quality'], ['distribution', 'Executar publicação autorizada', 'distribution']];
      const plan = await mapAsync(steps, async ([id, title, competency], index) => {
        const task = await saveRecord(org, 'tasks', {
          title,
          campaignId: op.campaignId,
          description: op.objective,
          status: 'todo'
        }, job.user_id);
        syncing = true;
        try {
          await systemUpdate(org, 'tasks', task.id, {
            operationId: op.id,
            kernelStep: id
          });
        } finally {
          syncing = false;
        }
        return {
          id,
          title,
          competency,
          taskId: task.id,
          status: index === 0 ? 'working' : 'pending'
        };
      });
      op = await persist(org, op.id, {
        plan,
        competencies: COMPETENCIES.filter(c => ['strategy', 'director', 'creative', 'copy', 'quality', 'distribution'].includes(c.id)),
        contextHash: hash({
          name: c.name,
          profile: c.profile
        })
      });
      await event(op, 'operation_plan', 'Plano e competências registrados', {
        taskIds: plan.map(s => s.taskId)
      });
    }
    if (op.firstInstagram && !op.approvedAsset) {
      const request = await db.prepare("SELECT text,attachments FROM conversation_messages WHERE org_id=? AND job_id=? AND role='user'").get(org, op.rootJobId);
      const assets = JSON.parse(request?.attachments || '[]');
      if (assets.length !== 1 || !suppliedAssetApproved(request?.text || '')) return {
        blocked: await block(org, op.id, 'Selecione uma única mídia real da EME na conversa e confirme que ela está aprovada. Um briefing não é mídia pronta.', 'blocked', 'blocked_missing_approved_asset')
      };
      const asset = await inspectAsset(org, assets[0]);
      if (!asset.passed) return {
        blocked: await block(org, op.id, 'A mídia selecionada não é compatível com esta primeira publicação: ' + asset.checks.filter(c => !c.passed).map(c => c.label).join('; ') + '.', 'blocked', asset.code)
      };
      op = await persist(org, op.id, {
        approvedAsset: {
          ...asset,
          source: 'supplied_by_user',
          actor: job.user_id,
          at: Date.now(),
          messageJobId: op.rootJobId
        }
      });
    }
    op = await transition(org, op.id, 'producing', 'Produzindo com o contexto atual.', {
      contextHash: hash({
        name: c.name,
        profile: c.profile
      })
    });
    return {
      operation: op,
      company: c,
      knowledge: await records(org, 'knowledge', 30),
      channel: (/\bgoogle\b/i).test(op.objective) ? 'google' : 'instagram'
    };
  }
  async function deliverPost(job, draft) {
    const op = await jobOperation(job), org = op.companyId;
    if (op.paused || op.state === 'cancelled') throw new ProviderError('A operação foi pausada antes de salvar a entrega.', 'canceled');
    if (op.artifactIds.length) return await get(org, op.id);
    for (const key of ['title', 'concept', 'caption', 'visualBrief']) if (!text(draft[key])) throw new ProviderError('A produção retornou uma entrega incompleta: ' + key + '.', 'failed');
    const c = await company(org);
    if (op.contextHash !== hash({
      name: c.name,
      profile: c.profile
    })) throw new ProviderError('O contexto da marca mudou durante a produção. Retome para produzir com as informações atuais.', 'blocked');
    const channel = (/\bgoogle\b/i).test(op.objective) ? 'google' : 'instagram';
    const content = await saveRecord(org, 'content', {
      title: text(draft.title, 500),
      caption: text(draft.caption),
      visualPrompt: text(draft.visualBrief),
      notes: 'Conceito: ' + text(draft.concept) + '\nRevisar fatos e adequação da identidade antes de aprovar.',
      channel,
      format: 'image',
      campaignId: op.campaignId,
      status: 'review'
    }, job.user_id);
    await linkRecord(org, op.id, 'content', content.id);
    syncing = true;
    try {
      await systemUpdate(org, 'content', content.id, {
        concept: text(draft.concept),
        briefOnly: !op.approvedAsset,
        ...op.approvedAsset ? {
          assetId: op.approvedAsset.assetId,
          mediaUrl: op.approvedAsset.sourceUrl || '',
          approvedAssetHash: op.approvedAsset.assetHash
        } : {}
      });
    } finally {
      syncing = false;
    }
    await persist(org, op.id, {
      plan: op.plan.map(s => ({
        ...s,
        status: ['direction', 'copy'].includes(s.id) ? 'completed' : s.id === 'review' ? 'working' : 'pending'
      })),
      contextHash: hash({
        name: c.name,
        profile: c.profile
      })
    });
    await transition(org, op.id, 'reviewing');
    return await review(org, op.id);
  }
  const fingerprint = async (org, op) => hash({
    context: {
      name: (await company(org)).name,
      profile: (await company(org)).profile
    },
    publication: op.firstInstagram ? {
      snapshotId: op.publication?.snapshotId,
      account: (await integration(org, 'instagram')).accountId,
      identity: (await integrationState(org)).find(x => x.id === 'instagram')?.identity,
      asset: op.approvedAsset && (await inspectAsset(org, op.approvedAsset.assetId)).assetHash
    } : null,
    artifacts: await mapAsync(op.artifactIds, async id => {
      const row = await db.prepare('SELECT data,kind FROM records WHERE org_id=? AND id=?').get(org, id);
      if (!row) error('Entrega da operação não encontrada.', 404);
      const d = parse(row.data);
      return {
        id,
        kind: row.kind,
        title: d.title,
        caption: d.caption,
        visualPrompt: d.visualPrompt,
        concept: d.concept,
        assetId: d.assetId,
        mediaUrl: d.mediaUrl,
        channel: d.channel,
        format: d.format,
        mediaType: d.mediaType,
        carouselUrls: d.carouselUrls,
        text: d.text,
        description: d.description,
        buttonLabel: d.buttonLabel,
        active: d.active,
        campaignId: d.campaignId,
        leadId: d.leadId,
        template: d.template,
        language: d.language,
        parameters: d.parameters,
        direction: d.direction,
        source: d.source
      };
    })
  });
  async function review(org, id) {
    if ((await get(org, id)).production) error('Esta entrega visual exige concluir as dependências no Estúdio antes de revisar ou aprovar a peça final.');
    let op = await get(org, id);
    if (op.paused || ['cancelled', 'uncertain'].includes(op.state)) return op;
    const artifacts = await mapAsync(op.artifactIds, async a => await db.prepare('SELECT * FROM records WHERE org_id=? AND id=?').get(org, a));
    const complete = row => {
      if (!row) return false;
      const c = decode(row);
      if (row.kind === 'content') return c.title && c.caption && (c.format === 'text' || c.visualPrompt) && (op.type !== 'post' || c.concept);
      if (row.kind === 'pages') return c.title && c.description;
      if (row.kind === 'knowledge') return c.title && c.text;
      if (row.kind === 'messages') return c.text && c.leadId && ['instagram', 'whatsapp'].includes(c.channel) && c.direction === 'outgoing';
      return false;
    };
    const needsBrand = op.type === 'post' || artifacts.some(row => row?.kind === 'content');
    const checks = [{
      label: 'Entregas completas nos registros da operação',
      passed: artifacts.length > 0 && artifacts.every(complete)
    }, {
      label: 'Contexto da marca disponível quando necessário',
      passed: !needsBrand || await everyAsync(['description', 'audience', 'visualIdentity'], async k => !!text((await company(org)).profile[k]))
    }, {
      label: 'Revisão humana dos fatos e da identidade',
      passed: false,
      requiresHuman: true
    }];
    if (checks.some(c => !c.requiresHuman && !c.passed)) return await block(org, id, 'Complete as entregas e o contexto necessário antes da aprovação. Conteúdos precisam de legenda e briefing; páginas e documentos precisam de título e texto.');
    if (op.state !== 'reviewing') op = await transition(org, id, 'reviewing');
    op = await persist(org, id, {
      quality: {
        checks,
        checkedAt: Date.now(),
        scope: 'completude; revisão semântica e visual exige aprovação humana'
      },
      reviewHash: await fingerprint(org, op),
      approval: {
        status: 'pending'
      },
      blockers: []
    });
    await event(op, 'operation_quality', 'Controle de qualidade registrado', {
      checks
    });
    return await transition(org, id, 'awaiting_approval', 'Revise as entregas vinculadas antes de aprovar.');
  }
  function validateRules(rules) {
    if (!Array.isArray(rules) || rules.length > 60) error('Informe até 60 regras de autonomia.', 400);
    return rules.map(r => {
      if (!r || !channels.includes(r.channel) || !actions.includes(r.action) || !risks.includes(r.risk) || !policies.includes(r.policy)) error('Regra de autonomia inválida.', 400);
      return {
        channel: r.channel,
        action: r.action,
        risk: r.risk,
        policy: r.policy
      };
    });
  }
  async function authorize(org, {action, channel = 'other', risk = 'high', operationId, approval = false} = {}) {
    const c = await company(org), op = operationId ? await get(org, operationId) : null;
    if (op && (op.paused || ['cancelled', 'uncertain'].includes(op.state))) throw new ProviderError('A operação está pausada, cancelada ou incerta.', 'blocked');
    const rules = validateRules(c.policy.operationRules || []).filter(r => (r.action === '*' || r.action === action) && (r.channel === '*' || r.channel === channel) && (r.risk === '*' || r.risk === risk));
    rules.sort((a, b) => ['channel', 'action', 'risk'].filter(k => b[k] !== '*').length - ['channel', 'action', 'risk'].filter(k => a[k] !== '*').length || policies.indexOf(b.policy) - policies.indexOf(a.policy));
    const policy = rules[0]?.policy || (op ? risk === 'low' ? 'automatic' : ['image', 'video'].includes(action) && c.policy.autoMedia ? 'automatic' : 'approval_required' : 'preauthorized');
    if (policy === 'forbidden') throw new ProviderError('Ação proibida pela política de Autonomia.', 'blocked');
    if (op && ['publish', 'send'].includes(action) && (!op.executionAuthorization || op.executionAuthorization.action !== action)) throw new ProviderError('Preparar uma entrega não autoriza publicar ou enviar. Use Executar ou Agendar na operação.', 'blocked');
    if (op && ['publish', 'send'].includes(action) && (op.approval.status !== 'approved' || op.approval.fingerprint !== await fingerprint(org, op) || op.executionAuthorization.fingerprint !== op.approval.fingerprint)) throw new ProviderError('A entrega ou o contexto mudou. Revise e autorize a versão atual antes de executar.', 'blocked');
    if (policy === 'approval_required' && !approval && !(op?.approval.status === 'approved' && op.approval.fingerprint === await fingerprint(org, op))) throw new ProviderError('Esta ação exige aprovação na operação.', 'blocked');
    if (policy === 'preauthorized' && op && !op.executionAuthorization && risk !== 'low' && !approval) throw new ProviderError('A ação precisa de autorização prévia registrada nesta operação.', 'blocked');
    return {
      policy,
      action,
      channel,
      risk
    };
  }
  async function attachJob(org, job) {
    const payload = job.payload || ({});
    const ids = [payload.operationId];
    for (const [key, kind] of [['contentId', 'content'], ['messageId', 'messages'], ['campaignId', 'campaigns']]) if (payload[key]) ids.push((await record(org, kind, payload[key])).operationId);
    if (payload.parentJobId && !(job.kind==='image'&&ids.some(Boolean))) ids.push(parse((await db.prepare('SELECT payload FROM jobs WHERE id=? AND org_id=?').get(payload.parentJobId, org))?.payload).operationId);
    const found = [...new Set(ids.filter(Boolean))];
    if (found.length > 1) error('O alvo e a execução de origem pertencem a operações diferentes.');
    const id = found[0];
    if (!id) return;
    const op = await get(org, id);
    if (['completed', 'learned', 'cancelled', 'uncertain'].includes(op.state) && ['publish', 'send', 'image', 'video', 'metaCampaign', 'googlePresence', 'agent'].includes(job.kind) && !payload.verificationOnly) error('Esta operação já foi encerrada ou precisa de verificação. Não crie uma nova execução.');
    await db.prepare("UPDATE jobs SET payload=json_set(payload,'$.operationId',?) WHERE id=? AND org_id=?").run(id, job.id, org);
    job.payload.operationId = id;
  }
  async function beforeJob(job) {
    const op = await jobOperation(job);
    if (!op) return;
    const payload = parse(job.payload), external = parse(job.external);
    if (op.paused || op.state === 'cancelled') throw new ProviderError('Operação pausada; nenhuma ação derivada será iniciada.', external.request_id || external.containerId || external.publishedId ? 'uncertain' : 'canceled');
    if (op.state === 'uncertain' && !(payload.verificationOnly && external.publishedId)) throw new ProviderError('Execução incerta exige verificação; não será repetida.', 'uncertain');
    if (['publish', 'send', 'metaCampaign', 'googlePresence'].includes(job.kind)) {
      const next = payload.verificationOnly ? 'verifying' : 'executing';
      await transition(op.companyId, op.id, next, 'Iniciando tentativa ' + job.attempts, {
        blockers: []
      });
    }
    if (op.firstInstagram && job.kind === 'publish') await persist(op.companyId, op.id, {
      publication: {
        ...op.publication,
        attempts: [...op.publication?.attempts || [], {
          attempt: job.attempts,
          jobId: job.id,
          startedAt: Date.now(),
          executor: 'api',
          account: op.publication?.account,
          snapshotId: op.publication?.snapshotId,
          verificationOnly: !!payload.verificationOnly,
          idempotencyKey: job.idempotency_key
        }]
      }
    });
    await event(await get(op.companyId, op.id), 'operation_attempt', 'Tentativa de execução registrada', {
      jobId: job.id,
      kind: job.kind,
      attempt: job.attempts
    }, job.id);
  }
  async function evidence(org, id, result, jobId) {
    const op = await get(org, id);
    const entry = {
      id: randomUUID(),
      status: result.status || 'failed',
      executor: result.executor || 'local',
      companyId: org,
      channel: result.channel || null,
      account: result.account || null,
      occurredAt: result.occurredAt || Date.now(),
      externalId: result.externalId || null,
      url: result.url || null,
      message: text(result.message, 2000),
      evidence: result.evidence || null,
      error: text(result.error, 1000) || null,
      uncertain: result.uncertain === true,
      retryable: result.retryable === true,
      jobId
    };
    await persist(org, id, {
      evidence: [...op.evidence, entry].slice(-100)
    });
    await event(op, 'operation_evidence', 'Resultado de ferramenta registrado', {
      result: entry
    }, jobId);
    return entry;
  }
  async function afterJob(job, state, {output, error: note, external} = {}) {
    const op = await jobOperation(job);
    if (!op) return;
    const org = op.companyId;
    if (op.firstInstagram && job.kind === 'publish') {
      const publicationState = state === 'succeeded' && output?.result?.status === 'verified' ? 'published_verified' : state === 'uncertain' ? 'publication_uncertain' : state === 'failed' ? 'publication_failed' : state === 'blocked' ? 'blocked' : state === 'waiting_provider' ? 'verifying' : op.publication?.status;
      await persist(org, op.id, {
        publication: {
          ...op.publication,
          status: publicationState,
          externalId: output?.result?.externalId || external?.publishedId || op.publication?.externalId,
          url: output?.result?.url || op.publication?.url
        }
      });
    }
    if (output?.result) await evidence(org, op.id, output.result, job.id);
    if (job.kind === 'publish' && state === 'succeeded' && output?.result?.status === 'verified') {
      const items = await publicationContents(org, op), pending = items.filter(c => c.status !== 'published');
      if (pending.length) {
        const live = await get(org, op.id), published = items.filter(c => c.status === 'published');
        const result = {
          ...live.result,
          summary: published.length + ' de ' + items.length + ' publicações confirmadas. Execute ou agende a próxima entrega.',
          publishedContentIds: published.map(c => c.id),
          pendingContentIds: pending.map(c => c.id)
        };
        await persist(org, op.id, {
          result
        });
        await event(await get(org, op.id), 'operation_progress', 'Publicação confirmada; existem entregas pendentes', {
          publishedContentIds: result.publishedContentIds,
          pendingContentIds: result.pendingContentIds
        }, job.id);
        if (!live.paused && ['executing', 'verifying'].includes(live.state)) {
          if (live.state === 'executing') await transition(org, op.id, 'verifying');
          await transition(org, op.id, 'ready', 'A próxima entrega aguarda execução autorizada.', {
            result,
            blockers: []
          });
        }
        return;
      }
    }
    if (['completed', 'measuring', 'learned'].includes(op.state) && ['blocked', 'failed', 'canceled'].includes(state)) return;
    if (['publish', 'send', 'metaCampaign', 'googlePresence'].includes(job.kind) && output?.result?.status === 'verified' && state === 'succeeded' && !['executing', 'verifying'].includes(op.state)) {
      const updated = await persist(org, op.id, {
        state: 'completed',
        paused: false,
        blockers: [],
        result: {
          summary: output.result.message || 'Execução já solicitada confirmada pelo canal.',
          externalId: output.result.externalId
        },
        plan: op.plan.map(s => ({
          ...s,
          status: 'completed'
        }))
      });
      await event(updated, 'operation_transition', 'Execução já solicitada confirmada', {
        from: op.state,
        to: 'completed',
        jobId: job.id
      });
      await sync(updated);
      return;
    }
    if (op.paused || op.state === 'cancelled') {
      if (state === 'uncertain') await block(org, op.id, note || 'Confira a execução interrompida.', 'uncertain');
      return;
    }
    if (['blocked', 'failed', 'uncertain'].includes(state)) {
      await block(org, op.id, note || 'A ferramenta não concluiu a execução.', state);
      return;
    }
    if (state === 'canceled') {
      await block(org, op.id, 'A tentativa foi cancelada. Retome pela operação.');
      return;
    }
    if (job.kind === 'conversation') return;
    if (state === 'waiting_provider') {
      if (['publish', 'send'].includes(job.kind) && (await get(org, op.id)).state === 'executing') await transition(org, op.id, 'verifying', 'Aguardando processamento do canal.');
      return;
    }
    if (state !== 'succeeded') return;
    if (job.kind === 'agent' && (await get(org, op.id)).artifactIds.length && ['producing', 'planning', 'ready', 'blocked'].includes(op.state)) {
      if (op.state === 'planning') await transition(org, op.id, 'producing');
      await transition(org, op.id, 'reviewing');
      await review(org, op.id);
      return;
    }
    if (['image', 'video'].includes(job.kind)) {
      await onRecord(org, 'content', parse(job.payload).contentId);
      if(output?.generation?.purpose==='base'&&!output.generation.stale){
        const message='A imagem-base foi salva. Falta compor texto e logo oficiais e revisar a peça final.';
        await persist(org,op.id,{production:{...op.production,state:'blocked_composition_required'}});
        await block(org,op.id,message,'blocked','blocked_composition_required');
      }
      return;
    }
    if (['publish', 'send', 'metaCampaign', 'googlePresence'].includes(job.kind)) {
      if (output?.result?.status !== 'verified') {
        if (output?.result?.status === 'accepted') {
          if ((await get(org, op.id)).state === 'executing') await transition(org, op.id, 'verifying', 'O canal aceitou o pedido; entrega ainda não confirmada.');
          return;
        }
        await block(org, op.id, 'A ferramenta não retornou evidência suficiente de conclusão.', 'uncertain');
        return;
      }
      if ((await get(org, op.id)).state === 'executing') await transition(org, op.id, 'verifying');
      await transition(org, op.id, 'completed', 'Execução confirmada pelo canal', {
        blockers: [],
        result: {
          summary: output.result.message || 'Execução verificada.',
          externalId: output.result.externalId
        },
        plan: op.plan.map(s => ({
          ...s,
          status: 'completed'
        }))
      });
    }
  }
  async function recover(job) {
    const op = await jobOperation(job);
    if (!op) return;
    const external = parse(job.external);
    if (job.kind === 'conversation' && !external.conversationEffectsStarted) {
      await block(op.companyId, op.id, 'A preparação foi interrompida. Retome a operação a partir dos registros já salvos.', 'blocked');
      return 'blocked';
    }
    await block(op.companyId, op.id, 'A execução foi interrompida. Confira as evidências antes de retomar.', 'uncertain');
    return 'uncertain';
  }
  async function onRecord(org, kind, id) {
    if (syncing) return;
    if (kind === 'tasks') {
      const task = await record(org, kind, id);
      if (!task.operationId || task.kernelStep) return;
      const op = await get(org, task.operationId);
      const plan = op.plan.map(step => step.taskId === id ? {
        ...step,
        status: task.status === 'done' ? 'completed' : task.status === 'doing' ? 'working' : 'pending'
      } : step);
      const updated = await persist(org, op.id, {
        plan
      });
      await event(updated, 'operation_task', 'Etapa atualizada pelo usuário', {
        taskId: id,
        status: task.status
      });
      if (op.type === 'general' && op.state === 'ready' && plan.length && plan.every(step => step.status === 'completed') && !op.artifactIds.length) await transition(org, op.id, 'completed', 'As tarefas locais foram concluídas pelo usuário.'); else await sync(updated);
      return;
    }
    if (kind !== 'content') return;
    const content = await record(org, kind, id);
    if (!content.operationId) return;
    const op = await get(org, content.operationId);
    if (['completed', 'measuring', 'learned', 'cancelled', 'uncertain'].includes(op.state) || op.paused) return;
    if (op.approval.status === 'approved' && op.approval.fingerprint !== await fingerprint(org, op)) {
      syncing = true;
      try {
        if (content.status !== 'published') await systemUpdate(org, 'content', id, {
          status: 'review',
          scheduledAt: ''
        });
      } finally {
        syncing = false;
      }
      await db.prepare("UPDATE jobs SET state='canceled',cancel_requested=1,error='Entrega alterada; aprovação revogada.',updated_at=? WHERE org_id=? AND json_extract(payload,'$.operationId')=? AND state='queued' AND kind='publish'").run(Date.now(), org, op.id);
      await transition(org, op.id, ['executing', 'verifying'].includes(op.state) ? 'blocked' : 'reviewing', 'A entrega ou a marca mudou; aprovação revogada.', {
        approval: {
          status: 'revoked'
        },
        executionAuthorization: null,
        blockers: [],
        plan: op.plan.map(s => s.id === 'review' ? {
          ...s,
          status: 'working'
        } : s)
      });
      await review(org, op.id);
    }
  }
  async function onBrand(org) {
    for (const op of await list(org)) {
      if (op.approval.status === 'approved' && op.artifactIds.length && !['completed', 'measuring', 'learned', 'cancelled', 'uncertain'].includes(op.state)) {
        for (const id of op.artifactIds) if (await db.prepare("SELECT 1 FROM records WHERE org_id=? AND id=? AND kind='content'").get(org, id)) await onRecord(org, 'content', id);
      }
    }
  }
  async function available(org, content) {
    const config = await integration(org, content.channel);
    if (content.channel === 'instagram' && !(config.accessToken && config.accountId)) throw new ProviderError('Configure a API do Instagram em Integrações. Um perfil aberto no navegador não fornece esta execução verificada.', 'blocked');
    if (content.channel === 'google' && !(config.accessToken && config.accountId && config.locationId)) throw new ProviderError('Configure uma conta e um perfil do Google em Integrações.', 'blocked');
    if (!['instagram', 'google'].includes(content.channel)) throw new ProviderError('Esta vertical executa publicação por API no Instagram ou Google.', 'blocked');
    if (content.channel === 'instagram' && content.format !== 'carousel' && !content.mediaUrl) throw new ProviderError('A entrega tem legenda e briefing. Adicione uma mídia HTTPS compatível no Estúdio antes de publicar no Instagram.', 'blocked');
  }
  async function action(org, id, userId, d) {
    let op = await get(org, id);
    if (d.action === 'select_asset') {
      if (!op.firstInstagram || !['blocked', 'failed', 'awaiting_approval', 'reviewing', 'ready'].includes(op.state) || d.approved !== true) error('Selecione e confirme uma mídia aprovada antes de vinculá-la.');
      if (d.expectedVersion !== op.version) error('A operação mudou. Atualize antes de selecionar a mídia.');
      if (await db.prepare("SELECT 1 FROM jobs WHERE org_id=? AND json_extract(payload,'$.operationId')=? AND state IN ('queued','working','waiting_provider','uncertain')").get(org, id)) error('Pause e aguarde a execução atual antes de substituir a mídia.');
      const asset = await inspectAsset(org, d.assetId);
      if (!asset.passed) return await block(org, id, 'A mídia não passou pela verificação técnica.', 'blocked', asset.code);
      op = await persist(org, id, {
        approvedAsset: {
          ...asset,
          source: 'supplied_by_user',
          actor: userId,
          at: Date.now()
        },
        approval: {
          status: 'revoked'
        },
        executionAuthorization: null,
        publication: null
      });
      syncing = true;
      try {
        for (const aid of op.artifactIds) if (await db.prepare("SELECT 1 FROM records WHERE org_id=? AND id=? AND kind='content'").get(org, aid)) await systemUpdate(org, 'content', aid, {
          assetId: asset.assetId,
          approvedAssetHash: asset.assetHash,
          mediaUrl: asset.sourceUrl || '',
          briefOnly: false,
          status: 'review',
          scheduledAt: ''
        });
      } finally {
        syncing = false;
      }
      await event(op, 'operation_decision', 'Mídia aprovada selecionada pelo usuário', {
        actor: userId,
        assetId: asset.assetId,
        assetHash: asset.assetHash
      });
      return await block(org, id, 'Mídia aprovada vinculada. Retome a preparação desta operação.', 'blocked', 'blocked_preparation_pending');
    }
    if (op.firstInstagram && ['execute', 'schedule'].includes(d.action) && !d.explicitPublication) error('Nesta primeira validação, use Aprovar e publicar agora na revisão final.');
    if (op.state === 'uncertain' && d.action === 'cancel') error('Uma execução incerta precisa de verificação; não pode ser descartada.');
    if (d.action === 'pause' || d.action === 'cancel') {
      if (terminal.includes(op.state)) return op;
      await db.prepare("UPDATE jobs SET cancel_requested=1,state=CASE WHEN state='queued' THEN 'canceled' ELSE state END,updated_at=? WHERE org_id=? AND json_extract(payload,'$.operationId')=? AND state IN ('queued','working','waiting_provider')").run(Date.now(), org, id);
      return await transition(org, id, d.action === 'cancel' ? 'cancelled' : op.state === 'uncertain' ? 'uncertain' : 'blocked', 'Operação ' + (d.action === 'cancel' ? 'cancelada' : 'pausada') + ' pelo usuário.', {
        paused: d.action === 'pause',
        resumeState: op.state,
        blockers: [{
          message: d.action === 'pause' ? 'Operação pausada. Nenhuma nova ação será iniciada.' : 'Operação cancelada.'
        }]
      });
    }
    if (op.state === 'uncertain' && d.action !== 'verify') error('A operação exige verificação. Uma tentativa incerta não pode ser repetida.');
    if (terminal.includes(op.state)) error('Esta operação já foi encerrada.');
    if (d.action === 'resume') {
      const pending = await db.prepare("SELECT 1 FROM jobs WHERE org_id=? AND json_extract(payload,'$.operationId')=? AND state IN ('working','waiting_provider','uncertain')").get(org, id);
      if (pending) error('Aguarde ou confira a tentativa externa antes de retomar.');
      if (!['blocked', 'failed'].includes(op.state) && !op.paused) return op;
      op = await persist(org, id, {
        paused: false,
        blockers: []
      });
      if (op.artifactIds.length) return await review(org, id);
      op = await transition(org, id, 'planning', 'Retomada a partir dos registros existentes.');
      const job = await queue(org, userId, 'conversation', {
        conversationId: op.threadId,
        mode: 'execute',
        operationId: id,
        resuming: true
      }, null, 'resume:' + id + ':' + op.version);
      return await persist(org, id, {
        currentJobId: job.id
      });
    }
    if (op.paused && d.action !== 'verify') error('Retome a operação antes de continuar.');
    if (d.action === 'approve') {
      if (op.approval.status === 'approved' && op.approval.fingerprint === await fingerprint(org, op)) return op;
      if (!['awaiting_approval', 'reviewing', 'blocked', 'ready'].includes(op.state) || !op.artifactIds.length) error('A operação ainda não possui uma entrega revisável.');
      if (op.reviewHash !== await fingerprint(org, op)) {
        await review(org, id);
        op = await get(org, id);
      }
      if (op.state === 'blocked') error('Complete a revisão antes de aprovar.');
      const approval = {
        status: 'approved',
        actor: userId,
        at: Date.now(),
        fingerprint: await fingerprint(org, op)
      };
      syncing = true;
      try {
        for (const aid of op.artifactIds) {
          const r = await db.prepare('SELECT kind,data FROM records WHERE org_id=? AND id=?').get(org, aid);
          if (r?.kind === 'content' && parse(r.data).status !== 'published') await systemUpdate(org, 'content', aid, {
            status: 'approved'
          });
        }
      } finally {
        syncing = false;
      }
      op = await transition(org, id, 'ready', 'Entrega aprovada pelo usuário.', {
        approval,
        blockers: [],
        plan: op.plan.map(s => s.id === 'review' ? {
          ...s,
          status: 'completed'
        } : s)
      });
      await event(op, 'operation_decision', 'Aprovação registrada', {
        actor: userId,
        fingerprint: approval.fingerprint
      });
      return op;
    }
    if (['execute', 'schedule'].includes(d.action)) {
      if (!['ready', 'scheduled', 'blocked'].includes(op.state) || op.approval.status !== 'approved' || op.approval.fingerprint !== await fingerprint(org, op)) error('Revise e aprove a versão atual antes de executar.');
      const items = await publicationContents(org, op), item = items.find(c => c.status !== 'published');
      if (!item) error(items.length ? 'Todas as publicações desta ordem já foram confirmadas.' : 'Esta ordem não possui conteúdo para publicação.');
      const when = d.action === 'schedule' ? new Date(d.scheduledAt).getTime() : Date.now();
      if (!Number.isFinite(when) || d.action === 'schedule' && when <= Date.now()) error('Escolha uma data futura válida.', 400);
      await persist(org, id, {
        executionAuthorization: {
          action: 'publish',
          actor: userId,
          at: Date.now(),
          fingerprint: op.approval.fingerprint
        }
      });
      try {
        if (!(await company(org)).policy.allowPublishing) throw new ProviderError('Ative a publicação de aprovados em Autonomia.', 'blocked');
        await authorize(org, {
          action: 'publish',
          channel: item.channel,
          risk: 'high',
          operationId: id
        });
        await available(org, item);
      } catch (e) {
        return await block(org, id, e.message);
      }
      if (op.state === 'blocked') op = await transition(org, id, 'ready', 'Bloqueio resolvido.');
      const job = await queue(org, userId, 'publish', {
        contentId: item.id,
        operationId: id
      }, new Date(when).toISOString(), 'publish:' + id + ':' + item.id + ':' + op.approval.fingerprint);
      if (['failed', 'blocked', 'canceled'].includes(job.state)) {
        const previous = await db.prepare('SELECT external FROM jobs WHERE id=? AND org_id=?').get(job.id, org);
        if (parse(previous.external).publishedId) error('Uma publicação já solicitada precisa de verificação, não de nova tentativa.');
        await db.prepare("UPDATE jobs SET state='queued',cancel_requested=0,error=NULL,scheduled_at=?,updated_at=? WHERE org_id=? AND id=?").run(when, Date.now(), org, job.id);
        await event(op, 'operation_retry', 'Nova tentativa vinculada à execução original', {
          jobId: job.id
        });
      }
      syncing = true;
      try {
        await systemUpdate(org, 'content', item.id, {
          status: d.action === 'schedule' ? 'scheduled' : 'approved',
          scheduledAt: d.action === 'schedule' ? new Date(when).toISOString() : ''
        });
      } finally {
        syncing = false;
      }
      op = await persist(org, id, {
        executionJobId: job.id
      });
      await event(op, 'operation_decision', d.action === 'schedule' ? 'Execução agendada pelo usuário' : 'Execução autorizada pelo usuário', {
        jobId: job.id,
        scheduledAt: when,
        actor: userId
      });
      return d.action === 'schedule' ? await transition(org, id, 'scheduled') : op;
    }
    if (d.action === 'verify') {
      const job = await db.prepare("SELECT * FROM jobs WHERE org_id=? AND json_extract(payload,'$.operationId')=? AND state='uncertain' AND kind='publish' ORDER BY created_at DESC LIMIT 1").get(org, id);
      if (!job || !parse(job.external).publishedId) error('Ainda não há identificador para verificação automática. Confira o serviço; a publicação não será repetida.');
      await db.prepare("UPDATE jobs SET payload=json_set(payload,'$.verificationOnly',json('true')),state='queued',cancel_requested=0,scheduled_at=?,updated_at=? WHERE id=?").run(Date.now(), Date.now(), job.id);
      return await transition(org, id, 'verifying', 'Somente a confirmação será consultada; não haverá nova publicação.', {
        paused: false
      });
    }
    if (d.action === 'measure') {
      if (op.state !== 'completed') error('A execução precisa estar confirmada antes da medição.');
      const metrics = (await records(org, 'metrics')).filter(m => m.operationId === id || op.campaignId && m.campaignId === op.campaignId);
      return await transition(org, id, 'measuring', 'Acompanhamento das medições reais.', {
        result: {
          ...op.result,
          metricIds: metrics.map(m => m.id),
          measurement: metrics.length ? 'Medições vinculadas disponíveis.' : 'Aguardando medições com fonte; nenhum resultado numérico foi inferido.'
        }
      });
    }
    if (d.action === 'learn') {
      if (op.state !== 'measuring') error('Inicie o acompanhamento antes de registrar aprendizado.');
      const metrics = (await records(org, 'metrics')).filter(m => m.operationId === id || op.campaignId && m.campaignId === op.campaignId);
      if (!metrics.length || !text(d.note)) error('Informe um aprendizado e vincule métricas reais à campanha.');
      const learned = await saveRecord(org, 'knowledge', {
        title: 'Aprendizado — ' + op.objective.slice(0, 100),
        text: text(d.note),
        source: 'Métricas: ' + metrics.map(m => m.id).join(', ')
      }, userId);
      await linkRecord(org, id, 'knowledge', learned.id);
      return await transition(org, id, 'learned', 'Aprendizado registrado com fontes.', {
        result: {
          ...op.result,
          metricIds: metrics.map(m => m.id),
          learningId: learned.id
        }
      });
    }
    error('Ação operacional inválida.', 400);
  }
  async function summary(org, id) {
    const op = await get(org, id), labels = {
      requested: 'Pedido registrado',
      understanding: 'Consultando contexto',
      planning: 'Plano registrado',
      producing: 'Produção em andamento',
      reviewing: 'Em revisão',
      awaiting_approval: 'Aguardando sua aprovação',
      ready: op.approval.status === 'approved' ? 'Entrega aprovada e pronta para execução autorizada' : 'Registros preparados; execução externa depende de autorização',
      scheduled: 'Publicação agendada',
      executing: 'Execução em andamento',
      verifying: 'Aguardando verificação do canal',
      completed: op.type === 'general' && !op.evidence.some(e => e.status === 'verified') ? 'Etapas locais concluídas' : 'Execução verificada',
      measuring: 'Acompanhando resultados reais',
      learned: 'Aprendizado registrado',
      blocked: 'Operação bloqueada',
      uncertain: 'Resultado incerto: precisa de conferência',
      failed: 'A tentativa falhou',
      cancelled: 'Operação cancelada'
    };
    return `${labels[op.state]}.\nObjetivo: ${op.objective}${op.artifactIds.length ? '\nEntregas registradas: ' + op.artifactIds.length + '. Consulte o Estúdio criativo.' : ''}${op.blockers.length ? '\n' + op.blockers.map(b => b.message).join('\n') : ''}${op.type === 'post' && !['completed', 'measuring', 'learned'].includes(op.state) ? '\nA publicação ainda não foi confirmada.' : ''}`;
  }
  async function publicationContents(org, op) {
    return (await mapAsync(op.artifactIds, async id => await db.prepare("SELECT * FROM records WHERE org_id=? AND id=? AND kind='content'").get(org, id))).filter(Boolean).map(decode);
  }
  async function finishGeneral(job) {
    let op = await jobOperation(job);
    if (!op || op.type === 'post') return op;
    if (['blocked', 'uncertain', 'cancelled', 'failed'].includes(op.state) || op.paused) return op;
    if (op.state === 'understanding') op = await transition(op.companyId, op.id, 'planning');
    if (await db.prepare("SELECT 1 FROM jobs WHERE org_id=? AND id<>? AND json_extract(payload,'$.operationId')=? AND state IN ('queued','working','waiting_provider')").get(op.companyId, job.id, op.id)) return await transition(op.companyId, op.id, 'producing', 'Há etapas de produção na fila existente.');
    if (op.artifactIds.length) {
      if (op.state === 'planning') await transition(op.companyId, op.id, 'producing');
      return await review(op.companyId, op.id);
    }
    if (op.artifactIds.length || op.plan.length || op.campaignId || op.evidence.some(e => e.executor === 'local' && e.status === 'recorded')) {
      if (op.state === 'producing') await transition(op.companyId, op.id, 'reviewing');
      return await transition(op.companyId, op.id, 'ready', 'Registros locais preparados; execução externa não confirmada.');
    }
    return await block(op.companyId, op.id, 'Nenhuma entrega foi registrada nesta tentativa. Detalhe o resultado esperado para continuar.');
  }
  return {
    list,
    get,
    register,
    jobOperation,
    transition,
    block,
    begin,
    preparePost: async job => await atomic(async () => await preparePost(job)),
    deliverPost: async (job, draft) => await atomic(async () => await deliverPost(job, draft)),
    linkRecord,
    review,
    validateRules,
    authorize,
    attachJob,
    beforeJob,
    afterJob,
    recover,
    onRecord,
    onBrand,
    action: async (org, id, user, d) => await atomic(async () => await action(org, id, user, d)),
    summary,
    finishGeneral,
    evidence,
    persist,
    fingerprint
  };
}
