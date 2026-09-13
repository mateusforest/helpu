export async function uploadFile(endpoint,file){
  if(file.size>25*1024*1024)throw new Error('Envie arquivos de até 25 MB.');
  const prepare=await fetch(endpoint+'/prepare',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({uploadId:crypto.randomUUID(),name:file.name,size:file.size})});
  const ticket=await prepare.json();if(!prepare.ok)throw new Error(ticket.error||'Não foi possível iniciar o envio.');
  let response;
  if(ticket.mode==='direct'){
    const target=new URL(ticket.url);
    if(target.protocol!=='https:'||!target.hostname.endsWith('.supabase.co')||!target.pathname.includes('/object/upload/sign/helpu-private/'))throw new Error('Destino de upload inválido.');
    const sent=await fetch(target,{method:'PUT',credentials:'omit',headers:{'Content-Type':file.type||'application/octet-stream','x-upsert':'false'},body:file});
    if(!sent.ok)throw new Error('O armazenamento não confirmou o envio. Tente novamente.');
    response=await fetch(endpoint+'/complete',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({uploadId:ticket.uploadId})});
  }else response=await fetch(endpoint,{method:'POST',credentials:'same-origin',headers:{'Content-Type':file.type,'X-File-Name':encodeURIComponent(file.name)},body:file});
  const asset=await response.json();if(!response.ok)throw new Error(asset.error||'Não foi possível verificar o arquivo.');return asset;
}
