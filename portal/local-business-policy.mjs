// Compatibility is applied on read, preserving existing accounts and their IDs.
export function localBusiness(value) {
  if (!value) return value;
  return {...value, sellerType:value.sellerType || 'Loja',
    productsOnly:value.sellerType === 'Pessoa física',
    state:['Novo cadastro','Em contato','Em preparação'].includes(value.state) ? 'Rascunho' : value.state};
}
export const businessStates = ['Rascunho','Em análise','Publicado','Pausado','Rejeitado','Inativo'];
