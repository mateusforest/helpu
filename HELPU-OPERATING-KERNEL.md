# Helpu Operating Kernel

Consolidação do portal existente · setembro de 2026.

## Base inspecionada e preservada

O projeto principal em `Helpu2.0` já continha servidor Node.js, SQLite, autenticação e sessões, isolamento por empresa, arquivos privados, credenciais criptografadas, conversa com histórico/anexos, fila persistente, pausas, recuperação, Responses API, adaptadores externos e navegador Playwright com perfis dedicados.

A inspeção incluiu `server.mjs`, `portal/`, `dist/`, `tests/`, metadados de `.local-data/` e os três documentos existentes. As 17 áreas do portal já usavam dados persistidos; não eram telas a serem reconstruídas. A EME já existia no banco local, mas seu perfil comercial estava vazio e não havia integrações, registros de operação ou arquivos cadastrados para ela. Não foram preenchidos fatos comerciais presumidos.

Landing, login, cadastro, documento HTML principal, navegação, logo e tipografia foram preservados. O banco existente não foi apagado ou recriado, e `.local-data/` não foi usado para testes ou populado com demonstrações. Os testes usam pastas temporárias e provedores controlados.

A lacuna era a ligação: conversa, fila e registros compartilhavam a empresa, mas não uma ordem de trabalho com ciclo, revisão, autorização e evidências próprios. O kernel conecta essas partes.

## Fonte única, entidades e migration

`portal/kernel.mjs` coordena o ciclo operacional. As ordens usam a tabela genérica `records`, com o novo tipo interno `operations`; não há tabelas paralelas de campanha, calendário, tarefa, aprovação ou evidência.

| Entidade operacional | Estrutura reutilizada |
| --- | --- |
| Empresa, contexto e regras | `companies.profile`, `companies.policy`, `memberships` |
| Objetivo, plano, estado, competências, bloqueios e decisões | `records` com `kind='operations'` |
| Campanha | `records` com `kind='campaigns'`, ligada por `operationId` |
| Etapas executáveis | `records` com `kind='tasks'`, `operationId` e `kernelStep` |
| Conceito, legenda e briefing | `records` com `kind='content'`, ligados à operação e campanha |
| Arquivo físico privado | `assets` e armazenamento privado existentes |
| Entregas adicionais, mensagens, conhecimento | Tipos existentes de `records`, com vínculo operacional quando criados pela operação |
| Agendamento | `content.scheduledAt` e `jobs.scheduled_at`; nenhuma tabela de calendário |
| Aprovação | `operation.approval`, fingerprint da versão revisada e evento com autor/data |
| Tentativas e chamadas de ferramentas | `jobs`, `jobs.external`, `jobs.output`, `conversation_events.detail` |
| Transições e auditoria | `conversation_events` e `audit` |
| Evidências | Resultado estruturado de ferramenta em `jobs.output.result`, associado à operação e aos eventos |
| Métricas e aprendizados | `records.metrics`, `records.knowledge` e referências em `operation.result` |
| Sessões e contas | `integrations`, `browser_profiles`, usuários e sessões existentes |

A migration incremental `portal/migrations/004.sql` adiciona somente quatro índices: vínculo de registros à operação, operações por conversa, jobs por operação e eventos por operação. As migrations anteriores e os dados existentes permanecem válidos. A aplicação normal aplica índices pendentes ao iniciar; isso não exige recriação do banco.

O estado detalhado da ordem é a fonte de verdade. Estados anteriores de campanha e tarefa continuam compatíveis e são derivados: campanha em preparação segue `planning`, execução/agendamento segue `running`, interrupções seguem `paused`, execução concluída segue `complete`; etapas `completed` viram tarefas `done` e etapas `working` viram `doing`. A interface mostra também o estado detalhado da operação.

As rotas de edição não permitem falsificar o andamento de etapas gerenciadas (`kernelStep`) ou campanhas vinculadas nem aprovar/agendar um conteúdo vinculado diretamente. Tarefas genéricas criadas pela conversa, sem `kernelStep`, continuam editáveis; seu andamento real atualiza o plano da ordem. A edição da entrega relevante revoga a aprovação e cancela publicação pendente. Registros ligados à operação preservam o histórico e não são removidos pela edição genérica.

## Conversa, API e ciclo

A entrada continua sendo `POST /api/portal/:empresa/conversations/:conversa/messages`. Pedidos operacionais no modo **Conversar e executar** registram objetivo, empresa ativa, mensagem, job e ordem persistente. A identificação inicial usa verbos e expressões como “preciso” e “quero”; a vertical reconhece publicação/postagem/post. Pedidos livres continuam usando as ferramentas existentes: se a primeira ferramenta altera registros ou opera o navegador, uma ordem é registrada antes da ação, mesmo quando o reconhecimento inicial não identifica a intenção. **Somente planejar** preserva o contrato de não executar alterações operacionais solicitadas pelo modelo.

