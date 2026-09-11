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

Na preparação geral, o controle automático de qualidade verifica **completude**: presença do contexto essencial, conceito, título, legenda e briefing. Na primeira ativação explícita do Instagram, a extensão abaixo acrescenta revisão contextual por Responses, incluindo os pixels da imagem selecionada. Nenhuma dessas verificações dispensa a revisão humana dos fatos comerciais, da legenda e da identidade. A aprovação refere-se à versão da entrega e do contexto; alterações relevantes exigem nova revisão.

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
7. Deixar pronta; na preparação geral, **Executar publicação** ou **Agendar** registra a decisão seguinte. A primeira ativação explícita no Instagram usa o fluxo de revisão final descrito abaixo e bloqueia esses caminhos genéricos. Sem data fornecida, não se inventa item de calendário.
8. Verificar política, recurso de mídia e conta. Instagram precisa de mídia compatível acessível por HTTPS; uma imagem privada local não vira automaticamente uma URL pública.
9. Executar e conferir pelo canal permitido, ou registrar bloqueio/falha/incerteza real.
10. Após confirmação, acompanhar métricas existentes. Sem medições, mostrar ausência de dados; aprendizado exige uma nota e métricas vinculadas, preservando as fontes em Marca e negócio.

O padrão da vertical é Instagram; a menção explícita ao Google escolhe esse canal. Outros canais permanecem fora desta primeira execução completa. A empresa usada é a ativa e autorizada na sessão; mencionar outra marca no texto não concede acesso nem troca silenciosamente de empresa.

## Integração entre as áreas

| ÁREA | ESTADO ANTERIOR | FONTE DE DADOS | CONEXÃO COM O KERNEL | ESTADO FINAL |
| --- | --- | --- | --- | --- |
| Conversa | Histórico, ferramentas, modos e jobs persistidos | Conversas, mensagens, eventos, jobs | Cria ordens; resposta e card usam estado salvo | Entrada e acompanhamento da mesma operação |
| Contas conectadas | Perfis locais, login e confirmação manual | `browser_profiles`, validação e perfis Playwright | Mostra sessão, identidade e disponibilidade do executor separadamente | Preservada; navegador aberto ou conta declarada não implica publicação validada |
| Visão geral | Contagens reais e fila | Registros, jobs, operações | Resumo de objetivos e estados | Dados derivados da empresa atual |
| Marca e negócio | Contexto e conhecimento editáveis | Perfil, profileEvidence e knowledge | Entrada da Executive, origem por campo e histórico | Contexto compartilhado, versionado e identificado como fornecido, inferido ou pendente |
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
| Integrações | Segredos criptografados e teste de acesso | Integrations e records/connection_validation | Metadados da validação e confirmação humana da identidade detectada | Modelo retornado, execução de teste e conta identificados; acesso não significa publicação validada |
| Autonomia | Booleanos e limites por empresa | Company.policy | Regras por canal/ação/risco | Quatro políticas no formulário existente |
| Atividades | Jobs e audit | Jobs, audit e eventos de operação | Tentativas e transições da mesma ordem | Histórico compartilhado e auditável |

## Validação e limites reais

Resultado da consolidação inicial (baseline `e5f32d9`): **79 verificações automatizadas aprovadas**, verificação de sintaxe e diagnóstico local aprovados, além da inspeção visual descrita abaixo. Os arquivos privados do banco, WAL e chave existentes conservaram seus hashes durante a implementação. Como a pasta não possuía Git, foi inicializado um repositório local; o primeiro commit inclui a base existente e esta consolidação. Dados locais, dependências instaladas e rascunhos de design ficam fora do commit.

As verificações automatizadas usam dados temporários, respostas de modelo e canais controlados; não publicam em contas reais. A suíte cobre autenticação/empresas e funções anteriores, além de criação via chat, plano e vínculos, transições, bloqueio por contexto, aprovação/revogação, autonomia, idempotência, artefato, evidência, falha/incerteza, pausa/retomada, conferência sem republicação, recuperação e persistência após reinício. `npm run check` verifica sintaxe e `npm test` executa a suíte. O relatório final da execução deve informar quais verificações efetivamente passaram; a existência de um teste não é evidência de execução ao vivo.

