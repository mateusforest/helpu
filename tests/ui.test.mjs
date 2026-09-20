import {companyDiagnosisCard,COMPANY_DIAGNOSIS_BRIEF} from '../dist/assets/company-diagnosis-ui.js';
import {technicalUsageCard} from '../dist/assets/usage-ui.js';
import {renderChatText} from '../dist/assets/chat-format.js';
import {readableTerm,knowledgeTitle} from '../dist/assets/labels.js';
import {createStudioUI} from '../dist/assets/studio-ui.js';
import {connectionFields,instagramSetupContent,autonomySummary,panelToolsStatus} from '../dist/assets/connection-ui.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {AGENTS,CONNECTORS,KINDS,DEFAULT_POLICY} from '../portal/catalog.mjs';
test('todas as áreas e formulários produzem HTML sem erros de execução',()=>{
 const nodes=new Map();const make=()=>({innerHTML:'',textContent:'',hidden:false,open:false,classList:{toggle(){},remove(){},add(){}},dataset:{},addEventListener(){},setAttribute(){},querySelector(){return make();},querySelectorAll(){return [];},insertAdjacentHTML(){},showModal(){this.open=true;},close(){this.open=false;},focus(){},value:''});
 const doc={body:{dataset:{}},hidden:false,activeElement:null,querySelector(key){if(!nodes.has(key))nodes.set(key,make());return nodes.get(key);},querySelectorAll(){return [];},addEventListener(){}};
 const fixture={company:{id:'company',name:'EME',profile:{},policy:DEFAULT_POLICY},records:Object.fromEntries(KINDS.map(k=>[k,[]])),assets:[],agents:AGENTS,integrations:CONNECTORS.map(c=>({...c,values:Object.fromEntries(c.fields.map(([k,,,d])=>[k,d||''])),configured:false})),jobs:[],audit:[],worker:{running:true}};
 const ctx=vm.createContext({companyDiagnosisCard,COMPANY_DIAGNOSIS_BRIEF,technicalUsageCard,createConsultationUI:()=>({page:()=>'<h1>Consultorias</h1>',mount(){}}),uploadFile:()=>{},createAssistedUI:()=>({page:()=>'<h1>Publicação assistida</h1>',mount(){}}),createContextualHelpUI:()=>({mount(){}}),createOnboardingUI:()=>({mount(){}}),renderChatText,createCreationUI:()=>({page:()=>'<h1>Criar conteúdo</h1>',mount(){}}),createCloudToolsUI:()=>({screens:()=>"<h1>Telas</h1>",videos:()=>"<h1>Vídeo</h1>",mount(){}}),connectionFields,instagramSetupContent,autonomySummary,panelToolsStatus,readableTerm,knowledgeTitle,createAccountUI:()=>({page:()=>'<h1>Minha conta</h1>',mount(){}}),createStudioUI,document:doc,window:{addEventListener(){}},location:{hash:'',origin:'http://localhost',assign(){}},localStorage:{getItem(){return null;},setItem(){}},setInterval(){},setTimeout(){},clearTimeout(){},__fixture:fixture,Date,Intl,URL,console,crypto:{randomUUID(){return 'test';}},createConversationUI:()=>({chat:()=>'<h1>Conversa</h1>',accounts:()=>'<h1>Contas</h1>',mount(){}})});
 const code=fs.readFileSync(new URL('../dist/assets/portal.js',import.meta.url),'utf8').replace(/^import[^\n]*\n/gm,'').replace(/init\(\);\s*$/,'');vm.runInContext(code,ctx);
 vm.runInContext("S=__fixture;org='company';boot={user:{name:'Pessoa',email:'test@example.test'},companies:[{id:'company',name:'EME'}]};",ctx);
 const routes=vm.runInContext('routes.map(x=>x[0])',ctx);assert.equal(routes.length,24);
 assert.equal(vm.runInContext("nav.length",ctx),5);
 for(const route of routes){vm.runInContext('view='+JSON.stringify(route)+';render();',ctx);const html=nodes.get('#workspace').innerHTML;assert.ok(html.includes('<h1>'),route);assert.ok(!html.includes('[object Object]'),route);assert.ok(!html.includes('undefined'),route);}
 for(const kind of ['campaigns','content','leads','tasks','metrics','pages','knowledge']){vm.runInContext('editRecord('+JSON.stringify(kind)+')',ctx);assert.ok(nodes.get('#dialog-body').innerHTML.includes('dialog-form'),kind);}
 for(const connector of fixture.integrations.filter(c=>c.id!=='higgsfield')){vm.runInContext('integrationDialog('+JSON.stringify(connector.id)+')',ctx);assert.ok(nodes.get('#dialog-body').innerHTML.includes('dialog-form'),connector.id);}
 vm.runInContext('instagramSetup()',ctx);assert.match(nodes.get('#dialog-body').innerHTML,/aplicativo da Meta/);
 const igFixture=fixture.integrations.find(c=>c.id==='instagram');
 Object.assign(igFixture,{configured:true,verifiedAt:Date.now(),validation:{status:'blocked'}});
 vm.runInContext("view='integrations';render();",ctx);assert.doesNotMatch(nodes.get('#workspace').innerHTML,/>Conectado</);
 igFixture.validation={status:'validated'};
 vm.runInContext("view='integrations';render();",ctx);assert.doesNotMatch(nodes.get('#workspace').innerHTML,/Entrar com Instagram|Meta Ads|Perfil da Empresa no Google/);assert.match(nodes.get('#workspace').innerHTML,/WhatsApp da Helpu/);
 Object.assign(igFixture,{configured:false,verifiedAt:null,validation:null});
 const now=Date.now();Object.assign(fixture.records,{campaigns:[{id:'campaign',name:'Campanha',status:'planning',channels:['instagram']}],content:[{id:'content',title:'Peça',status:'review',format:'image',channel:'instagram'}],leads:[{id:'lead',name:'Contato',stage:'new',consent:true,phone:'5511999999999'}],messages:[{id:'message',leadId:'lead',text:'Olá',channel:'whatsapp',direction:'incoming',status:'recorded'}],tasks:[{id:'task',title:'Tarefa',status:'todo'}],metrics:[{id:'metric',date:'2026-09-11',clicks:3,channel:'instagram',source:'manual'}],pages:[{id:'page',title:'Página',active:true}],knowledge:[{id:'knowledge',title:'Oferta',text:'Informações'}]});
 fixture.jobs=[{id:'job',kind:'agent',payload:{agent:'creative'},state:'succeeded',createdAt:now,updatedAt:now,output:{summary:'Resultado',questions:[],recommendations:['Próximo passo']}}];fixture.audit=[{created_at:now,action:'Registro criado',actor:'1',note:'Registro'}];
 for(const route of routes)vm.runInContext('view='+JSON.stringify(route)+';render();',ctx);
 for(const expression of ["contentDetail('content')","jobDetail('job')","bulkMessage()","googleCreate()","googleResult('accounts',{accounts:[{name:'accounts/123',accountName:'Conta EME'}]})","googleResult('read',{title:'EME'})","googleResult('status',{hasVoiceOfMerchant:true})","googleResult('reviews',{reviews:[]})"])vm.runInContext(expression,ctx);
});


