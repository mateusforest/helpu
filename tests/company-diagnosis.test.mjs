import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHelpuServer} from '../server.mjs';
import {createProviders} from '../portal/providers.mjs';
import {companyDiagnosisCard,COMPANY_DIAGNOSIS_BRIEF} from '../dist/assets/company-diagnosis-ui.js';

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const options={esc,formatTime:v=>'data '+v};
const base=()=>({company:{profile:{description:'Serviços locais',audience:'Empresas'}},integrations:[{id:'openai',configured:true}],jobs:[]});
const report=(id='diagnosis',createdAt=1)=>({id,kind:'agent',payload:{agent:'strategy',purpose:'company_diagnosis'},createdAt,updatedAt:createdAt+1,state:'succeeded',output:{summary:'Perfil confirmado <script>alert(1)</script>',recommendations:['Proposta de valor'],questions:['Qual é o foco?']}});

test('diagnóstico começa vazio, exige perfil salvo/conexão e explica uso de IA sem pesquisa externa',()=>{
 const state=base();let html=companyDiagnosisCard(state,options);
 assert.doesNotMatch(COMPANY_DIAGNOSIS_BRIEF,/\b(summary|recommendations|questions|pieces)\b/);assert.match(COMPANY_DIAGNOSIS_BRIEF,/informações salvas/);
 assert.match(html,/Nenhum diagnóstico concluído/);assert.match(html,/Gerar diagnóstico/);assert.match(html,/Salvar o cadastro não inicia/);assert.match(html,/Não inclui pesquisa externa/);assert.doesNotMatch(html,/data-action="company-diagnosis" disabled/);
 state.company.profile.description='';html=companyDiagnosisCard(state,options);assert.match(html,/Complete e salve/);assert.match(html,/data-action="company-diagnosis" disabled/);
 state.company.profile.description='Serviços';state.integrations=[];html=companyDiagnosisCard(state,options);assert.match(html,/Conecte a inteligência/);assert.match(html,/data-action="company-diagnosis" disabled/);
});

test('diagnóstico mostra relatório, data e status próprios, escapa conteúdo e não confunde estratégia genérica',()=>{
 const state=base();state.jobs=[{...report('generic',10),payload:{agent:'strategy'},output:{summary:'Não é diagnóstico'}},report()];
 const html=companyDiagnosisCard(state,options);assert.match(html,/Diagnóstico salvo · data 2/);assert.match(html,/Última solicitação · data 1/);assert.match(html,/Concluído/);assert.match(html,/Proposta de valor/);assert.match(html,/Qual é o foco/);assert.doesNotMatch(html,/Não é diagnóstico|<script>/);assert.match(html,/&lt;script&gt;/);assert.match(html,/Após alterar o cadastro/);
});

test('diagnóstico em andamento conserva relatório anterior e resultado incerto não incentiva nova cobrança',()=>{
 const state=base();state.jobs=[report(),{...report('latest',9),state:'working',output:{}}];
 let html=companyDiagnosisCard(state,options);assert.match(html,/Analisando/);assert.match(html,/Diagnóstico salvo · data 2/);assert.match(html,/Análise em andamento/);assert.match(html,/data-action="company-diagnosis" disabled/);
 state.jobs[1].state='uncertain';state.jobs[1].error='Confira <arquivo>';html=companyDiagnosisCard(state,options);assert.match(html,/Precisa de conferência/);assert.match(html,/Confira &lt;arquivo&gt;/);assert.match(html,/data-action="company-diagnosis" disabled/);
});

