import {randomUUID} from 'node:crypto';
export async function legacyBusiness(db,fields={}) {
  const org='helpu-local-directory',id='local:'+randomUUID(),at=Date.now();
  const data={name:'Empresa antiga',owner:'Responsável',phone:'5554999998888',publicPhone:'5554999998888',sector:'Tecnologia',state:'Novo cadastro',description:'',address:'',hours:'',offer:'',notes:'',approval:false,createdAt:at,...fields};
  await db.prepare("INSERT OR IGNORE INTO companies(id,name,profile,policy,created_at,updated_at) VALUES(?,?,'{}','{}',?,?)").run(org,'Helpu Local',at,at);
  await db.prepare("INSERT INTO records(id,org_id,kind,data,external_id,created_at,updated_at) VALUES(?,?,'local_business',?,?,?,?)").run(id,org,JSON.stringify(data),id,at,at);
  return {...data,id,version:1};
}
