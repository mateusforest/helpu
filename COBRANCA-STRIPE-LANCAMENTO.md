# Cobrança Stripe para o lançamento

## Estado desta entrega

Código preparado e verificado com Stripe simulado. Nenhum produto, preço, cupom, pagamento ou configuração real da conta Stripe foi criado nesta etapa. Publicação e configuração de produção ficam sob coordenação da entrega principal.

A assinatura mensal e os serviços avulsos usam Stripe Checkout hospedado. O preço, o modo de cobrança e o desconto são determinados pelo servidor. O navegador envia apenas o identificador de uma oferta permitida. A gestão da assinatura continua no Customer Portal. Uma assinatura já existente impede abrir uma segunda assinatura pela mesma empresa.

## Configuração

- Mantenha STRIPE_SECRET_KEY e HELPU_PUBLIC_URL nos ambientes corretos, sem expor chaves no navegador.
- STRIPE_PRICE_ID continua funcionando como o preço da assinatura no fluxo anterior.
- STRIPE_CATALOG_JSON substitui o preço único quando configurado. Exemplo de formato, com IDs que precisam ser substituídos por preços reais existentes:

```json
[
  {"id":"plan","mode":"subscription","priceId":"price_plano_mensal"},
  {"id":"strategy","mode":"payment","priceId":"price_sessao_estrategia"},
  {"id":"market-research","mode":"payment","priceId":"price_estudo_mercado"},
  {"id":"brand-identity","mode":"payment","priceId":"price_identidade"}
]
```

O catálogo aceita exatamente uma assinatura principal mensal e até três serviços opcionais. Os preços devem estar ativos, ser fixos por unidade e ter o tipo correspondente. O nome e o valor exibidos vêm do produto/preço no Stripe. Catálogo inválido não permite checkout; ele não volta silenciosamente para outra oferta.

STRIPE_LAUNCH_COUPON_ID é opcional. Configure somente depois de aprovar comercialmente a oferta e criar o cupom no Stripe. O backend verifica: cupom válido, duration=once, ambiente correto, prazo, moeda e produto compatíveis; assinatura de um mês; ausência de assinatura anterior confirmada para aquele cliente. O desconto não é aceito do navegador, não é aplicado a serviços avulsos e não fica permanente. O portal exibe valor do primeiro mês e valor regular antes de abrir o Checkout. O total final é o apresentado pelo Stripe.

As requisições fixam Stripe-Version: 2026-08-26.dahlia, versão atual confirmada na documentação em 18/09/2026. Não foi alterada a versão global da conta nem de webhooks.

## Pagamentos e entrega

Os meios de pagamento são selecionados pelo Stripe entre os habilitados e elegíveis para a conta, moeda e Checkout. Não se força boleto nem se promete sua presença sem teste na conta real. Boleto é assíncrono: Checkout concluído com payment_status diferente de paid permanece pendente. Abrir o retorno de sucesso não confirma pagamento e não libera acesso.

Este MVP não implementa webhook, concessão automática de plano, crédito de uso, emissão de nota fiscal nem entrega automática dos serviços vendidos. Depois de verificar o pagamento no Stripe, a equipe confirma o escopo e acompanha a entrega. Os limites de autonomia continuam independentes da assinatura.

Por segurança, cada empresa tem uma tentativa durável por serviço. Uma compra concluída, inclusive ainda não paga, impede cobrar de novo pelo mesmo serviço neste MVP. Recompras de sessões ou estudos precisam de fluxo de pedidos separado em uma etapa posterior; não apague metadados para forçar uma nova cobrança. Sessões expiradas podem ser substituídas. Erros de rede reutilizam a mesma chave de idempotência; resultados incertos não geram uma nova cobrança indiscriminadamente.

Retomar uma sessão aberta exige consultar os itens no Stripe e confirmar exatamente um item, o preço atualmente configurado e quantidade 1. Essa verificação também vale quando o registro local da tentativa não está disponível. Se o catálogo ou as condições mudaram, o portal bloqueia a retomada: a equipe precisa conferir e encerrar a tentativa antiga no Stripe antes de oferecer outro pagamento. O portal continua mostrando o preço atual do catálogo. Nenhuma sessão antiga é encerrada automaticamente.

Os serviços avulsos não habilitam invoice_creation: a integração não solicita a emissão opcional de fatura pós-pagamento no Checkout. Isso evita contratar esse recurso tarifado por padrão. Os comprovantes disponibilizados pelo Stripe seguem a configuração da conta; este fluxo não emite nota fiscal.

## Verificação realizada

13 testes Stripe passaram com mocks: compatibilidade do fluxo anterior; preços/cupom/mode não controlados pelo cliente; dono, sessão, origem e isolamento; catálogo inválido; avulso payment; desconto somente na primeira cobrança de cliente novo; validade, duração, moeda e produto do cupom; idempotência e concorrência; pagamento pendente versus pago; preço alterado com e sem registro local; quantidade ou itens extras bloqueados; ausência de emissão opcional de fatura nos avulsos; dados externos escapados na interface. Nenhuma chamada de cobrança real foi feita.

Antes de ativar vendas reais: escolher preços e escopos; criar/configurar os produtos aprovados; testar assinatura com desconto, avulso, retorno e cancelamento no ambiente de teste; definir rotina assistida de confirmação e entrega; conferir quais meios de pagamento aparecem na conta brasileira. Um checkout mock aprovado não substitui essa homologação.

## Referências oficiais

- https://docs.stripe.com/api/checkout/sessions/create
- https://docs.stripe.com/api/coupons/object
- https://docs.stripe.com/api/versioning
- https://docs.stripe.com/payments/boleto
