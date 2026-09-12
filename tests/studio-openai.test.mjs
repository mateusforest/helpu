import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {createHelpuServer} from '../server.mjs';
import {createProviders} from '../portal/providers.mjs';

test('OpenAI: consulta de modelo é somente leitura e não valida geração',async()=>{
 let calls=0;const providers=createProviders(async(url,options)=>{calls++;assert.equal(url,'https://api.openai.com/v1/models/gpt-image-2.5-sunburst');assert.equal(options.method,undefined);assert.equal(options.body,undefined);return new Response(JSON.stringify({object:'model',id:'gpt-image-2.5-sunburst'}),{headers:{'x-request-id':'TEST-ONLY-access'}});});
 const result=await providers.imageAccess({apiKey:'TEST-ONLY'});assert.equal(result.status,'model_accessible');assert.equal(result.executorValidated,false);assert.equal(result.generationPerformed,false);assert.equal(result.requestId,'TEST-ONLY-access');assert.equal(calls,1);
});
test('OpenAI: recusa, timeout e resposta incorreta não simulam acesso',async()=>{
 for(const fetcher of [async()=>new Response('{}',{status:403}),async()=>{throw new Error('TEST timeout');},async()=>new Response(JSON.stringify({object:'model',id:'different'}))]){
  const result=await createProviders(fetcher).imageAccess({apiKey:'TEST-ONLY-SECRET'});assert.equal(result.status,'blocked');assert.equal(result.executorValidated,false);assert.ok(!JSON.stringify(result).includes('TEST-ONLY-SECRET'));
 }
});

