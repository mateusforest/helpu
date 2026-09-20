export const AI_TASKS={conversation:'Conversa e briefing',post:'Legenda e proposta de postagem',creation_plan:'Roteiro e planejamento de mídia',contextual_review:'Revisão criativa',agent:'Tarefas estruturadas'};
export const ROUTE_MODELS=['gpt-5.6-sol','gpt-6-astra'];
// Existing tenant/environment choices remain the baseline until an operator
// explicitly activates a tested route. Transport failures never cause escalation.
export function aiModel(config,task){
 const selected=config.aiRouting?.routes?.[task];
 return ROUTE_MODELS.includes(selected)?selected:task==='agent'?(config.model||'gpt-5-mini'):(config.agentModel||'gpt-6-astra');
}
export function aiRequest(config,task){return {model:aiModel(config,task),service_tier:'default'};}