A Helpu Executive usa o modelo configurado da conversa na integração Responses API. Na vertical, recebe objetivo, empresa, contexto da marca e conhecimento existente, e entrega `title`, `concept`, `caption` e `visualBrief` por contrato estruturado. Texto genérico de sucesso não é uma entrega válida. A resposta operacional ao usuário é montada a partir do estado salvo pelo kernel, inclusive bloqueios; não reproduz uma alegação de publicação do modelo.

Interfaces incrementais:

- `GET /api/portal/:empresa/state` e o snapshot da conversa incluem `operations`.
- `GET /api/portal/:empresa/operations` lista ordens; `GET .../operations/:id` retorna uma ordem.
- `POST /api/portal/:empresa/operations/:id/action` recebe `action`, e quando necessário `scheduledAt` ou `note`.
- Ações: `approve`, `pause`, `resume`, `cancel`, `schedule`, `execute`, `verify`, `measure` e `learn`. Não há edição livre de estado.
- `PATCH .../company` aceita `policy.operationRules`; endpoints e tipos funcionais anteriores permanecem disponíveis.

Ciclo representado:

`requested → understanding → planning → producing → reviewing → awaiting_approval → ready → scheduled/executing → verifying → completed → measuring → learned`.

`blocked`, `failed`, `uncertain` e `cancelled` registram interrupções distintas. A pausa é persistida e bloqueia novos efeitos derivados. Cada transição aceita pela máquina de estados é gravada com origem/destino, momento e evento auditável. Concluir uma preparação local não confirma uma ação externa; na primeira vertical, a entrega fica pronta e a publicação é uma decisão posterior.

Retomada reaproveita ordem, campanha, etapas e entregas. As tentativas permanecem vinculadas ao job e à operação originais. Idempotência utiliza a chave do pedido, isolamento por empresa/conversa e índices já existentes; o formulário reaproveita a chave quando uma resposta HTTP falha e o mesmo pedido é reenviado. Não há equivalência garantida entre dois textos parecidos enviados conscientemente como novos pedidos.

Pedidos com identificador externo preservado são conferidos por leitura, sem repetir publicação. Uma execução incerta sem identificador suficiente permanece incerta e pede conferência no serviço. Preparações interrompidas antes de iniciar efeitos externos ficam bloqueadas e podem ser retomadas da mesma ordem. Pausar não desfaz efeitos externos já aplicados: se uma solicitação já enviada for confirmada durante a pausa, a confirmação real prevalece, fica auditada e não será repetida.

## Competências e qualidade

As competências são capacidades internas da mesma Helpu Executive, registradas no plano. Cada uma define responsabilidade, contexto de entrada, entrega esperada e critério de conclusão: estratégia, direção de marketing, direção criativa, conteúdo/copy, distribuição, relacionamento, performance e controle de qualidade. A vertical mobiliza as competências necessárias sem criar chats separados nem conversação livre entre personagens.

O controle automático de qualidade verifica **completude**: presença do contexto essencial, conceito, título, legenda e briefing. Ele não é uma avaliação semântica independente e não comprova que uma imagem foi produzida ou está visualmente correta. A revisão dos fatos comerciais, da legenda e da identidade continua sendo humana, com aprovação registrada. A aprovação refere-se à versão da entrega e do contexto; alterações relevantes exigem nova revisão.

## Autonomia e execução por ferramentas

A área Autonomia mantém controles e limites existentes e recebe regras por empresa, canal, ação e risco. As quatro políticas persistidas são `automatic`, `preauthorized`, `approval_required` e `forbidden`.

Cada regra contém `channel`, `action`, `risk` e `policy`. O curinga `*` abrange todas as opções naquela dimensão. A regra com mais dimensões específicas prevalece; em empate, vale a mais restritiva. Ações incluem publicar, enviar mensagem, gerar mídia, alterar campanha/perfil, excluir conteúdo/registro e operar navegador. Os controles prévios de publicação, mensagens, mídia e limites diários continuam sendo consultados.

Autorizar uma preparação não autoriza publicar ou enviar. Na operação, a execução externa exige a decisão correspondente, a aprovação atual quando aplicável, a política permitida e os dados reais da conta. Uma regra automática não cria credenciais, mídia ou evidências. Os caminhos legados sem uma ordem preservam sua compatibilidade, sujeitos às políticas explícitas e aos controles anteriores; isso não converte todos os módulos em verticais completas.

