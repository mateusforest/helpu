# F08 — Consultorias avulsas

## Onde usar

- Cliente: **Minha empresa → Consultorias** (`/portal.html#/consultations`).
- Equipe: **Administração → Consultorias e sites** (`/admin.html#/consultations-admin`).
- A equipe usa a mesma designação de operador do F07, documentada em `assisted-publishing.md`. E-mail informado no formulário não concede acesso administrativo.

## Serviços e contratação

Quatro formulários compartilham contexto da empresa e têm perguntas específicas: diagnóstico e plano de ação, mercado e posicionamento, identidade de comunicação, qualidade de presença e conteúdo. O cliente salva rascunhos, envia arquivos e links nos campos de texto e autoriza a análise. Um formulário enviado cria um pedido/tarefa na fila específica de consultorias, com indicação da próxima ação e contador de triagens/revisões. Não dispara um agente, e-mail ou WhatsApp.

O serviço de sites profissionais acrescenta um formulário próprio em
`/portal.html#/websites` e usa a fila administrativa de consultorias. Seus
rascunhos de preço, escopo, exemplos e controle de saldo final estão descritos
em [Operação administrativa, sites e Pix](admin-criacao-sites-pix.md).

A equipe assume o atendimento, pede complementos e apresenta escopo, entregas, exclusões, valor, condições de pagamento, prazo inicial, quantidade e prazo das revisões. Nenhum preço padrão foi aprovado ou ativado. O aceite do cliente fica vinculado ao número da proposta; alterar uma proposta antes do aceite cria outra versão e mantém a anterior.

O pagamento é combinado fora deste fluxo e confirmado manualmente pela equipe após conferir o recebimento, com referência registrada. O aceite não cobra, um comprovante não confirma pagamento automaticamente e esta etapa não integra Stripe, boleto ou conciliação. A infraestrutura de cobrança é uma frente separada.

## Execução e entrega

Pagamento confirmado e briefing completo são requisitos no servidor para iniciar o trabalho. A previsão usa dias de segunda a sexta no fuso de Brasília, sem descontar feriados automaticamente; condições específicas devem constar da proposta. Pausar exige um motivo. O complemento não retoma o prazo sozinho: a equipe confirma e retoma, prorrogando a previsão pelos dias úteis transcorridos. Uma revisão incluída abre sua própria previsão pelo prazo aceito.

A equipe prepara e salva o relatório em rascunho antes de publicá-lo. O texto desse rascunho não é retornado ao cliente. A entrega privada apresenta resumo, evidências e datas/fontes, comparação, fatos, hipóteses, prioridades justificadas, plano de ação e orientações. As seções são expansíveis e os materiais têm links de download autenticados. O cliente pode pedir as revisões contratadas ou aceitar a versão final. O histórico preserva propostas, entregas, complementos, responsáveis e aceites.

Anexos do briefing usam o upload existente, até 25 MB por arquivo. Anexos da entrega usam upload administrativo restrito ao pedido, até 3 MB por arquivo e 20 arquivos por pedido, compatível com o corpo de requisição da hospedagem. Os arquivos entram na biblioteca privada da empresa assim que anexados; apenas o texto do relatório permanece reservado à equipe até publicar a entrega. Links para materiais maiores podem constar no relatório, com acesso gerenciado pelo responsável pelo link. Não há exportação automática do relatório em PDF; um PDF preparado pela equipe pode ser anexado.

Antes do aceite da proposta, o cliente pode cancelar. Depois da contratação, mudanças de escopo ou encerramento são tratados com a equipe, sem promessas automáticas de reembolso. Revisões além das incluídas precisam de novo acordo.

## Persistência e segurança

- Registros próprios `records.kind=consultation`; nenhuma migração nova necessária.
- Permissões de escrita do cliente exigem proprietário/administrador da empresa. Membros podem consultar.
- O operador só vê pedidos enviados. Acesso a arquivos de outra empresa fica limitado aos anexos de pedidos enviados e não cancelados, ou à autorização independente já existente no F07.
- Todas as transições são verificadas no servidor. Controle de versão rejeita tela desatualizada e aceita apenas uma ação concorrente.
- Transações com savepoint preservam registro e auditoria juntos em SQLite e PostgreSQL.
- Pedidos não criam jobs de IA, publicações ou cobranças. Anexar não interpreta instruções dos documentos.
- Rascunhos, propostas e relatórios não têm link público compartilhável.

## Validação local

`tests/consultations.test.mjs`: fluxo completo em SQLite e PostgreSQL, isolamento, CSRF, rascunho privado, versões, aceite, barreiras de pagamento e briefing, pausas, arquivos e revisões limitadas.

`tests/consultations-visual.mjs`: cliente e operador reais no navegador local, uploads, rascunhos, proposta, conferências, entrega e revisão até o aceite final; larguras de 1440, 390 e 320 px. Usa dados fictícios e bloqueia requisições externas. As imagens ficam em `../output/f08`.

Esta implementação local precisa passar pelo push e pelo deploy antes de aparecer no portal público.
