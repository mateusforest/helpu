import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHelpuServer} from '../server.mjs';
import {decodeGeneratedPng} from '../portal/image-generation.mjs';
import {testPng} from './image-fixture.mjs';
import {createDatabase} from '../portal/database.mjs';
import {ProviderError} from '../portal/providers.mjs';
import {PGlite} from '@electric-sql/pglite';
import {inlineVideoHash} from '../portal/creations.mjs';

test('autorização de Reels ignora ordem das chaves, mas detecta mudanças reais',()=>{
 const content={id:'content-a',title:'EME',caption:'Legenda'};
 const payload={scenes:[{text:'Cena um',duration:5},{text:'Cena dois',duration:10}],referenceAssetIds:['asset-a','asset-b']};
 const expected=inlineVideoHash(content,payload);
 assert.equal(expected,inlineVideoHash({caption:'Legenda',title:'EME',id:'content-a'},{scenes:[{duration:5,text:'Cena um'},{duration:10,text:'Cena dois'}],referenceAssetIds:['asset-a','asset-b']}));
 assert.notEqual(expected,inlineVideoHash({...content,caption:'Outra legenda'},payload));
 assert.notEqual(expected,inlineVideoHash(content,{...payload,scenes:[...payload.scenes].reverse()}));
 assert.notEqual(expected,inlineVideoHash(content,{...payload,referenceAssetIds:['asset-b','asset-a']}));
});

const fakeMP4=()=>{const bytes=Buffer.alloc(64);bytes.writeUInt32BE(24);bytes.write('ftypisom',4);bytes.write('synthetic-creation-test-fixture',24);return bytes;};

