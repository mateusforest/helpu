export const normalizeProductSearch = value => String(value ?? '').normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim().replace(/\s+/g, ' ');

export function matchesProductSearch(product, query) {
  const words = normalizeProductSearch(query).split(' ').filter(Boolean);
  const content = normalizeProductSearch([product.title, product.description, product.city].join(' '));
  return words.every(word => content.includes(word));
}
