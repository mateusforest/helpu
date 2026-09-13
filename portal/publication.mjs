import {mapAsync} from "./async-collections.mjs";
import fs from 'node:fs';
import {createHash, randomUUID} from 'node:crypto';
import {lookup} from 'node:dns/promises';
import https from 'node:https';
import {publicUrl, ProviderError} from './providers.mjs';
export const digest = value => createHash('sha256').update(value).digest('hex');
export const snapshotHash = value => digest(JSON.stringify(value));
export async function inspectApprovedAsset(db, assetPath, org, assetId) {
  const row = await db.prepare('SELECT * FROM assets WHERE id=? AND org_id=?').get(assetId || '', org);
  if (!row) return {
    passed: false,
    code: 'blocked_missing_approved_asset',
    checks: [{
      label: 'Arquivo da empresa disponível',
      passed: false
    }]
  };
  let bytes;
  try {
    bytes = fs.readFileSync(await assetPath(org, assetId));
  } catch {
    return {
      passed: false,
      code: 'blocked_asset_unavailable',
      assetId,
      checks: [{
        label: 'Acesso ao arquivo',
        passed: false
      }]
    };
  }
  let width = null, height = null;
  if (bytes[0] === 255 && bytes[1] === 216) {
    let offset = 2;
    while (offset + 8 < bytes.length) {
      if (bytes[offset] !== 255) break;
      const marker = bytes[offset + 1];
      offset += 2;
      if (marker === 217 || marker === 218) break;
      if (marker === 1 || marker >= 208 && marker <= 215) continue;
      const length = bytes.readUInt16BE(offset);
      if (length < 2 || offset + length > bytes.length) break;
      if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker)) {
        height = bytes.readUInt16BE(offset + 3);
        width = bytes.readUInt16BE(offset + 5);
        break;
      }
      offset += length;
    }
  }
  const checks = [{
    label: 'Arquivo da empresa disponível',
    passed: true
  }, {
    label: 'JPEG com dimensões legíveis',
    passed: row.mime === 'image/jpeg' && !!width && !!height
  }, {
    label: 'Tamanho de até 8 MB',
    passed: bytes.length > 0 && bytes.length <= 8 * 1024 * 1024 && bytes.length === row.size
  }, {
    label: 'Proporção entre 4:5 e 1,91:1; largura entre 320 e 1440 px',
    passed: !!width && width >= 320 && width <= 1440 && width / height >= .8 && width / height <= 1.91
  }];
  return {
    passed: checks.every(c => c.passed),
    code: 'blocked_asset_incompatible',
    assetId,
    assetHash: digest(bytes),
    assetVersion: 1,
    name: row.name,
    mime: row.mime,
    size: bytes.length,
    width,
    height,
    sourceUrl: row.source_url,
    url: '/api/portal/files/' + assetId,
    checks
  };
}
export function suppliedAssetApproved(text) {
  return (/\baprovad[oa]\b/i).test(text) && !(/(n[aã]o|sem|ainda|pendente|precisa|desaprovad[oa]).{0,35}aprov|\bdesaprovad[oa]\b|aprov.{0,25}(pendente|necess[aá]ria)/i).test(text);
}
export async function withSourceDeadline(run, timeoutMs = 20000) {
  const controller = new AbortController();
  const failure = new ProviderError('A conferência da mídia excedeu o prazo permitido.', 'blocked');
  let timer;
  const expired = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort(failure);
      reject(failure);
    }, timeoutMs);
  });
  try {
    return await Promise.race([Promise.resolve().then(() => run(controller.signal)), expired]);
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
export const EME_CONTEXT = {
  description: 'Plataforma para corretores de imóveis. Centraliza e organiza a operação do corretor. Reúne gestão de clientes, imóveis, propostas, contratos, compromissos, catálogo público, Marketplace e recursos de inteligência artificial.',
  audience: 'Corretores de imóveis.',
  positioning: 'Sistema Operacional do Corretor. A EME não deve ser apresentada apenas como CRM. Assinatura institucional: EME — Sistema Operacional do Corretor.',
  visualIdentity: 'Identidade clean, premium e minimalista. Branco predominante, verde como destaque. Fonte principal: Geist. Referências visuais: Apple, OpenAI, Linear, Notion, Vercel e Stripe.',
  tone: 'Comunicação inteligente, objetiva, segura e profissional. Frase já validada pelo usuário: “Você não precisa de cinco sistemas. Precisa de um só.”',
  restrictions: 'O módulo Financeiro não faz parte do posicionamento atual. Evitar linguagem genérica, exagerada e promessas não comprovadas. Não há preço, quantidade de clientes, crescimento, resultados, economia ou conversão fornecidos e validados; não afirmar esses dados.'
};
export function createPublicationWorkflow({db, kernel, company, record, inspectAsset, integration, integrationMetadata, providers, queue, saveMetric, readAsset, fetcher, resolve = lookup}) {
  const parse = v => v ? JSON.parse(v) : {};
  const blocked = async (org, op, code, message) => await kernel.block(org, op.id, message, 'blocked', code);
  const current = async (org, op) => {
    const content = (await mapAsync(op.artifactIds, async id => await db.prepare("SELECT id FROM records WHERE org_id=? AND id=? AND kind='content'").get(org, id))).filter(Boolean)[0];
    if (!content) return null;
    const item = await record(org, 'content', content.id), asset = await inspectAsset(org, item.assetId), identity = await integrationMetadata(org, 'api:instagram');
    const account = {
      id: (await integration(org, 'instagram')).accountId || null,
      username: identity.username || null
    };
    const binding = {
      companyId: org,
      context: (await company(org)).profile,
      artifactId: item.id,
      assetId: item.assetId,
      assetHash: asset.assetHash,
      caption: item.caption,
      channel: item.channel,
      format: item.format,
      mediaUrl: item.mediaUrl,
      account,
      identityConfirmedAt: identity.confirmedAt
    };
    return {
      item,
      asset,
      identity,
      account,
      binding,
      snapshotId: snapshotHash(binding)
    };
  };
  async function verifySource(org, op) {
    const value = await current(org, op);
    if (!value?.asset.passed) throw new ProviderError('O arquivo aprovado não está disponível ou mudou.', 'blocked');
    const url = value.item.mediaUrl;
    if (!publicUrl(url)) throw new ProviderError('A API do Instagram precisa da mesma mídia em uma URL HTTPS pública. A biblioteca privada não é publicada automaticamente.', 'blocked');
    const host = new URL(url).hostname;
    return withSourceDeadline(async signal => {
      let req, response, reader;
      const cleanup = () => {
        req?.destroy();
        if (reader) void reader.cancel().catch(() => {}); else if (response?.body?.destroy) response.body.destroy(); else if (response?.body?.cancel) void response.body.cancel().catch(() => {});
      };
      signal.addEventListener('abort', cleanup, {
        once: true
      });
      try {
        const addresses = await resolve(host, {
          all: true,
          family: 4
        });
        signal.throwIfAborted();
        if (!addresses.length || addresses.some(x => !(/^\d+\.\d+\.\d+\.\d+$/).test(x.address) || (/^(0|10|127|169\.254|192\.168|224|240)\./).test(x.address) || Number(x.address.split('.')[0]) >= 224 || (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./).test(x.address) || (/^172\.(1[6-9]|2\d|3[01])\./).test(x.address))) throw new ProviderError('A URL da mídia não aponta para um endereço público permitido.', 'blocked');
        response = fetcher ? await fetcher(url, {
          signal,
          redirect: 'error'
        }) : await new Promise((accept, reject) => {
          req = https.get(url, {
            signal,
            headers: {
              'Accept-Encoding': 'identity'
            },
            lookup: (name, options, done) => done(null, options.all ? [{
              address: addresses[0].address,
              family: 4
            }] : addresses[0].address, 4)
          }, res => accept({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            body: res
          }));
          req.on('error', reject);
        });
        signal.throwIfAborted();
        if (!response.ok) {
          response.body?.destroy?.();
          throw new ProviderError('O endereço público da mídia não está acessível (' + response.status + ').', 'blocked');
        }
        const chunks = [];
        let size = 0;
        const collect = chunk => {
          signal.throwIfAborted();
          size += chunk.length;
          if (size > 8 * 1024 * 1024) throw new ProviderError('A mídia pública excede o limite validado.', 'blocked');
          chunks.push(chunk);
        };
        if (response.body?.getReader) {
          reader = response.body.getReader();
          for (; ; ) {
            const next = await reader.read();
            signal.throwIfAborted();
            if (next.done) break;
            collect(next.value);
          }
        } else for await (const chunk of response.body) collect(chunk);
        signal.throwIfAborted();
        if (digest(Buffer.concat(chunks)) !== value.asset.assetHash) throw new ProviderError('O arquivo na URL pública não corresponde ao hash da mídia aprovada.', 'blocked');
        return {
          type: 'asset_hash_match',
          assetHash: value.asset.assetHash,
          checkedAt: Date.now()
        };
      } finally {
        signal.removeEventListener('abort', cleanup);
        cleanup();
      }
    }).catch(error => {
      if (error instanceof ProviderError) throw error;
      throw new ProviderError('Não foi possível conferir a URL pública da mídia.', 'blocked');
    });
  }
  async function assertSnapshot(org, op) {
    const value = await current(org, op);
    if (!value || value.snapshotId !== op.publication?.snapshotId || !value.asset.passed || value.identity.status !== 'identity_confirmed') throw new ProviderError('A mídia, legenda, marca, configuração ou conta mudou. Revise e aprove a versão atual.', 'blocked');
    return value;
  }
  async function review(org, id, userId) {
    let op = await kernel.get(org, id);
    if (!op.firstInstagram) throw new ProviderError('Esta revisão é específica da primeira publicação no Instagram.', 'blocked');
    if (op.paused || ['uncertain', 'executing', 'verifying', 'completed', 'measuring', 'learned', 'cancelled'].includes(op.state)) throw new ProviderError('A operação não pode receber uma nova revisão neste estado.', 'blocked');
    const value = await current(org, op);
    if (!value || !op.approvedAsset) return await blocked(org, op, 'blocked_missing_approved_asset', 'Selecione na conversa uma mídia real e aprovada da empresa; briefing não é mídia pronta.');
    const {item, asset, identity, account} = value;
    const checks = [...asset.checks, {
      label: 'Mídia escolhida e aprovada pelo usuário',
      passed: asset.assetHash === op.approvedAsset.assetHash && item.assetId === op.approvedAsset.assetId
    }, {
      label: 'Legenda preenchida e com até 2.200 caracteres',
      passed: !!item.caption?.trim() && [...item.caption].length <= 2200
    }, {
      label: 'Até 30 hashtags e 20 menções na legenda',
      passed: (item.caption?.match(/#[\p{L}\p{N}_]+/gu) || []).length <= 30 && (item.caption?.match(/@[\w.]+/g) || []).length <= 20
    }, {
      label: 'Links com sintaxe válida; disponibilidade dos links da legenda não aferida',
      passed: (item.caption?.match(/https?:\/\/\S+/g) || []).every(link => !!publicUrl(link))
    }, {
      label: 'Imagem de feed no Instagram',
      passed: item.channel === 'instagram' && item.format === 'image'
    }, {
      label: 'Conta da empresa confirmada manualmente',
      passed: identity.status === 'identity_confirmed' && account.id === identity.accountId
    }, {
      label: 'Sem publicação anterior desta mídia na empresa',
      passed: !(await kernel.list(org)).some(other => other.id !== id && other.publication?.assetHash === asset.assetHash && ['published_verified', 'publication_uncertain'].includes(other.publication?.status))
    }];
    const quality = {
      technical: {
        passed: checks.every(c => c.passed),
        checks
      },
      textual: {
        passed: null,
        note: 'Revisão contextual pendente'
      },
      factual: {
        passed: null,
        note: 'Revisão contextual pendente'
      },
      visual: {
        passed: null,
        note: 'Avaliação visual humana necessária'
      },
      human: {
        required: true,
        note: 'Confira mídia, alegações, legenda e conta. Revisão automática não é garantia.'
      }
    };
    const reviewId = randomUUID();
    const publication = {
      reviewId,
      assetId: item.assetId,
      assetHash: asset.assetHash,
      assetVersion: asset.assetVersion,
      artifactId: item.id,
      artifactVersion: item.version,
      caption: item.caption,
      captionVersion: digest(item.caption || ''),
      account,
      channel: 'instagram',
      format: item.format,
      executor: 'api',
      quality,
      status: 'reviewing',
      snapshotId: value.snapshotId
    };
    await kernel.persist(org, id, {
      publication,
      approval: {
        status: 'pending'
      },
      executionAuthorization: null
    });
    if (!asset.passed) return await blocked(org, op, asset.code, 'A mídia não passou pela verificação técnica.');
    if (asset.assetHash !== op.approvedAsset.assetHash || item.assetId !== op.approvedAsset.assetId) return await blocked(org, op, 'blocked_asset_approval_changed', 'A mídia mudou desde a seleção aprovada. Selecione e confirme a nova mídia na conversa.');
    if (identity.status !== 'identity_confirmed' || identity.accountId !== account.id) return await blocked(org, op, 'blocked_account_not_confirmed', 'Valide a API e confirme manualmente a identidade do Instagram da EME em Integrações. O perfil aberto no navegador não fornece este executor verificado.');
    if (!quality.technical.passed) return await blocked(org, op, 'blocked_technical_review', 'Corrija as verificações técnicas indicadas antes da aprovação.');
    const intelligence = await integrationMetadata(org, 'validation:openai');
    if (intelligence.status !== 'validated') return await blocked(org, op, 'blocked_intelligence_not_validated', 'Valide uma chamada real da inteligência em Integrações antes da revisão contextual.');
    try {
      const source = await verifySource(org, op);
      const contextual = await providers.contextualReview(await integration(org, 'openai'), {
        company: await company(org),
        objective: op.objective,
        content: item,
        knowledge: [],
        imageDataUrl: readAsset ? "data:" + asset.mime + ";base64," + (await readAsset(org, asset.assetId)).toString("base64") : undefined
      });
      const fresh = await kernel.get(org, id);
      if (fresh.publication?.reviewId !== reviewId) return fresh;
      if (fresh.paused || ['cancelled', 'completed', 'executing', 'verifying', 'uncertain', 'learned', 'measuring'].includes(fresh.state) || (await current(org, fresh))?.snapshotId !== value.snapshotId) throw new ProviderError('A operação mudou durante a revisão. Revise a versão atual.', 'blocked');
      quality.visual = {
        passed: contextual.metadata?.imageReview === 'performed' ? contextual.checks?.find(c => c.criterion === 'visual_alignment')?.passed ?? null : null,
        note: contextual.metadata?.imageReview === 'performed' ? 'Revisão contextual dos pixels realizada; conferência humana ainda necessária.' : 'Avaliação visual humana necessária'
      };
      quality.contextual = contextual;
      quality.textual = {
        passed: contextual.checks?.filter(c => ['tone', 'objective', 'channel'].includes(c.criterion)).every(c => c.passed) ?? false,
        note: contextual.summary
      };
      quality.factual = {
        passed: contextual.checks?.find(c => c.criterion === 'factual_claims')?.passed ?? false,
        note: contextual.summary
      };
      await kernel.persist(org, id, {
        publication: {
          ...publication,
          quality,
          status: contextual.approved ? 'ready_for_approval' : 'review_failed',
          sourceCheck: source
        }
      });
      await kernel.evidence(org, id, {
        status: 'recorded',
        executor: 'responses',
        channel: 'instagram',
        message: 'Revisão contextual registrada; aprovação humana necessária.',
        evidence: {
          quality,
          source
        }
      }, op.currentJobId);
      if (!contextual.approved) return await blocked(org, op, 'blocked_contextual_review', 'A revisão contextual apontou pendências: ' + contextual.summary);
      await kernel.review(org, id);
      return await kernel.get(org, id);
    } catch (e) {
      const fresh = await kernel.get(org, id);
      if (fresh.publication?.reviewId !== reviewId || ['cancelled', 'completed', 'learned', 'measuring', 'uncertain'].includes(fresh.state)) return fresh;
      return await blocked(org, op, 'blocked_publication_review', e instanceof ProviderError ? e.message : 'Não foi possível concluir a revisão da publicação.');
    }
  }
  async function approvePublish(org, id, userId, data) {
    let op = await kernel.get(org, id);
    if (!op.firstInstagram) throw new ProviderError('Operação incompatível com esta aprovação.', 'blocked');
    if (op.publication?.snapshotId === data.snapshotId && op.executionAuthorization?.trigger === 'approve_publish' && op.executionJobId && ['queued', 'working', 'waiting_provider', 'succeeded', 'uncertain'].includes((await db.prepare('SELECT state FROM jobs WHERE id=?').get(op.executionJobId))?.state)) return op;
    if (!data.snapshotId || data.snapshotId !== op.publication?.snapshotId || op.publication.status !== 'ready_for_approval') throw new ProviderError('Revise a versão final antes de Aprovar e publicar agora.', 'blocked');
    await assertSnapshot(org, op);
    const previous = await db.prepare("SELECT id FROM records WHERE org_id=? AND kind='operations' AND id<>? AND json_extract(data,'$.firstInstagram')=1 AND json_extract(data,'$.publication.intentAt') IS NOT NULL").get(org, id);
    if (previous) return await blocked(org, op, 'blocked_first_publication_limit', 'Esta fase permite uma única publicação real. Confira a operação que já recebeu autorização.');
    await db.exec('SAVEPOINT approve_instagram');
    try {
      op = await kernel.action(org, id, userId, {
        action: 'approve'
      });
      const binding = {
        ...op.publication,
        approvedAt: Date.now(),
        approvedBy: userId,
        workOrderId: id
      };
      await kernel.persist(org, id, {
        approval: {
          ...op.approval,
          ...binding,
          status: 'approved'
        },
        publication: {
          ...op.publication,
          intentAt: Date.now(),
          status: 'approved'
        },
        executionAuthorization: null
      });
      op = await kernel.action(org, id, userId, {
        action: 'execute',
        explicitPublication: true
      });
      if (op.executionJobId) await kernel.persist(org, id, {
        executionAuthorization: {
          ...op.executionAuthorization,
          trigger: 'approve_publish',
          snapshotId: data.snapshotId
        },
        publication: {
          ...op.publication,
          status: 'queued'
        }
      });
      await db.exec('RELEASE approve_instagram');
      return await kernel.get(org, id);
    } catch (e) {
      await db.exec('ROLLBACK TO approve_instagram');
      await db.exec('RELEASE approve_instagram');
      throw e;
    }
  }
  async function metrics(org, id, mediaId, period = 'initial') {
    const op = await kernel.get(org, id);
    if (op.publication?.status !== 'published_verified') return;
    try {
      if (String((await integration(org, 'instagram')).accountId) !== String(op.publication.account.id)) throw new ProviderError('A conta configurada mudou desde a publicação.', 'blocked');
      const result = await providers.instagramMetrics(await integration(org, 'instagram'), {
        mediaId
      });
      const metricId = await saveMetric(org, op, result, period);
      const fresh = await kernel.get(org, id);
      await kernel.persist(org, id, {
        result: {
          ...fresh.result,
          metricIds: [...new Set([...fresh.result.metricIds || [], metricId])]
        },
        publication: {
          ...fresh.publication,
          metrics: {
            status: result.status === 'unavailable' ? 'unavailable' : result.status === 'partial' ? 'partial' : 'collected',
            lastCollectedAt: Date.now(),
            period,
            serverRequired: true
          }
        }
      });
    } catch {
      const fresh = await kernel.get(org, id);
      await kernel.persist(org, id, {
        publication: {
          ...fresh.publication,
          metrics: {
            status: 'unavailable',
            error: 'O canal não retornou métricas nesta consulta.',
            lastAttemptAt: Date.now(),
            serverRequired: true
          }
        }
      });
    }
  }
  return {
    review,
    approvePublish,
    assertSnapshot,
    verifySource,
    metrics
  };
}
