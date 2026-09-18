import {createHash} from 'node:crypto';

const formats={'image/png':['.png',20],'image/jpeg':['.jpg',20],'image/webp':['.webp',20],'video/mp4':['.mp4',25],'application/pdf':['.pdf',20]};
export async function receiveWhatsAppMedia({media,token,phoneId,version='v24.0',fetcher=fetch}){
  if(!/^\d{1,100}$/.test(String(media?.id||'')))throw new Error('Identificador de mídia inválido.');
  const headers={Authorization:'Bearer '+token};
  const meta=await fetcher(`https://graph.facebook.com/${version}/${media.id}?phone_number_id=${encodeURIComponent(phoneId)}`,{headers,redirect:'error',signal:AbortSignal.timeout(20000)});
  if(!meta.ok)throw new Error('Não foi possível consultar o arquivo no WhatsApp.');
  const info=await meta.json(),format=formats[info.mime_type];
  if(!format)throw new Error('Envie PNG, JPG, WebP, MP4 ou PDF.');
  const maximum=format[1]*1024*1024;
  if(!Number.isFinite(Number(info.file_size))||Number(info.file_size)<=0||Number(info.file_size)>maximum)throw new Error('O arquivo excede o tamanho permitido.');
  const url=new URL(info.url);
  if(url.protocol!=='https:'||url.username||url.password||url.port||!(url.hostname==='lookaside.fbsbx.com'||url.hostname==='lookaside.whatsapp.net'))throw new Error('Endereço de mídia não autorizado.');
  const response=await fetcher(url.href,{headers,redirect:'error',signal:AbortSignal.timeout(45000)});
  if(!response.ok||!response.body)throw new Error('Não foi possível baixar o arquivo.');
  const chunks=[];let size=0;
  for await(const chunk of response.body){size+=chunk.length;if(size>maximum)throw new Error('O arquivo excede o tamanho permitido.');chunks.push(chunk);}
  const bytes=Buffer.concat(chunks);
  if(size!==Number(info.file_size))throw new Error('Arquivo incompleto.');
  const expected=info.sha256||media.sha256;
  if(expected){const digest=createHash('sha256').update(bytes);const encoding=/^[a-f0-9]{64}$/i.test(expected)?'hex':'base64';if(digest.digest(encoding)!==expected)throw new Error('A integridade do arquivo não foi confirmada.');}
  const name=String(media.filename||'WhatsApp'+format[0]).replace(/[\\/\x00-\x1f]/g,'_').slice(0,150);
  return {bytes,name,mime:info.mime_type};
}
