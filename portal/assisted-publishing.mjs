import {randomUUID,createHash} from 'node:crypto';
import fs from 'node:fs';

export const ASSISTED_CONSENT_VERSION='assisted-2026-09-21';
export const ASSISTED_CONSENT='Autorizo a equipe Helpu a revisar os materiais deste serviço e publicar manualmente na conta indicada, somente após minha aprovação da versão, legenda e data. A liberação de acesso à conta será combinada com a equipe e poderá ser revogada. Esta autorização não faz login nem ativa publicação automática. Impulsionamentos exigem orçamento e aprovação separados.';
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const text=(v,max=3000)=>typeof v==='string'?v.trim().slice(0,max):'';
const digest=v=>createHash('sha256').update(v).digest('hex');
const decode=row=>row?{...JSON.parse(row.data),id:row.id,orgId:row.org_id,version:row.version}:null;
const validAccount=value=>{const v=text(value,60).replace(/^@/,'').toLowerCase();if(!/^[a-z0-9._]{1,30}$/.test(v))fail('Informe o nome de usuário do Instagram, sem senha.');return v;};
function externalLink(value,ads=false){let u;try{u=new URL(value);}catch{fail('Informe um link válido como evidência.');}const hosts=ads?['business.facebook.com','adsmanager.facebook.com','www.facebook.com']:['www.instagram.com','instagram.com'];if(u.protocol!=='https:'||u.username||u.password||!hosts.includes(u.hostname)||u.pathname==='/')fail('Use um link HTTPS do '+(ads?'Gerenciador de Anúncios':'Instagram')+'.');if(!ads&&!/^\/(?:p|reel|reels)\/[\w-]+\/?$/.test(u.pathname)&&!/^\/stories\/[\w.]+\/\d+\/?$/.test(u.pathname))fail('Informe o link da publicação ou Story, não o perfil da conta.');return u.href;}
function money(value){if(!Number.isInteger(value)||value<0||value>1000000)fail('Informe um valor válido em centavos.');return value;}
function instant(value){const n=Date.parse(value);if(!Number.isFinite(n))fail('Informe uma data e horário válidos.');return new Date(n).toISOString();}

