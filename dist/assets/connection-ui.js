const fieldHints = {
  instagram: {accountId:'Somente números. É o ID da conta profissional na Meta, não seu e-mail nem o @ do Instagram.'},
  whatsapp: {phoneNumberId:'ID numérico fornecido pela Meta. Não é o número de telefone com DDD.'},
  metaAds: {adAccountId:'ID da conta de anúncios na Meta: números, com ou sem o prefixo act_.'},
  google: {accountId:'Identificador da conta do Perfil da Empresa, não o e-mail de login.',locationId:'Identificador do local no Perfil da Empresa.',clientId:'Identificador do aplicativo OAuth no Google Cloud.'}
};

export function connectionFields(c, esc) {
  const primary = c.id==='openai'?['apiKey']:c.id==='google'?['accessToken','accountId','locationId']:['accessToken','accountId','phoneNumberId','adAccountId'];
  const render=([name,label,secret])=>{
    const numeric=(c.id==='instagram'&&name==='accountId')||(c.id==='whatsapp'&&name==='phoneNumberId');
    const hint=fieldHints[c.id]?.[name]||(name==='accessToken'?'Credencial emitida pelo serviço. Este campo não recebe sua senha de login.':'');
    const value=secret?'':c.values?.[name]||'';
    return `<label class="p-field" for="connection-${esc(name)}"><span>${esc(label)}</span><input id="connection-${esc(name)}" name="${esc(name)}" type="${secret?'password':'text'}" value="${esc(value)}" autocomplete="${secret?'new-password':'off'}" autocapitalize="none" spellcheck="false" data-1p-ignore data-lpignore="true" maxlength="10000" ${numeric?'inputmode="numeric" pattern="[0-9]*"':''} ${c.id==='metaAds'&&name==='adAccountId'?'pattern="(act_)?[0-9]*"':''} ${secret&&c.configured?'placeholder="Já salvo. Preencha apenas para substituir."':''}>${hint?`<small>${esc(hint)}</small>`:''}</label>`;
  };
  const main=c.fields.filter(([name])=>primary.includes(name)),advanced=c.fields.filter(([name])=>!primary.includes(name));
  return main.map(render).join('')+(advanced.length?`<details class="wide connection-technical"><summary>Opções técnicas adicionais</summary><div class="form-grid">${advanced.map(render).join('')}</div></details>`:'');
}

export function instagramSetupContent(login={},esc) {
  const missing=login.missing||[];
  return `<div class="account-section"><p>O cliente conecta a conta com <strong>Entrar com Instagram</strong>. Antes disso, quem administra a Helpu precisa configurar o aplicativo da Meta uma vez.</p><ol><li>Crie o aplicativo com Instagram Login e associe a conta profissional.</li><li>Cadastre o endereço de retorno mostrado abaixo.</li><li>Configure as credenciais do aplicativo na hospedagem e faça um novo deploy.</li></ol>${login.redirectUri?`<p>Endereço de retorno:</p><code class="connection-callback">${esc(login.redirectUri)}</code>`:'<p>Falta configurar o endereço público da Helpu na hospedagem para definir o retorno.</p>'}${missing.length?`<details class="connection-technical"><summary>O que falta na hospedagem</summary><ul>${missing.map(name=>`<li><code>${esc(name)}</code></li>`).join('')}</ul></details>`:''}<p>O login acontece na página oficial do Instagram. A Helpu recebe a autorização; o cliente não precisa preencher tokens, IDs ou a senha neste painel.</p><a class="p-button secondary" href="https://developers.facebook.com/apps/" target="_blank" rel="noopener">Abrir painel de aplicativos da Meta ↗</a></div>`;
}

export function autonomySummary(state,esc) {
  const p=state.company.policy,connected=state.integrations.some(c=>c.id==='openai'&&c.configured);
  const routine=!p.enabled?'Rotina diária desativada.':!connected?'Rotina habilitada; falta conectar o Astra.':!state.worker?.running?'Rotina habilitada; não há execução recente confirmada do serviço.':p.autoMedia?'Rotina habilitada para preparar conteúdos e gerar imagens.':'Rotina habilitada para preparar textos e briefings. A geração automática de imagens está desativada.';
  return `<section class="panel autonomy-summary"><h2>O que o Astra pode fazer sozinho</h2><dl><div><dt>Criar pelo chat</dt><dd>Em Conversar e executar, seu pedido autoriza criar textos, imagens e exportar vídeos. Você não precisa aprovar a geração novamente. Limites, materiais exigidos e proibições continuam valendo.</dd></div><div><dt>Criar sem abrir uma conversa</dt><dd>${esc(routine)}</dd></div><div><dt>Publicar</dt><dd>Você publica manualmente. A Helpu prepara o material e a legenda.</dd></div><div><dt>Receber no WhatsApp</dt><dd>Ative o vínculo na conversa para receber respostas e arquivos. Lembretes proativos ainda não estão disponíveis.</dd></div><div><dt>Editar vídeos</dt><dd>${state.runtime?.available&&state.runtime?.video?'O Astra Vídeo online pode criar cenas com texto, cortar MP4 e exportar. Abra Biblioteca → Astra Vídeo ou peça na conversa.':'O editor online está preparado. Falta ativar o serviço de vídeo na hospedagem.'}</dd></div></dl></section>`;
}

export function panelToolsStatus(cloud,runtime={}) {
 return `<section class="panel autonomy-summary"><h2>Astra Vídeo</h2><p>${runtime.available&&runtime.video?'O serviço de vídeo está acessível para editar cenas e exportar MP4.':'Falta ativar o serviço de vídeo online para exportar MP4. A administração configura esse serviço uma vez.'}</p><a class="p-button secondary" href="#/video">Abrir Astra Vídeo ↗</a></section>`;
}
