// Only operational facts cross the model boundary; connector credentials never do.
export function astraContext({company, integrations = [], worker = {}, cloud = false, runtime = {}, creations}) {
  const direct = creations !== undefined;
  const videoReady = direct ? !!creations.reels : !!(runtime.available && runtime.video);
  const videoReason = direct
    ? videoReady ? 'Use create_media com format reels e duration 15 ou 30. O gerador integrado cria e entrega MP4 com texto, imagens e cortes de referências. Não depende do editor ou de hospedagem de vídeo externa.' : creations.reelsReason || 'A chave de criação precisa ser configurada pela administração.'
    : videoReady ? 'Astra Vídeo online: use video_projects, video_project e video_export para montar cenas com texto/fundo ou cortar MP4 da Biblioteca.' : 'O serviço online do Astra Vídeo ainda precisa estar configurado e acessível.';
  return {
    now: new Date().toISOString(),
    timeZone: company.policy?.timeZone || 'America/Sao_Paulo',
    policy: company.policy || {},
    environment: cloud ? 'cloud' : 'local',
    worker,
    connections: integrations.filter(c=>c.id==='openai').map(c => ({
      id: c.id,
      configured: !!c.configured,
      verifiedAt: c.verifiedAt || null,
      validation: c.validation?.status || 'not_validated',
      model: c.id === 'openai' ? c.values?.agentModel || 'gpt-6-astra' : undefined
    })),
    capabilities: {
      drafts: true,
      scheduling: false,
      editorialPlanning: true,
      delivery: 'WhatsApp oficial da Helpu, quando vinculado pelo usuário. A publicação é manual. Lembretes proativos ainda não estão disponíveis.',
      browser: false,
      imageGeneration: {provider:'openai',model:'gpt-image-2.5-sunburst',configured:direct?!!creations.images:!!integrations.find(c=>c.id==='openai')?.configured,tool:direct?'create_media':'queue_action',kind:'image',requires:direct?'Use prompt e format feed, story ou carousel. Não crie um rascunho separado. Os arquivos voltam à conversa e à Biblioteca.':'contentId de um rascunho com visualPrompt. Gera o arquivo, salva na Biblioteca e devolve na conversa.'},
      videoEditing: videoReady,
      videoOptions: direct?{presets:creations.videoPresets,recipes:creations.videoRecipes,formats:creations.formats,qualities:creations.qualities,techniques:creations.techniques}:undefined,
      creativeReview: direct?'Use creation_library para consultar prévias e estilos. creation_review aprova, pede ajuste versionado ou salva estilo quando o cliente solicitar. Arquivos chegam como prévia; aprovação editorial nunca publica. Reutilize styleId e materiais novos quando o cliente pedir o mesmo estilo.':undefined,
      videoEditingReason: videoReason,
      videoGeneration: videoReady?'Cenas com texto, imagens e edição de MP4 disponíveis; sem geração de filmagens, avatar, locução ou música por IA.':videoReason,
      publishing: false
    }
  };
}
