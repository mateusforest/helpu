import {randomUUID} from 'node:crypto';

// One durable lease protects the existing worker across concurrent Vercel instances.
// Expired jobs are recovered by the existing Kernel; uncertain effects are not retried.
export async function runCloudWorker(app,{enabled=false,now=Date.now,leaseMs=360000}={}) {
  if(!enabled)return {state:'disabled'};
  const db=app.database,owner=randomUUID(),startedAt=now();
  const lease=await db.prepare('INSERT INTO worker_leases(id,owner,expires_at,last_started_at) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET owner=excluded.owner,expires_at=excluded.expires_at,last_started_at=excluded.last_started_at,last_error=NULL WHERE worker_leases.expires_at<=? RETURNING owner').get('operating-kernel',owner,startedAt+leaseMs,startedAt,startedAt);
  if(!lease)return {state:'already_running'};
  let error;
  try {
    await db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(now());
    await db.prepare('DELETE FROM auth_attempts WHERE expires_at<=?').run(now());
    await app.portal.tick();
    return {state:'checked',startedAt,completedAt:now()};
  }catch(e){error='O worker não concluiu esta verificação. Consulte os jobs e tente novamente.';throw e;}
  finally{await db.prepare('UPDATE worker_leases SET expires_at=0,last_completed_at=?,last_error=? WHERE id=? AND owner=?').run(now(),error||null,'operating-kernel',owner);}
}
