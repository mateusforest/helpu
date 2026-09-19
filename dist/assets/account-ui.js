import {createBillingUI} from './billing-ui.js';
export function createAccountUI({api,esc,getState,onUser,toast}){
 let tab='plan',account=null,billing=null,active=false,sequence=0,accountOrg=null;
 const billingUI=createBillingUI({esc,getState});
 const tabs=[['plan','Plano'],['configuration','Configurações'],['security','Segurança'],['billing','Faturamento']];
 const status='<p class="form-error" role="alert" hidden></p>';
 function body(){
  if(!account)return '<p class="account-loading">Carregando sua conta…</p>';
  if(tab==='plan')return billingUI.plan(billing);
  if(tab==='configuration')return `<div class="account-section"><span class="account-kicker">CONFIGURAÇÕES</span><h2>Como você aparece no Helpu</h2><form id="account-profile-form"><label class="p-field"><span>Seu nome</span><input name="name" value="${esc(account.user.name)}" required minlength="2" maxlength="100" autocomplete="name"></label><label class="p-field"><span>E-mail de acesso</span><input value="${esc(account.user.email)}" readonly type="email" aria-describedby="account-email-note"></label><p id="account-email-note" class="micro-copy">A alteração de e-mail ainda não está disponível.</p>${status}<button class="p-button primary" type="submit">Salvar alterações</button></form></div>`;
  if(tab==='security')return `<div class="account-section"><span class="account-kicker">SEGURANÇA</span><h2>Proteja seu acesso</h2><form id="account-password-form"><label class="p-field"><span>Senha atual</span><input name="currentPassword" type="password" required minlength="10" maxlength="128" autocomplete="current-password"></label><label class="p-field"><span>Nova senha</span><input name="newPassword" type="password" required minlength="10" maxlength="128" autocomplete="new-password"></label><label class="p-field"><span>Confirme a nova senha</span><input name="confirmation" type="password" required minlength="10" maxlength="128" autocomplete="new-password"></label><p class="micro-copy">Use de 10 a 128 caracteres. Ao trocar a senha, as outras sessões serão encerradas.</p>${status}<button class="p-button primary" type="submit">Alterar senha</button></form><div class="account-sessions"><h3>Sessões abertas</h3><p>${account.security.activeSessions} sessão(ões) com acesso à sua conta, incluindo esta.</p><button class="p-button secondary" data-account-action="revoke" ${account.security.activeSessions<2?'disabled':''}>Sair dos outros dispositivos</button><p class="micro-copy">A autenticação em duas etapas ainda não está disponível no Helpu.</p></div></div>`;
  return billingUI.invoices(billing);
 }
 function page(){if(accountOrg!==getState()?.company.id){billing=null;accountOrg=getState()?.company.id;}return `<section class="account-workspace"><div class="page-heading"><div><p class="overline">MINHA CONTA</p><h1>Seu acesso, do seu jeito.</h1><p>Plano, preferências e segurança em um só lugar.</p></div></div><div class="account-layout"><nav class="account-tabs" aria-label="Opções da conta">${tabs.map(([id,name])=>`<button data-account-tab="${id}" ${tab===id?'aria-current="page"':''}>${name}</button>`).join('')}<button id="portal-logout" class="account-signout">Sair da conta ↗</button></nav><div id="account-panel">${body()}</div></div></section>`;}
 function paint(){const panel=document.querySelector('#account-panel');if(!active||!panel)return;panel.innerHTML=body();document.querySelectorAll('[data-account-tab]').forEach(b=>{if(b.dataset.accountTab===tab)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});bind();}
 async function load(){const ticket=++sequence,org=getState()?.company.id;try{const [value,b]=await Promise.all([api('/api/account'),api('/api/portal/'+org+'/billing').catch(e=>({status:'error',message:e.message}))]);if(ticket!==sequence||org!==getState()?.company.id)return;account=value;billing=b;paint();}catch(e){toast(e.message,true);if(active&&!account){const panel=document.querySelector('#account-panel');if(panel)panel.innerHTML='<p class="account-loading">Não foi possível carregar sua conta.</p><button class="p-button secondary" data-account-action="refresh">Tentar novamente</button>';}}}
 async function submit(form,url,input){const button=form.querySelector('button[type=submit]'),error=form.querySelector('.form-error');button.disabled=true;error.hidden=true;try{const value=await api(url,'POST',input);if(value.user)onUser(value.user);toast(url.endsWith('password')?'Senha alterada. As outras sessões foram encerradas.':'Alterações salvas.');await load();}catch(e){error.textContent=e.message;error.hidden=false;}finally{button.disabled=false;}}
 function bind(){
  document.querySelector('#account-profile-form')?.addEventListener('submit',e=>{e.preventDefault();submit(e.currentTarget,'/api/account/profile',{name:e.currentTarget.elements.name.value});});
  document.querySelector('#account-password-form')?.addEventListener('submit',e=>{e.preventDefault();const f=e.currentTarget;if(f.elements.newPassword.value!==f.elements.confirmation.value){const error=f.querySelector('.form-error');error.textContent='As novas senhas precisam ser iguais.';error.hidden=false;return;}submit(f,'/api/account/password',{currentPassword:f.elements.currentPassword.value,newPassword:f.elements.newPassword.value});});
 }
 document.addEventListener('click',async e=>{
  const t=e.target.closest('[data-account-tab]');if(t){tab=t.dataset.accountTab;paint();}
  const b=e.target.closest('[data-account-action]');if(!b||!active)return;
  const action=b.dataset.accountAction,org=getState()?.company.id;b.disabled=true;
  try{
   if(action==='refresh')await load();
   if(action==='revoke'){await api('/api/account/sessions/revoke','POST',{});toast('As outras sessões foram encerradas.');await load();}
   if(['checkout','portal'].includes(action)){const result=await api('/api/portal/'+org+'/billing/'+action,'POST',b.dataset.offerId?{offerId:b.dataset.offerId}:{});if(org===getState()?.company.id&&active)location.assign(result.url);}
  }catch(e){toast(e.message,true);}finally{b.disabled=false;}
 });
 return {page,mount(view){active=view==='account';if(!active){sequence++;return;}bind();load();}};
}
