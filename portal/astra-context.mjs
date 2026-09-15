// Only operational facts cross the model boundary; connector credentials never do.
export function astraContext({company, integrations = [], worker = {}, cloud = false, runtime = {}}) {
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
      browser: !cloud||!!(runtime.available&&runtime.browser),
      imageGeneration: {provider:'openai',model:'gpt-image-2.5-sunburst',configured:!!integrations.find(c=>c.id==='openai')?.configured,tool:'queue_action',kind:'image',requires:'contentId de um rascunho com visualPrompt. Gera o arquivo, salva na Biblioteca e devolve na conversa. Respeita os limites e a autorização de criação da empresa. Conexão do Instagram só é necessária para publicar.'},
      videoEditing: !!(runtime.available&&runtime.video),
      videoEditingReason: runtime.available&&runtime.video?'Astra Vídeo online: use video_projects, video_project e video_export para montar cenas com texto/fundo ou cortar MP4 da Biblioteca. Não gera filmagens por IA, avatar, locução ou música. O MP4 verificado volta à conversa e à Biblioteca.':'O serviço online do Astra Vídeo ainda precisa estar configurado e acessível.',
      videoGeneration: runtime.available&&runtime.video?'Cenas com texto e edição de MP4 disponíveis; geração de filmagens por IA não conectada.':'Serviço de vídeo online indisponível.',
      publishing: 'Depende de conteúdo aprovado, conta validada e permissões da empresa.'
    }
  };
}
