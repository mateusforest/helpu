import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createHelpuServer} from '../server.mjs';
import {createProviders,ProviderError} from '../portal/providers.mjs';
import {decodeGeneratedPng,createImageWorkflow,imageLayout,imageSourceHash} from '../portal/image-generation.mjs';
import {testPng} from './image-fixture.mjs';

test('imagens OpenAI: contrato real da API e arquivo íntegro antes de declarar sucesso',async()=>{
 const png=testPng(),calls=[];
 const provider=createProviders(async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify({data:[{b64_json:png.toString('base64')}]}),{headers:{'x-request-id':'request-test'}});});
 const result=await provider.generateImage({apiKey:'secret-test'},{prompt:'Uma árvore'});
 assert.equal(calls[0].url,'https://api.openai.com/v1/images/generations');
 assert.deepEqual(JSON.parse(calls[0].options.body),{model:'gpt-image-2.5-sunburst',prompt:'Uma árvore',n:1,size:'1024x1024',quality:'medium',output_format:'png'});
 assert.equal(result.requestId,'request-test');assert.equal(decodeGeneratedPng(result.base64).width,16);
 for(const bytes of [png.subarray(0,-12),Buffer.from('<svg></svg>'),Buffer.from(png)]){
  if(bytes.length===png.length)bytes[50]^=1;
  assert.throws(()=>decodeGeneratedPng(bytes.toString('base64')),e=>e.state==='uncertain');
 }
 await assert.rejects(provider.generateImage({},{prompt:'Teste'}),e=>e.state==='blocked');assert.equal(calls.length,1);
 await assert.rejects(createProviders(async()=>{throw Error('timeout');}).generateImage({apiKey:'secret'},{prompt:'Teste'}),e=>e.state==='uncertain');
 await assert.rejects(createProviders(async()=>new Response(JSON.stringify({error:{code:'insufficient_quota'}}),{status:429})).generateImage({apiKey:'secret'},{prompt:'Teste'}),e=>e.state==='blocked'&&/cota/.test(e.message));
});

