# F12 — Financeiro

## Operação disponível

- Administração → Financeiro: cobranças de todas as empresas, busca, criação,
  correção antes de anexar boleto, reemissão e confirmação manual no banco.
- Cliente → Minha empresa → Financeiro: consulta restrita a owner/admin,
  Pix com chave e favorecido, boleto atual, linha digitável, comprovante PDF,
  histórico e consentimento WhatsApp. A equipe escolhe Pix, boleto ou ambos
  como alternativas de quitação da mesma cobrança.
- Valores em centavos, versão obrigatória nas alterações. Reemissão mantém a
  mesma dívida e conserva os documentos anteriores para a equipe.
- Cada cobrança exige referência do pedido/contrato, competência, descrição,
  valor, vencimento e condições previamente acordadas. Não há preço padrão,
  suspensão, juros ou emissão bancária automática.
- Comprovante muda para aguardando confirmação; apenas conferência bancária
  explícita permite marcar paga. Cancelamento exige solicitação e confirmação
  posterior no banco. Pagamentos parciais e estornos exigem conciliação assistida;
  não se deve alterar uma cobrança paga para apagar o recebimento.
- PDFs de até 3 MB ficam no armazenamento privado existente. Não aparecem na
  Biblioteca nem podem ser usados como referência criativa. Download verifica
  empresa e papel. Clientes não podem baixar boletos substituídos.
- Perguntas simples como “meu boleto” ou “consultar pagamentos” no chat interno
  ou WhatsApp consultam o financeiro sem criar execução de IA. O arquivo é
  acessado na área autenticada, nunca por link público no WhatsApp.

## Lembretes

O worker existente executa o agendador. Datas seguem America/Sao_Paulo.
O cliente precisa autorizar avisos financeiros e ter WhatsApp operacional
conectado e verificado. A preferência de boas-vindas não é reutilizada.

- D-2: cobrança aberta, boleto atual ou Pix cadastrado, sem comprovante em análise.
- Documento disponibilizado depois de D-2: aviso de disponibilidade, sem
  afirmar que faltam dois dias. Não há cobrança de atraso automática.
- Revalidação de estado, papel, consentimento e vínculo antes do envio.
- Chave por cobrança, versão do instrumento, etapa e destinatário. Até três
  envios por execução. Resultado incerto permanece registrado para conferência;
  não é repetido automaticamente. Aceitação pela API não significa entrega.
- Dentro de 24h da última mensagem do cliente: texto de serviço. Fora da janela:
  depende de `HELPU_WHATSAPP_FINANCE_TEMPLATE` configurado e aprovado pela Meta,
  sem parâmetros, no idioma `HELPU_WHATSAPP_TEMPLATE_LANGUAGE` (padrão pt_BR).
  O modelo deve informar genericamente a disponibilidade de informações no
  Financeiro, pois atende tanto D-2 quanto disponibilidade tardia.
- O histórico administrativo mostra tentativas aceitas, incertas ou não enviadas.
  O agendamento não chama modelos de IA.

## Sicredi e Stripe

Sicredi é manual nesta etapa: emitir no banco, anexar PDF e linha digitável,
conferir liquidação. Não há conexão automática com a conta bancária.
Pix também é manual: chave, nome do beneficiário e instituição são informados
na cobrança; o cliente copia a chave e paga no banco. Não há QR Code dinâmico.
Enviar comprovante não confirma recebimento nem ativa o plano automaticamente.

Stripe mantém o Checkout e o portal de cobrança já existentes em Minha conta.
O novo endpoint `POST /webhooks/helpu-stripe` registra pagamentos confirmados
no Financeiro sem reproduzir cobranças Sicredi no Stripe.

Para ativar, configurar `STRIPE_WEBHOOK_SECRET`, além das configurações Stripe
existentes, e cadastrar o endpoint HTTPS no Stripe com os eventos:

- `invoice.paid`
- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`

Valida HMAC do corpo bruto, timestamp de até cinco minutos, modo teste/produção
e eventos da própria conta (não Stripe Connect). Consulta novamente o objeto
pela API e confere customer vinculado à empresa. Checkout não pago é ignorado;
assinaturas e checkouts com invoice são reconciliados pela invoice para evitar
dupla contagem. A gravação é única por objeto/modo, inclusive com eventos distintos.
Teste Stripe aparece identificado somente à equipe e não entra nos totais.

O registro é de recebimento histórico. Reembolsos, disputas, pagamentos parciais
e liberação de franquias/créditos de planos não são automatizados aqui. Os preços
e direitos comerciais ainda precisam ser definidos; este módulo não os inventa.
Nota fiscal é um documento separado, não produzido por este fluxo.

Referência técnica: [assinatura Stripe](https://docs.stripe.com/webhooks/signature)
e [eventos Stripe](https://docs.stripe.com/webhooks).

## Publicação e validação

Sem nova migração: usa registros privados e assets existentes, compatíveis com
SQLite e PostgreSQL. Testes cobrem isolamento, CSRF, versões, comprovantes,
reemissão, duplicações, cancelamento, lembretes, chat sem IA e assinatura Stripe.
Teste visual usa contas fictícias e telas de 1440, 390 e 320 px.

Nenhuma cobrança real, mensagem de cliente, preço ou chave foi criado/alterado.
Depois do push manual e deploy: conferir acesso às duas áreas, ativar webhook
Stripe apenas se esse provedor for adotado e cadastrar o modelo Meta para
lembretes fora da janela. Produção precisa manter o worker periódico existente.