Os adaptadores e o navegador existentes foram reutilizados. Resultados de ferramentas registram, quando aplicável: status, executor, empresa, canal, conta, data/hora, identificador externo, URL, mensagem, evidência, erro, incerteza e possibilidade de nova tentativa. Falha, aceitação, interação de navegador e confirmação de negócio são estados diferentes.

Na vertical de publicação, Instagram e Google usam APIs com leitura posterior compatível com o canal. O Instagram precisa confirmar o contêiner publicado; o Google precisa confirmar o post em estado ativo. O identificador retornado pelo envio é preservado antes dessa leitura. Uma falha de conferência não dispara nova publicação. Cliques, formulários preenchidos, páginas abertas e respostas do modelo não comprovam publicação.

Perfis de navegador persistentes continuam disponíveis, mas não substituem o executor verificado da primeira vertical. Capturas/previews do navegador são transitórias; não se presume uma captura arquivada em toda evidência. Não foi implementada publicação genérica confiável em qualquer site.

## Primeira vertical: preparar uma publicação

1. Selecionar a empresa real no seletor existente e enviar o pedido pela conversa.
2. Registrar ordem, objetivo e contexto; faltar descrição do negócio, público ou identidade visual gera bloqueio com a informação necessária.
3. Criar uma campanha e quatro tarefas existentes: conceito, legenda/briefing, revisão e distribuição.
4. Produzir conceito, legenda e briefing criativo com a inteligência configurada, sem inventar dados da empresa.
5. Salvar a entrega em `content`, com `briefOnly` enquanto for apenas briefing. O Estúdio informa que uma imagem ainda precisa ser gerada ou anexada.
6. Executar o checklist de completude, encaminhar revisão humana e registrar aprovação.
7. Deixar pronta; **Executar publicação** ou **Agendar** registra a decisão seguinte. Sem data fornecida, não se inventa item de calendário.
8. Verificar política, recurso de mídia e conta. Instagram precisa de mídia compatível acessível por HTTPS; uma imagem privada local não vira automaticamente uma URL pública.
9. Executar e conferir pelo canal permitido, ou registrar bloqueio/falha/incerteza real.
10. Após confirmação, acompanhar métricas existentes. Sem medições, mostrar ausência de dados; aprendizado exige uma nota e métricas vinculadas, preservando as fontes em Marca e negócio.

O padrão da vertical é Instagram; a menção explícita ao Google escolhe esse canal. Outros canais permanecem fora desta primeira execução completa. A empresa usada é a ativa e autorizada na sessão; mencionar outra marca no texto não concede acesso nem troca silenciosamente de empresa.

## Integração entre as áreas

| ÁREA | ESTADO ANTERIOR | FONTE DE DADOS | CONEXÃO COM O KERNEL | ESTADO FINAL |
| --- | --- | --- | --- | --- |
| Conversa | Histórico, ferramentas, modos e jobs persistidos | Conversas, mensagens, eventos, jobs | Cria ordens; resposta e card usam estado salvo | Entrada e acompanhamento da mesma operação |
| Contas conectadas | Perfis locais, login e confirmação manual | `browser_profiles` e perfis Playwright | Fornece disponibilidade e permissão do navegador | Preservada; conta declarada não implica ação validada |
| Visão geral | Contagens reais e fila | Registros, jobs, operações | Resumo de objetivos e estados | Dados derivados da empresa atual |
| Marca e negócio | Contexto e conhecimento editáveis | Perfil da empresa e knowledge | Entrada da Executive e destino de aprendizado | Contexto compartilhado, sem fatos presumidos |
| Campanhas | CRUD persistente e vínculo de conteúdo | Campaigns com operationId | Campanha da ordem; estado derivado | Sem campanha paralela |
| Estúdio criativo | Conteúdo, briefing, arquivos e aprovação | Content e assets | Entregas, revisão e aprovação da operação | Mesmos artefatos com estado operacional |
| Calendário | Agenda derivada de conteúdo e fila | Content.scheduledAt e jobs | Ação de agendamento da ordem | Sem calendário paralelo ou data fictícia |
| Contatos e funil | Contatos, consentimento e etapas | Leads | Contexto de operações de relacionamento | Fluxo anterior preservado; fora da vertical de post |
| Atendimento | Histórico e rascunhos reais por contato | Messages e leads | Mensagens vinculadas exibem ligação à operação | Sem conversas recebidas inventadas |
| Captação | Formulários que gravam contatos | Pages e leads | Registros criados pela conversa podem ser vinculados | Fluxo preservado; recebimento externo requer HTTPS |
| Presença no Google | Consultas e alterações por adaptador | Integração Google e jobs | Publicação da vertical usa executor existente e conferência | Acesso real ainda precisa ser configurado e validado |
| Agentes | Competências especializadas e entregas em jobs | Catálogo e jobs | Executive registra competências por operação | Sem novos personagens ou chats de agentes |
| Tarefas | CRUD e conclusão manual | Tasks | Etapas ligadas e andamento derivado | Tarefas gerenciadas não são concluídas manualmente |
| Resultados | Métricas manuais/importadas com origem | Metrics, operações e evidências | Evidência separada de números; medida e aprendizado | Ausência de dados não vira zero ou estimativa |
| Integrações | Segredos criptografados e teste de acesso | Integrations | Configuração real consultada antes do executor | Adaptador disponível não significa conta conectada |
| Autonomia | Booleanos e limites por empresa | Company.policy | Regras por canal/ação/risco | Quatro políticas no formulário existente |
| Atividades | Jobs e audit | Jobs, audit e eventos de operação | Tentativas e transições da mesma ordem | Histórico compartilhado e auditável |

