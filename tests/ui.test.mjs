import {createStudioUI} from '../dist/assets/studio-ui.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {AGENTS,CONNECTORS,KINDS,DEFAULT_POLICY} from '../portal/catalog.mjs';
test('todas as áreas e formulários produzem HTML sem erros de execução',()=>{
 const nodes=new Map();const make=()=>({innerHTML:'',textContent:'',hidden:false,open:false,classList:{toggle(){},remove(){},add(){}},dataset:{},addEventListener(){},setAttribute(){},querySelector(){return make();},querySelectorAll(){return [];},insertAdjacentHTML(){},showModal(){this.open=true;},close(){this.open=false;},focus(){},value:''});
 const doc={body:{dataset:{}},hidden:false,activeElement:null,querySelector(key){if(!nodes.has(key))nodes.set(key,make());return nodes.get(key);},querySelectorAll(){return [];},addEventListener(){}};
 const fixture={company:{id:'company',name:'EME',profile:{},policy:DEFAULT_POLICY},records:Object.fromEntries(KINDS.map(k=>[k,[]])),assets:[],agents:AGENTS,integrations:CONNECTORS.map(c=>({...c,values:Object.fromEntries(c.fields.map(([k,,,d])=>[k,d||''])),configured:false})),jobs:[],audit:[],worker:{running:true}};
 const ctx=vm.createContext({createStudioUI,document:doc,window:{addEventListener(){}},location:{hash:'',origin:'http://localhost',assign(){}},localStorage:{getItem(){return null;},setItem(){}},setInterval(){},setTimeout(){},clearTimeout(){},__fixture:fixture,Date,Intl,URL,console,crypto:{randomUUID(){return 'test';}},createConversationUI:()=>({chat:()=>'<h1>Conversa</h1>',accounts:()=>'<h1>Contas</h1>',mount(){}})});
 const code=fs.readFileSync(new URL('../dist/assets/portal.js',import.meta.url),'utf8').replace(/^import[^\n]*\n/gm,'').replace(/init\(\);\s*$/,'');vm.runInContext(code,ctx);
 vm.runInContext("S=__fixture;org='company';boot={user:{name:'Pessoa',email:'test@example.test'},companies:[{id:'company',name:'EME'}]};",ctx);
 const routes=vm.runInContext('nav.map(x=>x[0])',ctx);assert.equal(routes.length,17);
 for(const route of routes){vm.runInContext('view='+JSON.stringify(route)+';render();',ctx);const html=nodes.get('#workspace').innerHTML;assert.ok(html.includes('<h1>'),route);assert.ok(!html.includes('[object Object]'),route);assert.ok(!html.includes('undefined'),route);}
 for(const kind of ['campaigns','content','leads','tasks','metrics','pages','knowledge']){vm.runInContext('editRecord('+JSON.stringify(kind)+')',ctx);assert.ok(nodes.get('#dialog-body').innerHTML.includes('dialog-form'),kind);}
 const now=Date.now();Object.assign(fixture.records,{campaigns:[{id:'campaign',name:'Campanha',status:'planning',channels:['instagram']}],content:[{id:'content',title:'Peça',status:'review',format:'image',channel:'instagram'}],leads:[{id:'lead',name:'Contato',stage:'new',consent:true,phone:'5511999999999'}],messages:[{id:'message',leadId:'lead',text:'Olá',channel:'whatsapp',direction:'incoming',status:'recorded'}],tasks:[{id:'task',title:'Tarefa',status:'todo'}],metrics:[{id:'metric',date:'2026-09-11',clicks:3,channel:'instagram',source:'manual'}],pages:[{id:'page',title:'Página',active:true}],knowledge:[{id:'knowledge',title:'Oferta',text:'Informações'}]});
 fixture.jobs=[{id:'job',kind:'agent',payload:{agent:'creative'},state:'succeeded',createdAt:now,updatedAt:now,output:{summary:'Resultado',questions:[],recommendations:['Próximo passo']}}];fixture.audit=[{created_at:now,action:'Registro criado',actor:'1',note:'Registro'}];
 for(const route of routes)vm.runInContext('view='+JSON.stringify(route)+';render();',ctx);
 for(const expression of ["contentDetail('content')","jobDetail('job')","bulkMessage()","googleCreate()","googleResult('accounts',{accounts:[{name:'accounts/123',accountName:'Conta EME'}]})","googleResult('read',{title:'EME'})","googleResult('status',{hasVoiceOfMerchant:true})","googleResult('reviews',{reviews:[]})"])vm.runInContext(expression,ctx);
});
