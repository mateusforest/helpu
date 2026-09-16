// Server-only defaults. Never persist the resolved environment secret in a tenant record.
export function resolveOpenAIConfig(saved = {}, env = process.env) {
  if (saved.environmentDisabled) return {};
  const value = key => typeof env[key] === 'string' ? env[key].trim() : '';
  return {
    ...saved,
    apiKey: saved.apiKey || value('OPENAI_API_KEY'),
    agentModel: saved.agentModel || value('OPENAI_MODEL') || 'gpt-6-astra',
    model: saved.model || value('OPENAI_TASK_MODEL') || 'gpt-5-mini'
  };
}
