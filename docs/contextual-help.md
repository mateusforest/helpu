# F06 — ajuda contextual

O botão **Como usar esta tela** aparece no início da área de trabalho, depois do acesso ao guia de primeiros passos. Abre instruções na própria tela, com como fazer, exemplo, resultado esperado e recuperação de erros. **Outros assuntos** permite consultar os demais tópicos.

Há conteúdo específico para Conversa, WhatsApp, imagens/carrosséis, Reels, Biblioteca, Minha empresa, Marca, Calendário, Autonomia, Conexões, Conta e Atividades. As demais áreas recebem orientação geral. A ajuda distingue uma data editorial de publicação automática, boas-vindas de ativação do WhatsApp e uso interno de saldo do provedor.

O conteúdo é local e estático, em `dist/assets/help-content.js`. Abrir e fechar a ajuda não chama APIs, não executa IA, não cria tarefas e não altera os campos ou rascunhos da tela. Os links para outras áreas são navegação normal: salve formulários antes de sair da tela.

Para manter: atualizar o tópico junto com qualquer mudança funcional da tela. Evitar prometer capacidades futuras ou dados comerciais ainda não configurados. `contextual-help-ui.js` apresenta o conteúdo usando o diálogo acessível já existente; o botão permanece fora da área que o chat atualiza automaticamente.

## Verificações

- Testes de seleção do tópico por tela/formato, estrutura, rotas reais e ausência de chamadas de rede.
- Navegação real em navegador local com cadastro, guia, ajuda e ativação separada do WhatsApp.
- Ajuda em 320 px e desktop, sem transbordamento horizontal; fechamento com Escape; troca de assunto e navegação pelos links.
- Rascunho do chat preservado após abrir e fechar; nenhuma tarefa de IA criada durante os testes.

Os testes não usam mensagens, pagamentos ou gerações reais. A mudança só fica disponível no portal online depois de publicar o commit.
