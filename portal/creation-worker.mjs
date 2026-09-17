import {runCloudWorker} from './cloud-worker.mjs';

// Each hop has its own Function lifetime. Stop as soon as this creation queue is empty.
export async function continueCreations(app,{env=process.env,fetcher=fetch,sleep=ms=>new Promise(r=>setTimeout(r,ms)),now=Date.now}={}){
 if(env.HELPU_AUTOMATIONS_ENABLED!=='true')return false;
 let endpoint;try{const u=new URL(env.HELPU_PUBLIC_URL);if(u.protocol!=='https:'||u.username||u.password||u.pathname!=='/'||u.search||u.hash)return false;endpoint=u.origin+'/api/worker';}catch{return false;}
 if(String(env.CRON_SECRET||'').length<32)return false;
 const active=await app.database.prepare('SELECT expires_at FROM worker_leases WHERE id=?').get('operating-kernel');
 if(active?.expires_at>now())return false;
 const pending=await app.database.prepare("SELECT MIN(scheduled_at) AS due FROM jobs WHERE state IN ('queued','waiting_provider') AND (kind='creation' OR json_extract(payload,'$.creationId') IS NOT NULL) AND scheduled_at<=?").get(now()+30000);
 if(pending?.due===null||pending?.due===undefined)return false;
 const delay=Math.max(0,Math.min(30000,Number(pending.due)-now()));if(delay)await sleep(delay);
 const response=await fetcher(endpoint,{method:'POST',headers:{Authorization:'Bearer '+env.CRON_SECRET,'X-Helpu-Creation-Wake':'1'},redirect:'error',signal:AbortSignal.timeout(10000)});
 return response.ok;
}
export async function runCreationWorker(app,options={}){
 const env=options.env||process.env;
 const result=await runCloudWorker(app,{enabled:env.HELPU_AUTOMATIONS_ENABLED==='true'});
 if(result.state==='checked')await continueCreations(app,options);
 return result;
}