test('Estúdio: decisão humana, candidatos e OpenAI na mesma entrega',async t=>{
 const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'helpu-studio-openai-'));let checks=0,server,cookie,org,db,origin;
 const providers={text:async()=>({pieces:['image','carousel','video'].map(format=>({format,title:'TEST ONLY '+format,caption:'Original',visualPrompt:'Original',channel:'instagram'})),questions:[],summary:'Fixture'}),imageAccess:async()=>({status:'model_accessible',model:'gpt-image-2.5-sunburst',requestId:'TEST-ONLY-'+(++checks),completedAt:Date.now(),executorValidated:false,generationPerformed:false})};
 const open=async()=>{server=createHelpuServer({dataDir,portalOptions:{startScheduler:false,providers}});await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;};
 const close=async()=>{await server.portal.shutdown();await new Promise(r=>server.close(r));};
 const request=async(url,method='GET',data)=>{const response=await fetch(origin+url,{method,headers:{Cookie:cookie||'',Origin:origin,'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)});return {status:response.status,headers:response.headers,body:await response.json()};};
 const api=(url,method,data)=>request('/api/portal/'+org+'/'+url,method,data);
 const state=async()=>(await api('state')).body;
 const count=table=>db.prepare('SELECT count(*) AS n FROM '+table).get().n;
 const input={provider:'openai',confirmed:true,text:'Frase confirmada.\nSegunda linha.',cta:'',artDirection:'Cinco módulos para um núcleo; sem texto na imagem.',prohibitedElements:['Pessoas','Texto gerado','Logo gerado']};
 try{
  await open();db=new DatabaseSync(path.join(dataDir,'helpu.sqlite'));
  const signup=await request('/api/auth/signup','POST',{name:'TEST ONLY',company:'TEST ONLY EME',email:'openai-studio@example.test',password:'test-only-long-password'});cookie=signup.headers.get('set-cookie').split(';')[0];org=(await request('/api/portal/bootstrap')).body.companies[0].id;
  await api('company','PATCH',{profile:{description:'Fixture',audience:'Fixture'}});await api('jobs','POST',{kind:'agent',payload:{agent:'creative'},idempotencyKey:'source'});await server.portal.tick();
  const content=(await state()).records.content.find(c=>c.format==='image');await api('studio/'+content.id+'/preflight','POST',{});
  const originals=(await state()).records.content,opId=originals[0].operationId;
  await t.test('mesma ordem, tarefa e conteúdos; decisões não aprovam material ou arquivo',async()=>{
   const result=await api('studio/'+content.id+'/decision','POST',input);assert.equal(result.status,200);assert.equal(result.body.executor.provider,'openai');assert.equal(result.body.decision.approvalScope,'creative_direction_only');assert.equal(result.body.specification.exactText.source,input.text);assert.equal(result.body.specification.exactText.cta,'');assert.equal(result.body.state,'blocked_missing_brand_assets');assert.ok(!result.body.blockers.some(b=>b.code.includes('higgsfield')||b.code==='blocked_production_review_required'));
   assert.deepEqual((await state()).records.content,originals);assert.equal((await state()).operations.length,1);assert.equal((await state()).records.tasks.length,1);assert.equal(result.body.operationId,opId);assert.equal(result.body.approval.status,'not_requested');
  });
  await t.test('repetir decisão é idempotente; alterar decisão preserva a versão anterior',async()=>{
   const before=count('records'),version=(await api('studio/'+content.id)).body.storedVersion;await api('studio/'+content.id+'/decision','POST',input);assert.equal(count('records'),before);assert.equal((await api('studio/'+content.id)).body.storedVersion,version);
   await api('studio/'+content.id+'/decision','POST',{...input,text:'Outro texto confirmado.'});const prior=JSON.parse(db.prepare('SELECT data FROM records WHERE external_id=?').get('studio:decision:'+content.id+':v1').data);assert.equal(prior.text,input.text);assert.equal((await api('studio/'+content.id)).body.decision.version,2);
   assert.equal((await api('operations/'+opId+'/action','POST',{action:'approve'})).status,409);
  });
  await t.test('consulta de acesso não gera job; trocar a credencial invalida a consulta',async()=>{
   await api('integrations/openai','PUT',{apiKey:'TEST-ONLY'});const jobs=count('jobs');const result=await api('studio/'+content.id+'/check-openai','POST',{});assert.equal(result.status,200);assert.equal(result.body.executor.state,'model_accessible_unvalidated');assert.equal(count('jobs'),jobs);
   await api('studio/'+content.id+'/check-openai','POST',{});assert.equal(checks,1);await api('integrations/openai','PUT',{apiKey:'TEST-ONLY-CHANGED'});assert.equal((await api('studio/'+content.id)).body.executor.state,'configured_unvalidated');
  });
  const logo={name:'TEST ONLY logo.png',bytes:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==','base64')};
  const fontBytes=Buffer.alloc(28);fontBytes.writeUInt32BE(0x00010000,0);fontBytes.writeUInt16BE(1,4);const font={name:'TEST ONLY signature.ttf',bytes:fontBytes};
  // Only a structural signature fixture. No claim of a renderable official font.
  const candidateInput={logo,font,colors:{background:'#F7F5EF',foreground:'#173B2D',accent:'#083C30'},fontFamily:'TEST ONLY',sources:{logo:'Fixture',font:'Fixture',colors:'Fixture'}};
  let candidate;
  await t.test('candidatos não são oficiais e importar novamente não duplica arquivos',async()=>{
   candidate=server.portal.studio.stageCandidates(org,content.id,candidateInput,'test');const before=count('assets');const again=server.portal.studio.stageCandidates(org,content.id,candidateInput,'test');assert.equal(again.hash,candidate.hash);assert.equal(count('assets'),before);assert.equal((await state()).brandMaterials.confirmedBy,undefined);assert.equal((await api('studio/'+content.id)).body.state,'blocked_missing_brand_assets');assert.equal(candidate.logoHash,createHash('sha256').update(logo.bytes).digest('hex'));
   const blocker=(await api('studio/'+content.id)).body.blockers[0];assert.match(blocker.message,/Confirme sua oficialidade/);assert.ok(blocker.missing.every(m=>m.where.includes('já preenchidos')&&!m.where.includes('Enviar arquivo')));
  });
  await t.test('confirmação humana vincula os arquivos exatos; adulteração bloqueia de novo',async()=>{
   assert.equal((await api('studio/materials','POST',{...candidate,confirmed:false})).status,409);
   assert.equal((await api('studio/materials','POST',{...candidate,confirmed:true})).status,200);assert.ok((await state()).brandMaterials.confirmedBy);
   const item=db.prepare('SELECT path FROM assets WHERE id=?').get(candidate.logoAssetId);fs.appendFileSync(path.join(dataDir,'uploads',item.path),'tamper');assert.equal((await api('studio/'+content.id)).body.state,'blocked_missing_brand_assets');assert.throws(()=>server.portal.studio.stageCandidates(org,content.id,candidateInput,'test'));
  });
  await t.test('reinício conserva decisões, seleção de executor e origem sem geração',async()=>{
   await close();await open();const result=(await api('studio/'+content.id)).body;assert.equal(result.decision.version,2);assert.equal(result.executor.provider,'openai');assert.equal(result.operationId,opId);assert.equal(result.generation,null);assert.deepEqual((await state()).records.content,originals);
  });
 }finally{db?.close();await close();}
});
