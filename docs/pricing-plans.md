# F10 — planos, entregas e formação de preço

## Onde usar

Equipe autorizada: **Minha empresa → Planos e custos**, rota `#/pricing`.
O acesso usa a mesma autorização administrativa da Operação Helpu. Cadastro
comum ou participação em uma empresa não concede acesso a custos e margens.

Esta implementação estrutura e compara ofertas. Nenhum preço anterior foi
adotado, não há catálogo público novo, cobrança, cupom, mudança de limite ou
ativação de assinatura. Valores em testes são fictícios e ficam em bases
temporárias, nunca no banco do portal.

## Fluxo

1. Estruturar uma oferta principal de criação. Publicação assistida, consultoria
   e gestão de anúncios têm fichas próprias. A verba de anúncios é separada.
2. Descrever entregas válidas, quantidade, formatos/duração, materiais, revisões,
   prazos, suporte, armazenamento, contas, WhatsApp, excedentes, pagamento,
   renovação, cancelamento e falhas/reembolsos. Não converter chamadas de IA em
   créditos comerciais.
3. Registrar custo direto e minutos por unidade. Informar fonte/amostra e se
   foi medido ou estimado. Custo desconhecido fica vazio; zero é um valor
   explícito. Incluir tentativas/falhas na média por entrega válida sem contar
   novamente na reserva de retrabalho.
4. Informar hora de trabalho, parcela de custos fixos, volume mensal realista,
   horas reservadas a esta oferta, tributos, margem e reserva. Documentar fonte,
   data e câmbio utilizado quando necessário. Não duplicar custos entre ofertas.
5. Preencher as tarifas contratadas de Stripe e/ou Sicredi e o tempo manual de
   conciliação. O meio selecionado deve estar completo; o outro pode continuar
   sem dados, explicitamente sem resultado. Nenhuma tarifa é consultada ou
   presumida pelo sistema.
6. Simular preço normal e, opcionalmente, primeira mensalidade. Lançamento exige
   validade futura, condições e vagas compatíveis com as horas informadas.
   Primeira mensalidade com prejuízo é bloqueada; margem abaixo do alvo, mas
   cobrindo os custos, é sinalizada. A renovação usa o preço normal.
7. Salvar o rascunho. Somente com ficha completa, margem normal suficiente e
   capacidade compatível a equipe pode revisar para propostas, confirmando as
   premissas e as horas reservadas. Não há aprovação automática de preço.
8. Em **Comercial Helpu**, preparar uma proposta privada a partir de interesse
   autorizado. A ficha revisada preenche termos e preço normal; descontos não
   são aplicados automaticamente. A equipe confere condições específicas antes
   de disponibilizar ao destinatário.

Revisar uma ficha não envia mensagens. O aceite da proposta preserva as regras
do F09 e não executa pagamento. Consultoria contratada segue o pedido e a
entrega do F08; publicação assistida segue aprovação e execução do F07.

## Cálculo

- Direto: soma de quantidade × custo unitário.
- Trabalho: soma de quantidade × minutos × custo/hora ÷ 60.
- Rateio: parcela de fixos mensais ÷ clientes/pedidos previstos no mês.
- Reserva: percentual de retrabalho sobre direto + trabalho.
- Conciliação: minutos por recebimento × custo/hora ÷ 60.
- Base: direto + trabalho + rateio + reserva + conciliação + tarifa fixa.
- Preço para margem: base ÷ (1 − tarifa percentual − tributos − margem).
- Equilíbrio: base ÷ (1 − tarifa percentual − tributos).
- Resultado no preço: preço − base − tarifas percentuais − tributos.
- Capacidade: horas disponíveis × 60 ÷ minutos por cliente/pedido, incluindo
  reserva de retrabalho e conciliação; arredondada para baixo.

Dinheiro é calculado em centavos e percentuais em centésimos de ponto percentual.
Custos são arredondados conservadoramente. O preço mínimo também considera o
arredondamento das tarifas para atingir a margem indicada. O resultado mensal
usa o volume informado, não a capacidade máxima. Projeções não equivalem a lucro
apurado, faturamento garantido ou fatura do fornecedor.

O resumo de uso técnico é somente leitura, referente à empresa selecionada e às
últimas 24 horas. Tokens desconhecidos não viram zero nem custo em reais. Para
medir custo por entrega é necessário conciliar gastos e tempo com amostras reais.

## Persistência e proteções

- `records.kind = pricing_plan`, com rascunho, revisão, versões preservadas,
  histórico e auditoria. Sem migração de banco ou mudança no catálogo Stripe.
- Endpoint autenticado e administrativo `/api/portal/pricing`; mutações com
  proteção de origem. Criação requer empresa administrada pelo operador.
- Edição exige versão atual. Alterar a ficha retira a revisão até nova
  conferência, preservando versões anteriores e propostas enviadas.
- Apenas uma oferta principal revisada por empresa de origem. Transação com
  bloqueio da empresa e controle de versão evita revisões concorrentes.
- Arquivar retira a base de novas propostas. Referências antigas são rejeitadas
  ao preparar novos acordos, sem reescrever acordos já enviados.
- O cliente recebe termos e preço. Custos, margens, referências de custo e
  capacidade não entram na proposta nem no estado comum da empresa.
- Pacotes pré-pagos podem ser rascunhados, mas a revisão comercial fica bloqueada
  até existir saldo auditável e conciliação. Pós-pago variável não foi ativado.

## Validação

- `tests/pricing.test.mjs`: fórmulas, desconhecido versus zero, capacidade,
  desconto, datas, permissões, conflitos, privacidade, SQLite e PostgreSQL.
- `tests/pricing-visual.mjs`: navegador local, rascunho, revisão, simulação sem
  chamadas de execução, proposta com base revisada e telas de 1440/390/320 px.
- Testes de regressão de F04–F09, ajuda, uso, interface e cobrança Stripe.

Publicação depende do envio manual do commit e deploy. Para lançar preços reais,
ainda é necessário preencher premissas reais e escolher a oferta. Recebíveis,
boleto, conciliação e lembretes permanecem no F12.