test('diagnóstico reutiliza fila, perfil salvo, idempotência, limites e medição sem produzir mídia ou alterar fatos',async t=>{
 let calls=0,lastInput;
 const providers=createProviders(async(_url,opts)=>{
  calls++;const body=JSON.parse(opts.body);lastInput=JSON.parse(body.input);
  return Response.json({id:'resp_diagnosis_'+calls,model:'test-model',status:'completed',usage:{input_tokens:30,output_tokens:20,total_tokens:50},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({summary:'Diagnóstico do cadastro.',recommendations:['Validar posicionamento.'],questions:['Qual oferta priorizar?'],pieces:[{title:'Peça não solicitada',caption:'Não deve ser criada',visualPrompt:'Não deve virar imagem',format:'image',channel:'instagram'}]})}]}]},{headers:{'x-request-id':'req_diagnosis_'+calls}});
 });
 const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'helpu-diagnosis-'));
 const server=await createHelpuServer({dataDir,portalOptions:{startScheduler:false,openaiEnv:{OPENAI_API_KEY:'test-only-key'},providers}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(async()=>{await server.portal.shutdown();await new Promise(r=>server.close(r));});
 const origin='http://127.0.0.1:'+server.address().port;let cookie='',org;
 const request=async(route,method='GET',data,session=cookie)=>{const r=await fetch(origin+route,{method,headers:{Origin:origin,Cookie:session,'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)});if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return {status:r.status,body:await r.json()};};
 const api=(tail,method='GET',data)=>request('/api/portal/'+org+'/'+tail,method,data);
 assert.equal((await request('/api/auth/signup','POST',{name:'Teste',email:'diagnosis@example.test',password:'test-only-password',company:'Empresa real'})).status,201);
 org=(await request('/api/portal/bootstrap')).body.companies[0].id;
 const profile={description:'Serviço real da empresa',audience:'Empresas locais',positioning:'Fato informado pelo cliente'};
 assert.equal((await api('company','PATCH',{profile,policy:{autoMedia:true,dailyRuns:1}})).status,200);
 await server.portal.tick();assert.equal(calls,0);assert.equal((await api('state')).body.jobs.length,0);
 const payload={kind:'agent',payload:{agent:'creative',purpose:'company_diagnosis',brief:COMPANY_DIAGNOSIS_BRIEF,leadId:'not-allowed',autoReply:true},idempotencyKey:'diagnosis-fixture-1'};
 assert.equal((await request('/api/portal/'+org+'/jobs','POST',payload,'')).status,401);
 assert.equal((await api('jobs','POST',{...payload,payload:{...payload.payload,brief:{invalid:true}}})).status,400);
 const first=await api('jobs','POST',payload);assert.equal(first.status,201,JSON.stringify(first.body));
 const duplicate=await api('jobs','POST',payload);assert.equal(duplicate.body.id,first.body.id);
 await server.portal.tick();const state=(await api('state')).body,job=state.jobs.find(j=>j.id===first.body.id);
 assert.equal(job.state,'succeeded',JSON.stringify(job));assert.equal(calls,1);assert.equal(job.payload.agent,'strategy');assert.equal(job.payload.autoReply,undefined);assert.equal(job.payload.leadId,undefined);
 assert.equal(lastInput.company.description,profile.description);assert.equal(lastInput.company.positioning,profile.positioning);
 assert.equal(job.output.summary,'Diagnóstico do cadastro.');assert.deepEqual(job.output.pieces,[]);assert.deepEqual(job.output.recordIds,[]);assert.equal(state.records.content.length,0);assert.equal(state.jobs.filter(j=>['image','video'].includes(j.kind)).length,0);assert.equal(state.company.profile.positioning,profile.positioning);
 const measured=await server.database.prepare("SELECT data FROM records WHERE org_id=? AND kind='provider_usage'").all(org);assert.equal(measured.length,1);assert.equal(JSON.parse(measured[0].data).tokens.total,50);
 const second=await api('jobs','POST',{...payload,idempotencyKey:'diagnosis-fixture-2'});assert.equal(second.status,201);await server.portal.tick();const blocked=(await api('state')).body.jobs.find(j=>j.id===second.body.id);assert.equal(blocked.state,'blocked');assert.equal(calls,1);
});
