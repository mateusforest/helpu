# Administração Helpu

Entrada própria: `/admin.html`. Usa a mesma conta e sessão, com autorização de
operador conferida pelo servidor. Não há um segundo cadastro administrativo.

## Experiência

- Login de operador, ao chegar em `portal.html` sem destino específico, abre a
  administração. Clientes continuam no portal habitual.
- Navegação administrativa própria: Visão geral, Clientes, Publicações,
  Consultorias, Comercial e Planos e custos.
- Visão geral mostra números reais e próximos passos das filas existentes.
- Diretório lista empresas cadastradas e contagens operacionais. Cadastro não
  equivale a cliente pagante. Falhas representam o histórico, não incidentes
  necessariamente atuais.
- Administração não carrega o guia inicial, o chat ou a navegação do cliente.
- “Abrir minha empresa” acessa `portal.html?mode=client#/company`. No portal da
  empresa, o operador pode voltar pelo botão Administração.
- Antigos links `portal.html#/admin`, `#/consultations-admin`, `#/commercial` e
  `#/pricing` redirecionam o operador à mesma função em `admin.html`.
- Links explícitos de conteúdo, conta e retorno de conexão preservam seu destino.
- Comercial e Planos usam uma seleção de empresa de origem para materiais e
  fichas. Ela não filtra as filas globais nem permite assumir a conta do cliente.

## Dados e autorização

`GET /api/portal/admin-overview` exige operador autorizado. Retorna somente nome,
ID e data de criação das empresas, contagens agregadas de pedidos e execuções.
Não retorna senhas, conexões, perfis, mensagens, arquivos nem payloads de IA.
Clientes recebem 403; anônimos, 401. A página HTML exige sessão e a interface
confere autorização antes de carregar dados. As APIs existentes mantêm suas
próprias verificações administrativas.

Publicações, consultorias, comercial e preços reutilizam as funções e controles
de versão existentes. Não há alteração no fluxo de aprovação, no faturamento,
nas cotas ou na autorização de execução. Financeiro permanece identificado como
pendente, sem saldo ou receita inventados. Não foram implementados impersonação
de clientes ou leitura administrativa de conversas privadas.

## Validação

- Teste de redirecionamento do operador, modo cliente explícito e callbacks.
- Endpoint administrativo testado em SQLite e PostgreSQL: permissões, diretório,
  agregação por empresa, ausência de dados privados e revogação de operador.
- Teste de navegador com contas fictícias: início administrativo, seis áreas,
  rascunho de oferta, volta ao cliente, acesso negado ao cliente, links antigos
  e telas de 1440, 390 e 320 px.
- Fluxo completo de planos e propostas executado novamente na nova estrutura.

Após o envio manual do commit e deploy, a conta administrativa já autorizada
passa a usar a nova entrada. Não há migração nem nova variável de ambiente.
