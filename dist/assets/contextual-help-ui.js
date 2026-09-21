import {HELP_TOPICS, helpTopicFor} from './help-content.js';

export function helpBody(key, esc) {
  const t = HELP_TOPICS[key] || HELP_TOPICS.general;
  return `<div class="context-help-body"><p>${esc(t.intro)}</p><h3>Como fazer</h3><ol>${t.steps.map(s=>`<li>${esc(s)}</li>`).join('')}</ol><h3>Exemplo</h3><blockquote>${esc(t.example)}</blockquote><h3>O que esperar</h3><p>${esc(t.result)}</p><h3>Se não funcionar</h3><ul>${t.recovery.map(s=>`<li>${esc(s)}</li>`).join('')}</ul><div class="context-help-links">${t.links.map(([label,route])=>`<a class="p-button secondary" data-help-link href="#/${esc(route)}">${esc(label)}</a>`).join('')}</div><details class="context-help-topics"><summary>Outros assuntos</summary><div>${Object.entries(HELP_TOPICS).filter(([id])=>id!==key&&id!=='general'&&(globalThis.document?.body?.dataset?.admin==='true'||!['commercial','pricing','admin','consultations-admin','agents','overview','leads','pages','presence','inbox'].includes(id))).map(([id,t])=>`<button type="button" class="quiet-button" data-help-topic="${id}">${esc(t.title)}</button>`).join('')}</div></details><p class="micro-copy">Esta ajuda não inicia tarefas nem consome IA. Feche para continuar de onde parou.</p></div>`;
}

// Help lives outside the workspace: chat polling must not erase the entry point
// or re-render the draft/form when a user opens or closes these instructions.
export function createContextualHelpUI({esc,openDialog,closeDialog}) {
  let current = 'general';
  function show(key) {
    if (!Object.hasOwn(HELP_TOPICS,key)) return;
    openDialog(HELP_TOPICS[key].title,helpBody(key,esc));
  }
  document.addEventListener('click',event=>{
    const button=event.target.closest('[data-help-topic]');
    if(button)show(button.dataset.helpTopic);
    if(event.target.closest('[data-help-link]'))closeDialog();
  });
  return {mount(view,format){
    current=helpTopicFor(view,format);
    const workspace=document.querySelector('#workspace');
    if(!workspace)return;
    let host=document.querySelector('#contextual-help');
    if(!host){workspace.insertAdjacentHTML('beforebegin','<aside id="contextual-help" aria-label="Ajuda desta tela"></aside>');host=document.querySelector('#contextual-help');}
    host.innerHTML=`<button type="button" class="quiet-button" data-help-topic="${current}" aria-haspopup="dialog"><span aria-hidden="true">?</span> Como usar esta tela</button>`;
  }};
}
