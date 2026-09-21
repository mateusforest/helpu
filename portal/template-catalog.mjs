import {randomUUID} from 'node:crypto';
import fs from 'node:fs';
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
export const TEMPLATE_SECTORS=['Bebidas e adegas','Imobiliárias e corretores','Restaurantes e alimentação','Varejo e comércio','Beleza e estética','Saúde','Serviços profissionais','Construção e arquitetura','Agronegócio','Automotivo','Logística e transportes','Turismo e hospedagem','Educação','Esportes e lazer','Tecnologia','Eventos','Indústria','Pets','Setor público','Outros'];
export function createTemplateCatalog({db,operator,access,storeAsset,assetPath,creativeLibrary}){
 const decode=r=>r?{...JSON.parse(r.data),id:r.id,orgId:r.org_id,version:r.version}:null;
 const read=async id=>decode(await db.prepare("SELECT * FROM records WHERE kind='shared_template' AND id=?").get(id));
 const authorize=user=>{if(!operator(user))fail('Acesso restrito à equipe Helpu.',403);};
 async function list(user,admin=false){if(admin)authorize(user);const rows=(await db.prepare("SELECT * FROM records WHERE kind='shared_template' ORDER BY updated_at DESC LIMIT 500").all()).map(decode).filter(t=>admin||t.state==='published');return {sectors:TEMPLATE_SECTORS,templates:rows.map(t=>({...t,assetUrl:'/api/portal/files/'+t.assetId}))};}
 async function action(user,d){authorize(user);if(d.action==='save'){
  const old=d.id?await read(d.id):null;if(d.id&&!old)fail('Template não encontrado.',404);const org=old?.orgId||d.orgId;await access(org,user);
  const a=await db.prepare('SELECT id,mime FROM assets WHERE org_id=? AND id=?').get(org,d.assetId);if(!a||!['image/png','image/jpeg','image/webp','video/mp4'].includes(a.mime))fail('Escolha uma imagem ou vídeo MP4 da empresa de origem.');
  const name=String(d.name||'').trim().slice(0,100),sectors=[...new Set((Array.isArray(d.sectors)?d.sectors:[]).map(s=>String(s).trim().slice(0,80)).filter(Boolean))];if(!name||!sectors.length||sectors.length>5)fail('Informe nome e até cinco setores.');
  const state=['draft','published','archived'].includes(d.state)?d.state:'draft',data={name,sectors,state,assetId:a.id,format:a.mime==='video/mp4'?'video':'image',description:String(d.description||'').trim().slice(0,3000),by:user.id,updatedAt:Date.now()},id=old?.id||randomUUID();
  if(old){const result=await db.prepare("UPDATE records SET data=?,updated_at=?,version=version+1 WHERE id=? AND kind='shared_template' AND version=? RETURNING id").get(JSON.stringify(data),Date.now(),id,d.version);if(!result)fail('O template mudou. Atualize a biblioteca.',409);}else await db.prepare("INSERT INTO records(id,org_id,kind,data,created_at,updated_at) VALUES(?,?,'shared_template',?,?,?)").run(id,org,JSON.stringify(data),Date.now(),Date.now());return read(id);
 }fail('Ação não reconhecida.');}
 async function canReadAsset(user,asset){const rows=await db.prepare("SELECT data FROM records WHERE kind='shared_template' AND json_extract(data,'$.assetId')=?").all(asset.id);return !!user&&rows.some(r=>operator(user)||JSON.parse(r.data).state==='published');}
 async function adopt(org,user,id){await access(org,user);const t=await read(id);if(!t||t.state!=='published')fail('Template indisponível.',404);const key='shared-template:'+id+':'+t.assetId,existing=await db.prepare("SELECT data FROM records WHERE org_id=? AND kind='connection_validation' AND external_id=?").get(org,key);if(existing){const a=JSON.parse(existing.data);await creativeLibrary.classify(org,user.id,{assetId:a.assetId,role:'reference',notes:t.description});return a;}
  const source=await db.prepare('SELECT name FROM assets WHERE org_id=? AND id=?').get(t.orgId,t.assetId);if(!source)fail('Arquivo indisponível.',404);
  const a=await storeAsset(org,'Referência — '+source.name,fs.readFileSync(await assetPath(t.orgId,t.assetId)));await creativeLibrary.classify(org,user.id,{assetId:a.id,role:'reference',notes:t.description});const data={assetId:a.id,templateId:id},now=Date.now();await db.prepare("INSERT INTO records(id,org_id,kind,data,external_id,created_at,updated_at) VALUES(?,?,'connection_validation',?,?,?,?) ON CONFLICT(org_id,kind,external_id) DO NOTHING").run(randomUUID(),org,JSON.stringify(data),key,now,now);return data;
 }
 return {list,action,canReadAsset,adopt};
}
