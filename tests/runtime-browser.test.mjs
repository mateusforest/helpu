import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createBrowserService,isPublicAddress} from '../services/runtime/browser.mjs';

class MockPage extends EventEmitter{
  constructor(){super();this.current='about:blank';this.challenge=false;this.identity={username:'empresa',source:'visible_self_profile_link'};this.sensitive=false;this.gone=false;this.actions=[];this.mouse={click:async(x,y)=>this.actions.push({kind:'click',x,y}),wheel:async(x,y)=>this.actions.push({kind:'wheel',x,y})};this.keyboard={insertText:async()=>this.actions.push({kind:'human_type'}),press:async key=>this.actions.push({kind:'key',key})};}
  async goto(url){this.current=url;this.emit('framenavigated',this);}
  url(){return this.current;}
  mainFrame(){return this;}
  isClosed(){return this.gone;}
  async evaluate(fn,args){assert.equal(fn.name,'inspectPage');if(this.challenge)return {challenge:true,elements:[],text:''};if(!args.nonce)return {challenge:false,identity:this.identity};return {challenge:false,identity:this.identity,text:'Conta conectada',elements:[{ref:args.nonce+'-0',role:'button',label:'Abrir publicação',type:''},{ref:args.nonce+'-1',role:'input',label:'Mensagem',type:'text'}]};}
  async screenshot(){return Buffer.from('mock-frame');}
  locator(){return {count:async()=>1,evaluate:async()=>({sensitive:this.sensitive,restricted:!!this.restricted,href:this.link||null}),click:async()=>{this.emit('action');if(this.pauseAction)await this.pauseAction;if(this.failAction)throw Error('provider details must not escape');this.actions.push({kind:'agent_click'});},fill:async()=>this.actions.push({kind:'agent_type'}),selectOption:async()=>this.actions.push({kind:'agent_select'}),setInputFiles:async file=>this.actions.push({kind:'agent_upload',file}),press:async key=>this.actions.push({kind:'agent_key',key})};}
}
class MockContext extends EventEmitter{
  constructor(){super();this.page=new MockPage();}
  pages(){return [this.page];}
  async newPage(){return this.page;}
  async route(pattern,handler){this.routeHandler=handler;}
  async routeWebSocket(pattern,handler){this.socketHandler=handler;}
  async close(){this.emit('close');}
}
async function fixture(t,options={}){
  const dataDir=await fs.mkdtemp(path.join(os.tmpdir(),'helpu-browser-test-')),contexts=[],calls=[];
  let clock=1_000;
  const launch=async(profile,config)=>{const context=new MockContext();contexts.push(context);calls.push({profile,config});return context;};
  const factory=()=>createBrowserService({dataDir,launch,now:()=>clock,resolveHost:async()=>[{address:'93.184.216.34'}],...options});
  const service=factory();t.after(async()=>{await service.shutdown();await fs.rm(dataDir,{recursive:true,force:true});});
  return {dataDir,service,contexts,calls,factory,advance:amount=>{clock+=amount;}};
}
const org=randomUUID(),otherOrg=randomUUID(),user=randomUUID(),otherUser=randomUUID(),job=randomUUID(),otherJob=randomUUID();
async function enable(service,company=org,channel='instagram'){
  await service.open(company,channel);await service.human(company,channel,user,{type:'take'});
  await service.confirm(company,channel,user,{accountLabel:'@empresa',automationAllowed:true});
  await service.human(company,channel,user,{type:'release'});
}
const rejectsCode=(fn,code)=>assert.rejects(fn,error=>error.code===code);

test('isolates persistent profiles and metadata by company and channel',async t=>{
  const f=await fixture(t);await enable(f.service);await f.service.open(otherOrg,'instagram');await f.service.open(org,'facebook');
  assert.equal(f.calls.length,3);assert.equal(new Set(f.calls.map(c=>c.profile)).size,3);
  assert.equal(f.calls[0].config.headless,true);assert.equal(f.calls[0].config.serviceWorkers,'block');assert.equal(f.calls[0].config.acceptDownloads,false);
  assert.equal(f.calls[0].config.chromiumSandbox,true);
  const ours=(await f.service.list(org)).find(x=>x.id==='instagram'),theirs=(await f.service.list(otherOrg)).find(x=>x.id==='instagram');
  assert.equal(ours.automationAllowed,true);assert.equal(theirs.automationAllowed,false);assert.equal(theirs.accountLabel,'');assert.equal(ours.executorAvailable,false);
  assert.ok(!('url' in ours));assert.ok(!('snapshotToken' in ours));assert.ok(!('owner' in ours));
  await rejectsCode(()=>f.service.open('../escape','instagram'),'invalid_identifier');await rejectsCode(()=>f.service.open(org,'higgsfield'),'invalid_channel');
});

