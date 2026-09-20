import os from 'node:os';
import path from 'node:path';
import {timingSafeEqual} from 'node:crypto';
import {waitUntil,attachDatabasePool,getDeadline} from '@vercel/functions';
import {createDatabase} from '../portal/database.mjs';
import {createHelpuServer} from '../server.mjs';
import {runCreationWorker,continueCreations} from '../portal/creation-worker.mjs';

let ready;
async function application(){
  if(!ready)ready=(async()=>{
    for(const key of ['DATABASE_URL','DATABASE_CA_CERT','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','HELPU_INTEGRATION_KEY','HELPU_PUBLIC_URL','CRON_SECRET'])if(!process.env[key])throw new Error('Missing production configuration');
    const db=createDatabase({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:true,ca:process.env.DATABASE_CA_CERT}});attachDatabasePool(db.pool);
    return createHelpuServer({database:db,cloud:true,dataDir:path.join(os.tmpdir(),'helpu'),extraOrigins:process.env.VERCEL_URL?['https://'+process.env.VERCEL_URL]:[],portalOptions:{startScheduler:false}});
  })().catch(error=>{ready=null;throw error;});
  return ready;
}
function secretMatches(value){const expected=Buffer.from('Bearer '+process.env.CRON_SECRET),actual=Buffer.from(String(value||''));return actual.length===expected.length&&timingSafeEqual(actual,expected);}
function json(res,status,body){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}).end(JSON.stringify(body));}
export default async function handler(req,res){
  try {
    const route=new URL(req.url,'https://helpu.invalid').pathname;
    if(route==='/api/worker'){
      if(req.method!=='POST'||!process.env.CRON_SECRET||!secretMatches(req.headers.authorization)){json(res,401,{error:'Acesso não autorizado.'});return;}
      const app=await application();
      if(req.headers['x-helpu-creation-wake']==='1'){waitUntil(runCreationWorker(app).catch(()=>console.error('helpu_creation_worker_failed')));json(res,202,{state:'accepted'});return;}
      const result=await runCreationWorker(app);
      json(res,200,result);return;
    }
    const app=await application();
    if(route==='/api/health'){
      await app.database.prepare('SELECT version FROM portal_migrations WHERE version=4').get();
      json(res,200,{status:'ok',storage:'supabase',runtime:'vercel'});return;
    }
    await app.handle(req,res);
    // Welcome delivery has its own durable claim and never starts an AI job.
    // It does not depend on enabling the daily marketing automation.
    if(req.method==='POST'&&route==='/api/auth/signup'&&res.statusCode===201){
      waitUntil(app.portal.dispatchSignupWelcome().catch(()=>console.error('helpu_welcome_dispatch_failed')));
    }
    // An authenticated poll can resume a queued creation if a previous wake was lost.
    if(req.method==='GET'&&res.statusCode===200&&/^\/api\/portal\/[^/]+\/creations(?:\/[^/]+)?$/.test(route)){
      waitUntil(continueCreations(app).catch(()=>console.error('helpu_creation_wake_failed')));
    }
    if(req.method==='POST'&&res.statusCode>=200&&res.statusCode<300&&(route.startsWith('/api/portal/')||route==='/webhooks/helpu-whatsapp')&&process.env.HELPU_AUTOMATIONS_ENABLED==='true'&&(!getDeadline()||getDeadline().getTime()-Date.now()>150000)){
      waitUntil(runCreationWorker(app).catch(()=>console.error('helpu_worker_failed')));
    }
  }catch{
    if(!res.headersSent)json(res,503,{error:'O serviço está temporariamente indisponível. Tente novamente.'});else res.destroy();
  }
}
