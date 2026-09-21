// WhatsApp image/video caps; PDF cap matches Helpu's verified private upload path.
export const MANUAL_FILE_LIMITS={'image/png':5,'image/jpeg':5,'video/mp4':16,'application/pdf':25};
export const MANUAL_ATTACHMENT_LABEL='Anexo · JPG/PNG até 5 MB · MP4 até 16 MB · PDF até 25 MB';
export function manualFileError(mime,size){const max=MANUAL_FILE_LIMITS[mime];if(!max)return 'Envie JPG, PNG, PDF ou MP4.';if(!Number.isInteger(size)||size<1)return 'O arquivo está vazio ou inválido.';return size>max*1024*1024?`Este arquivo excede o limite de ${max} MB para ${mime==='video/mp4'?'vídeo':mime==='application/pdf'?'PDF':'imagem'}.`:'';}
export function manualSendBlock({configured,selected,templates=[]},draft,{busy=false,locked=false}={}){
 if(busy)return 'Aguarde a conclusão da operação em andamento.';
 if(locked)return 'O último envio está sem confirmação. Confira com o contato antes de preparar outra mensagem.';
 if(!configured)return 'A conexão do WhatsApp oficial está incompleta. Confira a configuração do canal.';
 if(!selected)return 'Selecione um contato.';
 if(selected.suppressed)return 'Este contato pediu para sair. Novos envios estão bloqueados.';
 if(selected.mode!=='manual')return 'Assuma o atendimento para responder pela equipe.';
 const template=templates.find(t=>t.name===draft.template);
 if(draft.template&&!template)return 'O modelo selecionado não está mais disponível.';
 if(template){
  if(!selected.insideWindow&&!selected.consent)return 'Registre a autorização do contato para iniciar esta conversa.';
  if(draft.parameters.length!==template.parameters||draft.parameters.some(v=>!v.trim()))return 'Preencha os campos do modelo antes de enviar.';
 }else{
  if(!selected.insideWindow)return templates.length?'Escolha um modelo aprovado para iniciar a conversa. Mensagem livre depende de uma resposta do contato.':'Ainda não há modelo de primeira mensagem configurado. Configure um modelo aprovado na Meta ou aguarde o contato enviar uma mensagem ao número da Helpu.';
  if(!draft.text.trim()&&!draft.asset)return 'Escreva uma mensagem ou selecione um anexo.';
  if(draft.asset&&draft.text.trim().length>1024)return 'Use até 1.024 caracteres na mensagem com anexo.';
 }
 return '';
}