export async function createAssistedPublishing({db,assetPath,env=process.env,now=Date.now}) {
  // An explicitly configured, pre-existing account may be resolved on the server
  // without exporting production database credentials. A later signup with this
  // email must never become an operator; both email and cutoff are required.
  const email=text(env.HELPU_OPERATOR_ACCOUNT_EMAIL,254).toLowerCase(),cutoff=Number(env.HELPU_OPERATOR_ACCOUNT_CREATED_BEFORE);
  const designated=email&&Number.isSafeInteger(cutoff)&&cutoff>0&&cutoff<=now()
    ?await db.prepare('SELECT id FROM users WHERE lower(email)=? AND created_at<=?').get(email,cutoff):null;
  const operator=user=>!!user && Number.isSafeInteger(Number(user.id)) && Number(user.id)>0 && (!!designated&&String(user.id)===String(designated.id)||(env.HELPU_OPERATOR_USER_IDS||'').split(',').map(s=>s.trim()).filter(Boolean).includes(String(user.id)));
  const row=id=>db.prepare('SELECT * FROM records WHERE id=?').get(id);
  const serviceRow=org=>row('assisted-service:'+org);
  async function manager(org,user){const membership=await db.prepare('SELECT role FROM memberships WHERE org_id=? AND user_id=?').get(org,user.id);if(!['owner','admin'].includes(membership?.role))fail('Somente responsáveis pela empresa podem autorizar este serviço.',403);}
  async function transaction(fn){await db.exec('SAVEPOINT assisted_action');try{const result=await fn();await db.exec('RELEASE SAVEPOINT assisted_action');return result;}catch(e){await db.exec('ROLLBACK TO SAVEPOINT assisted_action');await db.exec('RELEASE SAVEPOINT assisted_action');throw e;}}
  async function write(org,id,kind,data,previous,user,action){
    const at=now(),event={id:randomUUID(),actor:String(user.id),role:operator(user)?'operator':'client',action,at,revision:data.revision||null};
    if(['authorize','revoke'].includes(action))event.authorization={account:data.account,authorizationId:data.authorizationId,consent:data.consent,active:data.active};
    if(action==='approve')event.approval=data.approval;
    if(['quote','boost_approve'].includes(action))event.budget={terms:data.boost.terms,approval:data.boost.approval};
    const next={...data,history:[...(previous?JSON.parse(previous.data).history||[]:[]),event],updatedAt:at};
    delete next.version;delete next.id;delete next.orgId;
    if(previous){const changed=await db.prepare('UPDATE records SET data=?,updated_at=?,version=version+1 WHERE id=? AND version=? RETURNING id').get(JSON.stringify(next),at,id,previous.version);if(!changed)fail('Este pedido mudou. Atualize a tela antes de continuar.',409);}
    else await db.prepare('INSERT INTO records(id,org_id,kind,data,external_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(id,org,kind,JSON.stringify(next),id,at,at);
    await db.prepare('INSERT INTO audit VALUES(?,?,?,?,?,?,?)').run(event.id,org,String(user.id),'Publicação assistida: '+action,id,'',at);
    return decode(await row(id));
  }
  async function lockService(org){
    // Serializes revocation with approval and starting work in PostgreSQL as well
    // as SQLite. No network publication happens in this transaction.
    await db.prepare("UPDATE records SET updated_at=updated_at WHERE id=?").run('assisted-service:'+org);
    return decode(await serviceRow(org));
  }
  function requireActive(service){if(!service?.active)fail('A autorização do serviço está desativada.',409);}
  function versionCheck(record,input){if(!Number.isInteger(input.version)||input.version!==record?.version)fail('Este pedido mudou. Atualize e confira a versão atual.',409);}
  async function assets(org,ids){
    if(!Array.isArray(ids)||!ids.length||ids.length>10||new Set(ids).size!==ids.length)fail('Selecione de 1 a 10 arquivos diferentes.');
    const result=[];
    for(const id of ids){const a=await db.prepare('SELECT * FROM assets WHERE id=? AND org_id=?').get(id,org);if(!a||!['image/jpeg','image/png','image/webp','video/mp4'].includes(a.mime))fail('Selecione imagens ou vídeos da própria empresa.');
      const file=await assetPath(org,id);result.push({id:a.id,name:a.name,mime:a.mime,hash:digest(fs.readFileSync(file))});}
    return result;
  }
  async function snapshot(org,input,service){
    const format=input.format;if(!['feed','story','reels','carousel'].includes(format))fail('Escolha o formato.');
    const media=await assets(org,input.assetIds);
    if(format!=='carousel'&&media.length!==1)fail('Selecione um arquivo final para este formato.');
    if(format==='reels'&&media[0].mime!=='video/mp4')fail('Reels precisa de um MP4 pronto.');
    const caption=text(input.caption,2200),title=text(input.title,120);if(!title)fail('Dê um título ao pedido.');
    const scheduledAt=instant(input.scheduledAt);if(Date.parse(scheduledAt)<=now())fail('Escolha uma data futura para revisão e publicação.');
    const timeZone=text(input.timeZone,80)||'America/Sao_Paulo';try{new Intl.DateTimeFormat('pt-BR',{timeZone});}catch{fail('Fuso horário inválido.');}
    return {title,caption,format,account:service.account,scheduledAt,timeZone,assets:media};
  }
  function boostRequest(input){if(!input?.requested)return null;const budget=money(input.budgetCents);if(![3500,5000,10000].includes(budget))fail('Escolha R$35, R$50 ou R$100 como intenção de verba.');
    const objective=text(input.objective,300),audience=text(input.audience,500),startAt=instant(input.startAt),endAt=instant(input.endAt);
    if(!objective||!audience||Date.parse(startAt)<=now()||Date.parse(endAt)<=Date.parse(startAt))fail('Informe objetivo, público e período futuro do anúncio.');
    return {state:'requested',terms:{budgetCents:budget,feeCents:null,objective,audience,startAt,endAt,payer:'client_meta'},approval:null,evidence:[]};
  }
  async function listing(org,user){
    const membership=await db.prepare('SELECT role FROM memberships WHERE org_id=? AND user_id=?').get(org,user.id);if(!membership)fail('Empresa não encontrada.',404);
    const requests=(await db.prepare("SELECT * FROM records WHERE org_id=? AND kind='assisted_request' ORDER BY created_at DESC").all(org)).map(decode);
    return {service:decode(await serviceRow(org)),consentText:ASSISTED_CONSENT,canManage:['owner','admin'].includes(membership.role),requests,operators:await responsibleNames(requests)};
  }
  async function responsibleNames(requests){const result=[];for(const id of new Set(requests.map(r=>r.assignee).filter(Boolean))){const u=await db.prepare('SELECT id,name FROM users WHERE id=?').get(Number(id));if(u)result.push({id:String(u.id),name:u.name});}return result;}
  async function adminListing(user){
    if(!operator(user))fail('Acesso restrito à equipe autorizada.',403);
    const requests=(await db.prepare("SELECT * FROM records WHERE kind='assisted_request' ORDER BY created_at DESC").all()).map(decode);
    const services=(await db.prepare("SELECT * FROM records WHERE kind='assisted_service' ORDER BY created_at DESC").all()).map(decode);
    const orgs=[...new Set([...requests,...services].map(r=>r.orgId))],clients=[];
    for(const org of orgs){const c=await db.prepare('SELECT id,name,profile FROM companies WHERE id=?').get(org);const active=services.some(s=>s.orgId===org&&s.active),source=JSON.parse(c.profile),profile=active?Object.fromEntries(['description','audience','tone','visualIdentity','restrictions'].filter(k=>typeof source[k]==='string').map(k=>[k,source[k]])):{};clients.push({id:c.id,name:c.name,profile,service:services.find(s=>s.orgId===org)});}
    return {requests,clients,operatorId:String(user.id),operators:await responsibleNames(requests)};
  }
  async function canReadAsset(user,a){
    if(!operator(user))return false;const s=decode(await serviceRow(a.org_id));if(!s?.active)return false;
    const requests=(await db.prepare("SELECT * FROM records WHERE org_id=? AND kind='assisted_request'").all(a.org_id)).map(decode);
    return requests.some(r=>!['canceled'].includes(r.state)&&r.snapshot.assets.some(m=>m.id===a.id));
  }
  async function action(org,user,input,admin=false){
    if(admin){if(!operator(user))fail('Acesso restrito à equipe autorizada.',403);}else await manager(org,user);
    if(!admin&&['authorize','create'].includes(input.action)){const row=await db.prepare("SELECT data FROM records WHERE org_id=? AND kind='subscription' AND id=?").get(org,'subscription:'+org);if(row){const subscription=JSON.parse(row.data);if(subscription.state!=='active'||subscription.plan!=='assisted'||subscription.start>now()||subscription.end<=now())fail('A publicação pela equipe faz parte do plano Helpu Assistido ativo.',403);}}
    return transaction(async()=>{
      const service=await lockService(org),act=input.action;
      if(['authorize','revoke','verify_access'].includes(act)){
        const prior=await serviceRow(org);if(prior)versionCheck(decode(prior),input);else if(input.version!==0)fail('Atualize a autorização.',409);
        if(act==='verify_access'){
          if(!admin)fail('Somente um operador pode confirmar o acesso autorizado.',403);requireActive(service);
          const evidence=text(input.evidence,1000);if(evidence.length<10)fail('Registre como conferiu o acesso autorizado na Meta.');
          return write(org,prior.id,'assisted_service',{...service,delegated:{account:service.account,operator:String(user.id),at:now(),evidence}},prior,user,act);
        }
        if(admin)fail('A autorização precisa vir do responsável pela empresa.',403);
        if(act==='authorize'&&input.consent!==true)fail('Autorize explicitamente o serviço.');
        const account=act==='authorize'?validAccount(input.account):service?.account;
        if(!account)fail('Não há serviço para revogar.',409);
        // Reauthorization deliberately invalidates prior approvals and delegated checks.
        return write(org,'assisted-service:'+org,'assisted_service',{active:act==='authorize',account,authorizationId:randomUUID(),consent:{version:ASSISTED_CONSENT_VERSION,text:ASSISTED_CONSENT,actor:String(user.id),at:now()},delegated:null},prior,user,act);
      }
      if(act==='create'){
        if(admin)fail('O pedido deve ser iniciado pela empresa.',403);requireActive(service);
        const requestKey=text(input.requestKey,80);if(!/^[a-zA-Z0-9-]{16,80}$/.test(requestKey))fail('Atualize o formulário antes de enviar.');
        const id='assisted:'+org+':'+requestKey,existing=await row(id);if(existing)return decode(existing);
        return write(org,id,'assisted_request',{createdAt:now(),state:'review',revision:1,snapshot:await snapshot(org,input,service),authorizationId:service.authorizationId,approval:null,assignee:'',note:'',boost:boostRequest(input.boost),revisions:[]},null,user,act);
      }
      const prior=await row(input.id);if(!prior||prior.org_id!==org||prior.kind!=='assisted_request')fail('Pedido não encontrado.',404);
      const r=decode(prior);versionCheck(r,input);
      let next={...r};
      const active=()=>{requireActive(service);if(service.authorizationId!==r.authorizationId)fail('A autorização mudou. Revise e envie uma nova versão ao cliente.',409);};
      const editable=()=>{if(['publishing','published','uncertain','canceled'].includes(r.state))fail('Este pedido não pode ser alterado nesse estado.',409);if(['configured','meta_review','active','closed','results'].includes(r.boost?.state))fail('O anúncio já está em operação; conclua-o antes de criar outro pedido.',409);};
      if(act==='revise'){
        requireActive(service);editable();next={...r,snapshot:await snapshot(org,input,service),state:'review',revision:r.revision+1,authorizationId:service.authorizationId,approval:null,boost:boostRequest(input.boost),revisions:[...r.revisions,{revision:r.revision,snapshot:r.snapshot,approval:r.approval,boost:r.boost}],note:text(input.note,1000)};
      }else if(act==='cancel'){
        if(['publishing','published','uncertain'].includes(r.state)||['configured','meta_review','active','closed','results'].includes(r.boost?.state))fail('Há execução iniciada. A equipe precisa conferir o resultado antes de cancelar.',409);
        if(r.state==='canceled')return r;next.state='canceled';next.approval=null;if(next.boost)next.boost={...next.boost,state:'canceled',approval:null};
      }else if(act==='changes'){
        editable();next.state='changes_requested';next.approval=null;next.note=text(input.note,1000);if(!next.note)fail('Descreva o ajuste necessário.');if(next.boost)next.boost={...next.boost,state:'requested',approval:null};
      }else if(act==='approve'){
        if(admin)fail('A aprovação precisa vir do responsável pela empresa.',403);active();if(r.state!=='awaiting_approval'||input.consent!==true)fail('Confira a versão e marque a aprovação.',409);
        if(Date.parse(r.snapshot.scheduledAt)<=now())fail('O horário passou. Solicite uma nova data antes de aprovar.',409);
        next.state='scheduled';next.approval={actor:String(user.id),at:now(),revision:r.revision,hash:digest(JSON.stringify(r.snapshot)),authorizationId:service.authorizationId};
      }else if(act==='boost_approve'){
        if(admin)fail('O orçamento precisa ser aprovado pela empresa.',403);active();if(r.boost?.state!=='quoted'||input.consent!==true||['canceled','uncertain','failed'].includes(r.state))fail('Confira e aprove o orçamento apresentado.',409);
        if(Date.parse(r.boost.terms.startAt)<=now())fail('O período passou. Solicite um novo orçamento.',409);
        next.boost={...r.boost,state:'approved',approval:{actor:String(user.id),at:now(),termsHash:digest(JSON.stringify(r.boost.terms)),revision:r.revision}};
      }else{
        if(!admin)fail('Ação reservada à equipe Helpu.',403);
        if(act==='assign'){active();next.assignee=String(user.id);}
        else if(act==='submit_review'){active();editable();if(!['review','changes_requested','failed'].includes(r.state))fail('O pedido já foi encaminhado.',409);next.state='awaiting_approval';next.assignee=String(user.id);next.note=text(input.note,1000);}
        else if(act==='start_publication'){
          active();if(r.state!=='scheduled'||!r.approval||r.approval.revision!==r.revision||r.approval.hash!==digest(JSON.stringify(r.snapshot)))fail('Esta versão ainda não está aprovada.',409);
          if(!service.delegated||service.delegated.account!==r.snapshot.account)fail('Confira o acesso autorizado à conta antes de publicar.',409);
          if(Date.parse(r.snapshot.scheduledAt)>now())fail('Aguarde o horário aprovado ou peça aprovação de outra data.',409);
          const current=await assets(org,r.snapshot.assets.map(a=>a.id));if(current.some((a,i)=>a.hash!==r.snapshot.assets[i].hash))fail('Um arquivo mudou. A peça precisa de uma nova aprovação.',409);
          next.state='publishing';next.execution={operator:String(user.id),startedAt:now(),revision:r.revision};next.assignee=String(user.id);
        }else if(act==='published'){
          if(!['publishing','uncertain'].includes(r.state)||r.execution?.operator!==String(user.id))fail('Somente quem iniciou a publicação pode registrar este resultado.',409);
          next.state='published';next.publication={url:externalLink(input.url),at:now(),operator:String(user.id),revision:r.revision,source:'manual_operator',note:text(input.note,1000)};
        }else if(act==='failed'){
          if(!['review','awaiting_approval','scheduled','publishing'].includes(r.state))fail('Estado incompatível.',409);
          next.note=text(input.note,1000);if(!next.note)fail('Explique o que precisa ser corrigido.');next.state=r.state==='publishing'?'uncertain':'failed';next.approval=null;
        }else if(act==='quote'){
          active();if(!r.boost||!['requested','quoted','approved'].includes(r.boost.state)||['canceled','uncertain','failed'].includes(r.state))fail('Não há orçamento disponível para revisão.',409);
          const terms={...r.boost.terms,budgetCents:money(input.budgetCents),feeCents:money(input.feeCents),startAt:instant(input.startAt),endAt:instant(input.endAt)};
          if(!terms.budgetCents||Date.parse(terms.startAt)<=now()||Date.parse(terms.endAt)<=Date.parse(terms.startAt))fail('Confira a verba e o período futuro.');
          next.boost={...r.boost,state:'quoted',terms,approval:null,note:text(input.note,1000)};
        }else if(act==='boost_status'){
          if(!['closed','results'].includes(input.state))active();const b=r.boost;if(!b?.approval||b.approval.revision!==r.revision||b.approval.termsHash!==digest(JSON.stringify(b.terms)))fail('O orçamento atual ainda não foi aprovado.',409);
          const allowed={approved:'configured',configured:'meta_review',meta_review:'active',active:'closed',closed:'results'};
          if(allowed[b.state]!==input.state)fail('Etapa de anúncio inválida.',409);
          if(r.state!=='published'||!['closed','results'].includes(input.state)&&!service?.delegated)fail('Publique a peça aprovada e confirme o acesso autorizado antes de registrar o anúncio.',409);
          const evidence=text(input.evidence,1000);if(evidence.length<5)fail('Registre a evidência desta etapa.');
          if(input.state==='active'&&(now()<Date.parse(b.terms.startAt)||now()>Date.parse(b.terms.endAt)))fail('A ativação precisa estar dentro do período aprovado.',409);
          const url=externalLink(input.url,true);next.boost={...b,state:input.state,evidence:[...b.evidence,{state:input.state,at:now(),operator:String(user.id),note:evidence,url}]};
        }else fail('Ação inválida.');
      }
      return write(org,r.id,'assisted_request',next,prior,user,act);
    });
  }
  return {operator,listing,adminListing,action,canReadAsset};
}
