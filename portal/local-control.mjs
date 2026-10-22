import {createHash, randomUUID} from 'node:crypto';

const ORG = 'helpu-local-directory';
const fail = (message, status = 400) => { throw Object.assign(new Error(message), {status}); };
const decode = r => r ? {...JSON.parse(r.data), id:r.id, version:r.version} : null;
export async function generalAccountBlocked(db, id) {
  const row = await db.prepare("SELECT data FROM records WHERE org_id=? AND kind='account_control' AND id=?").get(ORG, 'account-control:'+id);
  return row ? !!JSON.parse(row.data).blockedAt : false;
}

export function createLocalControl({db, operator, customer, now=Date.now}) {
  const allowed = user => { if (!operator(user)) fail('Acesso restrito à equipe Helpu.', 403); };
  const read = (id, kind) => db.prepare('SELECT * FROM records WHERE org_id=? AND id=? AND kind=?').get(ORG,id,kind).then(decode);
  async function ensureOrg() {
    await db.prepare("INSERT OR IGNORE INTO companies(id,name,profile,policy,created_at,updated_at) VALUES(?,?,'{}','{}',?,?)").run(ORG,'Helpu Local · diretório interno',now(),now());
  }
  async function transaction(fn) {
    return db.scope(async()=>{await db.exec('SAVEPOINT local_control');try {const result=await fn();await db.exec('RELEASE SAVEPOINT local_control');return result;} catch(e) {await db.exec('ROLLBACK TO SAVEPOINT local_control');await db.exec('RELEASE SAVEPOINT local_control');throw e;}});
  }
  async function put(id,kind,value,old) {
    const data={...value};delete data.id;delete data.version;
    if(old) {
      const result=await db.prepare('UPDATE records SET data=?,version=version+1,updated_at=? WHERE id=? AND org_id=? AND version=? RETURNING id').get(JSON.stringify(data),now(),id,ORG,old.version);
      if(!result)fail('Os dados mudaram. Atualize antes de continuar.',409);
    } else await db.prepare('INSERT INTO records(id,org_id,kind,data,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(id,ORG,kind,JSON.stringify(data),now(),now());
    return read(id,kind);
  }
  async function audit(user,action,target,reason) {
    await ensureOrg();
    await put('local-admin-event:'+randomUUID(),'local_admin_event',{actor:String(user.id),action,target,reason,createdAt:now()});
  }
  async function inventory() {
    const users=await db.prepare('SELECT id,name,email,created_at FROM users ORDER BY id').all();
    const locals=(await db.prepare("SELECT * FROM records WHERE org_id=? AND kind='local_account' ORDER BY id").all(ORG)).map(decode);
    const businesses=(await db.prepare("SELECT * FROM records WHERE org_id=? AND kind='local_business' ORDER BY id").all(ORG)).map(decode);
    const controls=(await db.prepare("SELECT * FROM records WHERE org_id=? AND kind='account_control'").all(ORG)).map(decode);
    return {users,locals,businesses,controls};
  }
  async function listing(user) {
    allowed(user);const data=await inventory();
    const accounts=data.locals.map(a=>{const b=data.businesses.find(b=>b.id===a.businessId);return {id:a.id,version:a.version,kind:'local',email:a.email,name:b?.name||'Sem cadastro vinculado',businessId:a.businessId,type:b?.sellerType||'Loja',blocked:!!a.blockedAt,reason:a.blockReason||'',activated:!!a.passwordHash,protected:data.users.some(u=>operator(u)&&u.email.toLowerCase()===a.email.toLowerCase()),createdAt:b?.createdAt};});
    for(const u of data.users) {const control=data.controls.find(c=>c.id==='account-control:'+u.id);accounts.push({id:String(u.id),kind:'general',version:control?.version||0,email:u.email,name:u.name,type:operator(u)?'Administrador':'Marketing',protected:operator(u)||String(u.id)===String(user.id),blocked:!!control?.blockedAt,reason:control?.reason||'',activated:true,createdAt:u.created_at});}
    const notifications=(await db.prepare("SELECT * FROM records WHERE org_id=? AND kind='local_notification' ORDER BY created_at DESC LIMIT 200").all(ORG)).map(decode);
    const events=(await db.prepare("SELECT * FROM records WHERE org_id=? AND kind='local_admin_event' ORDER BY created_at DESC LIMIT 200").all(ORG)).map(decode);
    return {accounts,notifications,events,operatorEmail:user.email};
  }
  async function accountAction(user,d) {
    allowed(user);if(!['block','unblock','delete-account'].includes(d.action))fail('Ação inválida.');
    const reason=String(d.reason||'').trim();if(reason.length<5||reason.length>1000)fail('Explique o motivo em 5 a 1.000 caracteres.');
    return transaction(async()=>{
      await ensureOrg();const item=(await listing(user)).accounts.find(a=>a.id===String(d.id)&&a.kind===d.kind);
      if(!item)fail('Conta não encontrada.',404);if(item.protected)fail('Este acesso administrativo está protegido.',403);
      if(item.version!==d.version)fail('A conta mudou. Atualize a lista.',409);
      if(d.action==='delete-account') {
        if(d.confirmEmail!==item.email)fail('Digite o e-mail exato da conta para excluir o acesso.');
        await erase(item);await audit(user,'Conta excluída',item.name+' · '+item.type,reason);return {ok:true};
      }
      if(item.kind==='local') {
        const a=await read(item.id,'local_account');
        await put(a.id,'local_account',{...a,blockedAt:d.action==='block'?now():null,blockReason:d.action==='block'?reason:'',authVersion:(a.authVersion||0)+1,inviteHash:null,resetHash:null,verifyHash:null},a);
        await db.prepare("DELETE FROM records WHERE org_id=? AND kind='local_session' AND json_extract(data,'$.accountId')=?").run(ORG,a.id);
      } else {
        const id='account-control:'+item.id,old=await read(id,'account_control');
        await put(id,'account_control',{blockedAt:d.action==='block'?now():null,reason},old);
        await db.prepare('DELETE FROM sessions WHERE user_id=?').run(Number(item.id));
      }
      await audit(user,d.action==='block'?'Acesso bloqueado':'Acesso desbloqueado',item.name+' · '+item.type,reason);return {ok:true};
    });
  }
  async function erase(item) {
    if(item.kind==='local') {
      await db.prepare("DELETE FROM records WHERE org_id=? AND kind='local_session' AND json_extract(data,'$.accountId')=?").run(ORG,item.id);
      await db.prepare("DELETE FROM records WHERE org_id=? AND kind='local_account' AND id=?").run(ORG,item.id);
    } else {
      const id=Number(item.id);
      await db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);
      await db.prepare('DELETE FROM memberships WHERE user_id=?').run(id);
      const running=await db.prepare("SELECT COUNT(*) AS n FROM jobs WHERE user_id=? AND state IN ('queued','working','waiting_provider','uncertain')").get(id);
      if(Number(running.n))fail('Esta conta tem execuções em andamento. Conclua ou cancele as execuções antes de excluir.',409);
      await db.prepare('UPDATE jobs SET user_id=NULL WHERE user_id=?').run(id);
      await db.prepare('DELETE FROM users WHERE id=?').run(id);
      await db.prepare("DELETE FROM records WHERE org_id=? AND kind='account_control' AND id=?").run(ORG,'account-control:'+id);
    }
  }
  async function cleanupPreview(user,preserveEmail) {
    allowed(user);const email=String(preserveEmail||'').trim().toLowerCase();
    if(email!==user.email.toLowerCase())fail('Entre com o acesso administrativo que será preservado.',403);
    const data=await inventory(),accounts=(await listing(user)).accounts;
    const preserved=accounts.filter(a=>a.protected||a.email.toLowerCase()===email),remove=accounts.filter(a=>!preserved.includes(a));
    const digest=createHash('sha256').update(JSON.stringify({actor:user.id,email,data})).digest('hex');
    return {digest,preserveEmail:email,remove,preserved,businesses:data.businesses.map(b=>({id:b.id,name:b.name,state:b.state,productsOnly:!!b.productsOnly})),message:'Remove somente logins, sessões e vínculos de acesso. Empresas, produtos, fotos e histórico são preservados. A exclusão de contas é definitiva.'};
  }
  async function cleanup(user,d) {
    allowed(user);return transaction(async()=>{
      // Serialize against existing account/profile changes while checking the reviewed inventory.
      if(db.dialect==='postgres') {
        await db.prepare('SELECT id FROM users FOR UPDATE').all();
        await db.prepare('SELECT id FROM records WHERE org_id=? FOR UPDATE').all(ORG);
      }
      const preview=await cleanupPreview(user,d.preserveEmail);
      if(d.confirm!=='EXCLUIR CONTAS'||d.digest!==preview.digest)fail('A lista mudou ou falta confirmação. Confira uma nova prévia.',409);
      for(const item of preview.remove)await erase(item);
      await audit(user,'Limpeza de contas',String(user.id),preview.remove.length+' acessos removidos; cadastros e conteúdos preservados.');
      return {ok:true,removed:preview.remove.length,preserved:preview.preserved.length,businessesPreserved:preview.businesses.length};
    });
  }
  async function notify(user,d) {
    allowed(user);const b=await read(d.businessId,'local_business');if(!b)fail('Cadastro não encontrado.',404);
    const title=String(d.title||'').trim(),message=String(d.message||'').trim();
    if(title.length<3||title.length>120||message.length<5||message.length>2000)fail('Informe um título de 3 a 120 caracteres e uma mensagem de 5 a 2.000 caracteres.');
    return transaction(async()=>{
      const notification=await put('local-notification:'+randomUUID(),'local_notification',{businessId:b.id,title,message,createdAt:now(),actor:String(user.id),readAt:null});
      await audit(user,'Notificação enviada ao portal',b.name,title);return {notification};
    });
  }
  async function notifications(token,d) {
    const a=await customer.authenticate(token);
    if(d) {const item=await read(d.id,'local_notification');if(!item||item.businessId!==a.businessId)fail('Notificação não encontrada.',404);if(!item.readAt)await put(item.id,'local_notification',{...item,readAt:now()},item);return {ok:true};}
    return {notifications:(await db.prepare("SELECT * FROM records WHERE org_id=? AND kind='local_notification' AND json_extract(data,'$.businessId')=? ORDER BY created_at DESC LIMIT 100").all(ORG,a.businessId)).map(decode).map(({id,title,message,createdAt,readAt})=>({id,title,message,createdAt,readAt}))};
  }
  return {listing,accountAction,cleanupPreview,cleanup,notify,notifications};
}