test('human control is exclusive, renews, expires and cancels model ownership',async t=>{
  const f=await fixture(t);await enable(f.service);await f.service.claim(org,'instagram',job);await f.service.observe(org,'instagram');
  await f.service.human(org,'instagram',user,{type:'take'});
  assert.equal((await f.service.list(org,user))[0].humanOwned,true);assert.equal((await f.service.list(org,otherUser))[0].humanOwned,false);
  await rejectsCode(()=>f.service.observe(org,'instagram'),'human_control_active');await rejectsCode(()=>f.service.claim(org,'instagram',job),'human_control_active');
  await rejectsCode(()=>f.service.frame(org,'instagram',otherUser),'human_control_required');await rejectsCode(()=>f.service.human(org,'instagram',otherUser,{type:'take'}),'human_control_active');
  f.advance(290_000);assert.equal((await f.service.frame(org,'instagram',user)).image,Buffer.from('mock-frame').toString('base64'));
  f.advance(20_000);await rejectsCode(()=>f.service.claim(org,'instagram',job),'human_control_active');
  f.advance(281_000);await f.service.claim(org,'instagram',otherJob);await rejectsCode(()=>f.service.frame(org,'instagram',user),'human_control_required');
});

test('model actions require current job, short-lived known refs and consume snapshots',async t=>{
  const f=await fixture(t);await enable(f.service);await f.service.claim(org,'instagram',job);let observed=await f.service.observe(org,'instagram');
  const args={type:'click',ref:observed.elements[0].ref,snapshotToken:observed.snapshotToken};
  await rejectsCode(()=>f.service.act(org,'instagram',otherJob,args),'job_ownership_required');
  await rejectsCode(()=>f.service.act(org,'instagram',job,{...args,ref:'invented'}),'invalid_reference');
  assert.deepEqual(await f.service.act(org,'instagram',job,args),{applied:true,verified:false});
  await rejectsCode(()=>f.service.act(org,'instagram',job,args),'snapshot_stale');
  observed=await f.service.observe(org,'instagram');f.advance(30_001);
  await rejectsCode(()=>f.service.act(org,'instagram',job,{type:'type',ref:observed.elements[1].ref,snapshotToken:observed.snapshotToken,text:'Olá'}),'snapshot_stale');
  observed=await f.service.observe(org,'instagram');await f.service.release(job);await f.service.claim(org,'instagram',otherJob);
  await rejectsCode(()=>f.service.act(org,'instagram',otherJob,{...args,snapshotToken:observed.snapshotToken}),'snapshot_stale');
});

test('auth challenges return neither screenshot nor page content and revoke consent',async t=>{
  const f=await fixture(t);await enable(f.service);f.contexts[0].page.challenge=true;
  const response=await f.service.observe(org,'instagram');assert.equal(response.requiresHuman,true);assert.ok(!('image' in response));assert.equal(response.elements.length,0);
  assert.equal((await f.service.list(org))[0].automationAllowed,false);
  await rejectsCode(()=>f.service.observe(org,'instagram'),'automation_not_allowed');
  await f.service.human(org,'instagram',user,{type:'take'});await rejectsCode(()=>f.service.confirm(org,'instagram',user,{accountLabel:'@conta',automationAllowed:true}),'authentication_required');
});

test('a field changing to password cannot receive agent typing',async t=>{
  const f=await fixture(t);await enable(f.service);await f.service.claim(org,'instagram',job);const observed=await f.service.observe(org,'instagram');
  f.contexts[0].page.sensitive=true;
  await rejectsCode(()=>f.service.act(org,'instagram',job,{type:'type',snapshotToken:observed.snapshotToken,ref:observed.elements[1].ref,text:'secret'}),'authentication_required');
  assert.equal(f.contexts[0].page.actions.length,0);
});

test('restart keeps profile and label but never restores consent, snapshots or inputs',async t=>{
  const f=await fixture(t);await enable(f.service);await f.service.human(org,'instagram',user,{type:'take'});
  await f.service.human(org,'instagram',user,{type:'type',text:'not-persisted-secret'});await f.service.shutdown();
  const next=f.factory();t.after(()=>next.shutdown());const listed=await next.list(org);
  assert.equal(listed[0].accountLabel,'@empresa');assert.equal(listed[0].automationAllowed,false);assert.equal(listed[0].confirmedAt,null);
  await next.open(org,'instagram');await rejectsCode(()=>next.observe(org,'instagram'),'automation_not_allowed');
  assert.equal(f.calls[0].profile,f.calls[1].profile);
  const state=await fs.readFile(path.join(f.calls[0].profile,'helpu-state.json'),'utf8');
  for(const secret of ['not-persisted-secret',user,job,'snapshotToken','automationAllowed','confirmedAt'])assert.ok(!state.includes(secret));
});

