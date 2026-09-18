export function createBillingUI({esc,getState}){
 const names={active:'Ativo',trialing:'Período de teste',past_due:'Pagamento em atraso',unpaid:'Pagamento pendente',incomplete:'Aguardando pagamento',incomplete_expired:'Pagamento expirado',paused:'Pausado',canceled:'Cancelado',paid:'Paga',open:'Em aberto',draft:'Em preparação',void:'Cancelada',uncollectible:'Pagamento não recebido'};
 const money=(amount,currency)=>{try{const formatter=new Intl.NumberFormat('pt-BR',{style:'currency',currency}),digits=['isk','ugx'].includes(currency)?2:formatter.resolvedOptions().maximumFractionDigits;return formatter.format(amount/10**digits);}catch{return 'Valor indisponível';}};
 const date=value=>value?new Date(value*1000).toLocaleDateString('pt-BR'):'—';
 function priceText(p){const unit={day:'dia',week:'semana',month:'mês',year:'ano'}[p.interval];return esc(money(p.amount,p.currency))+(unit?' / '+(p.intervalCount>1?p.intervalCount+' '+({day:'dias',week:'semanas',month:'meses',year:'anos'}[p.interval]):unit):'');}
 const actions=b=>`<div class="account-actions">${b.canCheckout?'<button class="p-button primary" data-account-action="checkout">Assinar pelo Stripe ↗</button>':''}${b.canPortal?'<button class="p-button secondary" data-account-action="portal">Gerenciar no Stripe ↗</button>':''}<button class="p-button ghost" data-account-action="refresh">Atualizar</button></div>`;
 function notice(b){
  if(!b)return '<p>Consultando faturamento…</p>';
  if(b.status==='error')return '<div class="account-empty"><strong>Não foi possível consultar o faturamento</strong><p>'+esc(b.message)+'</p><button class="p-button secondary" data-account-action="refresh">Tentar novamente</button></div>';
  if(b.status==='restricted')return '<div class="account-empty"><strong>Faturamento da empresa</strong><p>O responsável pela empresa pode consultar o plano e gerenciar os pagamentos.</p></div>';
  if(b.status==='not_configured')return '<div class="account-empty"><strong>Pagamentos pelo Stripe</strong><p>A contratação de planos ainda não está disponível. O Stripe precisa ser conectado para mostrar preços, pagamentos e faturas aqui.</p></div>';
  return '';
 }
 const testMode=b=>b.mode==='test'?'<p class="account-test">Ambiente de teste do Stripe · sem cobranças reais</p>':'';
 function plan(b){
  const message=notice(b),p=getState()?.company.policy||{};
  let commercial=message;
  if(!message){
   const sub=b.subscription,price=sub?.price||b.price;
   commercial=`${testMode(b)}<div class="account-empty"><strong>${sub?'Plano '+esc(names[sub.status]||'Em atualização'):price?esc(price.name):'Plano em configuração'}</strong>${price?'<p class="account-price">'+priceText(price)+'</p>':''}<p>${sub?(sub.cancelAtPeriodEnd?'Cancelamento programado'+(sub.renewsAt?' para '+date(sub.renewsAt):'')+'.':sub.renewsAt?'Fim do período atual: '+date(sub.renewsAt)+'.':'Situação consultada no Stripe.'):price?'Confira o total e conclua sua assinatura no Stripe.':'O preço do plano ainda não está disponível.'}</p>${actions(b)}</div>`;
  }
  return `<div class="account-section"><span class="account-kicker">PLANO</span><h2>Seu plano no Helpu</h2><p>Empresa: ${esc(getState()?.company.name||'sua empresa')}</p>${commercial}<h3>Limites de operação</h3><div class="account-usage">${[['Pedidos de IA por dia',p.dailyRuns],['Gerações de mídia por dia',p.dailyMedia],['Mensagens por dia',p.dailyMessages]].map(([name,value])=>`<div><strong>${esc(value==='unlimited'?'Sem limite':value??'—')}</strong><span>${name}</span></div>`).join('')}</div><p class="micro-copy">Esses limites são definidos na autonomia da empresa. A assinatura ainda não altera os limites automaticamente.</p><a class="p-button secondary" href="#/settings">Ajustar limites da empresa</a></div>`;
 }
 function invoices(b){
  const message=notice(b);
  return `<div class="account-section"><span class="account-kicker">FATURAMENTO</span><h2>Pagamentos e faturas</h2><p>Empresa: ${esc(getState()?.company.name||'sua empresa')}</p>${message||`${testMode(b)}<p>Gerencie sua assinatura e forma de pagamento no portal seguro do Stripe.</p>${actions(b)}<h3>Últimas faturas</h3>${b.invoices.length?'<div class="account-invoices">'+b.invoices.map(i=>`<div class="account-invoice"><div><strong>${esc(i.number||'Fatura em preparação')}</strong><span>${date(i.created)} · ${esc(names[i.status]||'Em atualização')}</span></div><div><strong>${esc(money(i.amount,i.currency))}</strong>${i.url?`<a href="${esc(i.url)}" target="_blank" rel="noopener noreferrer">Ver fatura ↗</a>`:''}</div></div>`).join('')+'</div>':'<div class="account-empty"><strong>Nenhuma fatura disponível</strong><p>As faturas aparecerão aqui quando forem emitidas pelo Stripe.</p></div>'}${b.hasMoreInvoices?'<p>Consulte o histórico completo em “Gerenciar no Stripe”.</p>':''}`}<p class="micro-copy">O consumo dos serviços de IA é cobrado pelas contas conectadas nesses serviços. Esses valores não são importados para o faturamento do Helpu.</p></div>`;
 }
 return {plan,invoices};
}
