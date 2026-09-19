const names={conversation:'Conversa',post:'Proposta de conteúdo',creation_plan:'Planejamento de criação',image:'Geração e edição de imagem',agent:'Agentes e rotina',contextual_review:'Revisão de qualidade',operational_validation:'Validação da conexão',unknown:'Outra atividade'};
const number=value=>new Intl.NumberFormat('pt-BR').format(value);
export function technicalUsageCard(usage,esc){
 const heading='<h3>Uso da OpenAI nas últimas 24 horas</h3>';
 if(!usage)return heading+'<p>A medição técnica ainda não está disponível. Atualize o painel para consultar.</p>';
 const note='<p class="micro-copy">Estes são os tokens informados pela OpenAI. O cache já faz parte da entrada. Esta medição preserva o histórico ao zerar o uso interno e não representa créditos do plano nem o valor da fatura. Não inclui renderização de vídeo, armazenamento ou WhatsApp. Chamadas sem resposta recebida podem não aparecer.</p>';
 if(!usage.calls)return heading+'<p>Nenhuma resposta de IA registrada nas últimas 24 horas.</p>'+note;
 const metric=(field,label)=>{
  const value=usage.tokens?.[field],known=usage.coverage?.[field]||0;
  return '<div><strong>'+esc(value===null||value===undefined?'Não informado':number(value))+'</strong><span>'+label+'</span><small>'+(known===usage.calls?'Informado em todas as chamadas':known?esc(number(known))+' de '+esc(number(usage.calls))+' chamadas; soma parcial':'Sem quantidade informada')+'</small></div>';
 };
 const rows=(usage.groups||[]).map(g=>'<tr><td>'+esc(names[g.operation]||names.unknown)+'</td><td>'+esc(g.model||'Não informado')+'</td><td>'+esc(number(g.calls))+'</td><td>'+esc(number(g.measuredCalls))+'</td></tr>').join('');
 return heading+'<p><strong>'+esc(number(usage.calls))+' chamadas registradas.</strong> '+esc(number(usage.measuredCalls))+' com alguma contagem de tokens; '+esc(number(usage.unknownCalls))+' sem contagem informada. Um pedido pode usar mais de uma chamada.</p><div class="account-usage">'+metric('input','Tokens de entrada')+metric('cachedInput','Entrada em cache')+metric('output','Tokens de saída')+'</div>'+note+(rows?'<details class="company-resources"><summary>Detalhar por atividade e modelo</summary><div class="table-wrap"><table><thead><tr><th>Atividade</th><th>Modelo</th><th>Chamadas</th><th>Com medição</th></tr></thead><tbody>'+rows+'</tbody></table></div></details>':'');
}
