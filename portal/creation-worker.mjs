import {whatsappBatchDelay} from './whatsapp-chat.mjs';
import {runCloudWorker} from './cloud-worker.mjs';

// Each hop has its own Function lifetime. Stop as soon as this creation queue is empty.
export async function continueCreations(app,{env=process.env,fetcher=fetch,sleep=ms=>new Promise(r=>setTimeout(r,ms)),now=Date.now}={}){
 if(env.HELPU_AUTOMATIONS_ENABLED!=='true')return false;
 let endpoint;try{const u=new URL(env.HELPU_PUBLIC_URL);if(u.protocol!=='https:'||u.username||u.password||u.pathname!=='/'||u.search||u.hash)return false;endpoint=u.origin+'/api/worker';}catch{return false;}
 if(String(env.CRON_SECRET||'').length<32)return false;
 const active=await app.database.prepare('SELECT expires_at FROM worker_leases WHERE id=?').get('operating-kernel');
 if(active?.expires_at>now())return false;
 const pending=await app.database.prepare("SELECT MIN(scheduled_at) AS due FROM jobs WHERE state IN ('queued','waiting_provider') AND (kind IN ('creation','conversation') OR json_extract(payload,'$.creationId') IS NOT NULL) AND scheduled_at<=?").get(now()+30000);
 const receiving=['HELPU_WHATSAPP_NUMBER','HELPU_WHATSAPP_ACCESS_TOKEN','HELPU_WHATSAPP_PHONE_NUMBER_ID','HELPU_WHATSAPP_APP_SECRET','HELPU_WHATSAPP_VERIFY_TOKEN'].every(key=>!!env[key]);
 const inbox=receiving&&await app.database.prepare("SELECT MAX(created_at) AS latest FROM records WHERE kind='whatsapp_chat_inbox' AND json_extract(data,'$.state')='queued'").get();
 const batch=receiving&&await app.database.prepare("SELECT 1 FROM records WHERE kind='whatsapp_chat_batch' AND json_extract(data,'$.state')='queued' LIMIT 1").get();
 const due=[pending?.due,inbox?.latest==null?null:Number(inbox.latest)+whatsappBatchDelay(env),batch?(inbox?.latest==null?now():Number(inbox.latest)+whatsappBatchDelay(env)):null].filter(x=>x!==null&&x!==undefined);
 if(!due.length)return false;
 const delay=Math.max(0,Math.min(30000,Math.min(...due)-now()));if(delay)await sleep(delay);
 const response=await fetcher(endpoint,{method:'POST',headers:{Authorization:'Bearer '+env.CRON_SECRET,'X-Helpu-Creation-Wake':'1'},redirect:'error',signal:AbortSignal.timeout(10000)});
 return response.ok;
}
export async function runCreationWorker(app,options={}){
 const env=options.env||process.env;
 const result=await runCloudWorker(app,{enabled:env.HELPU_AUTOMATIONS_ENABLED==='true'});
 if(result.state==='checked')await continueCreations(app,options);
 return result;
}