A interface preserva as 17 rotas existentes. Os testes de renderização cobrem as áreas e formulários; verificações adicionais do kernel exercitam cards, estados, tarefa derivada e idempotência do formulário. A validação visual local foi executada em Chrome headless com `node tests/visual-smoke.mjs`, separadamente de `npm test`. Cadastro, login, logout, criação/troca de empresa, preenchimento de Marca e negócio, pedido pelo chat e aprovação foram acionados pelos formulários reais. Campanhas, Estúdio, Tarefas, Calendário, Resultados, Autonomia, Atividades e Visão geral foram conferidos com a mesma ordem. Na ampliação da ativação Instagram, foram capturadas 27 imagens em desktop (1440 px) e mobile (390 px), com inspeção visual dos fluxos e controles; não houve erro de JavaScript nem overflow horizontal nos pontos medidos. O script grava banco, relatório e imagens em uma pasta temporária do sistema, usa duas respostas de modelo simuladas e bloqueia provedores externos. Exige Chrome instalado; `HELPU_VISUAL_BROWSER` permite indicar outro executável compatível. Esses testes não validam serviços externos.

O que funciona localmente: persistência, acesso isolado, ordem e plano, registros compartilhados, bloqueios, aprovação, regras, fila, retomada e exibição de evidências. A geração de copy precisa de uma conexão válida com a inteligência. A imagem é um briefing até ser produzida por um recurso configurado ou enviada pelo usuário. Agendamento e rotinas dependem de o servidor local estar ativo.

Preparado, mas não validado em conta real nesta entrega: geração de mídia, publicação Instagram/Google, relacionamento, gestão externa e leitura de métricas. Cada serviço exige credenciais, permissões, conta correta e uma validação específica. Testar credenciais comprova somente o acesso testado; não comprova publicação, envio ou operação comercial completa.

Limites restantes: reconhecimento inicial de intenção é delimitado; a vertical não cobre todos os canais ou objetivos; qualidade semântica/visual exige revisão humana; não há operação contínua na nuvem ou executor remoto; as evidências de cada adaptador precisam ser avaliadas conforme o canal; ausência de identificador externo pode impedir conciliação automática. A integração do ciclo de mensagens e de alterações comerciais em outros provedores não deve ser confundida com a vertical de publicação verificada. Nenhuma métrica de resultado da EME foi inferida e nenhuma publicação real foi feita nos testes.

## Ativação controlada da primeira publicação no Instagram

Esta extensão reaproveita a mesma operação, o mesmo conteúdo, as mesmas tarefas, a biblioteca privada e a fila. Não cria uma página de publicação ou uma segunda campanha. O pedido explícito de publicação no Instagram identifica a operação com `firstInstagram`. A aprovação habitual de entregas continua sendo uma revisão interna e não publica.

Marca e negócio registra a origem de cada informação em `company.profileEvidence`: fornecida pelo usuário, inferida, desconhecida, verificada ou pendente de confirmação, com versão, autor, instante e referência quando disponíveis. O formulário mostra a origem e envia `expectedUpdatedAt` para evitar sobrescrever uma versão editada por outra sessão. Informações comerciais da EME somente podem vir do usuário ou de uma fonte identificada; o contexto de teste permanece em bases temporárias.

Em Integrações, a validação da inteligência expõe modelo configurado e retornado, instante, latência, saída estruturada e chamada de ferramenta quando essas informações foram efetivamente retornadas pelo teste. A identidade detectada pela API do Instagram aparece com usuário e identificador. Ela exige um clique específico para confirmar que é a conta da empresa ativa. Confirmar a identidade não autoriza publicar. Sessão de navegador, identidade declarada/confirmada e executor disponível são estados distintos; os perfis locais ainda não fornecem publicação genérica validada.

O usuário seleciona ou envia uma imagem real pela biblioteca da conversa. Anexar uma referência não aprova a mídia: para exatamente uma imagem, há uma confirmação opcional e inicialmente desmarcada de que esse arquivo é a mídia aprovada. Marcar essa confirmação acrescenta uma declaração explícita ao pedido; trocar o arquivo, conversa ou empresa limpa a seleção. A operação vincula o arquivo aprovado, hash e versão. A aprovação de mídia ainda não autoriza a publicação.

**Revisar publicação** executa as verificações e abre o diálogo existente com empresa, conta, mídia privada, legenda, canal, formato, executor, versões e pendências. O primeiro executor aceita uma única imagem JPEG de feed, até 8 MB, largura entre 320 e 1440 px e proporção entre 4:5 e 1,91:1. A API exige a mesma imagem em URL HTTPS pública: o portal compara os bytes com o hash aprovado. A biblioteca privada não é publicada automaticamente, nem um briefing é convertido em imagem pronta.

