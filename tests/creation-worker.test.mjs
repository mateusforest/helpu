import test from 'node:test';
import assert from 'node:assert/strict';
import {createDatabase} from '../portal/database.mjs';
import {continueCreations,runCreationWorker} from '../portal/creation-worker.mjs';

const env={HELPU_AUTOMATIONS_ENABLED:'true',HELPU_PUBLIC_URL:'https://helpu.example.test',CRON_SECRET:'test-only-creation-worker-secret-32'};
async function fixture(t){
 const database=createDatabase({filename:':memory:'});
 await database.exec(`CREATE TABLE jobs(id TEXT PRIMARY KEY,kind TEXT,state TEXT,payload TEXT,scheduled_at INTEGER);
 CREATE TABLE sessions(expires_at INTEGER);CREATE TABLE auth_attempts(expires_at INTEGER);
 CREATE TABLE worker_leases(id TEXT PRIMARY KEY,owner TEXT,expires_at INTEGER,last_started_at INTEGER,last_completed_at INTEGER,last_error TEXT);`);
 t.after(()=>database.close());
 return {database,portal:{tick:async()=>{}}};
}

test('creation worker wakes each authorized queued page once and stops when empty',async t=>{
 const app=await fixture(t),wakes=[];
 await app.database.prepare('INSERT INTO jobs VALUES(?,?,?,?,?)').run('plan','creation','queued','{}',1);
 await app.database.prepare('INSERT INTO jobs VALUES(?,?,?,?,?)').run('page','image','queued',JSON.stringify({creationId:'plan'}),2);
 app.portal.tick=async()=>{const next=await app.database.prepare("SELECT id FROM jobs WHERE state='queued' ORDER BY scheduled_at LIMIT 1").get();if(next)await app.database.prepare("UPDATE jobs SET state='succeeded' WHERE id=?").run(next.id);};
 const fetcher=async(url,options)=>{wakes.push({url,options});const lease=await app.database.prepare('SELECT expires_at FROM worker_leases').get();assert.equal(lease.expires_at,0,'release lease before next invocation');return new Response('{}',{status:202});};
 assert.equal((await runCreationWorker(app,{env,fetcher})).state,'checked');assert.equal(wakes.length,1);
 assert.equal(wakes[0].url,'https://helpu.example.test/api/worker');assert.equal(wakes[0].options.method,'POST');
 assert.equal(wakes[0].options.headers.Authorization,'Bearer '+env.CRON_SECRET);assert.equal(wakes[0].options.headers['X-Helpu-Creation-Wake'],'1');assert.equal(wakes[0].options.redirect,'error');
 await runCreationWorker(app,{env,fetcher});assert.equal(wakes.length,1,'last page stops wake chain');
 await app.database.prepare('INSERT INTO jobs VALUES(?,?,?,?,?)').run('routine','agent','queued','{}',1);
 assert.equal(await continueCreations(app,{env,fetcher}),false,'unrelated routine does not keep creation chain alive');
});

test('creation wake respects due time, active lease and authenticated HTTPS destination',async t=>{
 const app=await fixture(t),calls=[],delays=[];const now=()=>1000;
 await app.database.prepare('INSERT INTO jobs VALUES(?,?,?,?,?)').run('image','image','waiting_provider',JSON.stringify({creationId:'parent'}),11000);
 const options={env,now,sleep:async ms=>delays.push(ms),fetcher:async url=>{calls.push(url);return new Response('{}',{status:202});}};
 assert.equal(await continueCreations(app,options),true);assert.deepEqual(delays,[10000]);
 await app.database.prepare('UPDATE jobs SET scheduled_at=40000').run();assert.equal(await continueCreations(app,options),false);assert.equal(calls.length,1);
 await app.database.prepare('UPDATE jobs SET scheduled_at=1').run();
 for(const url of ['http://helpu.example.test','https://user:pass@helpu.example.test','https://helpu.example.test/path','https://helpu.example.test/?leak=yes'])assert.equal(await continueCreations(app,{...options,env:{...env,HELPU_PUBLIC_URL:url}}),false);
 assert.equal(await continueCreations(app,{...options,env:{...env,CRON_SECRET:'short'}}),false);
 assert.equal(await continueCreations(app,{...options,env:{...env,HELPU_AUTOMATIONS_ENABLED:'false'}}),false);assert.equal(calls.length,1);
 await app.database.prepare('INSERT INTO worker_leases(id,owner,expires_at) VALUES(?,?,?)').run('operating-kernel','existing',Date.now()+60000);
 assert.equal(await continueCreations(app,options),false);assert.equal(calls.length,1);
 const result=await runCreationWorker(app,options);assert.equal(result.state,'already_running');assert.equal(calls.length,1);
});

test('failed creation wake never reports success',async t=>{
 const app=await fixture(t);await app.database.prepare('INSERT INTO jobs VALUES(?,?,?,?,?)').run('plan','creation','queued','{}',1);
 assert.equal(await continueCreations(app,{env,fetcher:async()=>new Response(null,{status:503})}),false);
 await assert.rejects(continueCreations(app,{env,fetcher:async()=>{throw new Error('transport');}}),/transport/);
});
