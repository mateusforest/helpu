# Direção criativa por empresa

A Biblioteca separa referências de inspiração, materiais de produção, identidade oficial, estilos aprovados e criações. Os grupos começam recolhidos. Os arquivos e preferências pertencem à empresa autenticada; não existe aprendizado compartilhado entre clientes.

Chat e WhatsApp consultam a identidade, orientação e referências salvas. Sem direção visual, um pedido de imagem/vídeo fica pendente e recebe uma pergunta sobre referências. O briefing é preservado até o envio da referência, a autorização para propor um estilo ou o cancelamento. Receber um anexo enquanto aguarda referência retoma o pedido; a classificação explícita como material continua valendo.

Aprovar uma entrega não salva uma preferência. A ação explícita “Salvar como estilo” registra uma imagem ou vídeo aprovado para próximas produções. Referências orientam aparência; suas marcas, produtos e textos não devem ser copiados. A criação utiliza uma seleção limitada de referências para controlar tamanho e custo; não analisa toda a biblioteca a cada mensagem.

Revisões de imagens recebem a prévia anterior de cada página e mantêm os materiais e a versão original. Vídeos mantêm seu plano e materiais e usam amostragem visual quando o renderizador oferece esse recurso. Não há promessa de reprodução exata de fontes/efeitos, rastreamento automático ou análise de desempenho sem métricas.

Validação: testes HTTP de isolamento, pergunta sem chamada à IA, retomada, cancelamento, aprovação, estilo salvo, revisão e webhook do WhatsApp com provedores simulados; navegador real com upload, classificação, orientação e layout móvel. Não foram feitas gerações pagas nem enviados avisos reais a clientes.

## Catálogo da administração

Administração → Biblioteca de templates permite adicionar imagens/MP4, nome, orientação e até cinco setores. Rascunhos e arquivados não aparecem aos clientes. Publicados aparecem em Biblioteca → Templates da Helpu, com filtro e busca. “Usar como inspiração” faz uma cópia privada na empresa cliente; não dispara geração nem consumo. Arquivar remove o item do catálogo, preservando referências já adotadas. Setores sugeridos podem ser complementados no formulário.

## Aprovação e saldo do plano

Novos pedidos vinculados a um plano comercial reservam capacidade enquanto estão em produção/aprovação. O painel separa disponível, reservado e consumido. Uma entrega concluída só é consumida após aprovação explícita; extras autorizados só ficam faturáveis nessa etapa. Campanhas/planejamentos não são debitados em bloco: cada entrega segue sua própria aprovação. Carrossel é uma entrega extra aprovada em conjunto, segundo o catálogo comercial existente.

Antes de aprovar, o endpoint autenticado dos arquivos e o envio do WhatsApp resolvem o original para uma prévia com marca-d'água e maior dimensão de 640 px. O original privado não é redirecionado nem enviado; se não houver renderizador/ocorrer erro na prévia, o acesso falha fechado. Após aprovar, o arquivo original é liberado e registrado na conversa para entrega pelo WhatsApp conforme vínculo e janela disponíveis. Prévias protegidas ficam fora da lista de materiais da empresa.

Uma rodada de ajustes do mesmo briefing fica incluída, preservando materiais e versão anterior. A aprovação da versão ajustada consome a reserva original uma única vez. Não há versões paralelas do mesmo pedido; novas tentativas após falhas técnicas continuam permitidas. Prévias concluídas não liberam automaticamente reservas por falta de aprovação. Arquivos anteriormente aprovados continuam liberados quando se solicita ajuste.

Essa política vale para novos pedidos com reserva comercial, sem alteração retroativa das entregas já contabilizadas. Empresas de teste sem plano não recebem uma cobrança fictícia. Uso técnico dos provedores continua registrado a cada execução; aprovação não desfaz esse custo. Marca-d'água reduz abuso, mas não impede captura de tela ou tentativas de remoção.

Requisitos de produção: FFmpeg e fonte DejaVu incluídos no empacotamento existente. O catálogo usa os registros e armazenamento privados atuais, sem migração. Testes cobrem SQLite/PostgreSQL, falha fechada de prévia, liberação do original, aprovação idempotente, ajuste anterior à aprovação, controle de acesso ao catálogo e publicação/adoção no navegador. A marca-d'água foi renderizada e inspecionada em PNG e MP4 sintéticos.
