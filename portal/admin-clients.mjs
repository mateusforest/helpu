import {randomUUID} from 'node:crypto';
const parse=r=>r?{...JSON.parse(r.data),version:r.version}:null;
const fail=(message,status=409)=>{throw Object.assign(new Error(message),{status});};
export async function clientControl(db,org,now=Date.now()){
 const row=parse(await db.prepare("SELECT data,version FROM records WHERE id=? AND org_id=? AND kind='admin_client'").get('admin-client:'+org,org))||{state:'active',version:0};
 return {...row,grantActive:row.state==='active'&&!!row.grant&&row.grant.start<=now&&!row.grant.revokedAt&&(!row.grant.end||row.grant.end>now)};
}
export function createAdminClients({db,operator,now=Date.now}){
 async function requireOperator(user){if(!operator(user))fail('Acesso restrito à equipe Helpu.',403);}
 async function audit(org,user,action,note=''){await db.prepare('INSERT INTO audit VALUES(?,?,?,?,?,?,?)').run(randomUUID(),org,String(user.id),action,org,note.slice(0,500),now());}
 async function detail(org,user){await requireOperator(user);const c=await db.prepare('SELECT id,name,created_at,updated_at FROM companies WHERE id=?').get(org);if(!c)fail('Empresa não encontrada.',404);
  const control=await clientControl(db,org,now()),members=await db.prepare('SELECT u.id,u.name,u.email,m.role FROM users u JOIN memberships m ON m.user_id=u.id WHERE m.org_id=?').all(org);
  const records=(await db.prepare("SELECT id,kind,data,created_at FROM records WHERE org_id=? AND kind IN ('subscription','finance_receivable','content','consultation') ORDER BY created_at DESC").all(org)).map(r=>({...JSON.parse(r.data),id:r.id,kind:r.kind}));
  const charges=records.filter(r=>r.kind==='finance_receivable');
  return {company:c,control,members,subscription:records.find(r=>r.kind==='subscription')||null,finance:{paid:charges.filter(r=>r.state==='paid'&&r.providerMode!=='test').reduce((n,r)=>n+Number(r.amountCents||0),0),open:charges.filter(r=>!['paid','canceled','cancelled'].includes(r.state)).reduce((n,r)=>n+r.amountCents,0),charges:charges.map(r=>({id:r.id,description:r.description,amountCents:r.amountCents,state:r.state,dueDate:r.dueDate}))},contents:records.filter(r=>r.kind==='content').map(r=>({id:r.id,title:r.title,status:r.status,format:r.format,assetId:r.assetId})),documents:await db.prepare('SELECT id,name,mime,size FROM assets WHERE org_id=? ORDER BY created_at DESC LIMIT 100').all(org)};
 }
 async function listing(user){await requireOperator(user);const clients=await db.prepare('SELECT id,name,created_at FROM companies ORDER BY created_at DESC').all();return {clients:await Promise.all(clients.map(async c=>{const control=await clientControl(db,c.id,now());const sub=parse(await db.prepare("SELECT data,version FROM records WHERE org_id=? AND kind='subscription' AND id=?").get(c.id,'subscription:'+c.id));const counts=await db.prepare("SELECT kind,COUNT(*) AS n FROM records WHERE org_id=? AND kind IN ('content','consultation') GROUP BY kind").all(c.id);return {...c,control,subscription:sub?{plan:sub.plan,state:sub.state,end:sub.end}:null,contents:Number(counts.find(r=>r.kind==='content')?.n||0),consultations:Number(counts.find(r=>r.kind==='consultation')?.n||0)};}))};}
 async function action(org,user,d){await requireOperator(user);const c=await db.prepare('SELECT id,name FROM companies WHERE id=?').get(org);if(!c)fail('Empresa não encontrada.',404);const old=await clientControl(db,org,now());if(d.version!==old.version)fail('O cadastro mudou. Atualize antes de continuar.');const note=String(d.reason||'').trim();if(note.length<5||note.length>1000)fail('Registre o motivo desta alteração.');let next={...old};delete next.grantActive;delete next.version;
  if(d.action==='edit'){const name=String(d.name||'').trim();if(!name||name.length>120)fail('Informe o nome da empresa.');next.contact=String(d.contact||'').slice(0,300);next.notes=String(d.notes||'').slice(0,2000);next.name=name;}
  else if(['suspend','activate','delete'].includes(d.action)){if(d.action==='delete'){if(d.confirmName!==c.name)fail('Digite o nome exato da empresa para excluir do diretório.');const running=await db.prepare("SELECT COUNT(*) AS n FROM jobs WHERE org_id=? AND state IN ('queued','working','waiting_provider')").get(org);if(Number(running.n))fail('Pause ou conclua as execuções antes de excluir do diretório.');}next.state={suspend:'inactive',activate:'active',delete:'deleted'}[d.action];}
  else if(d.action==='grant'){if(!['test','own'].includes(d.purpose)||d.confirmed!==true)fail('Confirme a liberação para teste ou uso próprio.');let end=d.end?Date.parse(d.end):null;if(d.purpose==='test'&&(!end||end<=now()||end>now()+90*86400000))fail('O teste precisa de término futuro em até 90 dias.');if(d.end&&(!Number.isFinite(end)||end<=now()))fail('Data de término inválida.');next.grant={purpose:d.purpose,unlimited:true,start:now(),end,reason:note,actor:user.id};}
  else if(d.action==='revoke')next.grant=next.grant?{...next.grant,revokedAt:now(),revokedBy:user.id}:null;
  else fail('Ação inválida.',400);
  next.updatedAt=now();next.actor=user.id;await db.exec('SAVEPOINT admin_client');try{
   if(old.version){const changed=await db.prepare("UPDATE records SET data=?,version=version+1,updated_at=? WHERE id=? AND org_id=? AND version=? RETURNING id").get(JSON.stringify(next),now(),'admin-client:'+org,org,old.version);if(!changed)fail('O cadastro mudou. Atualize.');}
   else await db.prepare("INSERT INTO records(id,org_id,kind,data,created_at,updated_at) VALUES(?,?,'admin_client',?,?,?)").run('admin-client:'+org,org,JSON.stringify(next),now(),now());
   if(d.action==='edit')await db.prepare('UPDATE companies SET name=?,updated_at=? WHERE id=?').run(next.name,now(),org);
   await audit(org,user,'Cliente: '+d.action,note);await db.exec('RELEASE SAVEPOINT admin_client');
  }catch(e){await db.exec('ROLLBACK TO SAVEPOINT admin_client');await db.exec('RELEASE SAVEPOINT admin_client');throw e;}return detail(org,user);
 }
 return {listing,detail,action,audit};
}
