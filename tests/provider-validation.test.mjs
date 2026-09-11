import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createProviders} from '../portal/providers.mjs';
import {createBrowserManager} from '../portal/browser.mjs';

const output=(value,id='response-test')=>({id,status:'completed',model:'configured-model',usage:{input_tokens:2,output_tokens:3,total_tokens:5},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(value)}]}]});

test('validação operacional usa Responses com ferramenta inofensiva e formato estruturado',async()=>{
 const requests=[];const provider=createProviders(async(url,options)=>{
  const body=JSON.parse(options.body);requests.push({url,body});
  if(requests.length===1)return Response.json({id:'probe',status:'completed',output:[{type:'function_call',name:'helpu_validation_probe',call_id:'call-probe',arguments:JSON.stringify({nonce:body.tools[0].parameters.properties.nonce.enum[0]})}]});
  const nonce=JSON.parse(body.input.at(-1).output).nonce;return Response.json(output({ok:true,nonce,capability:'structured_tools'}));
 });
 const result=await provider.operationalValidation({apiKey:'private-key',agentModel:'configured-model'},{tools:['read_records','queue_action']});
 assert.equal(result.status,'validated');assert.equal(result.model,'configured-model');assert.equal(result.configuredModel,'configured-model');assert.equal(result.responseId,'response-test');assert.equal(result.toolCalling,true);assert.equal(result.structuredOutput,true);assert.equal(requests.length,2);assert.ok(result.latencyMs>=0);assert.ok(!JSON.stringify(result).includes('private-key'));
 for(const request of requests){assert.equal(request.url,'https://api.openai.com/v1/responses');assert.equal(request.body.store,false);assert.equal(request.body.model,'configured-model');assert.equal(request.body.tools.length,1);assert.equal(request.body.tools[0].name,'helpu_validation_probe');}
 assert.ok(result.tools.filter(t=>t.name!=='helpu_validation_probe').every(t=>t.status==='available_unvalidated'));
});

test('chave ausente, resposta incompleta e falha de contrato nunca validam a inteligência',async()=>{
 let calls=0;const missing=createProviders(async()=>{calls++;throw Error('should not call');});const blocked=await missing.operationalValidation({agentModel:'configured-model'});assert.equal(blocked.status,'blocked');assert.equal(blocked.configuredModel,'configured-model');assert.equal((await missing.operationalValidation({model:'legacy-task-model'})).configuredModel,'gpt-6-astra');assert.equal(calls,0);
 for(const response of [{status:'incomplete',output:[]},output({ok:true})]){const provider=createProviders(async()=>Response.json(response));const result=await provider.operationalValidation({apiKey:'private-key',agentModel:'configured-model'});assert.equal(result.status,'failed');assert.equal(result.structuredOutput,false);assert.ok(!JSON.stringify(result).includes('private-key'));}
 const failing=createProviders(async()=>{throw Error('private-key');});assert.ok(!(await failing.operationalValidation({apiKey:'private-key'})).error.includes('private-key'));
});

test('parecer contextual verifica critérios e não converte falha em aprovação',async()=>{
 const checks=['objective','brand_identity','tone','factual_claims','channel'].map(criterion=>({criterion,passed:criterion!=='factual_claims',note:'Conferido com os fatos fornecidos.'}));
 const provider=createProviders(async()=>Response.json(output({approved:true,summary:'Revisão contextual',checks,blockers:[]})));
 const result=await provider.contextualReview({apiKey:'private-key',agentModel:'configured-model'},{company:{name:'Empresa de teste'},objective:'Publicação de teste',content:{caption:'Legenda'}});
 assert.equal(result.approved,false);assert.equal(result.metadata.scope,'text_and_brief');assert.equal(result.metadata.imageReview,'not_performed');assert.equal(result.metadata.responseId,'response-test');
 const malformed=createProviders(async()=>Response.json(output({approved:true,summary:'ok',checks:[],blockers:[]})));await assert.rejects(malformed.contextualReview({apiKey:'x'},{company:{},objective:'Teste',content:{}}),/parecer contextual/);
});

test('revisão visual envia a imagem real e exige um critério visual explícito',async()=>{
 let requested;const imageDataUrl='data:image/png;base64,iVBORw0KGgo=';const checks=['objective','brand_identity','tone','factual_claims','channel','visual_alignment'].map(criterion=>({criterion,passed:true,note:'Parecer controlado.'}));
 const provider=createProviders(async(url,options)=>{requested=JSON.parse(options.body);return Response.json(output({approved:true,summary:'Revisão com imagem.',checks,blockers:[]}));});
 const result=await provider.contextualReview({apiKey:'private-key'},{company:{},objective:'Teste',content:{},imageDataUrl});assert.equal(requested.input[0].content[1].type,'input_image');assert.equal(requested.input[0].content[1].image_url,imageDataUrl);assert.equal(result.metadata.imageReview,'performed');assert.equal(result.metadata.scope,'text_brief_and_image');assert.equal(result.checks.at(-1).criterion,'visual_alignment');
 await assert.rejects(provider.contextualReview({apiKey:'private-key'},{company:{},objective:'Teste',content:{},imageDataUrl:'https://attacker.example/image.png'}),e=>e.state==='blocked');
});

const identity={id:'account-1',username:'eme.test'};
const media={id:'media-1',username:'eme.test',caption:'Legenda aprovada.',media_type:'IMAGE',permalink:'https://www.instagram.com/p/confirmed/',media_url:'https://cdn.example.test/media.jpg',timestamp:'2026-09-11T12:00:00+0000'};
const config={accessToken:'private-token',accountId:'account-1'};
function instagramFetcher(overrides={},requests=[]){return async(url,options)=>{requests.push({url,method:options.method});const target=new URL(url).pathname.split('/').at(-1);return Response.json(target==='account-1'?(overrides.identity||identity):target==='container-1'?{status_code:'PUBLISHED'}:{...media,...overrides.media});};}

