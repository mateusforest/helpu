export function createOnboardingUI({api,esc,getState,toast}) {
  let org='',value=null,loading=false,busy=false,sequence=0,selected=null;
  const steps=[
    {id:'company',title:'Apresente sua empresa',text:'Confira o nome, o setor, o que sua empresa oferece e quem você quer alcançar. Salve as informações em Minha empresa.',href:'#/company',action:'Abrir Minha empresa'},
    {id:'brand',title:'Defina sua marca',text:'Adicione seu logo e descreva cores, estilo e tom de voz. Use apenas materiais que você pode utilizar. Você poderá ajustar tudo depois.',href:'#/brand',action:'Abrir Marca'},
    {id:'create',title:'Peça sua primeira criação',text:'Escolha imagem ou Reels, descreva o objetivo e adicione suas referências. Revise o pedido antes de clicar em Criar. O guia não gera conteúdo nem consome IA.',href:'#/create/feed',action:'Criar uma imagem'},
    {id:'review',title:'Confira o resultado',text:'Abra a Biblioteca para acompanhar o processamento. Quando o arquivo estiver pronto, confira textos, marca e materiais. Você pode pedir ajustes e baixar o resultado. Revise antes de publicar.',href:'#/studio',action:'Abrir Biblioteca'},
    {id:'whatsapp',title:'Leve a conversa para o WhatsApp',text:'Esta etapa é opcional. Na tela Conversa, clique em Ativar WhatsApp, autorize a operação e envie a mensagem de confirmação pelo seu telefone. Receber boas-vindas não ativa o vínculo.',href:'#/conversation',action:'Abrir Conversa'}
  ];
  const goals={present:'Apresentar minha empresa ou produto',offer:'Divulgar uma oferta',educate:'Compartilhar uma dica'};
  function host(){
    let node=document.querySelector('#onboarding-guide');
    const workspace=document.querySelector('#workspace');
    if(!node&&workspace){workspace.insertAdjacentHTML('beforebegin','<div id="onboarding-guide"></div>');node=document.querySelector('#onboarding-guide');}
    return node;
  }
  function paint(){
    const node=host();if(!node)return;
    document.body.dataset.onboarding=value?.state==='active'?'active':'';
    if(!value){node.innerHTML='';return;}
    if(value.state!=='active'){
      node.innerHTML='<div class="onboarding-resume"><button type="button" class="quiet-button" data-guide="resume">'+(value.state==='completed'?'Rever primeiros passos':value.state==='paused'?'Retomar primeiros passos':'Conhecer os primeiros passos')+'</button></div>';return;
    }
    const pending=steps.findIndex(s=>!value.completed.includes(s.id));
    const index=selected===null?(pending<0?steps.length-1:pending):selected,step=steps[index];
    node.innerHTML='<section class="panel first-access-panel" aria-labelledby="onboarding-title"><div class="onboarding-heading"><div><p class="overline">PRIMEIROS PASSOS · '+(index+1)+' DE '+steps.length+'</p><h2 id="onboarding-title">'+esc(step.title)+'</h2></div><button type="button" class="quiet-button" data-guide="skip" '+(busy?'disabled':'')+'>Pular por enquanto</button></div><p>'+esc(step.text)+'</p>'+
      (step.id==='create'?'<label class="p-field"><span>O que você quer fazer primeiro?</span><select id="onboarding-goal"><option value="">Escolha um objetivo (opcional)</option>'+Object.entries(goals).map(([key,label])=>'<option value="'+key+'" '+(value.goal===key?'selected':'')+'>'+esc(label)+'</option>').join('')+'</select></label>':'')+
      '<div class="onboarding-actions"><a class="p-button secondary" href="'+step.href+'">'+esc(step.action)+'</a>'+(step.id==='create'?'<a class="p-button secondary" href="#/create/reels">Criar um Reels</a>':'')+
      (index>0?'<button type="button" class="quiet-button" data-guide="back" data-step="'+index+'">Voltar</button>':'')+
      '<button type="button" class="p-button primary" data-guide="next" data-step="'+index+'" '+(busy?'disabled':'')+'>'+(index===steps.length-1?'Concluir guia':'Continuar guia')+'</button></div><p class="micro-copy">Pause e retome por Primeiros passos. As criações só começam quando você enviar um pedido.</p><p class="sr-only" role="status">Etapa '+(index+1)+' de '+steps.length+'</p></section>';
  }
  async function load(){
    if(loading)return;loading=true;const company=org,ticket=++sequence;
    try{const next=await api('/api/portal/'+company+'/onboarding');if(ticket===sequence&&company===org&&company===getState()?.company.id){value=next;paint();}}
    catch(error){if(company===org)toast(error.message,true);}finally{if(ticket===sequence)loading=false;}
  }
  async function save(input){
    if(busy)return false;busy=true;const company=org;paint();
    try{const next=await api('/api/portal/'+company+'/onboarding','POST',input);if(company!==org||company!==getState()?.company.id)return false;value=next;return true;}
    catch(error){if(company===org)toast(error.message,true);return false;}finally{busy=false;paint();}
  }
  document.addEventListener('click',async event=>{
    const button=event.target.closest('[data-guide]');if(!button||busy||!org)return;
    const action=button.dataset.guide;
    if(action==='back'){selected=Math.max(0,Number(button.dataset.step)-1);paint();return;}
    if(action==='next'){
      const index=Number(button.dataset.step),company=org;
      if(await save(index===steps.length-1?{action:'finish'}:{action:'step',step:steps[index].id})){if(company===org){selected=Math.min(index+1,steps.length-1);paint();}}
    }else if(['skip','resume'].includes(action)){selected=action==='resume'&&['completed','available'].includes(value?.state)?0:null;await save({action});}
  });
  document.addEventListener('change',async event=>{
    if(event.target.id==='onboarding-goal'&&event.target.value)await save({action:'goal',goal:event.target.value});
  });
  return {mount(){
    const next=getState()?.company.id||'';
    if(next!==org){org=next;value=null;selected=null;loading=false;++sequence;paint();}
    if(org&&!value)load();else paint();
  }};
}
