import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createDecipheriv,randomUUID} from 'node:crypto';
import {loadConfiguration} from './runtime.mjs';
import {createProviders} from '../portal/providers.mjs';

// Explicit diagnostic: uses the saved key only in memory; never prints or rewrites the key.
const {dataDir}=loadConfiguration();
const save=process.argv.includes('--save');
const db=new DatabaseSync(path.join(dataDir,'helpu.sqlite'),{readOnly:!save});
try{
 const rows=db.prepare("SELECT org_id,sealed FROM integrations WHERE provider='openai'").all();
 if(!rows.length){console.log('Nenhuma conexão OpenAI configurada. Abra Integrações no portal.');process.exitCode=1;}
 for(const [index,row]of rows.entries()){
  const key=fs.readFileSync(path.join(dataDir,'integration.key'));
  const [iv,tag,encrypted]=row.sealed.split('.').map(part=>Buffer.from(part,'base64'));
  const decipher=createDecipheriv('aes-256-gcm',key,iv);decipher.setAuthTag(tag);
  const config=JSON.parse(Buffer.concat([decipher.update(encrypted),decipher.final()]).toString('utf8'));
  const validationVersion=()=>db.prepare("SELECT id,version FROM records WHERE org_id=? AND kind='connection_validation' AND external_id='validation:openai'").get(row.org_id);
  const originalValidation=JSON.stringify(validationVersion());
  const result=await createProviders().operationalValidation(config,{tools:['deliver_post']});
  if(save){
   db.exec('BEGIN IMMEDIATE');
   try{
    if(db.prepare("SELECT sealed FROM integrations WHERE org_id=? AND provider='openai'").get(row.org_id)?.sealed!==row.sealed)throw new Error('A configuração mudou durante o teste. Valide novamente.');
    if(JSON.stringify(validationVersion())!==originalValidation)throw new Error('Uma validação mais recente substituiu este teste. O resultado anterior foi preservado.');
    const now=Date.now();result.validationId=randomUUID();
    db.prepare("INSERT INTO records(id,org_id,kind,data,external_id,created_at,updated_at) VALUES(?,?,'connection_validation',?,'validation:openai',?,?) ON CONFLICT(org_id,kind,external_id) DO UPDATE SET data=excluded.data,version=records.version+1,updated_at=excluded.updated_at").run(randomUUID(),row.org_id,JSON.stringify(result),now,now);
    db.prepare("UPDATE integrations SET verified_at=?,error=? WHERE org_id=? AND provider='openai'").run(result.status==='validated'?now:null,result.error||null,row.org_id);
    db.prepare('INSERT INTO audit(id,org_id,actor,action,resource_id,note,created_at) VALUES(?,?,?,?,?,?,?)').run(randomUUID(),row.org_id,'sistema','Validação operacional da inteligência','openai',result.status,now);
    db.exec('COMMIT');
   }catch(error){db.exec('ROLLBACK');throw error;}
  }
  console.log(JSON.stringify({connection:index+1,status:result.status,configuredModel:result.configuredModel,model:result.model,structuredOutput:result.structuredOutput,toolCalling:result.toolCalling,latencyMs:result.latencyMs,error:result.error||null}));
  if(result.status!=='validated')process.exitCode=1;
 }
}finally{db.close();}
