# Conversa mais simples

A conversa mantém a navegação inferior e passa a priorizar as mensagens:

- As respostas, inclusive as já salvas, exibem parágrafos, negrito, listas, citações, tabelas e blocos de código. O texto original permanece no histórico.
- Estados como `understanding` aparecem em português, inclusive nos registros antigos. Novos eventos já são gravados com uma descrição em português.
- O plano, os registros e os controles ficam em **Andamento e entregas**, recolhidos inicialmente. Aprovação pendente, falha e bloqueio continuam sinalizados no resumo.
- O chat só mostra pendências de produção vinculadas às operações daquela conversa.
- Enter envia a mensagem; Shift + Enter insere uma quebra de linha.
- As instruções para novas respostas pedem uma conversa natural, com perguntas objetivas quando necessário. O resumo técnico da operação deixa de ser acrescentado automaticamente à resposta; continua nos registros operacionais.

## Verificação local

`node tests/chat-format.test.mjs` confere a formatação, os estados históricos e o tratamento seguro de HTML e links. `node tests/conversation-ui.test.mjs` cobre a troca de conversa, os avisos e a apresentação dos detalhes. `node tests/conversation.test.mjs` verifica a execução com ferramentas simuladas e a preservação dos registros.

`node tests/chat-visual.mjs` abre o Chrome sem janela, com uma conta temporária e respostas simuladas. Confere larguras de 1440, 390 e 320 pixels, envio pelo teclado, detalhes durante atualizações e texto seguro. As capturas ficam em `HELPU_QA_OUTPUT` ou em `../preview`.

A validação usa dados de teste e não chama provedores de IA. A mudança de tom depende das próximas respostas do modelo; mensagens antigas recebem apenas a formatação. Este ajuste não habilita geração de mídia ou publicação em redes sociais.