A revisão técnica verifica mídia e conta; a revisão contextual usa a inteligência validada e registra o resultado real. Ela não dispensa avaliação humana dos fatos, imagem, identidade visual e legenda. A prévia só habilita **Aprovar e publicar agora** quando `publication.status=ready_for_approval`, não há bloqueios e a operação não está pausada. O clique envia `approve_publish` com o `snapshotId` exibido. A autorização fixa contexto, empresa, conta, mídia e hash, legenda e versões; qualquer mudança exige nova revisão. Abrir a prévia ou aprovar entregas não dispara esse pedido.

A execução permanece sujeita à Autonomia, à idempotência e ao limite desta fase de uma única publicação explicitamente autorizada. Um estado incerto exige conferência e não permite publicação automática repetida. Evidência de publicação e leitura de métricas são operações separadas: campo não retornado pelo Instagram continua desconhecido. O agendamento de verificações depende de o servidor local permanecer ligado.

Na inspeção que iniciou esta fase, faltavam **mídia real aprovada, chave válida da inteligência e conta Instagram confirmada**. Esses são bloqueios independentes. Além deles, a execução depende de permissões da conta e URL pública da mídia idêntica à versão aprovada. A implementação e as simulações locais não provam que uma conta real da EME publicou, nem que houve resultado de marketing. A confirmação manual de conta e a autorização final de publicação pertencem ao usuário. Qualquer validação ao vivo deve registrar sua evidência específica; não há reivindicação de sucesso ao vivo neste documento.

A conferência do hash da URL pública ocorre antes de o serviço receber a mídia. A leitura posterior valida conta, legenda, contêiner, identificador, permalink e tipo retornados pelo canal; ela não promete igualdade byte a byte de imagens que o Instagram reencoda. A revisão humana da imagem publicada continua necessária. Em estado incerto, **Vincular publicação encontrada** aceita o identificador numérico da publicação e agenda somente a conferência. Colar o identificador não conclui a operação, não comprova publicação e não dispara novo envio.

A ampliação de `tests/visual-smoke.mjs` também valida upload JPEG sintético, consentimento de mídia inicialmente desmarcado, vínculo do hash e bloqueio real por conta ausente. Para inspecionar o diálogo pronto e seu botão em desktop/mobile, o teste injeta exclusivamente na base temporária um snapshot visual `TEST ONLY`: o clique final envia o snapshot, mas o backend real recusa a publicação sem conta. Esse cenário verifica interface e proteção, não uma revisão de IA nem publicação bem-sucedida. O formulário de vínculo de publicação incerta também foi inspecionado. A execução local produziu zero erros de JavaScript, zero chamadas de provedores e nenhuma tarefa de publicação.

Para reparar falta de mídia ou escolher outra versão antes da publicação, **Selecionar mídia aprovada** abre a biblioteca dentro da operação existente, permite upload privado e exige nova confirmação explícita. A ação `select_asset` envia `assetId`, `approved: true` e `expectedVersion`; registra a escolha na mesma ordem e invalida snapshot e aprovação anteriores. O usuário usa **Retomar operação** para continuar. Essa recuperação não exige um novo pedido no chat, não duplica a campanha e não publica a mídia.

### Dados e execução reutilizados nesta extensão

Não há nova migration ou tabela. `companies.profile._evidence` guarda a origem por campo, exposta como `company.profileEvidence`; registros `knowledge` mantêm o histórico das alterações. `records` com tipo interno `connection_validation` guarda validações de provedor e identidade, sem credenciais. `operations.publication` guarda snapshot, versão do artefato, hash SHA-256 dos bytes, versão da legenda, conta, aprovação, intenção e tentativas. `content`, `assets`, `jobs`, `conversation_events` e `metrics` permanecem as fontes existentes das telas.

O worker exige que tanto o conteúdo quanto o job correspondam à autorização da operação. A primeira publicação só nasce de `approve_publish`; tentativas incertas não são repetidas. A revisão possui um identificador próprio para impedir que um parecer antigo sobrescreva o mais recente. Validações de integração também descartam respostas substituídas por outra configuração ou teste.

