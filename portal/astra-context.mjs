// Only operational facts cross the model boundary; connector credentials never do.
export function astraContext({company, integrations = [], worker = {}, cloud = false}) {
  return {
    now: new Date().toISOString(),
    timeZone: company.policy?.timeZone || 'America/Sao_Paulo',
    policy: company.policy || {},
    environment: cloud ? 'cloud' : 'local',
    worker,
    connections: integrations.map(c => ({
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
      videoEditing: false,
      videoEditingReason: 'O Astra Vídeo local ainda não está conectado ao Helpu. Não há ferramenta de corte, legendagem ou exportação desse editor neste ambiente.',
      videoGeneration: 'Depende da integração de geração, dos limites e das permissões da empresa.',
      publishing: 'Depende de conteúdo aprovado, conta validada e permissões da empresa.'
    }
  };
}
