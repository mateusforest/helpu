import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

export const hashFile = bytes => createHash('sha256').update(bytes).digest('hex');
export function createStorage({url, key, directory, fetcher=fetch}) {
  const base=new URL(url);
  if(base.protocol!=='https:'||base.username||base.password||base.pathname!=='/')throw new Error('Invalid storage origin');
  fs.mkdirSync(directory,{recursive:true});
  const bucket='helpu-private';
  const objectKey=(org,file)=>{
    if(!/^[a-f\d-]{36}$/.test(org)||!/^[-\w]+\.[a-z\d]+$/i.test(file))throw new Error('Invalid private file identity');
    return org+'/'+file;
  };
  async function request(object,options={}) {
    const response=await fetcher(new URL('/storage/v1/object/'+bucket+'/'+object,base),{
      ...options,headers:{Authorization:'Bearer '+key,apikey:key,...options.headers},
      redirect:'error',signal:AbortSignal.timeout(30000),
    });
    if(!response.ok){const error=new Error('Não foi possível acessar o arquivo privado ('+response.status+').');error.status=503;throw error;}
    return response;
  }
  async function put(org,file,bytes,mime){
    const object=objectKey(org,file),hash=hashFile(bytes);
    await request(object,{method:'POST',headers:{'Content-Type':mime,'x-upsert':'false'},body:bytes});
    const actual=Buffer.from(await (await request(object)).arrayBuffer());
    if(actual.length!==bytes.length||hashFile(actual)!==hash)throw new Error('Private upload verification failed');
    return {bucket,path:object,hash};
  }
  async function sign(org,file,upload,expiresIn=60){
    const object=objectKey(org,file);
    const response=await fetcher(new URL('/storage/v1/object/'+(upload?'upload/sign/':'sign/')+bucket+'/'+object,base),{method:'POST',headers:{Authorization:'Bearer '+key,apikey:key,'Content-Type':'application/json'},body:JSON.stringify(upload?{}:{expiresIn}),redirect:'error',signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw new Error('Private file authorization failed');
    const data=await response.json();const target=new URL('/storage/v1'+(data.url||data.signedURL),base);
    if(target.origin!==base.origin||!target.pathname.startsWith('/storage/v1/object/'))throw new Error('Invalid private file URL');
    return target.href;
  }
  async function download(org,file,max=25*1024*1024){
    const response=await request(objectKey(org,file));
    if(Number(response.headers.get('content-length'))>max)throw new Error('Private file exceeds size limit');
    const chunks=[];let size=0;
    for await(const chunk of response.body){size+=chunk.length;if(size>max)throw new Error('Private file exceeds size limit');chunks.push(chunk);}
    return Buffer.concat(chunks);
  }
  async function localPath(asset){
    const object=objectKey(asset.org_id,asset.path);
    if(asset.storage_bucket!==bucket||asset.storage_path!==object||!asset.sha256)throw new Error('Private file has no verified storage reference');
    const local=path.join(directory,asset.sha256+'-'+asset.path);
    if(fs.existsSync(local)){const bytes=fs.readFileSync(local);if(bytes.length===asset.size&&hashFile(bytes)===asset.sha256)return local;}
    const response=await request(object),bytes=Buffer.from(await response.arrayBuffer());
    if(bytes.length!==asset.size||hashFile(bytes)!==asset.sha256)throw new Error('Private file integrity check failed');
    fs.writeFileSync(local,bytes,{mode:0o600});return local;
  }
  return {put,localPath,download,signPublication:(org,file)=>sign(org,file,false,3600),signUpload:(org,file)=>sign(org,file,true),signDownload:(org,file)=>sign(org,file,false)};
}
