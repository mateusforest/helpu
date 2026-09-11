import fs from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {ProviderError} from './providers.mjs';

const parse = value => value ? JSON.parse(value) : {};
const digest = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
const contentSource = c => ({title:c.title,caption:c.caption,visualPrompt:c.visualPrompt,format:c.format,channel:c.channel,campaignId:c.campaignId||null});

// The existing scheduler calls this before reserving intelligence or creating a job.
export function dailyPriority({contents=[],operations=[],tasks=[],jobs=[]}) {
  const active = jobs.filter(j=>!String(j.idempotency_key||'').startsWith('daily-director:')&&['queued','working','waiting_provider','uncertain'].includes(j.state));
  const pending = contents.filter(c=>c.status!=='published'&&['draft','review','approved','scheduled'].includes(c.status));
  const orders = operations.filter(o=>!['completed','learned','cancelled'].includes(o.state));
  const unmeasured = operations.filter(o=>o.state==='completed'&&!o.result?.measurement);
  const openTasks = tasks.filter(t=>t.status!=='done');
  const hold = active.length||pending.length||orders.length||unmeasured.length||openTasks.length;
  return {status:hold?'pending_work':'new_front_allowed',intelligenceRequired:!hold,
    message:active.length?'Acompanhar as execuções em andamento ou conferir os resultados incertos.':pending.length?`${pending.length} entrega(s) existente(s) aguardam produção, revisão, aprovação ou execução. Conclua essas entregas antes de criar novas ideias.`:orders.length?'Resolver os bloqueios e concluir as ordens em andamento.':unmeasured.length?'Conferir os resultados das operações realizadas antes de iniciar uma nova frente.':openTasks.length?'Concluir as tarefas abertas antes de iniciar uma nova frente.':'Nenhum trabalho pendente encontrado. A direção pode planejar uma nova frente.',
    contentIds:pending.map(c=>c.id),operationIds:[...new Set([...orders,...unmeasured].map(o=>o.id))],jobIds:active.map(j=>j.id),taskIds:openTasks.map(t=>t.id)};
}

