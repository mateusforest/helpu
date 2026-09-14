# Geração de imagens pela OpenAI

Novos pedidos de imagem usam a OpenAI. A fila anterior do Higgsfield continua reconhecida para conciliar tentativas antigas; o Astra deixa de recomendar essa conexão para gerar imagens.

## Como usar

Depois de atualizar o deploy, recarregue a página. Em uma conversa no modo **Conversar e executar**, peça a imagem desejada. O Astra pode criar ou reutilizar um rascunho e enfileirar a geração. Para permitir que ele gere diretamente, habilite a geração automática em **Minha empresa → Autonomia**, respeitando os limites e as regras da empresa. Também é possível usar **Gerar imagem** no conteúdo da Biblioteca; esse clique autoriza aquela geração, sem permitir publicação.

A imagem aparece na conversa quando o arquivo estiver salvo e fica disponível na Biblioteca, com prévia e download. O Instagram não precisa estar conectado para criar o arquivo.

A produção institucional que já possui uma decisão confirmada mantém as exigências de materiais oficiais. Na tela **Produção visual**, o botão **Gerar imagem-base** aparece quando essas dependências estão atendidas. A base não contém o texto e o logo; a composição final em 1080 × 1080, com a fonte e os arquivos oficiais, continua pendente. A tela distingue a resolução solicitada para a peça final da resolução efetiva da base.

## O que foi implementado

- O servidor chama `POST /v1/images/generations` com `gpt-image-2.5-sunburst`, uma imagem, qualidade média e PNG em 1024 × 1024. A chave fica no servidor.
- O arquivo retornado é validado antes do salvamento. Na nuvem, usa o armazenamento privado já existente do Supabase; localmente, usa a Biblioteca local.
- O histórico registra arquivo, hash, resolução, modelo e identificador da requisição quando disponível. O arquivo gerado não é marcado como aprovado nem publicado.
- Pedidos repetidos com o mesmo briefing reutilizam o arquivo salvo e íntegro. Falhas sem confirmação ficam pendentes de conferência; recusas explícitas permitem retomar após corrigir o acesso.
- A proposta comum permanece em revisão. Na produção institucional controlada, a imagem-base fica separada da arte final e preserva o texto, a fonte e o logo para composição.

Referência do contrato da API: [documentação oficial de geração de imagens da OpenAI](https://developers.openai.com/api/docs/guides/image-generation).

## Verificação e limites

Os testes usam respostas simuladas da OpenAI e arquivos PNG de teste. Cobrem o caminho do chat à Biblioteca, repetição, continuação em outra conversa da mesma empresa, isolamento entre empresas, políticas, falha de rede, arquivo inválido, recusa por cota e preservação da decisão institucional. Nenhuma geração paga foi executada nesta alteração.

A geração real depende do acesso ao modelo, da cota da OpenAI, do armazenamento e do worker habilitado na hospedagem. Criar a imagem não conecta o Instagram. O login do Instagram ainda exige configurar o aplicativo da Meta conforme [CONTA-E-CONEXOES.md](CONTA-E-CONEXOES.md).

Esta implementação recebe um briefing textual na API de imagem. Não inclui edição por imagem de referência, aplicação automática dos arquivos oficiais na composição final, edição de vídeo nem nova integração de publicação.