test('network guards reject outside channels, private DNS, downloads and credential URLs',async t=>{
  const f=await fixture(t,{resolveHost:async host=>[{address:host==='private.instagram.com'?'127.0.0.1':'93.184.216.34'}]});await f.service.open(org,'instagram');
  const handler=f.contexts[0].routeHandler;
  async function request(url,navigation=true){let outcome;await handler({request:()=>({url:()=>url,isNavigationRequest:()=>navigation}),continue:async()=>{outcome='continue';},abort:async()=>{outcome='abort';}});return outcome;}
  assert.equal(await request('https://www.instagram.com/'),'continue');assert.equal(await request('https://www.facebook.com/login/'),'continue');
  for(const url of ['https://private.instagram.com/','http://instagram.com/','https://instagram.com:3000/','https://name:secret@instagram.com/','https://evilinstagram.com/','https://127.0.0.1/','https://www.google.com/','file:///etc/passwd'])assert.equal(await request(url),'abort',url);
  assert.equal(await request('https://scontent.cdninstagram.com/file.jpg',false),'continue');
  assert.equal(await request('https://scontent.cdninstagram.com/file.jpg',true),'abort');
  let cancelled=false;f.contexts[0].page.emit('download',{cancel:async()=>{cancelled=true;}});await Promise.resolve();assert.equal(cancelled,true);
  for(const address of ['127.0.0.1','169.254.169.254','10.2.3.4','192.168.1.1','100.64.0.1','172.31.1.1','::1','fe80::1','::ffff:127.0.0.1','fc00::1'])assert.equal(isPublicAddress(address),false,address);
  assert.equal(isPublicAddress('8.8.8.8'),true);assert.equal(isPublicAddress('2606:4700:4700::1111'),true);
});

test('session limit applies while opening; duplicates share one browser',async t=>{
  const f=await fixture(t,{maxSessions:1});const first=f.service.open(org,'instagram'),duplicate=f.service.open(org,'instagram');
  await rejectsCode(()=>f.service.open(otherOrg,'instagram'),'session_limit');await Promise.all([first,duplicate]);assert.equal(f.calls.length,1);
  await f.service.close(org,'instagram');await f.service.open(otherOrg,'instagram');assert.equal(f.calls.length,2);
});

test('navigation invalidates snapshots and uncertain interactions block further automation',async t=>{
  const f=await fixture(t);await enable(f.service);await f.service.claim(org,'instagram',job);let observed=await f.service.observe(org,'instagram');
  const page=f.contexts[0].page;await page.goto('https://www.instagram.com/next/');
  await rejectsCode(()=>f.service.act(org,'instagram',job,{type:'click',ref:observed.elements[0].ref,snapshotToken:observed.snapshotToken}),'snapshot_stale');
  observed=await f.service.observe(org,'instagram');page.failAction=true;
  await rejectsCode(()=>f.service.act(org,'instagram',job,{type:'click',ref:observed.elements[0].ref,snapshotToken:observed.snapshotToken}),'interaction_uncertain');
  await rejectsCode(()=>f.service.observe(org,'instagram'),'automation_not_allowed');
});

test('Instagram confirmation matches observed own-profile link and detects account changes',async t=>{
  const f=await fixture(t);await f.service.open(org,'instagram');await f.service.human(org,'instagram','123',{type:'take'});
  await rejectsCode(()=>f.service.confirm(org,'instagram','123',{accountLabel:'@someoneelse',automationAllowed:true}),'identity_mismatch');
  await f.service.confirm(org,'instagram','123',{accountLabel:'@empresa',automationAllowed:true});await f.service.human(org,'instagram','123',{type:'release'});
  assert.equal((await f.service.list(org))[0].connectionState,'identity_confirmed');
  f.contexts[0].page.identity={username:'different'};await rejectsCode(()=>f.service.observe(org,'instagram'),'identity_mismatch');
  assert.equal((await f.service.list(org))[0].automationAllowed,false);
});

test('navigation and restricted controls cannot escape safe channel interaction',async t=>{
  const f=await fixture(t);await enable(f.service);await f.service.claim(org,'instagram',job);let seen=await f.service.observe(org,'instagram');
  await rejectsCode(()=>f.service.act(org,'instagram',job,{type:'navigate',url:'https://evil.test/',snapshotToken:seen.snapshotToken}),'navigation_blocked');
  await rejectsCode(()=>f.service.act(org,'instagram',job,{type:'navigate',url:'https://instagram.com/payments/',snapshotToken:seen.snapshotToken}),'navigation_blocked');
  f.contexts[0].page.restricted=true;await rejectsCode(()=>f.service.act(org,'instagram',job,{type:'click',ref:seen.elements[0].ref,snapshotToken:seen.snapshotToken}),'restricted_action');
  f.contexts[0].page.restricted=false;
  assert.deepEqual(await f.service.act(org,'instagram',job,{type:'navigate',url:'https://www.instagram.com/empresa/',snapshotToken:seen.snapshotToken}),{applied:true,verified:false});
  seen=await f.service.observe(org,'instagram');await f.service.act(org,'instagram',job,{type:'select',text:'option',ref:seen.elements[0].ref,snapshotToken:seen.snapshotToken});
  assert.equal(f.contexts[0].page.actions.at(-1).kind,'agent_select');
});