## Validação e limites reais

Resultado desta revisão: **79 verificações automatizadas aprovadas**, verificação de sintaxe e diagnóstico local aprovados, além da inspeção visual descrita abaixo. Os arquivos privados do banco, WAL e chave existentes conservaram seus hashes durante a implementação. Como a pasta não possuía Git, foi inicializado um repositório local; o primeiro commit inclui a base existente e esta consolidação. Dados locais, dependências instaladas e rascunhos de design ficam fora do commit.

As verificações automatizadas usam dados temporários, respostas de modelo e canais controlados; não publicam em contas reais. A suíte cobre autenticação/empresas e funções anteriores, além de criação via chat, plano e vínculos, transições, bloqueio por contexto, aprovação/revogação, autonomia, idempotência, artefato, evidência, falha/incerteza, pausa/retomada, conferência sem republicação, recuperação e persistência após reinício. `npm run check` verifica sintaxe e `npm test` executa a suíte. O relatório final da execução deve informar quais verificações efetivamente passaram; a existência de um teste não é evidência de execução ao vivo.

A interface preserva as 17 rotas existentes. Os testes de renderização cobrem as áreas e formulários; verificações adicionais do kernel exercitam cards, estados, tarefa derivada e idempotência do formulário. A validação visual local foi executada em Chrome headless com `node tests/visual-smoke.mjs`, separadamente de `npm test`. Cadastro, login, logout, criação/troca de empresa, preenchimento de Marca e negócio, pedido pelo chat e aprovação foram acionados pelos formulários reais. Campanhas, Estúdio, Tarefas, Calendário, Resultados, Autonomia, Atividades e Visão geral foram conferidos com a mesma ordem. Foram capturadas 15 imagens em desktop (1440 px) e mobile (390 px), inspecionadas visualmente; não houve erro de JavaScript nem overflow horizontal nos pontos medidos. O script grava banco, relatório e imagens em uma pasta temporária do sistema, usa uma única resposta de modelo simulada e bloqueia provedores externos. Exige Chrome instalado; `HELPU_VISUAL_BROWSER` permite indicar outro executável compatível. Esses testes não validam serviços externos.

O que funciona localmente: persistência, acesso isolado, ordem e plano, registros compartilhados, bloqueios, aprovação, regras, fila, retomada e exibição de evidências. A geração de copy precisa de uma conexão válida com a inteligência. A imagem é um briefing até ser produzida por um recurso configurado ou enviada pelo usuário. Agendamento e rotinas dependem de o servidor local estar ativo.

Preparado, mas não validado em conta real nesta entrega: geração de mídia, publicação Instagram/Google, relacionamento, gestão externa e leitura de métricas. Cada serviço exige credenciais, permissões, conta correta e uma validação específica. Testar credenciais comprova somente o acesso testado; não comprova publicação, envio ou operação comercial completa.

Limites restantes: reconhecimento inicial de intenção é delimitado; a vertical não cobre todos os canais ou objetivos; qualidade semântica/visual exige revisão humana; não há operação contínua na nuvem ou executor remoto; as evidências de cada adaptador precisam ser avaliadas conforme o canal; ausência de identificador externo pode impedir conciliação automática. A integração do ciclo de mensagens e de alterações comerciais em outros provedores não deve ser confundida com a vertical de publicação verificada. Nenhuma métrica de resultado da EME foi inferida e nenhuma publicação real foi feita nos testes.
