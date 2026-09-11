import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createHelpuServer} from '../server.mjs';
import {dailyPriority} from '../portal/studio.mjs';

test('rotina prioriza entregas, bloqueios, execuções e resultados antes de novas ideias',()=>{
  for(const status of ['draft','review','approved','scheduled'])assert.equal(dailyPriority({contents:[{id:'existing',status}]}).intelligenceRequired,false);
  for(const state of ['producing','awaiting_approval','blocked','measuring'])assert.equal(dailyPriority({operations:[{id:'op',state}]}).intelligenceRequired,false);
  assert.equal(dailyPriority({operations:[{id:'op',state:'completed',result:{}}]}).intelligenceRequired,false);
  assert.equal(dailyPriority({jobs:[{id:'job',state:'uncertain'}]}).intelligenceRequired,false);
  assert.equal(dailyPriority({tasks:[{id:'task',status:'doing'}]}).intelligenceRequired,false);
  assert.equal(dailyPriority({contents:[{id:'old',status:'published'}],jobs:[{state:'blocked',idempotency_key:'daily-director:old'}]}).intelligenceRequired,true);
});

test('produção existente: origem, dependências e evidência sem geração fictícia',async t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'helpu-studio-'));
  let aiCalls=0,mediaCalls=0,server,origin,cookie='',org,db;
  const pieces=['carousel','video','image'].map(format=>({title:'TEST ONLY '+format,caption:'Texto original confirmado no fixture.',visualPrompt:'Briefing original do fixture.',format,channel:'instagram'}));
  const providers={text:async()=>{aiCalls++;return {pieces,summary:'Somente fixture',questions:[],recommendations:[]};},media:async()=>{mediaCalls++;throw new Error('External generation forbidden in tests');}};
  const open=async()=>{server=createHelpuServer({dataDir:directory,portalOptions:{startScheduler:false,providers}});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;};
  const request=async(route,method='GET',data)=>{const r=await fetch(origin+route,{method,headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)});return {status:r.status,headers:r.headers,body:await r.json()};};
  const api=(route,method,data)=>request('/api/portal/'+org+'/'+route,method,data);
  const state=async()=>(await api('state')).body;
  const close=async()=>{await server.portal.shutdown();await new Promise(resolve=>server.close(resolve));};
  const count=table=>db.prepare('SELECT count(*) AS n FROM '+table).get().n;
  try{
    await open();db=new DatabaseSync(path.join(directory,'helpu.sqlite'));
    const user=await request('/api/auth/signup','POST',{name:'TEST ONLY',company:'TEST ONLY EME',email:'studio@example.test',password:'test-only-long-password'});cookie=user.headers.get('set-cookie').split(';')[0];org=(await request('/api/portal/bootstrap')).body.companies[0].id;
    await api('company','PATCH',{profile:{description:'Empresa de teste.',audience:'Teste.',visualIdentity:'Geist, verde e branco.',tone:'Objetivo.'}});
    await api('jobs','POST',{kind:'agent',payload:{agent:'creative',brief:'Fixture: três rascunhos.'},idempotencyKey:'fixture-source'});
    await server.portal.tick();assert.equal(aiCalls,1);
    const original=(await state()).records.content,content=original.find(c=>c.format==='image'),sourceJob=(await state()).jobs[0];
    let operationId,first;
    await t.test('verificação escolhe a entrega existente e comprova materiais e executor ausentes',async()=>{
      const result=await api('studio/'+content.id+'/preflight','POST',{});assert.equal(result.status,200);
      first=result.body;operationId=first.operationId;
      assert.equal(first.contentId,content.id);assert.equal(first.sourceJobId,sourceJob.id);
      assert.equal(first.state,'blocked_missing_brand_assets');assert.deepEqual(first.blockers[0].missing.map(x=>x.field),['logo','palette','font']);
      assert.ok(first.blockers.some(b=>b.code==='blocked_higgsfield_not_configured'));assert.equal(first.generation,null);assert.equal(first.finalAsset,null);
      const s=await state();assert.equal(s.records.content.length,3);assert.equal(s.operations.length,1);assert.equal(s.records.tasks.length,1);
      assert.ok(s.records.content.every(c=>c.operationId===operationId));assert.ok(s.records.content.every(c=>c.status==='review'&&c.caption===content.caption));
      assert.equal(s.operations[0].state,'blocked');assert.equal(s.records.tasks[0].status,'todo');assert.equal(s.records.campaigns.length,0);
      assert.equal(s.operations[0].evidence[0].status,'recorded');assert.equal(s.operations[0].evidence[0].executor,'local');
    });
    await t.test('repetição preserva os mesmos registros, versão, tarefa e histórico',async()=>{
      const before=[count('records'),count('conversation_messages'),count('audit')];
      const again=(await api('studio/'+content.id+'/preflight','POST',{})).body;
      assert.equal(again.storedVersion,1);assert.deepEqual([count('records'),count('conversation_messages'),count('audit')],before);
    });
    await t.test('aprovação, geração e publicação não atravessam as dependências',async()=>{
      for(const action of ['approve','execute','schedule'])assert.equal((await api('operations/'+operationId+'/action','POST',{action})).status,409);
      for(const kind of ['image','video','publish'])assert.equal((await api('jobs','POST',{kind,payload:{contentId:content.id}})).status,409);
      assert.throws(()=>server.portal.kernel.action(org,operationId,1,{action:'approve'}));
      assert.equal(mediaCalls,0);assert.equal(count('assets'),0);
    });
    await t.test('retomada usa a verificação existente sem chamar o diretor',async()=>{
      assert.equal((await api('operations/'+operationId+'/action','POST',{action:'pause'})).status,200);
      assert.equal((await api('operations/'+operationId+'/action','POST',{action:'resume'})).status,200);
      assert.equal((await state()).operations[0].state,'blocked');assert.equal(aiCalls,1);assert.equal((await state()).records.content.length,3);
      assert.equal((await state()).operations[0].paused,false);
      assert.equal((await state()).operations[0].blockers[0].code,'blocked_missing_brand_assets');
      assert.equal((await api('studio/'+content.id)).body.storedVersion,1);
    });
    await t.test('mudança de briefing cria nova verificação e preserva a anterior',async()=>{
      const current=(await state()).records.content.find(c=>c.id===content.id);
      await api('records/content/'+content.id,'PATCH',{version:current.version,visualPrompt:'Nova direção fornecida no fixture.'});
      assert.equal((await api('studio/'+content.id)).body.stale,true);
      const changed=(await api('studio/'+content.id+'/preflight','POST',{})).body;
      assert.equal(changed.storedVersion,2);assert.notEqual(changed.sourceHash,first.sourceHash);
      const previous=JSON.parse(db.prepare("SELECT data FROM records WHERE external_id=?").get('studio:'+content.id+':v1').data);
      assert.equal(previous.briefing.visualPrompt,content.visualPrompt);assert.equal((await state()).records.tasks.length,1);
    });
    await t.test('credencial salva continua diferente de executor validado',async()=>{
      await api('integrations/higgsfield','PUT',{keyId:'TEST-ONLY',keySecret:'NOT-A-REAL-CREDENTIAL'});
      const result=(await api('studio/'+content.id+'/preflight','POST',{})).body;
      assert.equal(result.executor.state,'configured_unvalidated');assert.ok(result.blockers.some(b=>b.code==='blocked_higgsfield_executor_unvalidated'));
      assert.equal(mediaCalls,0);
    });
    await t.test('rotina não gera mais três rascunhos e não reserva chamada de IA',async()=>{
      await api('company','PATCH',{policy:{enabled:true,dailyRuns:8}});
      const usage=count('usage_reservations'),calls=aiCalls;
      await server.portal.tick();await server.portal.tick();
      const s=await state();assert.equal(s.routine.status,'pending_work');assert.equal(s.routine.contentIds.length,3);
      assert.equal(s.company.policy.dailyRuns,8);assert.equal(aiCalls,calls);assert.equal(count('usage_reservations'),usage);
      assert.equal(s.records.content.length,3);assert.equal(s.jobs.filter(j=>j.payload.agent==='director').length,0);
    });
    await t.test('job diário antigo enfileirado é barrado antes da inteligência',async()=>{
      await api('jobs','POST',{kind:'agent',payload:{agent:'director'},idempotencyKey:'daily-director:fixture-queued'});
      await server.portal.tick();const job=(await state()).jobs.find(j=>j.payload.agent==='director');
      assert.equal(job.state,'blocked');assert.equal(aiCalls,1);
    });
    await t.test('materiais exigem confirmação e arquivos da própria empresa',async()=>{
      assert.equal((await api('studio/materials','POST',{confirmed:false})).status,409);
      assert.equal((await api('studio/materials','POST',{confirmed:true,logoAssetId:'foreign',fontAssetId:'foreign',fontFamily:'Geist'})).status,409);
      assert.equal((await state()).brandMaterials.confirmedBy,undefined);
    });
    await t.test('outra empresa não consulta nem reutiliza a entrega',async()=>{
      const second=(await request('/api/portal/companies','POST',{name:'Outra fixture'})).body;
      assert.equal((await request('/api/portal/'+second.id+'/studio/'+content.id)).status,404);
      assert.equal((await request('/api/portal/'+second.id+'/studio/'+content.id+'/preflight','POST',{})).status,404);
      assert.equal((await request('/api/portal/'+second.id+'/state')).body.records.content.length,0);
    });
    await t.test('falha ao localizar a origem não deixa ordem órfã',async()=>{
      const c=(await api('records/content','POST',{title:'Sem origem de agente',format:'image',channel:'instagram'})).body;
      const before=(await state()).operations.length;assert.equal((await api('studio/'+c.id+'/preflight','POST',{})).status,409);
      assert.equal((await state()).operations.length,before);
    });
    await t.test('reinício preserva origem, versões, evidências e bloqueios sem gerar',async()=>{
      const before=(await api('studio/'+content.id)).body;await close();await open();
      const after=(await api('studio/'+content.id)).body;
      assert.equal(after.sourceHash,before.sourceHash);assert.equal(after.storedVersion,before.storedVersion);assert.equal(after.operationId,operationId);
      assert.equal(mediaCalls,0);assert.equal((await state()).records.metrics.length,0);assert.equal((await state()).assets.length,0);
    });
  }finally{db?.close();await close();}
});