test('identidade e publicação Instagram exigem conta, legenda, mídia e permalink correspondentes',async()=>{
 const requests=[],provider=createProviders(instagramFetcher({},requests));const actual=await provider.instagramIdentity(config);assert.equal(actual.id,'account-1');assert.equal(actual.username,'eme.test');
 const result=await provider.instagramVerify(config,'media-1','container-1',{expectedAccountId:'account-1',expectedCaption:'Legenda aprovada.',expectedMediaType:'IMAGE'});
 assert.equal(result.evidence.type,'instagram_media_readback');assert.equal(result.identity.id,'account-1');assert.equal(result.permalink,media.permalink);assert.equal(result.caption,media.caption);assert.equal(result.mediaType,'IMAGE');assert.equal(result.timestamp,media.timestamp);assert.ok(requests.every(r=>r.method==='GET'&&!r.url.includes('private-token')));
 for(const wrong of [{username:'other'},{caption:'Outra legenda'},{id:'wrong-id'},{permalink:'https://attacker.example/post'},{timestamp:null},{media_type:'VIDEO'}]){const bad=createProviders(instagramFetcher({media:wrong}));await assert.rejects(bad.instagramVerify(config,'media-1','container-1',{expectedCaption:media.caption,expectedMediaType:'IMAGE'}),e=>e.state==='uncertain');}
 await assert.rejects(createProviders(instagramFetcher({identity:{id:'wrong-account',username:'eme.test'}})).instagramIdentity(config),e=>e.state==='blocked');
});

test('métricas Instagram preservam zero real e deixam ausência explícita',async()=>{
 const requests=[];const provider=createProviders(async(url,options)=>{
  requests.push({url,method:options.method});const target=new URL(url);
  if(target.pathname.endsWith('/account-1'))return Response.json(identity);
  if(target.pathname.endsWith('/media-1'))return Response.json(media);
  const name=target.searchParams.get('metric');return Response.json({data:name==='likes'?[{name:'likes',period:'lifetime',id:'media-1/insights/likes/lifetime',values:[{value:0}]}]:[]});
 });
 const result=await provider.instagramMetrics(config,{mediaId:'media-1',metrics:['likes','reach']});assert.equal(result.status,'partial');assert.equal(result.metrics.length,1);assert.equal(result.metrics[0].value,0);assert.equal(result.metrics[0].accountId,'account-1');assert.equal(result.unavailable[0].name,'reach');assert.ok(requests.every(r=>r.method==='GET'));
});

test('confirmação de navegador exige ator e identidade observada, mantém executor indisponível',async()=>{
 const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'helpu-browser-validation-')),db=new DatabaseSync(':memory:');let currentIdentity=null;
 db.exec('CREATE TABLE users(id INTEGER PRIMARY KEY);');for(const version of ['001','002','003'])db.exec(fs.readFileSync(new URL('../portal/migrations/'+version+'.sql',import.meta.url),'utf8'));
 db.prepare('INSERT INTO users VALUES(1)').run();db.prepare('INSERT INTO companies VALUES(?,?,?,?,?,?)').run('org','Empresa','{}','{}',Date.now(),Date.now());db.prepare("INSERT INTO memberships VALUES('org',1,'owner')").run();
 const page={url:()=> 'https://www.instagram.com/',isClosed:()=>false,title:async()=> 'Instagram',bringToFront:async()=>{},on(){},goto:async()=>{},evaluate:async()=>({challenge:false,text:'Texto citando @eme não comprova identidade.',elements:[],identities:currentIdentity?[currentIdentity]:[]})};
 const manager=createBrowserManager({db,dataDir,launch:async()=>({pages:()=>[page],route:async()=>{},on(){},close:async()=>{}})});
 try{
  await manager.open('org','instagram');assert.equal(manager.list('org')[0].connectionState,'identity_unconfirmed');assert.equal(manager.list('org')[0].operationalReady,false);
  await assert.rejects(manager.confirm('org','instagram','@eme',true,false,{actorId:1}),/identidade digitada/);
  currentIdentity={username:'eme',profileUrl:'https://www.instagram.com/eme/',source:'visible_self_profile_link',label:'Perfil'};
  await assert.rejects(manager.confirm('org','instagram','@eme',true),/usuário autenticado/);
  const confirmed=await manager.confirm('org','instagram','@eme',true,false,{actorId:1});assert.equal(confirmed.connectionState,'identity_confirmed');assert.equal(confirmed.validation.actorId,1);assert.equal(confirmed.executorAvailable,false);assert.equal(confirmed.blocker.code,'blocked_browser_executor_unvalidated');
  const persisted=JSON.parse(db.prepare("SELECT data FROM records WHERE kind='connection_validation' AND external_id='browser:instagram'").get().data);assert.equal(persisted.identity.username,'eme');assert.equal(persisted.identity.source,'visible_self_profile_link');
  currentIdentity={...currentIdentity,username:'another',profileUrl:'https://www.instagram.com/another/'};await manager.observe('org','instagram');assert.equal(manager.list('org')[0].automationAllowed,false);assert.equal(manager.list('org')[0].confirmedAt,null);
 }finally{await manager.shutdown();db.close();assert.ok(path.resolve(dataDir).startsWith(path.resolve(os.tmpdir())+path.sep+'helpu-browser-validation-'));fs.rmSync(dataDir,{recursive:true,force:true});}
});
