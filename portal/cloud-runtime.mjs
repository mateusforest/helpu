import {ProviderError} from './providers.mjs';

const uuid = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
export function runtimeId(value) {
  if (!uuid.test(String(value || ''))) throw new ProviderError('Identificador inválido.', 'blocked');
  return value;
}
export function createCloudRuntime({env=process.env,fetcher=fetch,allowLoopback=false}={}) {
  const secret=String(env.HELPU_RUNTIME_SECRET||''), raw=String(env.HELPU_RUNTIME_URL||'');
  let base;
  try {const u=new URL(raw);if((u.protocol==='https:'||(allowLoopback&&u.protocol==='http:'&&['127.0.0.1','localhost'].includes(u.hostname)))&&!u.username&&!u.password&&!u.search&&!u.hash&&u.pathname==='/')base=u.origin;}catch{}
  const configured=!!base&&secret.length>=32;
  let cached=null,checked=0;
  async function request(org,route,{method='GET',data,bytes,actor,job,name,limit=3*1024*1024}={}) {
    if(!configured)throw new ProviderError('O serviço online ainda precisa ser configurado na hospedagem.', 'blocked');
    runtimeId(org);
    if(!/^\/(?:status|browser(?:\/[a-zA-Z0-9_-]+)*|video(?:\/[a-zA-Z0-9_-]+)*)$/.test(route))throw new ProviderError('Recurso online inválido.', 'blocked');
    const headers={Authorization:'Bearer '+secret,'X-Helpu-Company':org};
    if(actor!==undefined)headers['X-Helpu-Actor']=String(actor);
    if(job)headers['X-Helpu-Job']=runtimeId(job);
    if(name)headers['X-Helpu-Filename']=encodeURIComponent(String(name).slice(0,150));
    if(bytes)headers['Content-Type']='application/octet-stream';else if(data!==undefined)headers['Content-Type']='application/json';
    let res;
    try {res=await fetcher(base+'/v1'+route,{method,headers,body:bytes||(data===undefined?undefined:JSON.stringify(data)),redirect:'error',signal:AbortSignal.timeout(route==='/status'?20000:bytes?90000:60000)});}catch{throw new ProviderError('Não foi possível confirmar a resposta do serviço online. Confira o andamento antes de repetir.',method==='GET'?'blocked':'uncertain');}
    let size=0;const chunks=[];
    try{for await(const chunk of res.body){size+=chunk.length;if(size>limit)throw new Error('limit');chunks.push(chunk);}}catch{throw new ProviderError('A resposta do serviço foi interrompida. Confira o andamento antes de repetir.',method==='GET'?'blocked':'uncertain');}
    const buffer=Buffer.concat(chunks);
    if(res.ok&&res.headers.get('content-type')?.includes('video/mp4'))return buffer;
    let value;try{value=JSON.parse(buffer.toString('utf8'));}catch{throw new ProviderError('O serviço online retornou uma resposta inválida.','uncertain');}
    if(!res.ok){const e=new ProviderError(String(value.error||'Não foi possível concluir a operação online.').slice(0,400),res.status>=500?'uncertain':'blocked');e.status=res.status;throw e;}
    return value;
  }
  async function status(org,{fresh=false}={}) {
    if(!configured)return {configured:false,available:false,browser:false,video:false,queueEnabled:env.HELPU_AUTOMATIONS_ENABLED==='true',error:'Configure o serviço online para abrir contas e editar vídeos.'};
    if(!fresh&&cached&&Date.now()-checked<15000)return cached;
    try {const value=await request(org,'/status');cached={...value,configured:true,available:value.protocol===1};}catch{cached={configured:true,available:false,browser:false,video:false,error:'O serviço online não respondeu. Confira a hospedagem.'};}
    cached.queueEnabled=env.HELPU_AUTOMATIONS_ENABLED==='true';checked=Date.now();return cached;
  }
  return {configured,request,status};
}
