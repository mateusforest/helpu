# F09 — Apresentação comercial interativa

## Caminhos

- Equipe autorizada: **Minha empresa → Comercial Helpu** (`/portal.html#/commercial`). Usa a mesma autorização administrativa do F07, sem cadastrar outro grupo de administradores.
- Cliente: **Minha empresa → Propostas** (`/portal.html#/proposals`). Propostas desta área pertencem à conta destinatária, independentemente da empresa selecionada no cabeçalho; o nome da empresa contratante aparece na proposta.
- Apresentação pública: `/apresentacao.html?id=<identificador>`.
- Prévia da equipe: `/apresentacao.html?preview=<pedido>`, protegida por login e função de operador.

## Preparar e compartilhar

1. Crie uma apresentação na sua empresa de origem. Escolha a mensagem-base para negócios locais, imóveis, varejo, alimentação, serviços ou turismo. São pontos de partida comerciais, não a biblioteca de templates criativos do F01.
2. Personalize nome da empresa, mensagem, problema reconhecível e aplicações. Contexto específico precisa de fonte pública HTTPS e data de conferência. Não coloque dados privados, uma análise completa ou preço negociado no texto público.
3. Selecione até seis imagens ou MP4 da Biblioteca da empresa de origem, com até 3 MB cada. Dê legenda e marque demonstração ilustrativa ou material real autorizado. Não há publicação automática de arquivos privados: só os exemplos selecionados na versão liberada ficam acessíveis pela rota pública.
4. Abra a prévia restrita e confira a página. Para liberar o link, confirme o conteúdo público e a autorização dos materiais. A apresentação usa o filme institucional já existente da Helpu, identificado como filme da marca; ele não é apresentado como caso de cliente ou demonstração de resultados.
5. Copie o link e compartilhe dentro da autorização do contato. Nenhuma mensagem é enviada por este módulo.

O cliente vê aplicações, exemplos, etapas interativas de pedido/revisão/publicação e um formulário para selecionar necessidades. Não há resultados inventados, comparação fictícia apresentada como real, preço predefinido ou promessa de publicação automática. Se nenhum exemplo foi anexado, a página informa que a equipe pode apresentar materiais adequados antes da contratação.

Salvar um rascunho não altera a edição pública. Liberar novamente substitui o conteúdo visível. Desativar revoga os endpoints da página e de seus exemplos; não remove cópias que visitantes já tenham guardado. Reutilizar a base cria outro rascunho, sem copiar contexto específico ou materiais automaticamente.

## Interesses e retorno

O formulário registra nome, empresa, e-mail, necessidades e autorização restrita ao retorno solicitado por e-mail ou WhatsApp. Telefone só é armazenado quando o canal selecionado é WhatsApp. Não há autorização genérica para campanhas ou envios em massa.

Cada envio aparece na fila com a edição pública de origem. A equipe registra contato realizado, em proposta, encerrado ou **Não contatar**. Esse bloqueio impede novas propostas ou novas versões por aquela solicitação e não pode ser removido alterando a etapa; uma nova autorização deve chegar como nova solicitação.

Há chave de idempotência por envio, campo de contenção de robôs, restrição de origem e limite de repetição por e-mail/empresa persistido no banco (três novos envios por hora), além do limitador de requisições por endereço já existente. Isso não substitui proteção de borda contra ataques distribuídos; não existe CAPTCHA ou campanha automática nesta etapa.

## Proposta privada

A equipe seleciona um interesse autorizado e informa o e-mail de login de uma conta já existente na Helpu. O servidor vincula a proposta ao ID dessa conta. O nome e o e-mail são mostrados na fila; o destinatário não muda nas versões seguintes.

São obrigatórios título, valor total, validade, escopo/contas, entregas/formatos/quantidades, prazo/condição de início, revisões/suporte, exclusões, pagamento/eventual renovação e cancelamento/falhas/reembolso. Nenhum preço dos planos foi ativado. O cliente pode pedir ajuste ou aceitar explicitamente a versão vigente. Propostas vencidas ou retiradas não podem ser aceitas. Uma proposta aceita não pode ser reescrita: um novo escopo precisa de outro acordo.

A consulta e o aceite exigem autenticação da conta destinatária; conhecer o link ou o ID não dá acesso. Condições anteriores, pedidos de ajuste, versões e aceite ficam armazenados. Disponibilizar uma proposta não envia mensagem, cobra, ativa plano ou libera automaticamente uma execução. A conciliação e os direitos dos planos pertencem às frentes de cobrança e monetização. Propostas de consultoria iniciadas pelo F08 continuam no fluxo próprio de Consultorias.

## Integração e validação

- Registros separados: `commercial_page`, `commercial_interest`, `commercial_offer`; nenhuma nova migração.
- Auditoria, transações e verificação de versão em SQLite e PostgreSQL.
- Dados públicos retornam apenas a edição liberada; dados de contato, propostas, IDs internos e histórico não entram nessa resposta.
- Mídias públicas têm acesso por índice da apresentação, suporte a ranges, sem cache; não liberam o endpoint privado geral de arquivos.
- A prévia usa os arquivos autenticados; operadores só ganham acesso aos exemplos selecionados, não à biblioteca inteira de outras empresas.
- Nenhuma geração, cobrança, publicação social ou mensagem externa durante o teste.

`tests/commercial.test.mjs` verifica acesso, origem, rascunhos, revisão pública, mídia, consentimento, contenção de repetição, proposta privada, validade, versão, aceite concorrente e bloqueio de contato em SQLite e PostgreSQL.

`tests/commercial-visual.mjs` testa o caminho completo da equipe, visitante e cliente, com rede externa bloqueada, larguras 1440/390/320 px e imagens em `../output/f09`. Os valores e contatos usados são fictícios.

O código local só aparece no portal público após push e deploy. Não há apresentação de prospect real liberada por esta implementação.
