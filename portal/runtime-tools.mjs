import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {ProviderError} from './providers.mjs';
import {runtimeId} from './cloud-runtime.mjs';

const parse=v=>v?JSON.parse(v):{};
const fail=(text,status=409)=>{throw Object.assign(new ProviderError(text,'blocked'),{status});};
const jobView=row=>({id:row.id,projectId:parse(row.payload).projectId,revision:parse(row.payload).revision,state:({queued:'queued',working:'working',waiting_provider:'working',succeeded:'complete'})[row.state]||'failed',error:row.error||null,assetId:parse(row.output).assetId||null,url:parse(row.output).url||null});

export function createRuntimeTools({runtime,db,assetPath,storeAsset,saveRecord,record,metadata,saveMetadata,queue,systemUpdate,setJob,beforeMutation}){
  async function source(org,assetId,kind='video'){
    runtimeId(assetId);const a=await db.prepare('SELECT id,name,mime,size FROM assets WHERE id=? AND org_id=?').get(assetId,org);
    if(!a||(kind==='video'?a.mime!=='video/mp4':!['video/mp4','image/png','image/jpeg','image/webp'].includes(a.mime)))fail('Escolha um arquivo compatível da Biblioteca desta empresa.',404);
    if(a.size>50*1024*1024)fail('O arquivo excede 50 MB.',413);
    const bytes=await fs.readFile(await assetPath(org,assetId));
    return runtime.request(org,'/'+kind+'/assets/'+assetId,{method:'PUT',bytes,name:a.name});
  }
  async function prepareSources(org,data){
    const ids=[data.sourceAssetId,...(data.scenes||[]).map(s=>s.sourceAssetId),...(data.operations||[]).map(s=>s.scene?.sourceAssetId||s.changes?.sourceAssetId)].filter(Boolean);
    for(const id of new Set(ids))await source(org,id);
    return data;
  }
  async function project(org,id){
    const p=await runtime.request(org,'/video/projects/'+runtimeId(id));
    const recent=await db.prepare("SELECT * FROM jobs WHERE org_id=? AND kind='video' AND json_extract(payload,'$.projectId')=? ORDER BY created_at DESC LIMIT 1").get(org,id);
    return {...p,latestExport:recent?jobView(recent):null};
  }
  async function create(org,data){
    if(data.sourceAssetId)data={...data,sourceAsset:data.sourceAssetId,scenes:data.scenes?.length?data.scenes.map((s,i)=>i===0?{...s,sourceAssetId:data.sourceAssetId}:s):undefined};
    return runtime.request(org,'/video/projects',{method:'POST',data:await prepareSources(org,data)});
  }
  async function update(org,id,data){return runtime.request(org,'/video/projects/'+runtimeId(id),{method:'PATCH',data:await prepareSources(org,data)});}
  async function contentFor(org,p,user){
    const key='runtime-video:'+p.id+':'+p.revision,stored=await metadata(org,key);
    if(stored.contentId){await record(org,'content',stored.contentId);return stored.contentId;}
    const existing=await db.prepare("SELECT id FROM records WHERE org_id=? AND kind='content' AND external_id=?").get(org,key);
    if(existing)return existing.id;
    let content;try{content=await saveRecord(org,'content',{title:p.name,caption:'',format:'video',channel:'instagram',status:'draft',notes:'Projeto Astra Vídeo: '+p.id},user,null,false,key);}catch(e){const concurrent=await db.prepare("SELECT id FROM records WHERE org_id=? AND kind='content' AND external_id=?").get(org,key);if(!concurrent)throw e;content=concurrent;}
    await saveMetadata(org,key,{contentId:content.id});return content.id;
  }
  async function enqueue(org,user,projectId,{revision,idempotencyKey,parentJobId}={}){
    const p=await project(org,projectId);
    if(!Number.isInteger(revision)||p.revision!==revision)fail('O projeto mudou. Salve e confira a versão atual antes de exportar.');
    if(typeof idempotencyKey!=='string'||idempotencyKey.length<8||idempotencyKey.length>140)fail('Identificador da exportação inválido.');
    const previous=await db.prepare('SELECT * FROM jobs WHERE org_id=? AND idempotency_key=?').get(org,'astra-video:'+idempotencyKey);
    if(previous){const payload=parse(previous.payload);if(previous.kind!=='video'||payload.provider!=='astra-runtime'||payload.projectId!==projectId||payload.revision!==revision)fail('Este pedido já foi usado para outra versão de vídeo.');return {id:previous.id,state:previous.state,payload};}
    const contentId=await contentFor(org,p,user);
    const job=await queue(org,user,'video',{provider:'astra-runtime',projectId,revision,contentId,...(parentJobId?{parentJobId}:{})},null,'astra-video:'+idempotencyKey,{explicitVideo:true});
    if(job.payload.projectId!==projectId||job.payload.revision!==revision)fail('Já existe uma exportação de outra versão em andamento. Aguarde antes de exportar novamente.');
    return job;
  }
  async function ownedJob(org,id){
    const row=await db.prepare("SELECT * FROM jobs WHERE id=? AND org_id=? AND kind='video'").get(runtimeId(id),org);
    if(!row||parse(row.payload).provider!=='astra-runtime')fail('Exportação não encontrada.',404);
    return row;
  }
  async function run(job){
    const org=job.org_id,p=parse(job.payload),external=parse(job.external);let remote;
    if(!external.request_id){
      await beforeMutation(job);
      remote=await runtime.request(org,'/video/projects/'+runtimeId(p.projectId)+'/exports',{method:'POST',data:{revision:p.revision,idempotencyKey:job.id}});
      runtimeId(remote.id);
      await setJob(job.id,'waiting_provider',{external:{request_id:remote.id,provider:'astra-runtime'},scheduledAt:Date.now()+10000});
      return;
    }
    remote=await runtime.request(org,'/video/exports/'+runtimeId(external.request_id));
    if(remote.projectId!==p.projectId||remote.revision!==p.revision)fail('A exportação não corresponde ao projeto solicitado.');
    if(['queued','running'].includes(remote.status)){await setJob(job.id,'waiting_provider',{scheduledAt:Date.now()+10000});return;}
    if(remote.status!=='completed')fail(remote.error||'A exportação não foi concluída. Revise o projeto e tente novamente.');
    const out=remote.output;
    if(out?.mime!=='video/mp4'||!out.size||out.size>50*1024*1024||!/^[a-f\d]{64}$/.test(out.sha256||'')||!(out.duration>0))fail('O vídeo não tem uma verificação válida.');
    const bytes=await runtime.request(org,'/video/exports/'+remote.id+'/output',{limit:50*1024*1024});
    if(!Buffer.isBuffer(bytes)||bytes.length!==out.size||bytes.subarray(4,8).toString()!=='ftyp'||createHash('sha256').update(bytes).digest('hex')!==out.sha256)fail('O arquivo recebido não corresponde ao vídeo verificado.');
    const asset=await storeAsset(org,out.name||'astra-video.mp4',bytes,null,remote.id);
    const content=await record(org,'content',p.contentId);
    if(content.status==='published')fail('O conteúdo já foi publicado. O vídeo exportado está preservado na Biblioteca.');
    await systemUpdate(org,'content',p.contentId,{assetId:asset.id,mediaUrl:'',mediaType:'video',status:'review',scheduledAt:''});
    await setJob(job.id,'succeeded',{output:{assetId:asset.id,url:asset.url,summary:'O vídeo foi exportado e salvo na Biblioteca. Você pode assistir, editar ou preparar a publicação.',generation:{provider:'astra-runtime',projectId:p.projectId,revision:p.revision,sha256:out.sha256}}});
  }
  async function handle(req,res,org,parts,user,body,json){
    if(parts[3]!=='runtime')return false;
    res.setHeader('Cache-Control','private, no-store');
    const [, , , ,group,target,id,action]=parts;let value;
    if(group==='status'&&req.method==='GET')value=await runtime.status(org,{fresh:true});
    else if(group==='browser'){
      if(!target&&req.method==='GET')value=await runtime.request(org,'/browser');
      else if(['instagram','whatsapp','facebook','google'].includes(target)){
        if(id==='frame'&&req.method==='GET')value=await runtime.request(org,'/browser/'+target+'/frame',{actor:user.id});
        else if(['open','human','confirm','close'].includes(id)&&req.method==='POST')value=await runtime.request(org,'/browser/'+target+'/'+id,{method:'POST',data:await body(req),actor:user.id});
      }
    }else if(group==='video'){
      if(target==='projects'){
        if(!id&&req.method==='GET')value=await runtime.request(org,'/video/projects');
        else if(!id&&req.method==='POST')value=await create(org,await body(req));
        else if(id&&!action&&req.method==='GET')value=await project(org,id);
        else if(id&&!action&&req.method==='PATCH')value=await update(org,id,await body(req));
        else if(id&&action==='exports'&&req.method==='POST'){const job=await enqueue(org,user.id,id,await body(req));value=jobView(await ownedJob(org,job.id));}
      }else if(target==='exports'&&id){
        if(!action&&req.method==='GET')value=jobView(await ownedJob(org,id));
        else if(action==='import'&&req.method==='POST'){await body(req);const row=await ownedJob(org,id);if(row.state!=='succeeded')fail('O vídeo ainda está sendo preparado.');value={assetId:parse(row.output).assetId,url:parse(row.output).url};}
      }
    }
    if(value===undefined)fail('Recurso não encontrado.',404);json(res,200,value);return true;
  }
  const claims=new Map();
  const browser={
    list:async org=>(await runtime.request(org,'/browser')).profiles,
    claim(org,channel,jobId){claims.set(jobId,{org,channel});},
    async observe(org,channel,{jobId}={}){const found=claims.get(jobId);if(!found||found.org!==org||found.channel!==channel)fail('A observação precisa de uma execução autorizada.');return runtime.request(org,'/browser/'+channel+'/observe',{job:jobId});},
    async action(org,channel,args,jobId){
      if(args.op==='upload')await source(org,args.assetId,'browser');
      const type=({fill:'type',press:'key'})[args.op]||args.op;
      return runtime.request(org,'/browser/'+channel+'/act',{method:'POST',job:jobId,data:{type,snapshotToken:args.snapshotToken,ref:args.ref,text:args.text,key:args.op==='press'?args.text:undefined,dy:args.amount,url:args.url,sourceAssetId:args.assetId}});
    },
    async freeze(org,channel){const found=[...claims].find(([,x])=>x.org===org&&x.channel===channel);if(found)await runtime.request(org,'/browser/'+channel+'/freeze',{method:'POST',data:{},job:found[0]});},
    async release(jobId){const claim=claims.get(jobId);if(claim){claims.delete(jobId);await runtime.request(claim.org,'/browser/release',{method:'POST',job:jobId,data:{}}).catch(()=>{});}},
    async shutdown(){},
    async open(){fail('Abra a tela online em Minha empresa → Conexões → Telas das contas.');},
    async confirm(){fail('Confirme a conta na tela online.');},
    async close(){fail('Feche a sessão pela tela online.');},
    async executorStatus(){return {available:false,blocker:'A operação no navegador precisa ser verificada no canal.'};}
  };
  return {handle,run,project,create,update,enqueue,browser,list:org=>runtime.request(org,'/video/projects'),status:runtime.status,configured:runtime.configured};
}