for(const postgres of [false,true])test('Criações: Feed, Story, Carrossel e Reels em '+(postgres?'PostgreSQL':'SQLite'),async t=>{
 const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'helpu-creations-')),plans=[],images=[],videos=[];
 let omitRequired=false,rendererAvailable=true,failImage=false,database,pg,conversationReplies=[];
 const conversationBodies=[];
 if(postgres){
  pg=await PGlite.create({parsers:{20:Number}});
  await pg.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA storage; CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint);');
  for(const file of ['20260913113000_preserve_helpu_data.sql','20260913140000_activate_cloud_runtime.sql'])await pg.exec(fs.readFileSync(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
  await pg.exec('INSERT INTO helpu.portal_migrations VALUES(1,1),(2,1),(3,1),(4,1); SET ROLE helpu_runtime;');
  let queued=Promise.resolve();
  database=createDatabase({pool:{async connect(){const prior=queued;let release;queued=new Promise(r=>release=r);await prior;return {async query(sql,args){const result=await pg.query(sql,args);return {...result,rowCount:result.affectedRows};},release};},async end(){}}});
 }

 const server=await createHelpuServer({dataDir,database,portalOptions:{startScheduler:false,conversationRespond:async(config,body)=>{conversationBodies.push(body);return conversationReplies.shift()||({status:'completed',output:[{type:'message',content:[{type:'output_text',text:'Pedido registrado.'}]}]});},openaiEnv:{OPENAI_API_KEY:'fake-creation-key'},creationRespond:async(config,body)=>{
  assert.equal(config.apiKey,'fake-creation-key');const input=JSON.parse(typeof body.input==='string'?body.input:body.input[0].content[0].text);plans.push(input);
  const isVideo=input.request.format==='reels',count=isVideo?Math.max(input.request.requiredSourceAssetIds?.length||0,input.request.styleRecipe?.length||(input.request.duration===30?6:3)):input.request.slideCount;
  const value={caption:'Legenda da campanha, pronta para copiar.',slides:Array.from({length:count},(_,i)=>({title:'Página '+(i+1),text:'Mensagem '+(i+1),visualPrompt:'Fundo branco e verde. Texto na arte: Mensagem '+(i+1),background:'#ffffff',textColor:'#002200'}))};
  if(isVideo){
   const options=input.request.videoOptions,visual=input.references.filter(a=>!a.mime.startsWith('audio/')&&!input.request.referenceOnlyIds?.includes(a.id));
   value.videoStyle=Object.fromEntries(['font','fontSize','accent','motion','textAnimation','transition','fit'].map(k=>[k,options[k]]));
   if(input.adjustment){value.videoStyle.fontSize=88;value.videoStyle.accent='#ab2211';}
   value.slides.forEach((s,i)=>Object.assign(s,{sourceAssetId:visual[i%visual.length]?.id||null,in:0,duration:input.request.prompt==='Tour horizontal'?[12,2,1][i]:input.request.duration/count,position:input.adjustment?'top':'center'}));
   if(omitRequired)value.slides.forEach(s=>s.sourceAssetId=null);
   if(visual.length)assert.ok(body.input[0].content.some(p=>p.type==='input_image'));
  }
  return {status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(value)}]}]};
 },providers:{generateImage:async(config,input)=>{assert.equal(config.apiKey,'fake-creation-key');images.push(input);if(failImage)throw new ProviderError('A imagem não foi confirmada.','uncertain');const [w,h]=input.size.split('x').map(Number);return {base64:testPng(w,h).toString('base64'),requestId:'fake-image-'+images.length};}},reelsRenderer:{configured:()=>rendererAvailable,sampleReferences:async({assets})=>assets.filter(a=>!a.mime.startsWith('audio/')).map(a=>({id:a.id,time:0,duration:5,image:'data:image/png;base64,'+testPng().toString('base64')})),render:async input=>{videos.push(input);return {bytes:fakeMP4(),width:1080,height:1920,duration:input.scenes.reduce((n,s)=>n+s.duration,0),sha256:'test-fixture-hash'};}}}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const request=async(url,method='GET',data,cookie='')=>{const r=await fetch(origin+url,{method,headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie},body:data===undefined?undefined:JSON.stringify(data)});return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};};
 const signup=async(email,company)=>{const account=await request('/api/auth/signup','POST',{email,password:'test-only-long-password',name:'Pessoa',company});assert.equal(account.status,201);const boot=await request('/api/portal/bootstrap','GET',undefined,account.cookie);return {org:boot.body.companies[0].id,cookie:account.cookie};};
 const api=(who,tail,method='GET',body)=>request('/api/portal/'+who.org+'/'+tail,method,body,who.cookie);
 const upload=async(who,name,bytes)=>{const r=await fetch(origin+'/api/portal/'+who.org+'/files',{method:'POST',headers:{Origin:origin,Cookie:who.cookie,'X-File-Name':name},body:bytes});assert.equal(r.status,201);return r.json();};
 const finish=async(who,id,maxTicks=15)=>{let state;for(let n=0;n<maxTicks;n++){state=(await api(who,'creations/'+id)).body.creation;if(state.status==='complete')return state;if(['failed','blocked','uncertain'].includes(state.status))assert.fail(JSON.stringify(state));await server.portal.tick();}assert.fail('Criação não concluiu: '+JSON.stringify(state));};
 const one=await signup('creations-one@example.test','Marca Verde'),two=await signup('creations-two@example.test','Outra marca');
 try{
  await api(one,'company','PATCH',{profile:{description:'Produtos para jardinagem.',audience:'Pessoas que cuidam de plantas.',visualIdentity:'Verde e branco'},policy:{dailyRuns:40,dailyMedia:50,autoMedia:false}});
  const owned=await upload(one,'produto.png',testPng()),foreign=await upload(two,'privada.png',testPng());
  const payload={prompt:'Crie uma campanha para apresentar a marca.',format:'feed',requestId:'creation-feed-001',attachments:[owned.id]};let feedId;
  await t.test('rotas exigem sessão, empresa correta e campos válidos',async()=>{
   assert.equal((await request('/api/portal/'+one.org+'/creations')).status,401);
   assert.equal((await request('/api/portal/'+one.org+'/creations','POST',payload)).status,401);
   assert.equal((await request('/api/portal/'+one.org+'/creations','GET',undefined,two.cookie)).status,404);
   assert.equal((await api(one,'creations','POST',{...payload,attachments:[foreign.id]})).status,404);
   for(const input of [{prompt:''},{format:'landscape'},{requestId:'x'},{format:'carousel',slideCount:2},{format:'carousel',slideCount:11},{format:'reels',duration:90},{attachments:[owned.id,owned.id]}]){
    const r=await api(one,'creations','POST',{...payload,...input});assert.equal(r.status,400,JSON.stringify(r.body));
   }
   const list=await api(one,'creations');assert.equal(list.body.capabilities.images,true);assert.equal(list.body.capabilities.reels,true);assert.equal(list.body.creations.length,0);assert.equal(plans.length,0);assert.equal(images.length,0);
  });
  await t.test('pedido repetido reutiliza criação, e Feed entrega arquivo nativo com referência',async()=>{
   const posted=await api(one,'creations','POST',payload);assert.equal(posted.status,201,JSON.stringify(posted.body));feedId=posted.body.creation.id;
   const repeat=await api(one,'creations','POST',payload);assert.equal(repeat.body.creation.id,feedId);
   assert.equal((await api(one,'creations','POST',{...payload,prompt:'Mude o assunto'})).status,409);
   assert.equal((await api(two,'creations/'+feedId)).status,404);
   const ready=await finish(one,feedId);assert.equal(ready.format,'feed');assert.equal(ready.assets.length,1);assert.equal(ready.caption,'Legenda da campanha, pronta para copiar.');assert.equal(plans.length,1);assert.equal(images.length,1);
   assert.equal(plans[0].company.name,'Marca Verde');assert.equal(images[0].size,'1024x1280');assert.deepEqual(images[0].images[0].bytes,testPng());
   const asset=ready.assets[0];assert.equal(asset.width,1024);assert.equal(asset.height,1280);assert.equal(asset.mime,'image/png');
   const file=await fetch(origin+asset.url,{headers:{Cookie:one.cookie}});assert.equal(file.status,200);assert.equal(decodeGeneratedPng(Buffer.from(await file.arrayBuffer()).toString('base64')).height,1280);
   assert.equal((await fetch(origin+asset.url,{headers:{Cookie:two.cookie}})).status,404);
   const again=await api(one,'creations','POST',payload);assert.equal(again.body.creation.status,'complete');await server.portal.tick();assert.equal(images.length,1);assert.equal(plans.length,1);
   assert.doesNotMatch(JSON.stringify(ready),/fake-creation-key|b64_json|private-reference/);
  });
  await t.test('Story é entregue em 9:16 e carrossel mantém três páginas ordenadas',async()=>{
   const story=await api(one,'creations','POST',{...payload,format:'story',requestId:'creation-story-001',attachments:[]});assert.equal(story.status,201);
   const readyStory=await finish(one,story.body.creation.id);assert.equal(readyStory.assets[0].width,1008);assert.equal(readyStory.assets[0].height,1792);
   const carousel=await api(one,'creations','POST',{...payload,format:'carousel',slideCount:3,requestId:'creation-carousel-001'});assert.equal(carousel.status,201,JSON.stringify(carousel.body));
   const ready=await finish(one,carousel.body.creation.id);assert.deepEqual(ready.assets.map(a=>a.slideIndex),[1,2,3]);assert.equal(new Set(ready.assets.map(a=>a.id)).size,3);
   assert.ok(ready.assets.every(a=>a.width===1024&&a.height===1280));assert.equal(images.length,5);assert.equal(plans.length,3);
   for(let i=1;i<=3;i++)assert.ok(images[i+1].prompt.includes('página '+i+' de 3'));
  });
  await t.test('Reels chama o renderizador e entrega MP4 com os arquivos enviados',async()=>{
   await api(one,'company','PATCH',{policy:{operationRules:[{action:'video',channel:'other',risk:'medium',policy:'approval_required'}]}});
   const source=await upload(one,'gravacao.mp4',fakeMP4());
   const deniedImage=await api(one,'creations','POST',{...payload,requestId:'creation-image-video-ref',attachments:[source.id]});assert.equal(deniedImage.status,400);
   const posted=await api(one,'creations','POST',{...payload,format:'reels',duration:15,requestId:'creation-reels-001',attachments:[source.id,owned.id]});assert.equal(posted.status,201,JSON.stringify(posted.body));
   const ready=await finish(one,posted.body.creation.id);assert.equal(ready.assets.length,1,JSON.stringify(ready));assert.equal(ready.assets[0].mime,'video/mp4');assert.equal(ready.assets[0].width,1080);assert.equal(ready.assets[0].height,1920);assert.equal(videos.length,1);assert.equal(videos[0].scenes.length,3);
   assert.equal(videos[0].scenes.reduce((n,s)=>n+s.duration,0),15);assert.deepEqual(videos[0].assets.map(a=>a.id),[source.id,owned.id]);assert.deepEqual(videos[0].assets[0].bytes,fakeMP4());
   assert.equal(images.length,5);assert.equal(plans.length,4);assert.ok(plans.at(-1).references.every(r=>r.id));
   const downloaded=await fetch(origin+ready.assets[0].url,{headers:{Cookie:one.cookie}});assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()),fakeMP4());
  });
  await t.test('prévia aprovada guarda estilo privado; ajustes criam versões e reutilizam parâmetros',async()=>{
   const created=await api(one,'creations','POST',{prompt:'Tour horizontal',format:'reels',duration:15,requestId:'review-horizontal-001',videoOptions:{aspectRatio:'16:9',preset:'editorial',quality:'high'}});
   assert.equal(created.status,201,JSON.stringify(created.body));const id=created.body.creation.id;
   assert.equal((await api(one,'creations/'+id,'POST',{action:'approve'})).status,400);
   const ready=await finish(one,id);assert.equal(ready.review,'pending');assert.ok(ready.conversationId);
   assert.equal(videos.at(-1).options.aspectRatio,'16:9');assert.equal(videos.at(-1).options.font,'serif');
   const delivered=await api(one,'conversations/'+ready.conversationId);assert.ok(delivered.body.messages.some(m=>m.attachments.includes(ready.assets[0].id)));
   assert.equal((await api(one,'creations/'+id,'POST',{action:'save-style',name:'Meu tour'})).status,400);
   assert.equal((await api(two,'creations/'+id,'POST',{action:'approve'})).status,404);
   const approved=await api(one,'creations/'+id,'POST',{action:'approve'});assert.equal(approved.body.creation.review,'approved');
   const saved=await api(one,'creations/'+id,'POST',{action:'save-style',name:'Meu tour'});assert.equal(saved.status,200);const style=saved.body.creation;
   const again=await api(one,'creations/'+id,'POST',{action:'save-style',name:'Meu tour'});assert.equal(again.body.creation.id,style.id);
   assert.equal((await api(two,'creations')).body.styles.length,0);
   assert.equal((await api(two,'creations','POST',{prompt:'Teste',format:'reels',requestId:'foreign-style-001',styleId:style.id})).status,400);
   const reused=await api(one,'creations','POST',{prompt:'Novo imóvel',format:'reels',duration:30,requestId:'reuse-style-001',styleId:style.id});assert.equal(reused.status,201);
   const next=await finish(one,reused.body.creation.id);assert.equal(next.videoOptions.aspectRatio,'16:9');assert.equal(next.videoOptions.preset,'editorial');assert.equal(next.review,'pending');
   assert.equal(videos.at(-1).scenes.reduce((n,s)=>n+s.duration,0),30);assert.ok(videos.at(-1).scenes.every(s=>s.duration<=15));
   const adjustment={action:'revise',adjustment:'Troque a chamada final, aumente o texto e coloque no topo.',requestId:'revise-style-001',videoOptions:{accent:'#1144cc'}};
   const revised=await api(one,'creations/'+id,'POST',adjustment);assert.equal(revised.status,200,JSON.stringify(revised.body));
   const repeat=await api(one,'creations/'+id,'POST',adjustment);assert.equal(repeat.body.creation.id,revised.body.creation.id);
   const final=await finish(one,revised.body.creation.id);assert.equal(final.revisionOf,id);assert.equal(final.videoOptions.accent,'#1144cc');assert.equal(final.videoOptions.aspectRatio,'16:9');assert.equal(final.review,'pending');
   assert.equal(final.videoOptions.fontSize,88);assert.ok(videos.at(-1).scenes.every(s=>s.position==='top'));
   assert.equal((await api(one,'creations/'+id)).body.creation.review,'changes_requested');assert.ok(plans.at(-1).previousPlan);assert.equal(plans.at(-1).adjustment,adjustment.adjustment);
   assert.notEqual(final.assets[0].id,ready.assets[0].id);
  });
  await t.test('música enviada segue como trilha e referência de estilo não vira gravação-base',async()=>{
   const wav=Buffer.alloc(100);wav.write('RIFF',0);wav.write('WAVE',8);const music=await upload(one,'trilha.wav',wav);
   const source=await upload(one,'referencia.mp4',fakeMP4());
   const posted=await api(one,'creations','POST',{prompt:'Use a referência somente como estilo',format:'reels',duration:15,requestId:'music-style-001',attachments:[source.id,music.id],referenceOnlyIds:[source.id]});assert.equal(posted.status,201,JSON.stringify(posted.body));
   await finish(one,posted.body.creation.id);assert.equal(videos.at(-1).options.musicAssetId,music.id);assert.ok(videos.at(-1).scenes.every(s=>!s.sourceAssetId));
   assert.equal((await api(one,'creations','POST',{prompt:'Teste música privada',format:'reels',requestId:'invalid-music-001',videoOptions:{musicAssetId:foreign.id}})).status,400);
  });
  await t.test('pedido com todas as imagens cria cenas suficientes e rejeita omissões',async()=>{
   const photos=[];for(let i=0;i<5;i++)photos.push((await upload(one,'foto-'+i+'.png',testPng())).id);
   const source=await upload(one,'musica-no-video.mp4',fakeMP4());
   const input={prompt:'Use todas as imagens com a música do vídeo',format:'reels',duration:15,requestId:'all-images-track-001',attachments:[...photos,source.id],referenceOnlyIds:[source.id],videoOptions:{musicAssetId:source.id,sourceAudio:false}};
   const posted=await api(one,'creations','POST',input);assert.equal(posted.status,201,JSON.stringify(posted.body));
   await finish(one,posted.body.creation.id);assert.equal(videos.at(-1).scenes.length,5);assert.deepEqual(videos.at(-1).scenes.map(s=>s.sourceAssetId),photos);assert.equal(videos.at(-1).options.musicAssetId,source.id);
   const before=videos.length;omitRequired=true;
   try{
    const missing=await api(one,'creations','POST',{...input,requestId:'all-images-track-002'});assert.equal(missing.status,201);
    await server.portal.tick();const state=(await api(one,'creations/'+missing.body.creation.id)).body.creation;assert.equal(state.status,'failed');assert.match(state.error,/deixou de incluir/);assert.equal(videos.length,before);
   }finally{omitRequired=false;}
  });
  await t.test('sem música não reativa automaticamente a trilha anexada',async()=>{
   const wav=Buffer.alloc(100);wav.write('RIFF',0);wav.write('WAVE',8);const music=await upload(one,'silenciar.wav',wav);
   const posted=await api(one,'creations','POST',{prompt:'Sem música',format:'reels',requestId:'explicit-no-music-001',attachments:[music.id],videoOptions:{musicAssetId:null,sourceAudio:false}});assert.equal(posted.status,201);
   await finish(one,posted.body.creation.id);assert.equal(videos.at(-1).options.musicAssetId,null);assert.equal(videos.at(-1).options.sourceAudio,false);
  });
  await t.test('uma tentativa incerta não gera novamente por repetição ou consulta',async()=>{
   failImage=true;const uncertainRequest={...payload,requestId:'creation-uncertain-001',attachments:[]};
   const posted=await api(one,'creations','POST',uncertainRequest);assert.equal(posted.status,201);await server.portal.tick();await server.portal.tick();
   const state=(await api(one,'creations/'+posted.body.creation.id)).body.creation;assert.equal(state.status,'uncertain');assert.equal(state.assets.length,0);const attempts=images.length,preparations=plans.length;
   const replay=await api(one,'creations','POST',uncertainRequest);assert.equal(replay.body.creation.id,state.id);assert.equal(replay.body.creation.status,'uncertain');await server.portal.tick();assert.equal(images.length,attempts);assert.equal(plans.length,preparations);failImage=false;
  });
  await t.test('carrossel maior que a cota disponível é bloqueado antes de preparar',async()=>{
   const limited=await signup('creations-limit@example.test','Marca com limite');await api(limited,'company','PATCH',{policy:{dailyMedia:2,dailyRuns:20}});
   const beforePlans=plans.length,beforeImages=images.length;
   const denied=await api(limited,'creations','POST',{prompt:'Carrossel com três páginas.',format:'carousel',slideCount:3,requestId:'quota-before-planning'});assert.equal(denied.status,409);assert.match(denied.body.error,/limite/);
   assert.equal((await api(limited,'creations')).body.creations.length,0);await server.portal.tick();assert.equal(plans.length,beforePlans);assert.equal(images.length,beforeImages);
  });
  await t.test('cota reduzida na fila impede cobrança de plano; oito páginas cabem em oito reservas',async()=>{
   const limited=await signup('creations-eight@example.test','Marca oito páginas');await api(limited,'company','PATCH',{policy:{dailyMedia:8,dailyRuns:20}});
   const posted=await api(limited,'creations','POST',{prompt:'Crie oito páginas explicando os cuidados com plantas.',format:'carousel',slideCount:8,requestId:'quota-eight-pages'});assert.equal(posted.status,201);
   const beforePlans=plans.length,beforeImages=images.length;await api(limited,'company','PATCH',{policy:{dailyMedia:3}});await server.portal.tick();
   const blocked=(await api(limited,'creations/'+posted.body.creation.id)).body.creation;assert.equal(blocked.status,'blocked');assert.equal(plans.length,beforePlans,'Revalidar a cota antes da chamada paga de planejamento');assert.equal(images.length,beforeImages);
   await api(limited,'company','PATCH',{policy:{dailyMedia:8}});const retry=await api(limited,'jobs/'+posted.body.creation.id,'POST',{action:'retry'});assert.equal(retry.status,200);
   const ready=await finish(limited,posted.body.creation.id,20);assert.equal(ready.assets.length,8);assert.deepEqual(ready.assets.map(a=>a.slideIndex),[1,2,3,4,5,6,7,8]);assert.equal(plans.length,beforePlans+1);assert.equal(images.length,beforeImages+8);
   const exhausted=await api(limited,'creations','POST',{prompt:'Mais uma imagem',format:'feed',requestId:'quota-eight-exhausted'});assert.equal(exhausted.status,409);
  });
  await t.test('pausar a conversa cancela a criação derivada antes de gerar arquivos',async()=>{
   const thread=(await api(one,'conversations','POST',{title:'Pausa da criação'})).body;
   conversationReplies=[{status:'completed',output:[{type:'function_call',name:'create_media',call_id:'create-paused',arguments:JSON.stringify({prompt:'Crie uma imagem para feed.',format:'feed'})}]}];
   const submitted=await api(one,'conversations/'+thread.id+'/messages','POST',{text:'Crie uma imagem para feed.',mode:'execute',attachments:[owned.id]});assert.equal(submitted.status,201);await server.portal.tick();
   const linked=(await server.database.prepare("SELECT id FROM jobs WHERE org_id=? AND kind='creation' AND json_extract(payload,'$.conversationId')=?").all(one.org,thread.id));assert.equal(linked.length,1);
   const beforePlans=plans.length,beforeImages=images.length;assert.equal((await api(one,'conversations/'+thread.id+'/stop','POST',{})).status,200);await server.portal.tick();await server.portal.tick();
   assert.equal(plans.length,beforePlans,'Pausar o chat deve impedir o planejamento derivado');assert.equal(images.length,beforeImages);assert.equal((await api(one,'creations/'+linked[0].id)).body.creation.status,'blocked');
   const next=(await api(one,'conversations','POST',{title:'Pausa após o plano'})).body;
   conversationReplies=[{status:'completed',output:[{type:'function_call',name:'create_media',call_id:'create-children-paused',arguments:JSON.stringify({prompt:'Crie três imagens para carrossel.',format:'carousel',slideCount:3})}]}];
   await api(one,'conversations/'+next.id+'/messages','POST',{text:'Crie três imagens para carrossel.',mode:'execute'});await server.portal.tick();await server.portal.tick();
   const children=(await api(one,'conversations/'+next.id)).body.mediaJobs;assert.equal(children.length,3);const beforeChildren=images.length;
   assert.equal((await api(one,'conversations/'+next.id+'/stop','POST',{})).status,200);for(let i=0;i<3;i++)await server.portal.tick();assert.equal(images.length,beforeChildren,'A pausa precisa alcançar os arquivos derivados do plano');
   const states=(await api(one,'state')).body.jobs.filter(j=>children.some(c=>c.id===j.id));assert.ok(states.every(j=>j.state==='canceled'));

  });
  await t.test('conversa redireciona vídeo legado e gera Reels autorizado sem aprovação adicional',async()=>{
   const thread=(await api(one,'conversations','POST',{title:'Reels pela conversa'})).body;
   const before=videos.length;
   conversationBodies.length=0;
   conversationReplies=[
    {status:'completed',output:[{type:'function_call',name:'queue_action',call_id:'legacy-video',arguments:JSON.stringify({kind:'video',payloadJson:'{}'})}]},
    {status:'completed',output:[{type:'function_call',name:'create_media',call_id:'direct-reel',arguments:JSON.stringify({prompt:'Reels verde de 15 segundos.',format:'reels',duration:15})}]}
   ];
   await api(one,'conversations/'+thread.id+'/messages','POST',{text:'Crie o Reels com 15 segundos e entregue o MP4.',mode:'execute'});
   await server.portal.tick();
   const tools=conversationBodies[0].tools;
   assert.ok(tools.some(t=>t.name==='create_media'));
   assert.ok(!tools.some(t=>t.name.startsWith('video_')));
   assert.ok(!tools.find(t=>t.name==='queue_action').parameters.properties.kind.enum.includes('video'));
   assert.match(JSON.stringify(conversationBodies[1].input),/use create_media/);
   const linked=await server.database.prepare("SELECT id FROM jobs WHERE org_id=? AND kind='creation' AND json_extract(payload,'$.conversationId')=?").all(one.org,thread.id);
   assert.equal(linked.length,1);
   const ready=await finish(one,linked[0].id);
   assert.equal(ready.status,'complete',JSON.stringify(ready));
   assert.equal(ready.assets[0].mime,'video/mp4');
   assert.equal(videos.length,before+1);
  });
  await t.test('API agenda para a conversa e worker dispara apenas uma criação na data',async()=>{
   await api(one,'company','PATCH',{policy:{enabled:true}});
   const thread=(await api(one,'conversations','POST',{title:'Geração programada'})).body;
   const scheduled=await api(one,'creation-schedules','POST',{conversationId:thread.id,format:'reels',prompt:'Reels agendado',duration:15,videoOptions:{aspectRatio:'16:9',quality:'standard',preset:'product'},scheduledAt:new Date(Date.now()+86400000).toISOString()});
   assert.equal(scheduled.status,200,JSON.stringify(scheduled.body));
   assert.equal((await api(two,'creation-schedules')).body.schedules.length,0);
   assert.equal((await api(two,'creation-schedules/'+scheduled.body.id,'POST',{action:'cancel'})).status,422);
   const prior=videos.length;await server.portal.tick();assert.equal(videos.length,prior);
   await server.database.prepare("UPDATE records SET data=json_set(data,'$.nextAt',?) WHERE id=?").run(Date.now()-1000,scheduled.body.id);
   await server.portal.tick();const state=(await api(one,'creation-schedules')).body.schedules.find(s=>s.id===scheduled.body.id);
   assert.equal(state.enabled,false);assert.ok(state.lastCreationId);
   await finish(one,state.lastCreationId);assert.equal(videos.length,prior+1);assert.equal(videos.at(-1).options.aspectRatio,'16:9');assert.equal(videos.at(-1).options.quality,'standard');
   await server.portal.tick();assert.equal(videos.length,prior+1);
  });
  await t.test('indisponibilidade do renderizador aparece antes de cobrar pela preparação',async()=>{
   rendererAvailable=false;const before=plans.length;
   const denied=await api(one,'creations','POST',{...payload,format:'reels',requestId:'creation-reels-unavailable'});assert.equal(denied.status,409);assert.equal((await api(one,'creations')).body.capabilities.reels,false);assert.equal(plans.length,before);
   const privateList=await api(two,'creations');assert.equal(privateList.body.creations.length,0);
  });
 }finally{await server.portal.shutdown();await new Promise(r=>server.close(r));await pg?.close();}
});
