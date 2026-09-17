import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRuntimeServer,createWorkerClock} from '../services/runtime/server.mjs';
import {createCloudRuntime} from '../portal/cloud-runtime.mjs';

const org=randomUUID(),other=randomUUID(),secret='test-only-runtime-secret-1234567890123456';
test('gateway autentica segredo, empresa e ator; controle e frames não ficam em cache',async t=>{
 const calls=[];
 const browser={capabilities:async()=>true,list:async company=>[{id:'instagram',company}],open:async(company,channel)=>{calls.push({company,channel});return {open:true};},human:async(company,channel,actor,d)=>{calls.push({company,channel,actor,type:d.type});return {ok:true};},frame:async(company,channel,actor)=>({image:'aGVsbG8=',width:1280,height:800,actor})};
 const server=createRuntimeServer({secret,browser,video:{capabilities:async()=>({available:false,reason:'not installed'})}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
 const base='http://127.0.0.1:'+server.address().port;
 assert.equal((await fetch(base+'/v1/status')).status,401);
 const headers={Authorization:'Bearer '+secret,'X-Helpu-Company':org};
 assert.equal((await fetch(base+'/v1/status',{headers:{...headers,'X-Helpu-Company':'../private'}})).status,400);
 const health=await (await fetch(base+'/v1/status',{headers})).json();assert.equal(health.video,false);assert.equal(health.browser,true);
 assert.equal((await fetch(base+'/v1/browser/instagram/open',{method:'POST',headers,body:'{}'})).status,403);
 const client=createCloudRuntime({env:{HELPU_RUNTIME_URL:base,HELPU_RUNTIME_SECRET:secret},allowLoopback:true});
 await client.request(org,'/browser/instagram/open',{method:'POST',actor:7,data:{org:other}});
 await client.request(org,'/browser/instagram/human',{method:'POST',actor:7,data:{type:'type',text:'test-only-private-input'}});
 assert.deepEqual(calls,[{company:org,channel:'instagram'},{company:org,channel:'instagram',actor:'7',type:'type'}]);
 const frame=await fetch(base+'/v1/browser/instagram/frame',{headers:{...headers,'X-Helpu-Actor':'7'}});assert.equal(frame.headers.get('cache-control'),'private, no-store');assert.equal((await frame.json()).actor,'7');
 await assert.rejects(()=>client.request(org,'/video/../../status'),/inválido/);
 const profiles=await client.request(other,'/browser');assert.equal(profiles.profiles[0].company,other);
});
test('runtime exige origem HTTPS e omite segredo do status e dos erros',async()=>{
 let calls=0;const client=createCloudRuntime({env:{HELPU_RUNTIME_URL:'http://example.com',HELPU_RUNTIME_SECRET:secret},fetcher:async()=>{calls++;}});
 assert.equal((await client.status(org)).configured,false);assert.equal(calls,0);
 const down=createCloudRuntime({env:{HELPU_RUNTIME_URL:'https://runtime.example.test',HELPU_RUNTIME_SECRET:secret},fetcher:async()=>{throw new Error(secret);}});
 const status=await down.status(org);assert.equal(status.available,false);assert.ok(!JSON.stringify(status).includes(secret));
 await assert.rejects(()=>down.request(org,'/video/projects',{method:'POST',data:{}}),e=>e.state==='uncertain'&&!e.message.includes(secret));
});
test('resposta cortada após envio preserva incerteza e não inicia nova mutação',async()=>{
 let calls=0;const runtime=createCloudRuntime({env:{HELPU_RUNTIME_URL:'https://runtime.example.test',HELPU_RUNTIME_SECRET:secret},fetcher:async()=>{calls++;return {ok:true,headers:new Headers(),body:{async *[Symbol.asyncIterator](){yield Buffer.from('{');throw new Error('connection lost');}}};}});
 await assert.rejects(()=>runtime.request(org,'/video/projects',{method:'POST',data:{}}),e=>e.state==='uncertain');assert.equal(calls,1);
});
test('relógio chama worker autenticado sem depender de painel e evita sobreposição',async()=>{
 let calls=0,release;
 const clock=createWorkerClock({url:'https://www.helpumkt.com',secret,fetcher:async(url,opts)=>{calls++;assert.equal(url,'https://www.helpumkt.com/api/worker');assert.equal(opts.method,'POST');assert.equal(opts.headers.Authorization,'Bearer '+secret);await new Promise(resolve=>{release=resolve;});return Response.json({state:'checked'});}});
 const pending=clock.tick();await clock.tick();assert.equal(calls,1);release();await pending;assert.equal(clock.status().state,'checked');clock.stop();await clock.tick();assert.equal(calls,1);
});

test('serviço dedicado expõe apenas saúde pública e vídeo autenticado',async t=>{
 const server=createRuntimeServer({secret,browser:null,video:{capabilities:async()=>({available:true}),list:async company=>[{company}]},publicHealth:true});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 t.after(()=>new Promise(r=>{server.closeAllConnections();server.close(r);}));
 const base='http://127.0.0.1:'+server.address().port;
 const health=await fetch(base+'/healthz');assert.equal(health.status,200);assert.deepEqual(await health.json(),{ok:true});
 assert.equal((await fetch(base+'/v1/video/projects')).status,401);
 const headers={Authorization:'Bearer '+secret,'X-Helpu-Company':org};
 const status=await (await fetch(base+'/v1/status',{headers})).json();assert.equal(status.browser,false);assert.equal(status.video,true);
 assert.equal((await fetch(base+'/v1/browser',{headers})).status,404);
 assert.deepEqual(await (await fetch(base+'/v1/video/projects',{headers})).json(),{projects:[{company:org}]});
 assert.equal((await fetch(base+'/v1/video/projects',{headers:{...headers,'X-Helpu-Company':'invalid'}})).status,400);
});
