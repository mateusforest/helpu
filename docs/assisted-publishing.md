# F07 — publicação assistida e fila da equipe

## Acesso às telas

- Cliente: **Minha empresa → Publicação assistida** (`#/assisted`).
- Operador: **Minha empresa → Operação Helpu** (`#/admin`). O item só aparece para operadores configurados no servidor. A API também verifica a função; esconder o menu não é a proteção de acesso.

Esta versão entrega a operação humana de publicação: pedidos por empresa, arquivos finais, conta, legenda, data/fuso, revisão, responsável, versões, aprovações, verba de anúncio e evidências. Não contém um executor de publicação automática. Botões de anúncio registram o trabalho feito na Meta, não criam campanhas nem gastam dinheiro.

Financeiro/Sicredi/Stripe e consultorias continuam nas frentes F12 e F08. Não foram criados atalhos administrativos para agir como o cliente, consultar suas conversas privadas ou obter credenciais de conexões.

## Habilitar o operador

Configurar `HELPU_OPERATOR_USER_IDS` no ambiente do servidor com os IDs dos usuários autorizados, separados por vírgula. A configuração vazia desabilita a área administrativa. Não confundir ID de usuário com ID de empresa. Não usar um e-mail fixado no código ou promover automaticamente o primeiro cadastro.

Para identificar uma conta existente, em uma conexão administrativa autorizada ao banco, usar consulta parametrizada:

```sql
SELECT id, name, email FROM helpu.users WHERE lower(email) = $1;
```

Conferir a pessoa e configurar somente o ID retornado. Nenhuma senha é necessária para essa identificação. Não adivinhar o ID. A configuração deve acompanhar o próximo deploy, sem enviar arquivos `.env` ao Git.

Alternativa de implantação: `HELPU_OPERATOR_ACCOUNT_EMAIL` junto com `HELPU_OPERATOR_ACCOUNT_CREATED_BEFORE` (timestamp Unix em milissegundos no passado). O servidor consulta sua própria base e resolve o ID somente se a conta já existia até esse corte. Ausência de conta, corte futuro ou configuração incompleta não concedem acesso. Isso permite configurar a conta autorizada sem exportar credenciais de produção. Um novo cadastro com o mesmo e-mail após o corte não recebe a função. Sem essas variáveis e sem IDs explícitos, ninguém ganha acesso administrativo.

Retirar um ID da configuração remove o acesso administrativo nas instâncias que carregarem a nova configuração. Permissões do serviço são verificadas a cada início de ação. Uma revogação na Helpu não revoga o acesso na Meta: ele também precisa ser removido na plataforma externa quando necessário.

## Caminho completo

1. Responsável da empresa informa o usuário do Instagram e autoriza o serviço com uma caixa inicialmente desmarcada. A autorização registra texto, versão, pessoa e horário.
2. Cliente e equipe combinam o acesso delegado oficial na Meta. Não há campo para senha. O operador registra como conferiu o acesso à conta indicada; isso é evidência humana, não teste automático de permissões.
3. Cliente seleciona os arquivos prontos da empresa, formato, legenda e data futura. Pode solicitar orçamento de impulsionamento junto ao pedido. A data usa o horário do dispositivo e salva o instante e o fuso.
4. Equipe assume o atendimento, revisa a peça e encaminha a versão para aprovação. Pode solicitar ajustes ou registrar impedimento.
5. Cliente confere a prévia e aprova explicitamente a versão. Mudar arquivo, legenda, data ou autorização requer outra revisão e aprovação. A ordem dos arquivos é a ordem mostrada na lista e na prévia.
6. No horário aprovado, o operador inicia a publicação manual. A operação exige autorização vigente, acesso delegado conferido, aprovação da versão e os mesmos bytes dos arquivos aprovados. A reserva impede dois operadores de iniciar a mesma versão.
7. Operador publica na conta da Meta e registra o link HTTPS do Instagram. O portal identifica esse resultado como registro manual da equipe. Após dúvida ou falha durante a publicação, o pedido fica **Resultado a conferir** e não pode ser iniciado novamente. Quem iniciou confere o perfil e registra o link encontrado.

Não há promessa automática de prazo mínimo, atendimento imediato, feriados ou capacidade ilimitada. A equipe deve combinar o prazo antes de enviar a versão para aceite. Horário ultrapassado é sinalizado; aprovação de uma data já passada é bloqueada.

## Impulsionamento

Intenções iniciais: R$35, R$50 ou R$100 de mídia. O pedido também exige objetivo, público/cidade e período. A equipe valida a verba e informa a taxa Helpu separadamente, inclusive zero explícito. O cliente vê mídia, taxa, total, período e público antes de aprovar o orçamento. Uma mudança na proposta invalida esse aceite.

O fluxo registrado é solicitado → orçamento → aprovado → configurado → análise Meta → ativo → encerrado → resultados. Cada avanço operacional exige evidência e link da campanha; não há salto silencioso para ativo. A peça precisa estar publicada antes das etapas operacionais do anúncio. O período ativo deve estar dentro do aprovado. Encerramento e resultados de anúncio já iniciado podem ser registrados mesmo após revogar a autorização, para permitir prestação de contas.

A mídia é paga pelo cliente diretamente à Meta. O portal não cobra mídia nem a taxa nesta versão. O registro não verifica automaticamente gastos ou desempenho: a equipe deve conferir a conta, interromper campanhas quando necessário e registrar resultados observados, sem garantia de alcance ou vendas.

## Dados, segurança e recuperação

- Sem migração: usa os tipos `assisted_service` e `assisted_request` na tabela `records`, com índices já existentes.
- Operador vê a fila e um resumo de marca dos clientes com autorização ativa. Pode ler apenas arquivos vinculados a pedidos desse serviço e somente durante a autorização; não recebe acesso geral ao estado da empresa.
- Cliente só consulta sua empresa. Apenas `owner`/`admin` pode conceder autorização, alterar pedidos ou aprovar.
- Escritas verificam versão e ficam em transação com o histórico de auditoria. Alterações paralelas são rejeitadas em vez de sobrescrever silenciosamente.
- Pedidos têm chave de idempotência: reenviar o mesmo formulário não duplica o pedido.
- Aprovações, orçamentos anteriores e revisões permanecem no histórico. Cancelar preserva evidências.
- Revogar bloqueia novos inícios e acesso do operador aos arquivos. Uma ação manual já iniciada fora da Helpu não pode ser recolhida pelo código; seu resultado ainda pode ser registrado por quem a iniciou.
- Nada nesta frente consome IA, envia WhatsApp, publica na Meta ou movimenta dinheiro automaticamente.

## Verificação

`tests/assisted-publishing.test.mjs` cobre SQLite e PostgreSQL: função administrativa, origem de requisições, isolamento, consentimento, idempotência, arquivos, versões, revogação, reautorização, orçamento, integridade dos arquivos, concorrência, resultado incerto e etapas do anúncio.

`tests/assisted-visual.mjs` percorre cliente e operador em navegador local: autorizar, solicitar com arquivo e verba, conferir acesso, revisar, aprovar peça/orçamento e registrar publicação. Verifica desktop, 390 e 320 px. Usa dados fictícios e bloqueia requisições externas.
