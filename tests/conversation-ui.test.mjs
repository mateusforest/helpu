import {readableTerm} from '../dist/assets/labels.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {renderChatText,eventLabel,operationLabel} from '../dist/assets/chat-format.js';
import {uploadFile} from '../dist/assets/upload.js';

const flush=async()=>{for(let i=0;i<15;i++)await Promise.resolve();};
function fixture(overrides={},stateOverrides={}){
 const nodes=new Map(),events={},intervals=[],posts=[],pending=new Map();let creation=null,profileOpen=false;
 const node=()=>({innerHTML:'',value:'',handlers:{},addEventListener(name,fn){this.handlers[name]=fn;},focus(){},setSelectionRange(){}});
 const document={hidden:false,activeElement:null,querySelectorAll(){return [];},querySelector(selector){if(!nodes.has(selector))nodes.set(selector,node());return nodes.get(selector);},addEventListener(name,fn){events[name]=fn;}};
 const state={company:{id:'org',name:'Teste'},assets:[],records:{content:[]},integrations:[],production:[{contentId:'unrelated',blockers:[{message:'PENDÊNCIA DE OUTRA CONVERSA'}]}],...stateOverrides};
 const api=async(url,method='GET',body)=>{
  if(method==='POST'&&url.endsWith('/conversations')&&creation)return creation;
  if(method==='POST'){posts.push({url,body});return {};}
  if(url.endsWith('/conversations'))return {conversations:['A','B','CREATED'].map(id=>({id,title:id,updatedAt:1}))};
  if(url.endsWith('/browser'))return {profiles:[{id:'instagram',name:'Instagram',open:profileOpen}]};
  const id=url.split('/').at(-1);if(pending.has(id))return pending.get(id);
  return {...snapshot(id),...overrides};
 };
 const snapshot=id=>({messages:[{id,role:'assistant',text:'VISUAL '+id,attachments:[],createdAt:1}],events:[],jobs:[],operations:[]});
 const context=vm.createContext({readableTerm,renderChatText,eventLabel,operationLabel,document,console,Date,JSON,Promise,uploadFile,setInterval:fn=>{intervals.push(fn);return 1;},crypto:{randomUUID:()=> 'key'},__deps:{api,endpoint:tail=>'/api/portal/org/'+tail,getState:()=>state,esc:v=>String(v??''),toast(){},refresh:async()=>{},openDialog(){},closeDialog(){}}});
 vm.runInContext(fs.readFileSync(new URL('../dist/assets/conversation-ui.js',import.meta.url),'utf8').replace(/^import[^\n]*\n/gm,'').replace('export function','function')+'\nglobalThis.ui=createConversationUI(__deps);',context);
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

test('conversa formata respostas e recolhe operações com progresso em português',async()=>{
 const f=fixture({messages:[{id:'m',role:'assistant',text:'Vamos começar.\n\n**Sua campanha**\n- Uma imagem\n- Um vídeo',createdAt:1,attachments:[]}],jobs:[{id:'job',state:'working'}],events:[{jobId:'job',label:'Operação: understanding',kind:'operation_transition',detail:{to:'understanding'}},{jobId:'outro',label:'ESTADO DE OUTRO PEDIDO'}],operations:[{id:'op',state:'understanding',objective:'Criar campanha',updatedAt:1}]});
 f.ui.mount('conversation');await flush();await f.ui.selectThread('A');const html=f.ui.chat();
 assert.match(html,/<strong>Sua campanha<\/strong>/);assert.match(html,/<ul><li>Uma imagem/);
 assert.match(html,/<div class="chat-working" role="status">.*Entendendo seu pedido/);
 assert.doesNotMatch(html,/Operação: understanding/);
 assert.match(html,/<details class="chat-activity " data-details-key="A:activity">/);
 assert.ok(html.indexOf('Andamento e entregas')<html.indexOf('class="operation-context"'));
 assert.match(html,/<div class="conversation-thread-head sr-only">/);
 assert.doesNotMatch(html,/PENDÊNCIA DE OUTRA CONVERSA|Uma criação precisa de um ajuste/);
});

test('falhas reais seguem visíveis sem repetir o erro já respondido pela Helpu',async()=>{
 const f=fixture({jobs:[{id:'job',state:'failed',error:'Não foi possível criar a imagem.'}]});
 f.ui.mount('conversation');await flush();await f.ui.selectThread('A');assert.match(f.ui.chat(),/class="chat-run-error" role="status">Não foi possível criar a imagem\./);
 const replied=fixture({messages:[{id:'m',jobId:'job',role:'assistant',text:'Não foi possível criar a imagem. Confira a conexão.',createdAt:1,attachments:[]}],jobs:[{id:'job',state:'failed',error:'Não foi possível criar a imagem.'}]});
 replied.ui.mount('conversation');await flush();await replied.ui.selectThread('A');assert.doesNotMatch(replied.ui.chat(),/class="chat-run-error"/);assert.match(replied.ui.chat(),/Confira a conexão/);
});

test('aprovação e falha continuam sinalizadas no resumo recolhido',async()=>{
 const f=fixture({operations:[{id:'op',state:'awaiting_approval',objective:'Campanha',updatedAt:1}]});
 f.ui.mount('conversation');await flush();await f.ui.selectThread('A');const html=f.ui.chat();
 assert.match(html,/<details class="chat-activity needs-attention"/);
 assert.match(html,/<span class="chat-activity-status">Aguardando sua aprovação<\/span>/);
 assert.match(html,/data-operation-action="approve"/);
});

test('imagem gerada aparece na conversa com download e acompanhamento da fila',async()=>{
 const f=fixture({messages:[{id:'m',role:'assistant',text:'Imagem salva.',attachments:['asset-1','fora-da-empresa'],createdAt:1}],mediaJobs:[{id:'image-job',state:'working'}]},{assets:[{id:'asset-1',name:'Imagem criada',mime:'image/png',url:'https://external.invalid/untrusted'}]});
 f.ui.mount('conversation');await flush();await f.ui.selectThread('A');const html=f.ui.chat();
 assert.match(html,/<img src="\/api\/portal\/files\/asset-1"/);assert.match(html,/Baixar imagem/);assert.match(html,/Preparando sua imagem/);assert.doesNotMatch(html,/external.invalid|fora-da-empresa/);
});
