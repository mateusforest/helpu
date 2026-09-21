import {VIDEO_RECIPES} from './video-recipes.mjs';

// Resolve a recipe locally; this does not consume another model call.
export function videoRecipeFor(prompt='') {
 const text=prompt.toLocaleLowerCase('pt-BR');
 if(/constru[çc][aã]o|evolu[çc][aã]o.*(?:obra|escrit[oó]rio)|obra|cont[eê]iner/.test(text))return 'construction';
 if(/antes\s+e\s+depois/.test(text))return 'before-after';
 if(/lan[çc]amento|teaser/.test(text))return 'teaser';
 if(/restaurante|gastronom|prato|comida|pizza|bebida/.test(text))return 'gastronomy';
 if(/im[oó]vel|imobili|arquitet|ambiente|apartamento/.test(text))return 'architecture';
 if(/palavras|tipografia|cortes r[aá]pidos|din[aâ]mico/.test(text))return 'kinetic';
 return 'editorial';
}

export function videoSceneCount(request) {
 if(request.styleRecipe?.length)return Math.max(request.requiredSourceAssetIds?.length||0,request.styleRecipe.length);
 // Spoken footage and explicit recipes preserve their timing. New automatic
 // compositions get enough shots to develop an idea without a long slideshow.
 return Math.max(request.requiredSourceAssetIds?.length||0,request.editingVersion===2?(request.duration===30?8:5):(request.duration===30?6:3));
}

export function recipeTiming(preset) {
 return VIDEO_RECIPES.find(r=>r.id===preset)?.shares.map(share=>({share,position:VIDEO_RECIPES.find(r=>r.id===preset).position||'center'}))||null;
}

export const VIDEO_EDITING_RULES=`Faça direção de edição, não apenas uma sequência de fotos. Dê função a cada cena: abertura, desenvolvimento e desfecho. Analise as amostras para ordenar estágios de obra e antes/depois; a ordem de upload não comprova cronologia. Não invente etapas ausentes. Evite repetir a mesma foto quando existirem materiais diferentes adequados. Use frases curtas de 2 a 7 palavras; algumas cenas podem ter texto vazio. Não repita a mesma frase para preencher a duração. Texto deve ter contraste, respiro e tamanho legível no celular. Evite tomar o enquadramento com frases longas. Com material vertical ou horizontal incompatível, prefira fit blur para preservar a imagem com fundo desfocado; use cover quando o recorte preservar o assunto, e contain somente para fundo plano intencional. Não crie margens brancas por padrão. Use transições e ritmo para ligar cenas, sem prometer montagem em mosaico, tracking, 3D ou máscaras de pessoas. Não acrescente assinatura, slogan, logotipo, CTA de outra marca ou nome da empresa automaticamente: só inclua identidade textual quando solicitada no briefing, e nunca extraia a identidade de uma referência de inspiração. Os dados da empresa ativa orientam o trabalho; se o material for sobre outro negócio, não force a assinatura da empresa ativa.`;

export function reviewVideoPlan(slides,request,refs=[]) {
 const issues=[];
 const textKey=t=>String(t||'').toLocaleLowerCase('pt-BR').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
 const seen=new Set();
 for(const scene of slides){
  const key=textKey(scene.text);
  if(key&&seen.has(key))issues.push('Há texto repetido. Cada cena deve acrescentar informação; use texto vazio onde não houver nova frase.');
  if(key)seen.add(key);
  if(key.split(' ').length>14)issues.push('Um título está longo demais para leitura no celular. Reduza para uma frase curta.');
  const company=textKey(request.activeCompanyName);
  if(company&&key.startsWith(company+' ')&&/[—–|:]/.test(scene.text||'')&&!/(?:assinatura|slogan|nome da empresa|nome da marca)/i.test(request.prompt||''))issues.push('Remova a assinatura automática da empresa. O pedido não solicitou slogan nem assinatura; preserve o assunto dos materiais.');
 }
 const sources=refs.filter(a=>(a.mime?.startsWith('image/')||a.mime==='video/mp4')&&!request.referenceOnlyIds?.includes(a.id)&&a.id!==request.videoOptions?.musicAssetId);
 if(sources.length&&slides.every(s=>!s.sourceAssetId))issues.push('O plano não utiliza os materiais visuais enviados.');
 return [...new Set(issues)];
}
