import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const flush=async()=>{for(let i=0;i<15;i++)await Promise.resolve();};
function fixture(){
 const nodes=new Map(),events={},intervals=[],posts=[],pending=new Map();let creation=null,profileOpen=false;
 const node=()=>({innerHTML:'',value:'',handlers:{},addEventListener(name,fn){this.handlers[name]=fn;},focus(){},setSelectionRange(){}});
 const document={hidden:false,activeElement:null,querySelector(selector){if(!nodes.has(selector))nodes.set(selector,node());return nodes.get(selector);},addEventListener(name,fn){events[name]=fn;}};
 const state={company:{id:'org',name:'Teste'},assets:[],records:{content:[]},integrations:[]};
 const api=async(url,method='GET',body)=>{
  if(method==='POST'&&url.endsWith('/conversations')&&creation)return creation;
  if(method==='POST'){posts.push({url,body});return {};}
  if(url.endsWith('/conversations'))return {conversations:['A','B','CREATED'].map(id=>({id,title:id,updatedAt:1}))};
  if(url.endsWith('/browser'))return {profiles:[{id:'instagram',name:'Instagram',open:profileOpen}]};
  const id=url.split('/').at(-1);if(pending.has(id))return pending.get(id);
  return snapshot(id);
 };
 const snapshot=id=>({messages:[{id,role:'assistant',text:'VISUAL '+id,attachments:[],createdAt:1}],events:[],jobs:[],operations:[]});
 const context=vm.createContext({document,console,Date,JSON,Promise,setInterval:fn=>{intervals.push(fn);return 1;},crypto:{randomUUID:()=> 'key'},__deps:{api,endpoint:tail=>'/api/portal/org/'+tail,getState:()=>state,esc:v=>String(v??''),toast(){},refresh:async()=>{},openDialog(){},closeDialog(){}}});
 vm.runInContext(fs.readFileSync(new URL('../dist/assets/conversation-ui.js',import.meta.url),'utf8').replace('export function','function')+'\nglobalThis.ui=createConversationUI(__deps);',context);
 const ui=context.ui;
 const click=(action,id)=>events.click({target:{closest:()=>({dataset:{chat:action,id},disabled:false})}});
 const type=text=>nodes.get('#conversation-prompt').handlers.input({target:{value:text}});
 const submit=()=>nodes.get('#conversation-composer').handlers.submit({preventDefault(){}});
 return {ui,nodes,posts,intervals,click,type,submit,snapshot,hold(id){let release;pending.set(id,new Promise(r=>release=r));return ()=>{pending.delete(id);release(snapshot(id));};},holdCreation(){let release;creation=new Promise(r=>release=r);return ()=>release({id:'CREATED'});},openProfile(){profileOpen=true;}};
}

test('troca de conversa limpa o contexto anterior e impede envio durante carga',async()=>{
 const f=fixture();f.ui.mount('conversation');await flush();await f.ui.selectThread('A');assert.match(f.ui.chat(),/VISUAL A/);
 const release=f.hold('B'),loading=f.ui.selectThread('B');assert.doesNotMatch(f.ui.chat(),/VISUAL A/);
 f.type('Pedido para B');await f.submit();assert.equal(f.posts.length,0);release();await loading;
 assert.match(f.ui.chat(),/VISUAL B/);await f.submit();assert.equal(f.posts[0].url,'/api/portal/org/conversations/B/messages');
});

test('respostas atrasadas não substituem a conversa selecionada',async()=>{
 const f=fixture();f.ui.mount('conversation');await flush();
 const release=f.hold('A'),old=f.ui.selectThread('A');await f.ui.selectThread('B');release();await old;assert.match(f.ui.chat(),/VISUAL B/);assert.doesNotMatch(f.ui.chat(),/VISUAL A/);
 await f.click('new');f.type('Novo pedido');const created=f.holdCreation(),submission=f.submit();await flush();await f.ui.selectThread('B');created();await submission;
 assert.match(f.ui.chat(),/VISUAL B/);assert.equal(f.posts.length,0);
});

test('polling atualiza os cartões das contas sem trocar de área',async()=>{
 const f=fixture();f.ui.mount('browser');await flush();assert.match(f.nodes.get('#workspace').innerHTML,/Não conectado/);
 f.openProfile();f.intervals[0]();await flush();assert.match(f.nodes.get('#workspace').innerHTML,/Navegador aberto/);
});
