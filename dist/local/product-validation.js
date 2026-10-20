export function productErrors(d) {
  const errors = {};
  if (!d.title?.trim() || d.title.trim().length < 3) errors.title = 'Informe um título com pelo menos 3 caracteres.';
  const price = Number(d.price);
  if (!String(d.price ?? '').trim() || !Number.isFinite(price) || price < 0.01 || price > 1000000 || Math.abs(price * 100 - Math.round(price * 100)) > 0.000001) errors.price = 'Informe um preço entre R$ 0,01 e R$ 1.000.000, com no máximo 2 casas decimais.';
  if (!d.city?.trim() || d.city.trim().length < 2) errors.city = 'Informe a cidade ou região com pelo menos 2 caracteres.';
  if (!d.description?.trim() || d.description.trim().length < 20) errors.description = 'Descreva o produto com pelo menos 20 caracteres.';
  if (!/^(?:55)?\d{10,11}$/.test(String(d.phone || '').replace(/\D/g, ''))) errors.phone = 'Informe o WhatsApp com DDD, por exemplo: (54) 99999-9999.';
  return errors;
}

export function photoError(files, existing = 0) {
  if (files.length && existing >= 6) return 'Você já adicionou 6 fotos. Remova uma antes de escolher outra.';
  if (files.length + existing > 6) return `Você pode usar até 6 fotos por anúncio. Já há ${existing}; selecione no máximo ${6 - existing} agora.`;
  for (const file of files) {
    if (file.size > 3 * 1024 * 1024) return `A foto “${file.name}” ultrapassa 3 MB. Reduza o tamanho e tente novamente.`;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return `A foto “${file.name}” tem formato não aceito. Use JPG, PNG ou WebP.`;
  }
  return '';
}