export function createStudio({db,company,record,list,saveRecord,systemUpdate,kernel,metadata,saveMetadata,integrationState,assetPath,audit}) {
  function sourceJob(org,id) {
    return db.prepare("SELECT j.* FROM jobs j WHERE j.org_id=? AND j.kind='agent' AND EXISTS (SELECT 1 FROM json_each(j.output,'$.recordIds') WHERE value=?) ORDER BY j.created_at LIMIT 1").get(org,id);
  }
  function fileEvidence(org,id,mimes) {
    if(!id)return null;
    const asset=db.prepare('SELECT id,mime,size,name FROM assets WHERE org_id=? AND id=?').get(org,id);
    if(!asset||!mimes.includes(asset.mime))return null;
    try {const bytes=fs.readFileSync(assetPath(org,id));if(bytes.length!==asset.size||!bytes.length)return null;return {...asset,hash:digest(bytes)};}catch{return null;}
  }
  function inspect(org,id) {
    const c=record(org,'content',id),brand=company(org),materials=metadata(org,'brand:production'),saved=metadata(org,'studio:'+id),connection=integrationState(org).find(i=>i.id==='higgsfield');
    const logo=fileEvidence(org,materials.logoAssetId,['image/png','image/jpeg','image/webp']);
    const font=fileEvidence(org,materials.fontAssetId,['font/woff2','font/ttf','font/otf']);
    const missing=[];
    const need=(field,material,why,where)=>missing.push({field,material,why,where});
    if(!logo||logo.hash!==materials.logoHash||!materials.confirmedBy)need('logo','Logotipo oficial e confirmação da versão','Aplicar a marca sem inventar ou redesenhar o símbolo.','Estúdio → Enviar arquivo; depois Materiais oficiais → selecionar o logo em PNG, JPEG ou WebP.');
    if(!['background','foreground','accent'].every(k=>/^#[\da-f]{6}$/i.test(materials.colors?.[k]||'')))need('palette','Paleta exata: fundo, texto e destaque','“Verde” não identifica a cor institucional.','Estúdio → Materiais oficiais → informar os três códigos hexadecimais.');
    if(!font||font.hash!==materials.fontHash||!materials.fontFamily)need('font','Arquivo da fonte oficial e nome da família','A referência à Geist não comprova que a fonte está disponível para composição.','Estúdio → Enviar arquivo; depois Materiais oficiais → selecionar WOFF2, TTF ou OTF e informar sua família.');
    const blockers=[];
    if(missing.length)blockers.push({code:'blocked_missing_brand_assets',message:'Faltam materiais oficiais: '+missing.map(m=>m.material).join('; ')+'.',missing});
    const configured=!!connection?.configuredFields?.keyId&&!!connection?.configuredFields?.keySecret;
    const validated=configured&&connection?.validation?.status==='executor_validated';
    if(!configured)blockers.push({code:'blocked_higgsfield_not_configured',message:'Abra Integrações → Higgsfield → Configurar e salve o identificador e o segredo da API. Credencial salva ainda exige validação real do executor.'});
    else if(!validated)blockers.push({code:'blocked_higgsfield_executor_unvalidated',message:'As credenciais do Higgsfield estão salvas, mas ainda não existe evidência de geração e acompanhamento por esse executor.'});
    // The existing adapter generates media; it does not implement the final composition contract.
    blockers.push({code:'blocked_production_review_required',message:'Confirme o texto final, o uso ou remoção de “Saiba como” e a direção da imagem-base. Depois dos materiais e do executor, a composição e suas revisões precisam ser validadas antes da aprovação humana.'});
    const source=contentSource(c),sourceHash=digest(source);
    const specification={objective:c.title,audience:brand.profile.audience||null,centralMessage:c.caption||null,
      artDirection:c.visualPrompt||null,composition:'Preservar a composição descrita no briefing original; alterações exigem nova versão.',
      format:'static_image',width:1080,height:1080,count:1,allowedMime:['image/png','image/jpeg'],
      exactText:{source:c.caption||'',status:'requires_human_confirmation'},logo,colors:materials.colors||null,
      typography:font?{family:materials.fontFamily,asset:font}:null,margins:{status:'requires_production_specification'},safeArea:{status:'requires_production_specification'},
      hierarchy:c.visualPrompt||'',requiredElements:['Logo oficial proporcional','Texto confirmado','Identidade oficial da empresa'],
      prohibitedElements:['Logo inventado','Fontes substitutas sem aprovação','Cores presumidas','Fatos comerciais não fornecidos','Textos gerados dentro da imagem-base','Carrossel','Vídeo','Música'],
      restrictions:brand.profile.restrictions||null,references:brand.profile.visualIdentity||null,
      technicalCriteria:['Arquivo íntegro','1080 × 1080 px','PNG ou JPEG','Hash e versão','Texto e logo dentro da área segura'],
      approvalCriteria:['Revisão técnica','Revisão textual e factual','Revisão visual','Aprovação humana da versão e hash exatos'],
      state:'incomplete_external_dependencies'};
    return {contentId:id,companyId:org,operationId:c.operationId||null,campaignId:c.campaignId||null,
      sourceJobId:sourceJob(org,id)?.id||null,sourceVersion:c.version,sourceHash,
      state:blockers[0].code,blockers,executor:{provider:'higgsfield',path:'api',state:validated?'executor_validated':configured?'configured_unvalidated':'not_configured',account:null},
      specification,storedVersion:saved.version||null,stale:!!saved.sourceHash&&saved.sourceHash!==sourceHash,
      generation:null,baseAsset:null,finalAsset:null,approval:{status:'not_requested'},
      reviews:{technical:'not_performed',textual:'not_performed',factual:'not_performed',visualAI:'not_performed',human:'not_performed'}};
  }
  function linkExisting(org,id,actor) {
    const c=record(org,'content',id);if(c.operationId)return kernel.get(org,c.operationId);
    const job=sourceJob(org,id);if(!job)throw new ProviderError('A origem desta entrega não está vinculada a uma execução criativa. Confira o histórico antes de continuar.','blocked');
    const payload=parse(job.payload);let op=payload.operationId?kernel.get(org,payload.operationId):null;
    if(!op){
      const thread=randomUUID(),now=Date.now();
      db.prepare('INSERT INTO conversations VALUES(?,?,?,?,?)').run(thread,org,'Produção das entregas criativas existentes',now,now);
      op=kernel.register(org,job.user_id,thread,job.id,'Finalizar as entregas criativas existentes, sem publicação.',{force:true});
      db.prepare("UPDATE jobs SET payload=json_set(payload,'$.conversationId',?) WHERE org_id=? AND id=?").run(thread,org,job.id);
      db.prepare('INSERT INTO conversation_messages VALUES(?,?,?,?,?,?,?,?)').run(randomUUID(),thread,org,'assistant','A execução criativa original foi vinculada a esta conversa. Os textos e conceitos existentes foram preservados; não houve geração de imagem nem publicação.','[]',job.id,now);
    }
    for(const aid of parse(job.output).recordIds||[]) {
      const row=db.prepare("SELECT data FROM records WHERE org_id=? AND id=? AND kind='content'").get(org,aid);
      if(row&&!parse(row.data).operationId)kernel.linkRecord(org,op.id,'content',aid);
    }
    audit(org,actor,'Origem criativa vinculada sem duplicar entregas',op.id,job.id);
    return kernel.get(org,op.id);
  }
  function preflight(org,id,actor) {
    const before=record(org,'content',id);if(before.format!=='image'||before.status==='published')throw new ProviderError('Esta verificação é para uma entrega estática ainda não publicada.','blocked');
    if(db.prepare("SELECT 1 FROM jobs WHERE org_id=? AND json_extract(payload,'$.contentId')=? AND state IN ('queued','working','waiting_provider','uncertain')").get(org,id))throw new ProviderError('Acompanhe ou confira a tentativa existente antes de atualizar a produção.','blocked');
    db.exec('SAVEPOINT studio_preflight');
    try {
      const op=linkExisting(org,id,actor),result=inspect(org,id),saved=metadata(org,'studio:'+id);
      const checkHash=digest({source:result.sourceHash,profile:company(org).profile,materials:metadata(org,'brand:production'),executor:result.executor,blockers:result.blockers});
      if(saved.checkHash!==checkHash){
        const version=(saved.version||0)+1,now=Date.now();
        const snapshot={...result,version,checkHash,checkedAt:now,checkedBy:actor,briefing:{sourceVersion:before.version,...contentSource(before)}};
        saveMetadata(org,'studio:'+id+':v'+version,snapshot);saveMetadata(org,'studio:'+id,snapshot);
        let task=list(org,'tasks').find(t=>t.productionContentId===id);
        const description=result.blockers.map(b=>b.message).join('\n\n');
        if(!task){task=saveRecord(org,'tasks',{title:'Produzir peça visual: '+before.title,description,status:'todo',campaignId:before.campaignId||''},actor);systemUpdate(org,'tasks',task.id,{productionContentId:id,kernelStep:'studio:'+id});kernel.linkRecord(org,op.id,'tasks',task.id);}
        else systemUpdate(org,'tasks',task.id,{description});
        kernel.persist(org,op.id,{production:{contentId:id,state:result.state,version,sourceHash:result.sourceHash},approval:{status:'pending'},executionAuthorization:null});
        kernel.transition(org,op.id,'blocked',result.blockers[0].message,{blockers:result.blockers,result:{...op.result,summary:result.blockers[0].message}});
        kernel.evidence(org,op.id,{status:'recorded',executor:'local',channel:'higgsfield',message:'Verificação local da entrega existente. Nenhuma geração iniciada.',evidence:{type:'studio_preflight',contentId:id,sourceJobId:result.sourceJobId,version,sourceHash:result.sourceHash,missing:result.blockers.flatMap(b=>b.missing||[]),state:result.state}},op.rootJobId);
        db.prepare('INSERT INTO conversation_messages VALUES(?,?,?,?,?,?,?,?)').run(randomUUID(),op.threadId,org,'assistant',result.blockers.map(b=>b.message).join('\n\n'),'[]',op.rootJobId,now);
        audit(org,actor,'Produção visual bloqueada por dependências comprovadas',id,result.state);
      }else if(op.state==='blocked'&&JSON.stringify(op.blockers)!==JSON.stringify(result.blockers)){
        kernel.transition(org,op.id,'blocked',result.blockers[0].message,{blockers:result.blockers,result:{...op.result,summary:result.blockers[0].message}});
      }
      db.exec('RELEASE studio_preflight');return inspect(org,id);
    }catch(error){db.exec('ROLLBACK TO studio_preflight');db.exec('RELEASE studio_preflight');throw error;}
  }
  function saveMaterials(org,input,actor) {
    if(input.confirmed!==true)throw new ProviderError('Confirme que estes são os materiais oficiais aprovados da empresa.','blocked');
    const logo=fileEvidence(org,input.logoAssetId,['image/png','image/jpeg','image/webp']),font=fileEvidence(org,input.fontAssetId,['font/woff2','font/ttf','font/otf']);
    if(!logo||!font)throw new ProviderError('Selecione o logo e a fonte entre os arquivos desta empresa.','blocked');
    if(!['background','foreground','accent'].every(k=>/^#[\da-f]{6}$/i.test(input.colors?.[k]||'')))throw new ProviderError('Informe os três códigos de cor no formato #RRGGBB.','blocked');
    if(typeof input.fontFamily!=='string'||!input.fontFamily.trim()||input.fontFamily.length>100)throw new ProviderError('Informe o nome da família tipográfica oficial.','blocked');
    const value={logoAssetId:logo.id,logoHash:logo.hash,fontAssetId:font.id,fontHash:font.hash,fontFamily:input.fontFamily.trim(),colors:Object.fromEntries(['background','foreground','accent'].map(k=>[k,input.colors[k]])),confirmedBy:actor,confirmedAt:Date.now()};
    db.exec('SAVEPOINT studio_materials');
    try{
      saveMetadata(org,'brand:production',value);audit(org,actor,'Materiais oficiais de produção registrados','brand:production');
      for(const c of list(org,'content'))if(metadata(org,'studio:'+c.id).version)preflight(org,c.id,actor);
      db.exec('RELEASE studio_materials');return value;
    }catch(error){db.exec('ROLLBACK TO studio_materials');db.exec('RELEASE studio_materials');throw error;}
  }
  return {inspect,preflight,saveMaterials};
}
