import test from 'node:test';
import assert from 'node:assert/strict';
import {connectionFields,instagramSetupContent,autonomySummary,panelToolsStatus} from '../dist/assets/connection-ui.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

test('configuração técnica não revela tokens salvos e orienta o ID profissional',()=>{
 const html=connectionFields({id:'instagram',configured:true,values:{accessToken:'must-not-render',accountId:'1784140000001'},fields:[['accessToken','Token',true],['accountId','ID',false],['appSecret','Segredo',true]]},esc);
 assert.doesNotMatch(html,/must-not-render/);assert.match(html,/autocomplete="new-password"/);assert.match(html,/inputmode="numeric"/);assert.match(html,/não seu e-mail/);assert.match(html,/Opções técnicas adicionais/);
 const escaped=connectionFields({id:'google',values:{accountId:'"><script>'},fields:[['accountId','ID',false]]},esc);assert.doesNotMatch(escaped,/<script>/);
});
test('o fluxo comum do Instagram explica a preparação sem encaminhar o cliente ao formulário de token',()=>{
 const html=instagramSetupContent({redirectUri:'https://www.helpumkt.com/api/connect/instagram/callback',missing:['HELPU_INSTAGRAM_APP_ID']},esc);
 assert.match(html,/www.helpumkt.com/);assert.match(html,/HELPU_INSTAGRAM_APP_ID/);assert.doesNotMatch(html,/configure-integration/);
});
test('autonomia distingue autorização da criação, rotina, publicação e ferramentas pendentes',()=>{
 const state={company:{policy:{enabled:true,autoMedia:true,allowPublishing:true,autoReply:false}},integrations:[{id:'openai',configured:true}],worker:{running:false}};
 let html=autonomySummary(state,esc);assert.match(html,/não há execução recente confirmada/);assert.match(html,/publica manualmente/);assert.match(html,/não precisa aprovar a geração novamente/);assert.match(html,/ativar o serviço de vídeo/);
 state.worker.running=true;html=autonomySummary(state,esc);assert.match(html,/preparar conteúdos e gerar imagens/);
 assert.match(panelToolsStatus(true),/Falta ativar o serviço de vídeo online/);
 assert.match(panelToolsStatus(true,{available:true,video:true}),/serviço de vídeo está acessível/);
 assert.match(panelToolsStatus(true,{available:true}),/href="#\/video"/);
});
