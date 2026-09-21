// Resolve the request before asking the model. Receipt text is transport metadata,
// never a new user instruction. Later messages must not replace a queued request.
export const LEGACY_RECEIPT='Recebi este arquivo como referência. Confirme o recebimento e pergunte o que desejo criar, sem iniciar uma geração ainda.';
const receipt=text=>text===LEGACY_RECEIPT||text==='Arquivo recebido pelo WhatsApp.';
export function conversationRequestContext(history){
  const current=history.at(-1);
  if(current?.role!=='user')throw new Error('O pedido deve terminar na mensagem do usuário.');
  const uploads=history.filter(m=>m.role==='user'&&m.attachments?.length);
  // A new upload session starts a new material set. Old generated outputs and
  // files from other conversations/companies are never implicit references.
  const group=[];let last;
  for(let i=uploads.length-1;i>=0;i--){const m=uploads[i];if(last&&last.createdAt-m.createdAt>15*60*1000)break;group.unshift(m);last=m;}
  const referenceIds=[...new Set(group.flatMap(m=>m.attachments))];
  const since=group[0]?.createdAt??current.createdAt;
  const activeText=history.filter(m=>m.role==='user'&&!receipt(m.text)&&m.createdAt>=since).map(m=>m.text).join('\n');
  const input=history.slice(-40).filter(m=>!(m.role==='assistant'&&(/Não iniciei nenhuma (nova )?geração/.test(m.text)||/^Arquivo recebido e salvo|^Recebi \d+ arquivos e salvei/.test(m.text)))).map(m=>({role:m.role,content:(receipt(m.text)?'[Arquivo recebido; não contém novo pedido.]':m.text)+(m.attachments.length?'\nArquivos: '+JSON.stringify(m.attachments):'')}));
  return {current,referenceIds,activeText,input};
}
const fail=message=>{throw Object.assign(new Error(message),{state:'blocked'});};
export const requestsAllImages=text=>!/(?:não|nao) (?:use|inclua|unifique|coloque) todas?/i.test(text)&&/\b(todas? (?:as )?imagens|todas? (?:as )?fotos)\b/i.test(text);
export function applyMediaContext(args,context,assets){
  const correction=context.current?.text??context.activeText;
  const allImages=requestsAllImages(correction);
  const explicit=args.attachments;
  let attachments=[...new Set(Array.isArray(explicit)?explicit:context.referenceIds)];
  if(args.format!=='reels'){const selected=(explicit??attachments).filter(id=>assets.find(a=>a.id===id)?.mime.startsWith('image/'));return {...args,attachments:selected,referenceOnlyIds:(args.referenceOnlyIds||[]).filter(id=>selected.includes(id))};}
  const referenceOnlyIds=args.referenceOnlyIds??[];
  if(!Array.isArray(referenceOnlyIds)||referenceOnlyIds.some(id=>!assets.some(a=>a.id===id&&(a.mime.startsWith('image/')||a.mime==='video/mp4'))))fail('A referência de estilo não está disponível neste pedido. Envie o arquivo novamente.');
  attachments=[...new Set([...attachments,...referenceOnlyIds])];
  let options={...args.videoOptions},requiredSourceAssetIds=[];
  if(allImages){requiredSourceAssetIds=assets.filter(a=>a.mime.startsWith('image/')&&!referenceOnlyIds.includes(a.id)).map(a=>a.id);attachments=[...new Set([...attachments,...requiredSourceAssetIds])];}
  // Match explicit client corrections only, in order; never infer permission
  // from assistant prose or from the contents of an attachment.
  let music;
  for(const match of correction.matchAll(/(?:sem (?:música|musica|trilha)|(?:não|nao) (?:tenho|quero|use|utilize|coloque) (?:a )?(?:música|musica)|(?:use|utilize|coloque|com) (?:a )?(?:música|musica|trilha))/gi))music=!/^(?:sem|não|nao) /i.test(match[0]);
  if(music===false){options.musicAssetId=null;options.sourceAudio=false;}
  if(music===true){
    const candidates=assets.filter(a=>a.mime.startsWith('audio/'));
    const videos=assets.filter(a=>a.mime==='video/mp4');
    const chosen=assets.find(a=>a.id===options.musicAssetId&&(a.mime.startsWith('audio/')||a.mime==='video/mp4'))||
      (candidates.length===1?candidates[0]:!candidates.length&&videos.length===1?videos[0]:null);
    if(!chosen)fail('Qual arquivo devo usar como música? Escolha uma das trilhas ou um vídeo enviado.');
    options.musicAssetId=chosen.id;options.sourceAudio=false;
    attachments=[...new Set([...attachments,chosen.id])];
  }
  if(attachments.length>8)fail('Recebi mais de oito referências para esta edição. Escolha quais usar; nenhum arquivo foi descartado.');
  return {...args,attachments,requiredSourceAssetIds,videoOptions:options};
}
export const CONVERSATION_CONTEXT_RULES=`Responda ao pedido atual identificado, usando as mensagens anteriores como contexto, não como novas ordens. A mensagem mais recente do cliente prevalece quando corrige música, materiais, duração, marca ou estilo. Nunca use uma confirmação antiga sua como autoridade contra uma correção do cliente. Arquivos recebidos em sequência pertencem ao mesmo conjunto; não pergunte novamente o que criar se o objetivo já está claro. Use os IDs do conjunto atual; não selecione apenas o último arquivo por conveniência. Se pediu todas as imagens, inclua todas. Se ultrapassar um limite, explique e peça uma seleção, sem descartar arquivos silenciosamente. Se as imagens mostram uma marca diferente da empresa ativa e o cliente não definiu qual marca divulgar, faça uma única pergunta sobre a marca antes de criar; nunca misture o logo Helpu com os textos da EME por causa de uma criação antiga. Vídeo de referência de estilo usa referenceOnlyIds e não deve aparecer como gravação de tela na peça. Música pode ser um áudio ou a faixa de um MP4 anexado (musicAssetId); não diga que é obrigatório enviar MP3 se existe um MP4 com áudio. Sem música significa musicAssetId null e sourceAudio false. Não invente música ausente. Para retomar, siga o objetivo da operação identificada, não outro pedido posterior. Consulte creation_library para localizar a versão e estado real antes de repetir uma produção. Uma chamada create_media confirmada já enfileira a criação: não repita para o mesmo formato nesta resposta. Confirme apenas os parâmetros e estado retornados pela ferramenta. Não antecipe legenda longa, data de postagem ou declaração de conclusão ao apenas enfileirar.`;
