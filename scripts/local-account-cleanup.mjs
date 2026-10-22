// Uses the same authorization and transaction as the administrative screen.
// No credentials, passwords, or connection strings are printed.
import {createDatabase} from '../portal/database.mjs';
import {createAssistedPublishing} from '../portal/assisted-publishing.mjs';
import {createLocalControl} from '../portal/local-control.mjs';

const args=process.argv.slice(2),value=name=>{const i=args.indexOf(name);return i<0?null:args[i+1];};
const preserveEmail=value('--preserve-email')?.trim().toLowerCase(),digest=value('--apply');
if(!preserveEmail||!process.env.DATABASE_URL||!process.env.DATABASE_CA_CERT) {
  console.error('Configure DATABASE_URL, DATABASE_CA_CERT e as variáveis HELPU_OPERATOR_* no ambiente seguro. Execute com --preserve-email EMAIL. A primeira execução apenas mostra a prévia; --apply DIGEST aplica exatamente a lista revisada.');
  process.exitCode=1;
} else {
  const db=createDatabase({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:true,ca:process.env.DATABASE_CA_CERT.replace(/\\n/g,'\n')}});
  try {
    const user=await db.prepare('SELECT id,name,email,created_at FROM users WHERE lower(email)=?').get(preserveEmail);
    const {operator}=await createAssistedPublishing({db});
    if(!user||!operator(user))throw Object.assign(Error('O e-mail informado não corresponde a um administrador configurado. Nenhuma conta foi alterada.'),{status:403});
    const control=createLocalControl({db,operator});
    const result=digest?await control.cleanup(user,{preserveEmail,digest,confirm:'EXCLUIR CONTAS'}):await control.cleanupPreview(user,preserveEmail);
    console.log(JSON.stringify(result,null,2));
  } catch(e) {
    // Driver errors may contain connection details; only application errors are safe to show.
    console.error(e.status?e.message:'Não foi possível concluir. Verifique a conexão, o certificado e as permissões do banco. A operação é transacional.');
    process.exitCode=1;
  } finally {await db.close();}
}
