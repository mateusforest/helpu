import {normalizeVideoOptions} from './video-styles.mjs';
import {randomUUID} from 'node:crypto';
const fail=text=>{throw Object.assign(new Error(text),{status:422});};
export function nextWeekly({weekdays,time,timeZone},after){
  const fmt=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  const parts=ms=>Object.fromEntries(fmt.formatToParts(ms).map(p=>[p.type,p.value]));
  const today=parts(after),[hour,minute]=time.split(':').map(Number);
  for(let n=0;n<9;n++){
    const date=new Date(Date.UTC(+today.year,+today.month-1,+today.day+n));
    if(!weekdays.includes(date.getUTCDay()))continue;
    const target=Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate(),hour,minute);let candidate=target;
    for(let i=0;i<3;i++){const p=parts(candidate);candidate+=target-Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute);}
    const p=parts(candidate);
    if(candidate>after&&+p.hour===hour&&+p.minute===minute&&+p.day===date.getUTCDate())return candidate;
  }
  fail('Não foi possível calcular a próxima data nesse fuso.');
}
export function createCreationSchedules({db,creations,company,now=Date.now}){
 const decode=row=>row?{id:row.id,...JSON.parse(row.data)}:null;
 async function write(org,id,data){await db.prepare("INSERT INTO records(id,org_id,kind,data,external_id,created_at,updated_at) VALUES(?,?,'creation_schedule',?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at").run(id,org,JSON.stringify(data),id,now(),now());return {id,...data};}
 const list=async(org,user)=> (await db.prepare("SELECT * FROM records WHERE org_id=? AND kind='creation_schedule' ORDER BY created_at DESC LIMIT 100").all(org)).map(decode).filter(s=>s.userId===user);
 async function create(org,user,input,conversationId,idempotencyKey){
  if(!(await company(org)).policy.enabled)fail('Ative a automação da empresa em Autonomia antes de programar gerações.');
  if(!['feed','story','carousel','reels'].includes(input.format)||!String(input.prompt||'').trim()||input.prompt.length>12000)fail('Informe o pedido e o formato da criação.');
  if(!conversationId||!await db.prepare('SELECT 1 FROM conversations WHERE org_id=? AND id=?').get(org,conversationId))fail('Conversa não encontrada.');
  const timeZone=input.timeZone||(await company(org)).policy.timeZone||'America/Sao_Paulo';
  try{new Intl.DateTimeFormat('pt-BR',{timeZone}).format();}catch{fail('Fuso horário inválido.');}
  const weekly=input.repeat==='weekly';let rule=null,nextAt;
  if(weekly){if(!Array.isArray(input.weekdays)||!input.weekdays.length||input.weekdays.length>7||input.weekdays.some(d=>!Number.isInteger(d)||d<0||d>6)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.time||''))fail('Informe os dias da semana (0 domingo a 6 sábado) e horário HH:mm.');rule={weekdays:[...new Set(input.weekdays)],time:input.time,timeZone};nextAt=nextWeekly(rule,now());}
  else {if(!/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(input.scheduledAt||''))fail('Informe data e hora com fuso explícito.');nextAt=Date.parse(input.scheduledAt);if(!Number.isFinite(nextAt)||nextAt<=now())fail('Escolha uma data futura.');}
  const attachments=input.attachments||[],maximum=input.format==='reels'?8:6;if(!Array.isArray(attachments)||attachments.length>maximum||new Set(attachments).size!==attachments.length)fail(input.format==='reels'?'Use até oito referências diferentes.':'Use até seis referências diferentes.');
  for(const id of attachments)if(!await db.prepare('SELECT 1 FROM assets WHERE org_id=? AND id=?').get(org,id))fail('Referência não encontrada nesta empresa.');
  if(input.format==='reels'){normalizeVideoOptions(input.videoOptions||{});if(input.styleId)await creations.styles.get(org,input.styleId);if(input.referenceOnlyIds&&(!Array.isArray(input.referenceOnlyIds)||input.referenceOnlyIds.some(id=>!attachments.includes(id))))fail('Referência de estilo inválida.');}
  const duration=input.duration||15,slideCount=input.slideCount||3;
  if(input.format==='reels'&&![15,30].includes(duration))fail('Escolha 15 ou 30 segundos.');
  if(input.format==='carousel'&&(!Number.isInteger(slideCount)||slideCount<3||slideCount>10))fail('Escolha de três a dez páginas.');
  if(idempotencyKey){const prior=(await list(org,user)).find(s=>s.idempotencyKey===idempotencyKey);if(prior)return prior;}
  return write(org,randomUUID(),{userId:user,conversationId,enabled:true,repeat:weekly?'weekly':'once',rule,timeZone,nextAt,request:{prompt:input.prompt.trim(),format:input.format,duration,slideCount,attachments,...input.videoOptions?{videoOptions:input.videoOptions}:{},...input.styleId?{styleId:input.styleId}:{},...input.referenceOnlyIds?{referenceOnlyIds:input.referenceOnlyIds}:{}},idempotencyKey,lastError:null});
 }
 async function update(org,user,id,action){const row=await db.prepare("SELECT * FROM records WHERE id=? AND org_id=? AND kind='creation_schedule'").get(id,org),s=decode(row);if(!s||s.userId!==user)fail('Agendamento não encontrado.');if(!['pause','resume','cancel'].includes(action))fail('Ação inválida.');if(s.canceled)fail('Agendamento cancelado.');s.enabled=action==='resume';if(action==='cancel')s.canceled=true;if(s.enabled){if(s.repeat==='weekly')s.nextAt=nextWeekly(s.rule,now());else if(s.nextAt<=now())fail('A data já passou. Crie um novo agendamento.');s.lastError=null;}delete s.id;return write(org,id,s);}
 async function tick(){
  const rows=await db.prepare("SELECT * FROM records WHERE kind='creation_schedule' AND json_extract(data,'$.enabled')=1 AND json_extract(data,'$.nextAt')<=? ORDER BY created_at LIMIT 10").all(now());
  for(const row of rows){const s=decode(row);delete s.id;
   if(!(await company(row.org_id)).policy.enabled)continue;
   if(!await db.prepare('SELECT 1 FROM memberships WHERE org_id=? AND user_id=?').get(row.org_id,s.userId)){await write(row.org_id,row.id,{...s,enabled:false,lastError:'O criador não tem mais acesso à empresa.'});continue;}
   try{const creation=await creations.submit(row.org_id,s.userId,{...s.request,requestId:'schedule_'+row.id+'_'+s.nextAt},{conversationId:s.conversationId});await write(row.org_id,row.id,{...s,enabled:s.repeat==='weekly',nextAt:s.repeat==='weekly'?nextWeekly(s.rule,now()):s.nextAt,lastCreationId:creation.id,lastRunAt:now(),lastError:null});}
   catch{await write(row.org_id,row.id,{...s,enabled:false,lastError:'Não foi possível iniciar a criação. Confira conexão, referências e limites antes de reativar.'});}
  }
 }
 return {create,list,update,tick};
}