test('imagem: conversa → OpenAI → biblioteca → resposta; isolamento, repetição e políticas',async t=>{
 const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'helpu-image-'));
 let mode='success',calls=0,contentId,org,cookie='',responses=[];const prompts=[];
 const output=text=>({status:'completed',output:[{type:'message',content:[{type:'output_text',text}]}]});
 const tool=(name,args,id=name)=>({status:'completed',output:[{type:'function_call',name,call_id:id,arguments:JSON.stringify(args)}]});
 const server=await createHelpuServer({dataDir,portalOptions: {operatorEnv:{HELPU_OPERATOR_USER_IDS:'1'},startScheduler:false,providers:{generateImage:async(config,input)=>{assert.equal(config.apiKey,'secret-test');calls++;prompts.push(input.prompt);if(mode==='quota')throw new ProviderError('Sem cota','blocked');if(mode==='timeout')throw new ProviderError('Sem confirmação','uncertain');if(mode==='invalid')return {base64:'invalid'};return {base64:testPng().toString('base64'),requestId:'request-'+calls};}},conversationRespond:async(_,body)=>{
  if(responses.length)return responses.shift();
  const saved=body.input.find(x=>x.type==='function_call_output'&&x.call_id==='save');
  if(saved&&!body.input.some(x=>x.type==='function_call'&&x.call_id==='generate')){contentId=JSON.parse(saved.output).id;return tool('queue_action',{kind:'image',payloadJson:JSON.stringify({contentId})},'generate');}
  return output('Estou preparando a imagem.');
 }}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const request=async(url,method='GET',data,session=cookie)=>{const r=await fetch(origin+url,{method,headers:{Origin:origin,Cookie:session,'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)});return {status:r.status,headers:r.headers,body:await r.json()};};
 const api=(tail,method,data)=>request('/api/portal/'+org+'/'+tail,method,data);
 const db=new DatabaseSync(path.join(dataDir,'helpu.sqlite'));let thread,assetId;
 const createContent=async title=>(await api('records/content','POST',{title,caption:'Confira a novidade.',visualPrompt:'Composição sem logo, uma árvore verde.',format:'image',channel:'instagram'})).body;
 try{
  const signup=await request('/api/auth/signup','POST',{name:'Teste',company:'Marca QA',email:'image@example.test',password:'test-only-password'});cookie=signup.headers.get('set-cookie').split(';')[0];org=(await request('/api/portal/bootstrap')).body.companies[0].id;
  await api('company','PATCH',{profile:{description:'Uma marca de jardinagem',audience:'Jardineiros',visualIdentity:'Verde e branco'},policy:{autoMedia:false,dailyMedia:20,dailyRuns:20}});
  await api('integrations/openai','PUT',{apiKey:'secret-test'});
  await t.test('pedido no chat autoriza a imagem mesmo com geração automática desativada',async()=>{
   thread=(await api('conversations','POST',{title:'Imagem'})).body;
   responses=[tool('save_draft',{kind:'content',dataJson:JSON.stringify({title:'Árvore',caption:'Uma novidade para seu jardim.',visualPrompt:'Árvore verde, fundo branco.',format:'image',channel:'instagram'})},'save')];
   await api('conversations/'+thread.id+'/messages','POST',{text:'Crie uma imagem para Instagram',mode:'execute'});await server.portal.tick();
   let snapshot=(await api('conversations/'+thread.id)).body;assert.equal(snapshot.mediaJobs.length,1);assert.equal(calls,0);
   await server.portal.tick();snapshot=(await api('conversations/'+thread.id)).body;
   assert.equal(calls,1);assert.equal(snapshot.mediaJobs.length,0);
   const message=snapshot.messages.find(m=>m.attachments.length);assert.ok(message);assert.match(message.text,/gerada e salva/);assetId=message.attachments[0];
   const state=(await api('state')).body,content=state.records.content.find(c=>c.id===contentId);assert.equal(content.assetId,assetId);assert.equal(content.status,'review');assert.equal(content.mediaUrl,'');assert.equal(state.assets.find(a=>a.id===assetId).mime,'image/png');
   assert.equal(state.company.policy.autoMedia,false);assert.equal(state.jobs.some(j=>j.kind==='publish'),false);
   const file=await fetch(origin+'/api/portal/files/'+assetId,{headers:{Cookie:cookie}});assert.equal(file.status,200);assert.deepEqual(Buffer.from(await file.arrayBuffer()),testPng());
   assert.doesNotMatch(JSON.stringify(snapshot),/secret-test|b64_json/);assert.match(prompts[0],/Marca QA/);
  });
  await t.test('reutiliza o mesmo arquivo ao repetir uma geração sem mudar o briefing',async()=>{
   const queued=await api('jobs','POST',{kind:'image',payload:{contentId}});assert.equal(queued.status,201);await server.portal.tick();
   const job=(await api('state')).body.jobs.find(j=>j.id===queued.body.id);assert.equal(job.state,'succeeded',job.error);assert.equal(job.output.reused,true);assert.equal(job.output.assetId,assetId);assert.equal(calls,1);
  });
  await t.test('pedido em outra conversa continua a entrega existente na mesma empresa',async()=>{
   const next=(await api('conversations','POST',{title:'Continuar imagem'})).body;
   responses=[tool('queue_action',{kind:'image',payloadJson:JSON.stringify({contentId})}),output('Vou retomar a imagem existente.')];
   await api('conversations/'+next.id+'/messages','POST',{text:'Gere a imagem do rascunho existente',mode:'execute'});await server.portal.tick();
   assert.equal((await api('conversations/'+next.id)).body.mediaJobs.length,1);await server.portal.tick();
   assert.ok((await api('conversations/'+next.id)).body.messages.some(m=>m.attachments.includes(assetId)));assert.equal(calls,1);
  });
  await t.test('pausar a operação de origem interrompe a imagem mesmo quando o rascunho vem de outra conversa',async()=>{
   const next=(await api('conversations','POST',{title:'Pausa'})).body;
   responses=[tool('queue_action',{kind:'image',payloadJson:JSON.stringify({contentId})}),output('Pedido enfileirado.')];
   await api('conversations/'+next.id+'/messages','POST',{text:'Gere a imagem existente',mode:'execute'});await server.portal.tick();
   const snapshot=(await api('conversations/'+next.id)).body;assert.equal(snapshot.mediaJobs.length,1);
   const pause=await api('operations/'+snapshot.operations[0].id+'/action','POST',{action:'pause'});assert.equal(pause.status,200);await server.portal.tick();
   const job=(await api('state')).body.jobs.find(j=>j.id===snapshot.mediaJobs[0].id);assert.equal(job.state,'canceled');assert.equal(calls,1);
  });
  await t.test('outra empresa não consegue ler a imagem nem gerar sobre o conteúdo',async()=>{
   const signup=await request('/api/auth/signup','POST',{name:'Outro',company:'Outra',email:'other-image@example.test',password:'test-only-password'},''),otherCookie=signup.headers.get('set-cookie').split(';')[0],other=(await request('/api/portal/bootstrap','GET',undefined,otherCookie)).body.companies[0].id;
   assert.equal((await request('/api/portal/files/'+assetId,'GET',undefined,otherCookie)).status,404);
   assert.equal((await request('/api/portal/'+other+'/jobs','POST',{kind:'image',payload:{contentId}},otherCookie)).status,404);
  });
  await t.test('a política proibida prevalece sobre o clique explícito em Gerar',async()=>{
   await api('company','PATCH',{policy:{operationRules:[{channel:'openai',action:'image',risk:'*',policy:'forbidden'}]}});
   const content=await createContent('Proibida'),queued=await api('jobs','POST',{kind:'image',payload:{contentId:content.id}});await server.portal.tick();
   const job=(await api('state')).body.jobs.find(j=>j.id===queued.body.id);assert.equal(job.state,'blocked');assert.equal(calls,1);
   const deniedThread=(await api('conversations','POST',{title:'Criação proibida'})).body;
   responses=[tool('queue_action',{kind:'image',payloadJson:JSON.stringify({contentId:content.id})}),output('Pedido registrado.')];
   await api('conversations/'+deniedThread.id+'/messages','POST',{text:'Crie esta imagem',mode:'execute'});await server.portal.tick();await server.portal.tick();
   assert.equal(calls,1);assert.ok((await api('conversations/'+deniedThread.id)).body.messages.some(m=>/proibida/.test(m.text)));
   await api('company','PATCH',{policy:{operationRules:[]}});
  });
  await t.test('a autorização do chat não vale para um briefing alterado depois do pedido',async()=>{
   const changed=await createContent('Briefing alterado'),next=(await api('conversations','POST',{title:'Versão da imagem'})).body;
   responses=[tool('queue_action',{kind:'image',payloadJson:JSON.stringify({contentId:changed.id})}),output('Estou preparando a imagem.')];
   await api('conversations/'+next.id+'/messages','POST',{text:'Gere a imagem deste conteúdo',mode:'execute'});await server.portal.tick();
   const queued=(await api('conversations/'+next.id)).body.mediaJobs[0];assert.ok(queued);
   const update=await api('records/content/'+changed.id,'PATCH',{visualPrompt:'Outro assunto: montanhas azuis.'});assert.equal(update.status,200);
   await server.portal.tick();const job=(await api('state')).body.jobs.find(j=>j.id===queued.id);
   assert.equal(job.state,'blocked');assert.match(job.error,/aprovação/);assert.equal(calls,1);
  });
  await t.test('timeout conserva a tentativa e impede nova cobrança por repetição automática',async()=>{
   mode='timeout';const content=await createContent('Timeout'),queued=await api('jobs','POST',{kind:'image',payload:{contentId:content.id}});await server.portal.tick();
   const job=(await api('state')).body.jobs.find(j=>j.id===queued.body.id);assert.equal(job.state,'uncertain');assert.equal((await api('jobs','POST',{kind:'image',payload:{contentId:content.id}})).status,409);await server.portal.tick();assert.equal(calls,2);mode='success';
  });
  await t.test('PNG inválido não aparece como entrega concluída',async()=>{
   mode='invalid';const content=await createContent('Inválida'),queued=await api('jobs','POST',{kind:'image',payload:{contentId:content.id}});await server.portal.tick();
   const state=(await api('state')).body;assert.equal(state.jobs.find(j=>j.id===queued.body.id).state,'uncertain');assert.ok(!state.records.content.find(c=>c.id===content.id).assetId);mode='success';
  });
  await t.test('modo Planejar não aciona geração',async()=>{
   const planned=(await api('conversations','POST',{title:'Planejamento'})).body,before=calls;
   responses=[tool('queue_action',{kind:'image',payloadJson:JSON.stringify({contentId})}),output('A proposta está preparada.')];
   await api('conversations/'+planned.id+'/messages','POST',{text:'Planeje uma imagem',mode:'plan'});await server.portal.tick();await server.portal.tick();assert.equal(calls,before);
   assert.ok((await api('conversations/'+planned.id)).body.events.some(e=>e.kind==='attention'));
  });
  await t.test('produção institucional permite gerar a base e preserva texto, fonte e logo para composição',async()=>{
   await api('company','PATCH',{policy:{autoMedia:false}});
   const preflight=await api('studio/'+contentId+'/preflight','POST',{});assert.equal(preflight.status,200);
   const decision=await api('studio/'+contentId+'/decision','POST',{confirmed:true,provider:'openai',text:'Texto que deve ser composto depois.',cta:'',artDirection:'Uma árvore editorial, sem texto.',prohibitedElements:['Letras','Logotipos']});assert.equal(decision.status,200);
   assert.equal((await api('jobs','POST',{kind:'image',payload:{contentId}})).status,409,'Materiais exigidos na decisão não podem ser ignorados');
   const upload=async(name,bytes)=>{const r=await fetch(origin+'/api/portal/'+org+'/files',{method:'POST',headers:{Origin:origin,Cookie:cookie,'X-File-Name':name},body:bytes});assert.equal(r.status,201);return r.json();};
   const logo=await upload('logo.png',testPng()),fontBytes=Buffer.alloc(28);fontBytes.writeUInt32BE(0x00010000);fontBytes.writeUInt16BE(1,4);const font=await upload('fonte.ttf',fontBytes);
   const materials=await api('studio/materials','POST',{confirmed:true,logoAssetId:logo.id,fontAssetId:font.id,fontFamily:'Fonte oficial',colors:{background:'#FFFFFF',foreground:'#222222',accent:'#008800'}});assert.equal(materials.status,200);
   const ready=(await api('studio/'+contentId)).body;assert.equal(ready.canGenerate,true);assert.equal(ready.generation?.stale,true);
   const queued=await api('jobs','POST',{kind:'image',payload:{contentId}});assert.equal(queued.status,201);await server.portal.tick();
   const state=(await api('state')).body,job=state.jobs.find(j=>j.id===queued.body.id);assert.equal(job.state,'succeeded',job.error);assert.equal(job.output.generation.purpose,'base');
   assert.match(prompts.at(-1),/Não inclua texto/);
   const inspected=(await api('studio/'+contentId)).body;assert.equal(inspected.baseAsset.id,job.output.assetId);assert.equal(inspected.finalAsset,null);assert.equal(inspected.specification.width,1080);assert.equal(inspected.generation.width,16);assert.equal(inspected.canGenerate,false);assert.equal(inspected.decision.text,'Texto que deve ser composto depois.');
   assert.equal(state.records.content.find(c=>c.id===contentId).assetId,assetId,'A base não substitui a arte anexada');
   assert.ok(state.operations.find(o=>o.id===inspected.operationId).blockers.some(b=>b.code==='blocked_composition_required'));
  });
  await t.test('recusa explícita permite retomar após corrigir o acesso',async()=>{
   mode='quota';const content=await createContent('Cota'),queued=await api('jobs','POST',{kind:'image',payload:{contentId:content.id}});assert.equal(queued.status,201);await server.portal.tick();
   const job=(await api('state')).body.jobs.find(j=>j.id===queued.body.id);assert.equal(job.state,'blocked');assert.equal(job.external.imageStartedAt,undefined);
   mode='success';assert.equal((await api('jobs/'+job.id,'POST',{action:'retry'})).status,200);await server.portal.tick();assert.equal((await api('state')).body.jobs.find(j=>j.id===job.id).state,'succeeded');
  });
 }finally{db.close();await server.portal.shutdown();await new Promise(r=>server.close(r));}
});

test('imagens: formatos sociais, edição real por referência e validação antes de chamar a API',async()=>{
 const calls=[],provider=createProviders(async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify({data:[{b64_json:testPng().toString('base64')}]}));});
 for(const [layout,size] of [['feed','1024x1280'],['story','1008x1792'],['carousel','1024x1280']]){
  const settings=imageLayout({imageLayout:layout,slideIndex:1,slideCount:3});assert.equal(settings.size,size);
  await provider.generateImage({apiKey:'test-only'},{prompt:'Arte editorial',size});assert.equal(JSON.parse(calls.at(-1).options.body).size,size);
 }
 const png=testPng();await provider.generateImage({apiKey:'test-only'},{prompt:'Mantenha o produto, altere o fundo.',size:'1008x1792',images:[{mime:'image/png',bytes:png}]});
 const edit=calls.at(-1);assert.equal(edit.url,'https://api.openai.com/v1/images/edits');assert.ok(edit.options.body instanceof FormData);assert.equal(edit.options.headers['Content-Type'],undefined);
 assert.equal(edit.options.body.get('size'),'1008x1792');assert.equal(edit.options.body.has('input_fidelity'),false);assert.deepEqual(Buffer.from(await edit.options.body.getAll('image[]')[0].arrayBuffer()),png);
 const before=calls.length;
 for(const input of [{size:'1080x1920'},{images:[{mime:'video/mp4',bytes:png}]},{images:Array(7).fill({mime:'image/png',bytes:png})}])await assert.rejects(provider.generateImage({apiKey:'test-only'},{prompt:'Teste',...input}),e=>e.state==='blocked');
 assert.equal(calls.length,before);
 assert.throws(()=>imageLayout({imageLayout:'carousel',slideIndex:4,slideCount:3}),e=>e.state==='blocked');
 assert.throws(()=>imageLayout({imageLayout:'wide'}),e=>e.state==='blocked');
});

test('Sunburst: referências em feed, story e carrossel não enviam parâmetro legado recusado',async()=>{
 let calls=0,measurements=0;
 const reference=testPng(64,64);
 const provider=createProviders(async(url,options)=>{
  calls++;assert.equal(url,'https://api.openai.com/v1/images/edits');
  const form=options.body;
  if(form.has('input_fidelity'))return Response.json({error:{code:'invalid_input_fidelity_model',param:'input_fidelity',type:'image_generation_user_error'}},{status:400});
  assert.deepEqual([...new Set(form.keys())].sort(),['model','prompt','n','size','quality','output_format','image[]'].sort());
  assert.equal(form.get('model'),'gpt-image-2.5-sunburst');assert.equal(form.get('quality'),'medium');
  assert.deepEqual(Buffer.from(await form.get('image[]').arrayBuffer()),reference);
  const [width,height]=form.get('size').split('x').map(Number);
  return Response.json({data:[{b64_json:testPng(width,height).toString('base64')}]},{headers:{'x-request-id':'reference-'+calls}});
 });
 for(const format of ['feed','story','carousel']){
  const layout=imageLayout({imageLayout:format,slideIndex:1,slideCount:3});
  const result=await provider.generateImage({apiKey:'test-only'},{prompt:'Use a referência como inspiração visual.',size:layout.size,images:[{mime:'image/png',bytes:reference}],onUsage:async()=>measurements++});
  const image=decodeGeneratedPng(result.base64);assert.equal(image.width,layout.width);assert.equal(image.height,layout.height);
 }
 assert.equal(calls,3);assert.equal(measurements,3);
});

test('imagens: páginas ordenadas, referências privadas, reuso e formato incorreto cercado',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'helpu-image-layout-')),contents=new Map(),meta=new Map(),assets=new Map(),requests=[],brand={name:'Marca',profile:{visualIdentity:'Verde e branco'}};
 let assetSequence=0,badSize=false,changes=0;
 const ref='private-reference';assets.set(ref,path.join(directory,'ref.png'));fs.writeFileSync(assets.get(ref),testPng());
 const jobs=[];
 const workflow=createImageWorkflow({
  record:async(org,kind,id)=>{assert.equal(org,1);return contents.get(id);},company:async()=>brand,
  metadata:async(org,key)=>meta.get(key)||{},saveMetadata:async(org,key,data)=>meta.set(key,data),studio:{inspect:async()=>({blockers:[]})},integration:async()=>({apiKey:'test-only'}),
  assetPath:async(org,id)=>{if(org!==1||!assets.has(id))throw new ProviderError('Arquivo não encontrado.','blocked');return assets.get(id);},
  providers:{generateImage:async(config,input)=>{requests.push(input);const [w,h]=input.size.split('x').map(Number);return {base64:testPng(badSize?16:w,badSize?16:h).toString('base64'),requestId:'request-'+requests.length};}},
  storeAsset:async(org,name,bytes)=>{const id='generated-'+(++assetSequence),file=path.join(directory,id+'.png');assets.set(id,file);fs.writeFileSync(file,bytes);return {id,url:'/files/'+id};},
  systemUpdate:async(org,kind,id,data)=>contents.set(id,{...contents.get(id),...data}),beforeMutation:async()=>{changes++;},
  setJob:async(id,state,patch)=>{const job=jobs.find(j=>j.id===id);if(patch.external)job.external=JSON.stringify(patch.external);}
 });
 const job=id=>{const next={id:jobs.length+1,org_id:1,payload:JSON.stringify({contentId:id}),external:'{}'};jobs.push(next);return next;};
 try{
  const outline=JSON.stringify([{title:'Capa'},{title:'Benefícios'},{title:'Próximo passo'}]);
  for(let index=1;index<=3;index++){
   const id='slide-'+index;contents.set(id,{id,title:'Campanha',caption:'Conheça a marca.',visualPrompt:'Página '+index,format:'carousel',imageLayout:'carousel',slideIndex:index,slideCount:3,carouselOutline:outline,referenceAssetIds:[ref]});
   const result=await workflow.run(job(id));assert.equal(result.generation.width,1024);assert.equal(result.generation.height,1280);assert.equal(result.generation.slideIndex,index);assert.equal(contents.get(id).status,'review');
   assert.match(requests.at(-1).prompt,new RegExp('página '+index+' de 3'));assert.ok(requests.at(-1).prompt.includes('Benefícios'));assert.deepEqual(requests.at(-1).images[0].bytes,testPng());
  }
  assert.equal(new Set([...contents.values()].map(c=>c.assetId)).size,3);
  const reused=await workflow.run(job('slide-2'));assert.equal(reused.reused,true);assert.equal(requests.length,3);
  const second=contents.get('slide-2');assert.notEqual(imageSourceHash(second,brand,{},{}),imageSourceHash({...second,slideIndex:3},brand,{},{}));assert.notEqual(imageSourceHash(second,brand,{},{}),imageSourceHash({...second,referenceAssetIds:[]},brand,{},{}));
  contents.set('story',{title:'Story',caption:'Story',visualPrompt:'Produto',imageLayout:'story',format:'story'});
  const story=await workflow.run(job('story'));assert.equal(story.generation.width*16,story.generation.height*9);assert.equal(story.generation.height,1792);
  contents.set('wrong',{title:'Formato errado',visualPrompt:'Produto',imageLayout:'feed',format:'image'});badSize=true;const wrong=job('wrong');
  await assert.rejects(workflow.run(wrong),e=>e.state==='uncertain'&&/tamanho/.test(e.message));assert.ok(JSON.parse(wrong.external).imageStartedAt);const attempts=requests.length;
  await assert.rejects(workflow.run(wrong),e=>e.state==='uncertain');assert.equal(requests.length,attempts);assert.equal(contents.get('wrong').assetId,undefined);
  contents.set('foreign',{title:'Referência alheia',visualPrompt:'Teste',imageLayout:'feed',referenceAssetIds:['other-company-file']});const mutations=changes;
  await assert.rejects(workflow.run(job('foreign')),e=>e.state==='blocked');assert.equal(changes,mutations);assert.equal(requests.length,attempts);
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
