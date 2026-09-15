// Checks only fields supplied by this edit. Connection verification still belongs
// to the provider; a syntactically valid ID or token does not prove authentication.
const idFields = {
  instagram: {
    accountId: [/^\d+$/, 'Informe o ID numérico da conta profissional do Instagram. Este campo não aceita e-mail, @usuário ou endereço do perfil.']
  },
  whatsapp: {
    phoneNumberId: [/^\d+$/, 'Informe o ID numérico do número no WhatsApp Business, fornecido pela Meta. Não use o telefone com DDD, e-mail ou nome de usuário.']
  },
  metaAds: {
    adAccountId: [/^(?:act_)?\d+$/, 'Informe o ID numérico da conta de anúncios, com ou sem act_. Este campo não aceita e-mail ou nome de usuário.']
  },
  google: {
    // The executors already add accounts/ and locations/. Keep IDs opaque;
    // Google documents resource identifiers as strings, not fixed-size numbers.
    accountId: [/^[A-Za-z0-9_-]+$/, 'Informe somente o ID da conta do Perfil da Empresa no Google, sem accounts/. Não use o e-mail ou nome da conta.'],
    locationId: [/^[A-Za-z0-9_-]+$/, 'Informe somente o ID do local no Perfil da Empresa no Google, sem locations/. Não use e-mail, nome ou endereço do estabelecimento.'],
    clientId: [/^[A-Za-z0-9._-]+$/, 'Informe o Client ID do aplicativo OAuth do Google. Este campo não aceita o e-mail da conta ou uma URL.']
  }
};

const tokenFields = {
  instagram: ['accessToken'],
  whatsapp: ['accessToken'],
  metaAds: ['accessToken'],
  google: ['accessToken', 'refreshToken']
};

const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

/** Validate an incoming partial integration update, before merging saved secrets.
 * Returns field names and fixed Portuguese messages, never submitted values.
 * Empty strings remain allowed: the caller preserves empty secret fields and
 * may deliberately clear a non-secret field while preparing a connection.
 */
export function validateConnectionPatch(provider, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    return {ok: false, errors: [{field: '', message: 'Envie os campos da conexão em um objeto.'}]};
  }
  const errors = [];
  for (const [field, [pattern, message]] of Object.entries(own(idFields, provider) ? idFields[provider] : {})) {
    if (!own(patch, field) || patch[field] === undefined || patch[field] === '') continue;
    if (typeof patch[field] !== 'string') {
      errors.push({field, message});
      continue;
    }
    const value = patch[field].trim();
    if (value && !pattern.test(value)) errors.push({field, message});
  }
  for (const field of own(tokenFields, provider) ? tokenFields[provider] : []) {
    if (!own(patch, field) || patch[field] === undefined || patch[field] === '') continue;
    const message = field === 'refreshToken'
      ? 'Informe o token de renovação OAuth fornecido pelo Google. Ele não é a senha da conta. Deixe em branco para manter o token já salvo.'
      : 'Informe o token de acesso fornecido pelo serviço. Ele não é a senha da conta. Cole somente o token, sem e-mail, URL ou a palavra Bearer; deixe em branco para manter o token já salvo.';
    if (typeof patch[field] !== 'string') {
      errors.push({field, message});
      continue;
    }
    const value = patch[field].trim();
    // Opaque tokens have no assumed length or vendor prefix. These checks catch
    // obvious pasted login fields/headers, not every possible password mistake.
    if (!value || /\s|[\u0000-\u001f\u007f]/u.test(value) || /^https?:\/\//i.test(value) || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value) || /^[*•●]+$/u.test(value)) {
      errors.push({field, message});
    }
  }
  return {ok: errors.length === 0, errors};
}
