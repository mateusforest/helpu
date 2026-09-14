import fs from 'node:fs';
import {createHash, randomUUID} from 'node:crypto';
import {ProviderError} from './providers.mjs';
import {imageSourceHash} from './image-generation.mjs';
const parse = value => value ? JSON.parse(value) : {};
const digest = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
const contentSource = c => ({
  title: c.title,
  caption: c.caption,
  visualPrompt: c.visualPrompt,
  format: c.format,
  channel: c.channel,
  campaignId: c.campaignId || null
});
export function dailyPriority({contents = [], operations = [], tasks = [], jobs = []}) {
  const active = jobs.filter(j => !String(j.idempotency_key || '').startsWith('daily-director:') && ['queued', 'working', 'waiting_provider', 'uncertain'].includes(j.state));
  const pending = contents.filter(c => c.status !== 'published' && ['draft', 'review', 'approved', 'scheduled'].includes(c.status));
  const orders = operations.filter(o => !['completed', 'learned', 'cancelled'].includes(o.state));
  const unmeasured = operations.filter(o => o.state === 'completed' && !o.result?.measurement);
  const openTasks = tasks.filter(t => t.status !== 'done');
  const hold = active.length || pending.length || orders.length || unmeasured.length || openTasks.length;
  return {
    status: hold ? 'pending_work' : 'new_front_allowed',
    intelligenceRequired: !hold,
    message: active.length ? 'Acompanhar as execuções em andamento ou conferir os resultados incertos.' : pending.length ? `${pending.length} entrega(s) existente(s) aguardam produção, revisão, aprovação ou execução. Conclua essas entregas antes de criar novas ideias.` : orders.length ? 'Resolver os bloqueios e concluir as ordens em andamento.' : unmeasured.length ? 'Conferir os resultados das operações realizadas antes de iniciar uma nova frente.' : openTasks.length ? 'Concluir as tarefas abertas antes de iniciar uma nova frente.' : 'Nenhum trabalho pendente encontrado. A direção pode planejar uma nova frente.',
    contentIds: pending.map(c => c.id),
    operationIds: [...new Set([...orders, ...unmeasured].map(o => o.id))],
    jobIds: active.map(j => j.id),
    taskIds: openTasks.map(t => t.id)
  };
}
export function createStudio({db, company, record, list, saveRecord, systemUpdate, kernel, metadata, saveMetadata, integrationState, assetPath, audit, storeAsset, assetType, providers, integration}) {
  async function sourceJob(org, id) {
    return await db.prepare("SELECT j.* FROM jobs j WHERE j.org_id=? AND j.kind='agent' AND EXISTS (SELECT 1 FROM json_each(j.output,'$.recordIds') WHERE value=?) ORDER BY j.created_at LIMIT 1").get(org, id);
  }
  async function fileEvidence(org, id, mimes) {
    if (!id) return null;
    const asset = await db.prepare('SELECT id,mime,size,name FROM assets WHERE org_id=? AND id=?').get(org, id);
    if (!asset || !mimes.includes(asset.mime)) return null;
    try {
      const bytes = fs.readFileSync(await assetPath(org, id));
      if (bytes.length !== asset.size || !bytes.length) return null;
      return {
        ...asset,
        hash: digest(bytes)
      };
    } catch {
      return null;
    }
  }
  async function inspect(org, id) {
    const c = await record(org, 'content', id), brand = await company(org), materials = await metadata(org, 'brand:production'), saved = await metadata(org, 'studio:' + id), decision = await metadata(org, 'studio:decision:' + id), provider = decision.provider || 'openai', connection = (await integrationState(org)).find(i => i.id === provider);
    const generated=await metadata(org,'image:'+id),imageFile=await fileEvidence(org,generated.assetId,['image/png']),imageValid=!!imageFile&&imageFile.hash===generated.hash,currentImage=imageValid&&generated.sourceHash===imageSourceHash(c,brand,decision,materials);
    const logo = await fileEvidence(org, materials.logoAssetId, ['image/png', 'image/jpeg', 'image/webp']);
    const font = await fileEvidence(org, materials.fontAssetId, ['font/woff2', 'font/ttf', 'font/otf']);
    const missing = [];
    const need = (field, material, why, where) => missing.push({
      field,
      material,
      why,
      where
    });
    if (!logo || logo.hash !== materials.logoHash || !materials.confirmedBy) need('logo', 'Logotipo oficial e confirmação da versão', 'Aplicar a marca sem inventar ou redesenhar o símbolo.', 'Estúdio → Enviar arquivo; depois Materiais oficiais → selecionar o logo em PNG, JPEG ou WebP.');
    if (!['background', 'foreground', 'accent'].every(k => (/^#[\da-f]{6}$/i).test(materials.colors?.[k] || ''))) need('palette', 'Paleta exata: fundo, texto e destaque', '“Verde” não identifica a cor institucional.', 'Estúdio → Materiais oficiais → informar os três códigos hexadecimais.');
    if (!font || font.hash !== materials.fontHash || !materials.fontFamily) need('font', 'Arquivo da fonte oficial e nome da família', 'A referência à Geist não comprova que a fonte está disponível para composição.', 'Estúdio → Enviar arquivo; depois Materiais oficiais → selecionar WOFF2, TTF ou OTF e informar sua família.');
    const candidates = await metadata(org, 'brand:candidates');
    const confirmationPending = !materials.confirmedBy && !!candidates.hash && (await fileEvidence(org, candidates.logoAssetId, ['image/png', 'image/jpeg', 'image/webp']))?.hash === candidates.logoHash && (await fileEvidence(org, candidates.fontAssetId, ['font/woff2', 'font/ttf', 'font/otf']))?.hash === candidates.fontHash && !!candidates.fontFamily && ['background', 'foreground', 'accent'].every(k => (/^#[\da-f]{6}$/i).test(candidates.colors?.[k] || ''));
    if (confirmationPending) for (const item of missing) {
      item.why = 'Os materiais candidatos foram localizados e sua integridade foi verificada. Falta confirmar a oficialidade.';
      item.where = 'Estúdio → Materiais oficiais → conferir os arquivos e as cores já preenchidos, marcar a confirmação e salvar.';
    }
    const blockers = [];
    if (missing.length) blockers.push({
      code: 'blocked_missing_brand_assets',
      message: confirmationPending ? 'Logo, fonte e paleta localizados. Confirme sua oficialidade em Estúdio → Materiais oficiais.' : 'Faltam materiais oficiais: ' + missing.map(m => m.material).join('; ') + '.',
      missing
    });
    const configured = provider === 'openai' ? !!connection?.configuredFields?.apiKey : !!connection?.configuredFields?.keyId && !!connection?.configuredFields?.keySecret;
    const validated = configured && connection?.validation?.status === 'executor_validated';
    const savedAccess = await metadata(org, 'studio:openai-access'), revision = (await db.prepare("SELECT updated_at FROM integrations WHERE org_id=? AND provider='openai'").get(org))?.updated_at;
    const access = savedAccess.credentialRevision === revision ? savedAccess : {
      ...savedAccess,
      status: 'not_validated',
      error: null
    };
    if (provider === 'openai') {
      if (!configured) blockers.push({
        code: 'blocked_openai_not_configured',
        message: 'Abra Integrações → OpenAI e configure a credencial da API no cofre da Helpu.'
      }); else if(currentImage) blockers.push({code:'blocked_composition_required',message:generated.purpose==='base'?'A imagem-base já está na Biblioteca. Falta compor o texto e o logo oficiais e revisar a peça final.':'A imagem já está na Biblioteca. Revise o arquivo antes de aprovar a peça final.'}); else if (access.status !== 'model_accessible') blockers.push({
        code: 'blocked_openai_image_access',
        message: access.error || 'A credencial de inteligência existe, mas o acesso ao modelo de imagem ainda precisa ser conferido.'
      }); else blockers.push({
        code: 'blocked_first_generation_required',
        message: 'O modelo está acessível. Use Gerar imagem-base para criar o arquivo e salvá-lo na Biblioteca.'
      });
    } else if (!configured) blockers.push({
      code: 'blocked_higgsfield_not_configured',
      message: 'Abra Integrações → Higgsfield → Configurar e salve o identificador e o segredo da API. Credencial salva ainda exige validação real do executor.'
    }); else if (!validated) blockers.push({
      code: 'blocked_higgsfield_executor_unvalidated',
      message: 'As credenciais do Higgsfield estão salvas, mas ainda não existe evidência de geração e acompanhamento por esse executor.'
    });
    if (!decision.confirmedAt) blockers.push({
      code: 'blocked_production_review_required',
      message: 'Confirme o texto final, o uso ou remoção de “Saiba como” e a direção da imagem-base. Depois dos materiais e do executor, a composição e suas revisões precisam ser validadas antes da aprovação humana.'
    });
    const source = contentSource(c), sourceHash = digest(source);
    const specification = {
      objective: c.title,
      audience: brand.profile.audience || null,
      centralMessage: c.caption || null,
      artDirection: c.visualPrompt || null,
      composition: 'Preservar a composição descrita no briefing original; alterações exigem nova versão.',
      format: 'static_image',
      width: 1080,
      height: 1080,
      count: 1,
      allowedMime: ['image/png', 'image/jpeg'],
      exactText: {
        source: c.caption || '',
        status: 'requires_human_confirmation'
      },
      logo,
      colors: materials.colors || null,
      typography: font ? {
        family: materials.fontFamily,
        asset: font
      } : null,
      margins: {
        status: 'requires_production_specification'
      },
      safeArea: {
        status: 'requires_production_specification'
      },
      hierarchy: c.visualPrompt || '',
      requiredElements: ['Logo oficial proporcional', 'Texto confirmado', 'Identidade oficial da empresa'],
      prohibitedElements: ['Logo inventado', 'Fontes substitutas sem aprovação', 'Cores presumidas', 'Fatos comerciais não fornecidos', 'Textos gerados dentro da imagem-base', 'Carrossel', 'Vídeo', 'Música'],
      restrictions: brand.profile.restrictions || null,
      references: brand.profile.visualIdentity || null,
      technicalCriteria: ['Arquivo íntegro', '1080 × 1080 px', 'PNG ou JPEG', 'Hash e versão', 'Texto e logo dentro da área segura'],
      approvalCriteria: ['Revisão técnica', 'Revisão textual e factual', 'Revisão visual', 'Aprovação humana da versão e hash exatos'],
      state: 'incomplete_external_dependencies'
    };
    if (decision.confirmedAt) {
      Object.assign(specification, {
        centralMessage: decision.text,
        artDirection: decision.artDirection,
        exactText: {
          source: decision.text,
          status: 'confirmed_by_user',
          cta: decision.cta
        },
        imageBase: {
          direction: decision.artDirection,
          containsText: false,
          containsLogo: false
        },
        composition: 'Imagem-base na área central. Declaração institucional na parte superior. Logo oficial no rodapé, sem CTA.',
        margins: {
          top: 80,
          right: 80,
          bottom: 80,
          left: 80,
          unit: 'px'
        },
        safeArea: {
          x: 80,
          y: 80,
          width: 920,
          height: 920
        },
        hierarchy: ['Frase institucional em duas linhas', 'Imagem editorial de centralização', 'Logo oficial'],
        alignment: 'Texto alinhado à esquerda; elemento visual central; logo no canto inferior direito.',
        layout: {
          text: {
            x: 80,
            y: 80,
            width: 920,
            height: 170
          },
          image: {
            x: 80,
            y: 290,
            width: 920,
            height: 550
          },
          logo: {
            x: 780,
            y: 850,
            width: 220,
            height: 150
          }
        },
        prohibitedElements: [...specification.prohibitedElements, ...decision.prohibitedElements],
        state: missing.length ? 'awaiting_official_materials' : 'specified'
      });
    }
    return {
      contentId: id,
      companyId: org,
      operationId: c.operationId || null,
      campaignId: c.campaignId || null,
      sourceJobId: (await sourceJob(org, id))?.id || null,
      sourceVersion: c.version,
      sourceHash,
      state: blockers[0]?.code || 'blocked_first_generation_required',
      blockers,
      executor: {
        provider,
        path: 'api',
        model: provider === 'openai' ? access.model || 'gpt-image-2.5-sunburst' : null,
        state: currentImage?'generation_verified':provider === 'openai' ? configured ? access.status === 'model_accessible' ? 'model_accessible_unvalidated' : 'configured_unvalidated' : 'not_configured' : validated ? 'executor_validated' : configured ? 'configured_unvalidated' : 'not_configured',
        account: null,
        access: provider === 'openai' ? access : null
      },
      decision: decision.confirmedAt ? decision : null,
      candidates,
      specification,
      storedVersion: saved.version || null,
      stale: !!saved.sourceHash && saved.sourceHash !== sourceHash,
      canGenerate: provider==='openai'&&configured&&!currentImage&&!blockers.some(b=>!['blocked_first_generation_required','blocked_openai_image_access'].includes(b.code)),
      generation: imageValid?{...generated,stale:!currentImage}:null,
      baseAsset: imageValid&&generated.purpose==='base'?{...imageFile,url:'/api/portal/files/'+imageFile.id}:null,
      finalAsset: null,
      approval: {
        status: 'not_requested'
      },
      reviews: {
        technical: 'not_performed',
        textual: 'not_performed',
        factual: 'not_performed',
        visualAI: 'not_performed',
        human: 'not_performed'
      }
    };
  }
  async function linkExisting(org, id, actor) {
    const c = await record(org, 'content', id);
    if (c.operationId) return await kernel.get(org, c.operationId);
    const job = await sourceJob(org, id);
    if (!job) throw new ProviderError('A origem desta entrega não está vinculada a uma execução criativa. Confira o histórico antes de continuar.', 'blocked');
    const payload = parse(job.payload);
    let op = payload.operationId ? await kernel.get(org, payload.operationId) : null;
    if (!op) {
      const thread = randomUUID(), now = Date.now();
      await db.prepare('INSERT INTO conversations VALUES(?,?,?,?,?)').run(thread, org, 'Produção das entregas criativas existentes', now, now);
      op = await kernel.register(org, job.user_id, thread, job.id, 'Finalizar as entregas criativas existentes, sem publicação.', {
        force: true
      });
      await db.prepare("UPDATE jobs SET payload=json_set(payload,'$.conversationId',?) WHERE org_id=? AND id=?").run(thread, org, job.id);
      await db.prepare('INSERT INTO conversation_messages VALUES(?,?,?,?,?,?,?,?)').run(randomUUID(), thread, org, 'assistant', 'A execução criativa original foi vinculada a esta conversa. Os textos e conceitos existentes foram preservados; não houve geração de imagem nem publicação.', '[]', job.id, now);
    }
    for (const aid of parse(job.output).recordIds || []) {
      const row = await db.prepare("SELECT data FROM records WHERE org_id=? AND id=? AND kind='content'").get(org, aid);
      if (row && !parse(row.data).operationId) await kernel.linkRecord(org, op.id, 'content', aid);
    }
    await audit(org, actor, 'Origem criativa vinculada sem duplicar entregas', op.id, job.id);
    return await kernel.get(org, op.id);
  }
  async function preflight(org, id, actor) {
    const before = await record(org, 'content', id);
    if (before.format !== 'image' || before.status === 'published') throw new ProviderError('Esta verificação é para uma entrega estática ainda não publicada.', 'blocked');
    if (await db.prepare("SELECT 1 FROM jobs WHERE org_id=? AND json_extract(payload,'$.contentId')=? AND state IN ('queued','working','waiting_provider','uncertain')").get(org, id)) throw new ProviderError('Acompanhe ou confira a tentativa existente antes de atualizar a produção.', 'blocked');
    await db.exec('SAVEPOINT studio_preflight');
    try {
      const op = await linkExisting(org, id, actor), result = await inspect(org, id), saved = await metadata(org, 'studio:' + id);
      const checkHash = digest({
        source: result.sourceHash,
        profile: (await company(org)).profile,
        materials: await metadata(org, 'brand:production'),
        executor: result.executor,
        decision: result.decision,
        blockers: result.blockers
      });
      if (saved.checkHash !== checkHash) {
        const version = (saved.version || 0) + 1, now = Date.now();
        const snapshot = {
          ...result,
          version,
          checkHash,
          checkedAt: now,
          checkedBy: actor,
          briefing: {
            sourceVersion: before.version,
            ...contentSource(before)
          }
        };
        await saveMetadata(org, 'studio:' + id + ':v' + version, snapshot);
        await saveMetadata(org, 'studio:' + id, snapshot);
        let task = (await list(org, 'tasks')).find(t => t.productionContentId === id);
        const description = result.blockers.map(b => b.message).join('\n\n');
        if (!task) {
          task = await saveRecord(org, 'tasks', {
            title: 'Produzir peça visual: ' + before.title,
            description,
            status: 'todo',
            campaignId: before.campaignId || ''
          }, actor);
          await systemUpdate(org, 'tasks', task.id, {
            productionContentId: id,
            kernelStep: 'studio:' + id
          });
          await kernel.linkRecord(org, op.id, 'tasks', task.id);
        } else await systemUpdate(org, 'tasks', task.id, {
          description
        });
        await kernel.persist(org, op.id, {
          production: {
            contentId: id,
            state: result.state,
            version,
            sourceHash: result.sourceHash
          },
          approval: {
            status: 'pending'
          },
          executionAuthorization: null
        });
        await kernel.transition(org, op.id, 'blocked', result.blockers[0].message, {
          blockers: result.blockers,
          result: {
            ...op.result,
            summary: result.blockers[0].message
          }
        });
        await kernel.evidence(org, op.id, {
          status: 'recorded',
          executor: 'local',
          channel: result.executor.provider,
          message: 'Verificação local da entrega existente. Nenhuma geração iniciada.',
          evidence: {
            type: 'studio_preflight',
            contentId: id,
            sourceJobId: result.sourceJobId,
            version,
            sourceHash: result.sourceHash,
            missing: result.blockers.flatMap(b => b.missing || []),
            state: result.state
          }
        }, op.rootJobId);
        await db.prepare('INSERT INTO conversation_messages VALUES(?,?,?,?,?,?,?,?)').run(randomUUID(), op.threadId, org, 'assistant', result.blockers.map(b => b.message).join('\n\n'), '[]', op.rootJobId, now);
        await audit(org, actor, 'Produção visual bloqueada por dependências comprovadas', id, result.state);
      } else if (op.state === 'blocked' && JSON.stringify(op.blockers) !== JSON.stringify(result.blockers)) {
        await kernel.transition(org, op.id, 'blocked', result.blockers[0].message, {
          blockers: result.blockers,
          result: {
            ...op.result,
            summary: result.blockers[0].message
          }
        });
      }
      await db.exec('RELEASE studio_preflight');
      return await inspect(org, id);
    } catch (error) {
      await db.exec('ROLLBACK TO studio_preflight');
      await db.exec('RELEASE studio_preflight');
      throw error;
    }
  }
  async function saveMaterials(org, input, actor) {
    if (input.confirmed !== true) throw new ProviderError('Confirme que estes são os materiais oficiais aprovados da empresa.', 'blocked');
    const logo = await fileEvidence(org, input.logoAssetId, ['image/png', 'image/jpeg', 'image/webp']), font = await fileEvidence(org, input.fontAssetId, ['font/woff2', 'font/ttf', 'font/otf']);
    if (!logo || !font) throw new ProviderError('Selecione o logo e a fonte entre os arquivos desta empresa.', 'blocked');
    if (!['background', 'foreground', 'accent'].every(k => (/^#[\da-f]{6}$/i).test(input.colors?.[k] || ''))) throw new ProviderError('Informe os três códigos de cor no formato #RRGGBB.', 'blocked');
    if (typeof input.fontFamily !== 'string' || !input.fontFamily.trim() || input.fontFamily.length > 100) throw new ProviderError('Informe o nome da família tipográfica oficial.', 'blocked');
    const value = {
      logoAssetId: logo.id,
      logoHash: logo.hash,
      fontAssetId: font.id,
      fontHash: font.hash,
      fontFamily: input.fontFamily.trim(),
      colors: Object.fromEntries(['background', 'foreground', 'accent'].map(k => [k, input.colors[k]])),
      confirmedBy: actor,
      confirmedAt: Date.now()
    };
    await db.exec('SAVEPOINT studio_materials');
    try {
      await saveMetadata(org, 'brand:production', value);
      await audit(org, actor, 'Materiais oficiais de produção registrados', 'brand:production');
      for (const c of await list(org, 'content')) if ((await metadata(org, 'studio:' + c.id)).version) await preflight(org, c.id, actor);
      await db.exec('RELEASE studio_materials');
      return value;
    } catch (error) {
      await db.exec('ROLLBACK TO studio_materials');
      await db.exec('RELEASE studio_materials');
      throw error;
    }
  }
  async function saveDecision(org, id, input, actor, {source = 'portal', reference = 'Decisão humana no Estúdio'} = {}) {
    const c = await record(org, 'content', id);
    if (c.format !== 'image' || !c.operationId) throw new ProviderError('Use a entrega de imagem vinculada à ordem existente.', 'blocked');
    if (input.confirmed !== true || input.provider !== 'openai' || typeof input.text !== 'string' || !input.text.trim() || input.text.length > 2000 || input.cta !== '' || typeof input.artDirection !== 'string' || !input.artDirection.trim() || input.artDirection.length > 8000 || !Array.isArray(input.prohibitedElements) || input.prohibitedElements.some(v => typeof v !== 'string' || v.length > 200)) throw new ProviderError('Confirme o texto, a remoção do CTA e a direção de arte fornecidos pelo usuário.', 'blocked');
    if (await db.prepare("SELECT 1 FROM jobs WHERE org_id=? AND json_extract(payload,'$.contentId')=? AND state IN ('queued','working','waiting_provider','uncertain')").get(org, id)) throw new ProviderError('Confira a tentativa existente antes de alterar a especificação.', 'blocked');
    const value = {
      text: input.text.trim(),
      cta: '',
      artDirection: input.artDirection.trim(),
      prohibitedElements: input.prohibitedElements,
      provider: 'openai'
    }, previous = await metadata(org, 'studio:decision:' + id), hash = digest(value);
    if (previous.hash === hash) return await inspect(org, id);
    await db.exec('SAVEPOINT studio_decision');
    try {
      const version = (previous.version || 0) + 1, decision = {
        ...value,
        hash,
        version,
        confirmedAt: Date.now(),
        source,
        reference,
        recordedBy: actor,
        approvalScope: 'creative_direction_only'
      };
      await saveMetadata(org, 'studio:decision:' + id + ':v' + version, decision);
      await saveMetadata(org, 'studio:decision:' + id, decision);
      const op = await kernel.get(org, c.operationId);
      await kernel.evidence(org, op.id, {
        status: 'recorded',
        executor: 'user',
        channel: 'openai',
        message: 'Decisão humana registrada: texto final, remoção do CTA e direção da imagem-base. Não é aprovação de uma peça final.',
        evidence: {
          type: 'creative_decision',
          contentId: id,
          version,
          hash,
          source,
          reference,
          recordedBy: actor
        }
      }, op.rootJobId);
      await audit(org, actor, 'Decisão criativa registrada na entrega existente', id, hash);
      const result = await preflight(org, id, actor);
      await db.exec('RELEASE studio_decision');
      return result;
    } catch (error) {
      await db.exec('ROLLBACK TO studio_decision');
      await db.exec('RELEASE studio_decision');
      throw error;
    }
  }
  async function checkOpenAI(org, id, actor) {
    const before = await inspect(org, id);
    if (before.executor.provider !== 'openai') throw new ProviderError('Esta entrega não selecionou OpenAI para produção.', 'blocked');
    if (before.executor.access?.status === 'model_accessible' && Date.now() - before.executor.access.completedAt < 86400000) return before;
    const revision = (await db.prepare("SELECT updated_at FROM integrations WHERE org_id=? AND provider='openai'").get(org))?.updated_at;
    const result = {
      ...await providers.imageAccess(await integration(org, 'openai')),
      credentialRevision: revision
    };
    if (revision !== (await db.prepare("SELECT updated_at FROM integrations WHERE org_id=? AND provider='openai'").get(org))?.updated_at) throw new ProviderError('A credencial mudou durante a consulta. Confira o acesso novamente.', 'blocked');
    await saveMetadata(org, 'studio:openai-access', result);
    await audit(org, actor, 'Acesso ao modelo de imagem: ' + result.status, id, result.requestId || '');
    return await preflight(org, id, actor);
  }
  async function stageCandidates(org, id, {logo, font, colors, fontFamily, sources}, actor) {
    const c = await record(org, 'content', id);
    if (!c.operationId) throw new ProviderError('Use a entrega existente.', 'blocked');
    if (!['background', 'foreground', 'accent'].every(k => (/^#[\da-f]{6}$/i).test(colors?.[k] || ''))) throw new ProviderError('As cores candidatas precisam de origem e valores exatos.', 'blocked');
    const key = digest({
      logo: digest(logo.bytes),
      font: digest(font.bytes),
      colors,
      fontFamily,
      sources
    }), previous = await metadata(org, 'brand:candidates');
    if (previous.hash === key) {
      if ((await fileEvidence(org, previous.logoAssetId, ['image/png', 'image/jpeg', 'image/webp']))?.hash !== previous.logoHash || (await fileEvidence(org, previous.fontAssetId, ['font/ttf', 'font/woff2', 'font/otf']))?.hash !== previous.fontHash) throw new ProviderError('Os arquivos candidatos mudaram ou estão ausentes. Confira a biblioteca antes de importar novamente.', 'blocked');
      return previous;
    }
    if (!assetType(logo.bytes)?.[0].startsWith('image/') || !assetType(font.bytes)?.[0].startsWith('font/')) throw new ProviderError('Os candidatos precisam ser um logo e um arquivo de fonte reconhecidos.', 'blocked');
    const logoAsset = await storeAsset(org, logo.name, logo.bytes), fontAsset = await storeAsset(org, font.name, font.bytes);
    const value = {
      logoAssetId: logoAsset.id,
      fontAssetId: fontAsset.id,
      logoHash: digest(logo.bytes),
      fontHash: digest(font.bytes),
      colors,
      fontFamily,
      sources,
      hash: key,
      status: 'awaiting_human_confirmation',
      foundAt: Date.now(),
      recordedBy: actor,
      contentId: id
    };
    await saveMetadata(org, 'brand:candidates', value);
    await audit(org, actor, 'Materiais candidatos localizados; oficialidade pendente', id, key);
    return value;
  }
  return {
    inspect,
    preflight,
    saveMaterials,
    saveDecision,
    checkOpenAI,
    stageCandidates
  };
}
