export function mountBusinessLogo(host,{id='',url='',upload,onChange}){
 const form=host.closest('form');host.innerHTML='<h3>Logo da empresa</h3><p>PNG com fundo transparente é ideal. JPG e WebP também são aceitos, até 25 MB. O logo se ajusta sem cortes e não ocupa uma das seis fotos.</p><img alt="Prévia do logo" hidden><label>Inserir ou trocar logo<input type="file" accept="image/png,image/jpeg,image/webp"></label><button type="button" hidden>Remover logo</button><p role="status"></p>';
 const img=host.querySelector('img'),input=host.querySelector('input'),remove=host.querySelector('button'),status=host.querySelector('[role=status]');
 const draw=()=>{img.hidden=!url;if(url)img.src=url;else img.removeAttribute('src');remove.hidden=!id;};draw();
 remove.onclick=()=>{id='';url='';onChange('');draw();status.textContent='Salve as informações para remover o logo.';};
 input.onchange=async()=>{const file=input.files[0];if(!file)return;const controls=[...form.querySelectorAll('[type=submit]')],states=controls.map(b=>b.disabled);controls.forEach(b=>b.disabled=true);input.disabled=remove.disabled=true;status.textContent='Preparando logo…';try{
  if(file.size>25*1024*1024||!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error('Use PNG, JPG ou WebP de até 25 MB.');
  const bitmap=await createImageBitmap(file);let blob;try{const scale=Math.min(1,1200/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);blob=await new Promise(r=>canvas.toBlob(r,'image/png'));}finally{bitmap.close();}
  if(!blob||blob.size>3*1024*1024)throw Error('O logo ficou muito pesado. Use uma versão menor.');const asset=await upload(new File([blob],'logo.png',{type:'image/png'}));if(!host.isConnected)return;id=asset.id;url=asset.url;onChange(id);draw();status.textContent='Logo pronto. Salve as informações para publicar.';
 }catch(e){status.textContent=e.message;}finally{controls.forEach((b,i)=>b.disabled=states[i]);input.disabled=remove.disabled=false;input.value='';}};
}
