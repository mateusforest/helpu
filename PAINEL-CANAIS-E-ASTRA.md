# Canais no painel, Astra Vídeo e situação operacional

Conferência em 14/09/2026 do código do Helpu, da base local e da pasta ASTRA-VIDEO. Esta conferência não acessou o banco da Vercel nem executou gerações, publicações, mensagens ou anúncios reais. Registros locais não comprovam o estado atual da produção.

## O que está implementado e o que foi comprovado

| Recurso | Implementação encontrada | Evidência e pendência |
|---|---|---|
| Chat interativo | `portal/conversation.mjs` envia histórico, contexto da empresa e ferramentas à Responses API. Permite conversar, planejar, criar rascunhos e enfileirar ações. | A base local tem validação de conexão e chamada de ferramenta com Astra. As quatro execuções locais de conversa registradas tiveram bloqueios de configuração ou erro 429, anteriores à validação. Validar uma conversa completa na Vercel continua necessário. |
| Textos e conteúdos | Agentes estruturam conteúdos e persistem as peças. | Duas execuções de agente concluídas e três registros de conteúdo na base local. Não são três imagens ou vídeos renderizados. |
| Imagens e vídeos no Helpu | Os trabalhos `image` e `video` ainda usam `integration(org, 'higgsfield')` em `portal/core.mjs`. | Higgsfield foi removido das opções visíveis, mas o motor não foi substituído. Não há trabalhos de geração concluídos na base examinada. A função OpenAI `imageAccess` verifica acesso ao modelo; não gera imagens. |
| Campanhas de tráfego | O adaptador Meta Ads solicita criação de uma campanha pausada e pode consultar métricas. | Não implementa sozinho toda a sequência de conjunto de anúncios, segmentação, criativo e ativação. A base local examinada não tem campanhas cadastradas. |
| Automação | Fila persistente, agendamento, rotina diária, limites e processamento de mensagens recebidas. | Na empresa local examinada, a rotina está habilitada, mas `autoMedia`, `allowPublishing` e `autoReply` estão desabilitados. A execução na nuvem depende do worker e das conexões. |
| Astra Vídeo | Aplicação React/Vite com servidor Node, FFmpeg, projetos, importação de arquivos, timeline, preview e exportação. Há MP4s na pasta `exports`. | É um editor local separado. O Helpu declara corretamente `videoEditing: false`. O interpretador de comandos do editor usa regras locais; a conversa ampla com Astra ainda precisa de ferramentas que editem os projetos. |
| Geração no editor Astra | Adaptadores fal e ElevenLabs, fila e armazenamento de resultados. | Código de integração não comprova credenciais, saldo nem uma geração concluída. Nenhuma geração foi executada nesta conferência. |

## Experiência proposta para o painel

Manter os cinco destinos inferiores. A conversa continua sendo a entrada principal.

- **Minha empresa → Conexões:** Instagram, WhatsApp, Facebook/Meta Ads e Google. Cada canal pode oferecer conexão oficial e, quando existir infraestrutura validada, acesso à sua tela remota. O Google existente no Helpu é Perfil da Empresa; Google Ads é uma integração adicional.
- **Biblioteca → Vídeos → Editar no Astra:** abrir o editor, com timeline e preview dentro do painel. O usuário pode ajustar manualmente; pedidos do chat usam o mesmo projeto. A exportação retorna como um novo arquivo na biblioteca.
- **Conversa:** apresentar o andamento e o resultado de cada ação, diferenciando texto preparado, mídia gerada, conteúdo agendado e publicação confirmada.

### Mostrar as telas originais dos canais

O caminho técnico é um navegador remoto com tela transmitida ao Helpu e controle de mouse/teclado. Apenas incluir a URL de um site em um `iframe` não garante funcionamento: o site controla quais páginas podem incorporá-lo. Ver [MDN: frame-ancestors](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/frame-ancestors).

O serviço de navegador precisa de perfis separados por empresa e canal, armazenamento privado da sessão, acesso autenticado à transmissão e um único controlador por vez. Durante login, confirmação em duas etapas e desafios, o controle fica com o usuário. A sessão pode expirar ou ser revogada pelo serviço; não se deve prometer autenticação permanente. Cada canal precisa passar por teste real de login, retomada e ação antes de ser anunciado como operacional.

O código atual do Helpu bloqueia navegador em nuvem com `blocked_persistent_browser_required`. As funções atuais da Vercel têm duração limitada; um processo aberto continuamente precisa de infraestrutura apropriada além desse runtime. Ver [limites das Vercel Functions](https://vercel.com/docs/functions/limitations). A escolha e o custo da hospedagem desse serviço ainda não foram definidos.

As APIs oficiais continuam úteis para publicação, atendimento e métricas, mesmo com a tela remota disponível. O acesso visual não amplia as funções ou permissões concedidas pelos serviços.

### Integrar o Astra Vídeo existente

O editor em `ASTRA-VIDEO/editor` escuta apenas em `127.0.0.1:4310`. Seu servidor rejeita hosts e origens externos e trabalha com arquivos locais. A biblioteca de projetos mantém um projeto ativo na instância; isso precisa de isolamento antes de oferecer a vários clientes. Expor esse servidor local diretamente não constitui uma integração pronta para produção.

A integração precisa conectar autenticação e empresa do Helpu, armazenamento dos projetos e arquivos, processamento de preview/exportação em serviço apropriado e retorno do MP4 à biblioteca. As ferramentas do chat devem aplicar operações estruturadas com controle de versão, preservação do original e acompanhamento da exportação. A interface pode então ser incorporada com os acessos necessários e um modo amplo de edição.

## Sequência para fechar a operação

1. Validar conversa real com contexto, resposta, ferramenta e resultado persistido no ambiente publicado.
2. Substituir o caminho antigo de mídia e comprovar geração de uma imagem do pedido ao arquivo final.
3. Conectar o Astra Vídeo, primeiro com importação, edição manual e exportação; depois adicionar edição por conversa usando o mesmo projeto.
4. Ativar e validar os canais oficiais com as credenciais da aplicação.
5. Implementar o navegador remoto e validar as sessões de cada serviço.
6. Validar agendamento, publicação, atendimento e análise de resultados, com as permissões da empresa e evidências de execução.

Esses itens são trabalho pendente. Este documento registra a avaliação e a proposta; não declara as novas integrações instaladas ou o Helpu 100% autônomo.
