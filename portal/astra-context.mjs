// Only operational facts cross the model boundary; connector credentials never do.
export function astraContext({company, integrations = [], worker = {}, cloud = false}) {
  return {
    now: new Date().toISOString(),
    timeZone: company.policy?.timeZone || 'America/Sao_Paulo',
    policy: company.policy || {},
    environment: cloud ? 'cloud' : 'local',
    worker,
    connections: integrations.filter(c=>c.id!=='higgsfield').map(c => ({
      id: c.id,
      configured: !!c.configured,
      verifiedAt: c.verifiedAt || null,
      validation: c.validation?.status || 'not_validated',
      model: c.id === 'openai' ? c.values?.agentModel || 'gpt-6-astra' : undefined
    })),
    capabilities: {
      drafts: true,
      scheduling: true,
      browser: !cloud,
      imageGeneration: {provider:'openai',model:'gpt-image-2.5-sunburst',configured:!!integrations.find(c=>c.id==='openai')?.configured,tool:'queue_action',kind:'image',requires:'contentId de um rascunho com visualPrompt. Gera o arquivo, salva na Biblioteca e devolve na conversa. Respeita os limites e a autorização de criação da empresa. Conexão do Instagram só é necessária para publicar.'},
      videoEditing: false,
      videoEditingReason: 'O Astra Vídeo local ainda não está conectado ao Helpu. Não há ferramenta de corte, legendagem ou exportação desse editor neste ambiente.',
      videoGeneration: 'Depende da integração de geração, dos limites e das permissões da empresa.',
      publishing: 'Depende de conteúdo aprovado, conta validada e permissões da empresa.'
    }
  };
}
