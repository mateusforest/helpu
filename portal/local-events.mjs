import {randomUUID} from 'node:crypto';
const fail=message=>{throw Object.assign(Error(message),{status:400});};
export const eventInstant=(date,time)=>Date.parse(`${date}T${time}:00-03:00`);
export const eventOpen=(event,now=Date.now())=>event.available!==false&&eventInstant(event.endDate||event.date,event.endTime||event.time)>now;
export function validateEvents(input,photos=[]){
 if(!Array.isArray(input)||input.length>30)fail('Cadastre até 30 eventos por negócio.');
 const ids=new Set(),text=(v,max)=>{if(typeof v!=='string'||v.trim().length>max)fail('Confira as informações do evento.');return v.trim();};
 const date=(d,t)=>/^\d{4}-\d{2}-\d{2}$/.test(d)&&/^([01]\d|2[0-3]):[0-5]\d$/.test(t)&&Number.isFinite(eventInstant(d,t))&&new Date(eventInstant(d,t)-10800000).toISOString().slice(0,10)===d;
 return input.map(x=>{
  if(!x||typeof x!=='object')fail('Confira as informações do evento.');
  const id=x.id||randomUUID(),name=text(x.name,120),description=text(x.description||'',3000),venue=text(x.venue||'',300),conditions=text(x.conditions||'',3000);
  if(!/^[a-f\d-]{36}$/i.test(id)||ids.has(id)||name.length<2||!venue||description.length<10||!date(x.date,x.time))fail('Informe título, descrição, local, data e horário válidos do evento.');
  ids.add(id);const endDate=x.endDate||'',endTime=x.endTime||'';
  if((endDate||endTime)&&(!date(endDate,endTime)||eventInstant(endDate,endTime)<=eventInstant(x.date,x.time)))fail('O encerramento deve ter data e horário posteriores ao início.');
  const priceCents=x.priceCents==null?null:Number(x.priceCents);
  if(priceCents!==null&&(!Number.isSafeInteger(priceCents)||priceCents<0||priceCents>100000000))fail('Confira o valor do ingresso.');
  const photoId=x.photoId||'';if(photoId&&!photos.includes(photoId))fail('Selecione uma foto do negócio para o evento.');
  return {id,name,description,venue,conditions,date:x.date,time:x.time,endDate,endTime,priceCents,photoId,available:x.available!==false};
 });
}