test('imported uploads are immutable, private to company and checked again before use',async t=>{
  const f=await fixture(t);await enable(f.service);await f.service.claim(org,'instagram',job);const assetId=randomUUID(),bytes=Buffer.from([255,216,255,0,255,217]);
  const saved=await f.service.importAsset(org,{id:assetId,name:'image.jpg',bytes});assert.equal(saved.mimeType,'image/jpeg');assert.ok(!('path' in saved));
  await rejectsCode(()=>f.service.importAsset(org,{id:assetId,name:'image.jpg',bytes:Buffer.from([255,216,255,1,255,217])}),'asset_conflict');
  await rejectsCode(()=>f.service.importAsset(org,{id:randomUUID(),name:'../image.jpg',bytes}),'invalid_asset');
  await rejectsCode(()=>f.service.importAsset(org,{id:randomUUID(),name:'bad.jpg',bytes:Buffer.from('executable')}),'invalid_asset');
  let seen=await f.service.observe(org,'instagram');await f.service.act(org,'instagram',job,{type:'upload',sourceAssetId:assetId,ref:seen.elements[0].ref,snapshotToken:seen.snapshotToken});
  assert.equal(f.contexts[0].page.actions.at(-1).kind,'agent_upload');
  await enable(f.service,otherOrg);await f.service.claim(otherOrg,'instagram',otherJob);seen=await f.service.observe(otherOrg,'instagram');
  await rejectsCode(()=>f.service.act(otherOrg,'instagram',otherJob,{type:'upload',sourceAssetId:assetId,ref:seen.elements[0].ref,snapshotToken:seen.snapshotToken}),'asset_missing');
  await fs.writeFile(path.join(f.dataDir,'browser-assets',org,assetId+'.jpg'),Buffer.from('changed'));seen=await f.service.observe(org,'instagram');
  await rejectsCode(()=>f.service.act(org,'instagram',job,{type:'upload',sourceAssetId:assetId,ref:seen.elements[0].ref,snapshotToken:seen.snapshotToken}),'invalid_asset');
});

test('filechooser only uses imported company asset, and freeze revokes automation',async t=>{
  const f=await fixture(t);await enable(f.service);await f.service.claim(org,'instagram',job);const assetId=randomUUID();
  await f.service.importAsset(org,{id:assetId,name:'image.jpg',bytes:Buffer.from([255,216,255,0,255,217])});let chosen;
  f.contexts[0].page.emit('filechooser',{setFiles:async file=>{chosen=file;}});const seen=await f.service.observe(org,'instagram');
  await f.service.act(org,'instagram',job,{type:'upload',sourceAssetId:assetId,snapshotToken:seen.snapshotToken});assert.ok(chosen.endsWith(assetId+'.jpg'));
  await f.service.freeze(org,'instagram','ignored-secret-note');await rejectsCode(()=>f.service.observe(org,'instagram'),'automation_not_allowed');
  const state=(await f.service.list(org))[0];assert.equal(state.connectionState,'uncertain');assert.ok(!JSON.stringify(state).includes('ignored-secret-note'));
});

test('human takeover waits for in-flight agent interaction before acquiring control',async t=>{
  const f=await fixture(t);await enable(f.service);await f.service.claim(org,'instagram',job);const seen=await f.service.observe(org,'instagram'),page=f.contexts[0].page;
  let resume;page.pauseAction=new Promise(resolve=>{resume=resolve;});const started=new Promise(resolve=>page.once('action',resolve));
  const working=f.service.act(org,'instagram',job,{type:'click',ref:seen.elements[0].ref,snapshotToken:seen.snapshotToken});await started;
  let taken=false;const taking=f.service.human(org,'instagram',user,{type:'take'}).then(()=>{taken=true;});await Promise.resolve();assert.equal(taken,false);
  resume();await working;await taking;assert.equal(taken,true);await rejectsCode(()=>f.service.observe(org,'instagram'),'human_control_active');
});

test('capability check is explicit and stops reporting available after shutdown',async t=>{
  const f=await fixture(t);assert.equal(await f.service.capabilities(),true);await f.service.shutdown();assert.equal(await f.service.capabilities(),false);
  const previous=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=path.join(f.dataDir,'not-installed');
  try{const unavailable=createBrowserService({dataDir:f.dataDir});assert.equal(await unavailable.capabilities(),false);await unavailable.shutdown();}finally{if(previous===undefined)delete process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;else process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=previous;}
});