test('briefing anterior oferece criação direta sem verificação ou hospedagem do editor',()=>{
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let shown='';const p={contentId:'old-content',state:'blocked_first_generation_required',sourceVersion:2,sourceJobId:'old-job',executor:{provider:'openai'},blockers:[{message:'Hospede o editor na Render'}],specification:{objective:'Apresentar a marca',exactText:{source:'Texto salvo'},artDirection:'Fundo claro'},generation:{assetId:'old-image'}};
 const state={company:{id:'company'},production:[p],records:{content:[{id:'old-content',title:'Briefing <seguro>',format:'image',visualPrompt:'Referência existente'}]},assets:[{id:'old-image',mime:'image/png',name:'Imagem existente'}]};
 const ui=createStudioUI({state:()=>state,esc,btn:(text,action,data='')=>'<button data-action="'+action+'" '+data+'>'+text+'</button>',openDialog:(title,html)=>{shown=html;}});
 const summary=ui.summary();assert.match(summary,/Briefings anteriores/);assert.match(summary,/data-action="generate-image"/);assert.doesNotMatch(summary,/pendente|validar|hosped/i);
 ui.detail(p);assert.match(shown,/Texto salvo/);assert.match(shown,/Fundo claro/);assert.match(shown,/Criar com este briefing/);assert.match(shown,/\/api\/portal\/files\/old-image/);assert.doesNotMatch(shown,/studio-check|studio-openai-check|Render|1080 × 1080|<seguro>/);
});