Os estados específicos são `published_verified`, `publication_uncertain` e `publication_failed`, subordinados aos estados existentes do kernel. Verificação de publicação pode continuar depois de 24 horas quando há identificador; o prazo de criação de um contêiner não cancela uma conferência de leitura. Um identificador informado manualmente é registrado como candidato declarado até a plataforma confirmar conta, legenda, contêiner e mídia. Captura de tela não é uma evidência obrigatória do executor API, e não se cria uma captura fictícia.

Após confirmação, quatro consultas entram na fila persistente: inicial, 1 hora, 24 horas e 7 dias. Reiniciar preserva essas consultas. O servidor deve permanecer ativo para executá-las; enquanto desligado, ficam pendentes. Snapshots preservam somente os valores retornados, inclusive zero quando o canal efetivamente o retorna, e registram campos indisponíveis. Não se somam snapshots cumulativos como se fossem períodos independentes.

Limites técnicos desta etapa: somente JPEG de feed no executor API; acesso público à mesma mídia precisa ser providenciado pelo usuário. A consulta da URL usa HTTPS, endereço IPv4 público validado e fixado na conexão, sem seguir redirecionamentos. Hash igual no momento da consulta não garante que um servidor externo manterá o arquivo imutável até a coleta pelo Instagram. Não foram implementados executor de publicação pelo navegador, vídeo/reels nesta aprovação final, hospedagem pública de arquivos privados ou conciliação sem contêiner de origem.

### Resultado da ativação local em 11/09/2026

Validação final desta extensão: **108 testes aprovados**, sintaxe de **30 arquivos** e `npm run doctor` aprovados. A inspeção visual produziu **27 capturas** em desktop/mobile, sem erros JavaScript ou chamadas reais a provedores. HTTP na instância local respondeu 200 para landing, login e cadastro; o portal protegido respondeu 302 para login sem sessão. Os testes de conta, troca de empresa, retomada, aprovação, concorrência, falha/incerteza e métricas usaram exclusivamente bases temporárias e executores controlados.

Baseline confirmado: `e5f32d9`, árvore limpa antes das alterações. A empresa EME já existia e os campos de contexto estavam vazios. Foram preenchidos descrição/categoria e recursos, público, posicionamento/assinatura, identidade visual, tom/frase validada e restrições. Todos ficaram na versão 1 com origem `supplied_by_user` e referência à instrução direta de ativação; nenhum valor existente foi substituído. As restrições excluem Financeiro do posicionamento e impedem inventar preços, clientes, crescimento, economia ou conversão.

A leitura da instalação real após o registro confirmou **zero arquivos de mídia, nenhuma integração cadastrada, nenhuma identidade Instagram confirmada e zero jobs de publicação**. Há uma ordem anterior persistida, bloqueada com a mensagem “Conecte a inteligência da Helpu em Integrações para executar esta ação.” Não foi criada uma ordem fictícia de publicação para completar a validação. Um pedido de publicação sem mídia aprovada recebe `blocked_missing_approved_asset` no novo fluxo.

Consequentemente, nenhum provedor/modelo foi validado ao vivo, nenhum artefato recebeu aprovação final, nenhum executor publicou, e não há URL, identificador externo, evidência de publicação ou métrica real para relatar. A sessão existente do servidor na porta 4173 precisa ser reiniciada pelo seu inicializador para carregar o backend alterado. Login, configuração da inteligência, confirmação da conta, seleção de mídia e aprovação final continuam pendentes na interface real. A ferramenta de controle de navegador desta sessão não encontrou navegador disponível; isso limita a condução assistida ao vivo, além dos bloqueios de dados já constatados.

Os contratos foram consultados na [documentação oficial de saídas estruturadas da OpenAI](https://developers.openai.com/api/docs/guides/structured-outputs) e na [coleção oficial da Meta no Postman](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api). Essas referências orientam a implementação; não são evidência de acesso à conta EME. As páginas de referência do domínio developers.facebook.com retornaram HTTP 429 nesta consulta.

Resultados também lê `records.metrics[].snapshot` das consultas do Instagram. O painel existente mostra alcance, visualizações, curtidas, comentários, salvamentos e compartilhamentos por consulta (inicial/1h/24h/7d), preservando fonte, instante, publicação e conta quando retornados. Zero informado pelo canal aparece como zero; valor ausente permanece indisponível com o motivo recebido, sem inferência. Os snapshots acumulados ficam fora das somas, gráfico e tabela de medições legados, evitando somar repetidamente o mesmo acumulado. Fixtures visuais marcadas `TEST ONLY` conferem essa apresentação sem importar números para a base real.
