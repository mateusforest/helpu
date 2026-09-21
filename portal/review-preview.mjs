import {createHash} from 'node:crypto';
import fs from 'node:fs';
const parse=v=>v?JSON.parse(v):{};
const fail=()=>{throw Object.assign(new Error('A prévia protegida ainda não está disponível. Tente novamente ou solicite ajuda; o original é liberado após a aprovação.'),{status:409});};
export function createReviewPreview({db,metadata,storeAsset,assetPath,renderer}){
 const running=new Map();
 async function source(asset){const children=await db.prepare("SELECT payload,output FROM jobs WHERE org_id=? AND kind IN ('image','video') AND (json_extract(output,'$.assetId')=? OR json_extract(output,'$.previewAssetId')=?)").all(asset.org_id,asset.id,asset.id);for(const child of children){const id=parse(child.payload).creationId;if(!id)continue;const parent=await db.prepare("SELECT payload FROM jobs WHERE org_id=? AND id=? AND kind='creation'").get(asset.org_id,id);if(parse(parent?.payload).approvalRequired)return {creationId:id,originalId:parse(child.output).assetId};}return null;}
 async function resolve(asset){const linked=await source(asset);if(!linked)return asset;const review=await metadata(asset.org_id,'creation-review:'+linked.creationId);if(review.status==='approved'||review.approvedAt)return asset;
  const key=linked.originalId;if(running.has(key))return running.get(key);
  const work=(async()=>{const h=createHash('sha256').update('review-v1:'+key).digest('hex'),id=[h.slice(0,8),h.slice(8,12),h.slice(12,16),h.slice(16,20),h.slice(20,32)].join('-');const saved=await db.prepare('SELECT * FROM assets WHERE org_id=? AND id=?').get(asset.org_id,id);if(saved)return saved;
   const original=await db.prepare('SELECT * FROM assets WHERE org_id=? AND id=?').get(asset.org_id,key);if(!original||!renderer.reviewPreview)fail();let bytes;try{bytes=await renderer.reviewPreview({bytes:fs.readFileSync(await assetPath(asset.org_id,key)),mime:original.mime});}catch{fail();}
   await storeAsset(asset.org_id,'Prévia para aprovação'+(original.mime==='video/mp4'?'.mp4':'.png'),bytes,'helpu:review-preview',id);return db.prepare('SELECT * FROM assets WHERE org_id=? AND id=?').get(asset.org_id,id);
  })();running.set(key,work);try{return await work;}finally{running.delete(key);}
 }
 return {resolve};
}
