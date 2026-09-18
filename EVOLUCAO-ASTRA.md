# Produção do Astra — edição, referências e aprovação

## Contrato do produto

O cliente envia seus materiais, descreve a edição e escolhe ou reutiliza um estilo. O Astra prepara um plano limitado aos recursos executáveis, gera um MP4 e entrega uma prévia para revisão. Aprovação é editorial: nunca autoriza publicação em redes. Ajustes criam uma nova versão e preservam a anterior. Estilos salvos pertencem à empresa e preservam parâmetros, sem carregar automaticamente mídia de pedidos anteriores.

## Primeira etapa implementada localmente

- **Biblioteca → Criar → Vídeo:** cinco estilos iniciais (claro e natural, editorial, dinâmico, imóvel e produto), catálogo de recursos, formato vertical 9:16 ou horizontal 16:9, exportação Full HD em qualidade alta ou arquivo menor.
- **Movimento e texto:** zoom de aproximação/afastamento, pan, corte, dissolução, transição lateral suave, entradas de texto por fade/subida/escala/palavras, cor de destaque, tamanho e posição. Fontes DejaVu Sans e Serif; a opção condensada usa compressão horizontal da Sans.
- **Materiais:** imagens PNG/JPEG/WebP, MP4 e uma trilha MP3/WAV/OGG. Música com volume e fades, preservação ou silêncio do áudio original e whoosh sintetizado opcional. Não há separação de voz, transcrição ou sincronização por batida nesta etapa.
- **Referências visuais:** o planejador recebe uma amostra por imagem e duas por MP4. O cliente pode marcar “Apenas referência de estilo”, impedindo que a gravação entre no resultado. A análise ajuda com composição, texto visível, cor e enquadramento; não equivale a examinar cada quadro, ouvir o áudio ou reproduzir precisamente todo efeito.
- **Prévia e aprovação:** o arquivo chega à conversa interna. Com o WhatsApp do solicitante conectado, usa a conversa vinculada e o fluxo de entrega existente. Há ações para aprovar, solicitar ajuste e criar no mesmo estilo. Ajustes preservam o original e geram outra versão; passam novamente pelos limites de uso.
- **Memória de estilo:** após aprovação, “Salvar meu estilo” guarda opções e proporções/posições das cenas por empresa. Pode ser escolhido no formulário ou por `styleId` na conversa. Fotos, textos e músicas anteriores não são reutilizados automaticamente. Ao mudar a duração, proporções incompatíveis com o limite por cena são adaptadas pelo novo plano. É persistência no banco, não treinamento do modelo.
- **Agendamentos:** pedidos avulsos e recorrentes pela conversa/API agora conservam estilo, formato, qualidade e referências. O horário inicia a geração; o resultado ainda precisa terminar e passar pela revisão do cliente.
- **Exportação e entrega:** original H.264/AAC em 1080×1920 ou 1920×1080. Acima de 15 MB, é criada uma prévia 720×1280 ou 1280×720 para a conversa; o original permanece na Biblioteca. Duração de 15 ou 30 segundos, até seis anexos, 25 MB por arquivo e 30 MB no conjunto; imagens somam até 20 MB. Não há opção 4K nesta etapa.

## Verificação desta entrega

Testes de integração usam SQLite e PostgreSQL (PGlite), sem credenciais reais ou gerações pagas. Cobrem isolamento entre empresas, aprovação antes de salvar estilo, repetição idempotente, ajustes por texto, novos parâmetros de render, manutenção das versões, música e referência que não pode virar material de cena.

FFmpeg real foi usado com materiais sintéticos para conferir exportação, duração, áudio, duas transições, amostragem visual, rejeição de mídia incompatível e prévia compactada decodificável. O teste da compactação reduz o limiar por injeção para exercitar o mesmo caminho com um arquivo pequeno.

O navegador local validou criação, aprovação, estilo salvo e ajuste em desktop e telas de 390/320 px, sem chamadas externas. Nenhum envio real a clientes ou novo teste de geração na API foi feito nesta entrega. Os resultados locais não confirmam o estado publicado nem a qualidade criativa de todos os briefs.

## Resultado final dos checks locais

- `node tests/run.mjs`: 347 testes, 344 aprovados, nenhuma falha, três testes de FFmpeg pulados por ausência das variáveis de ambiente.
- Reels vertical de 30 segundos e novos testes horizontais com FFmpeg foram executados separadamente; exportação, transições, som e compactação passaram. O teste de um serviço de render legado não foi executado nesta etapa.
- `node scripts/check.mjs`: sintaxe de 109 arquivos aprovada.
- `node scripts/build-production.mjs`: arquivos públicos e fontes verificados no Windows. A conferência do pacote Linux da API ainda deve ocorrer no build de implantação.
- Teste visual: aprovação, salvamento/reutilização de estilo, revisão e ausência de transbordamento horizontal em 390/320 px aprovados. Um teste de integração repetido na cópia de trabalho falhou por conexão local; a regressão integral no diretório principal passou, incluindo SQLite/PostgreSQL e inicialização.

## Limites que não podem ser apresentados como concluídos

Voz local (Piper/Kokoro) precisa de serviço hospedado. Rastreamento automático, máscaras semânticas, 3D e composições Hyperframes exigem integração e validação próprias. O catálogo original de 29 gravações é análise local; somente descrições técnicas e presets genéricos entram no produto, não os vídeos de terceiros. Música automática exige acervo com licença de uso registrada; por enquanto utilizar arquivo enviado ou áudio original.

Próximas etapas, nesta ordem:

1. Validar após deploy um pedido real com materiais, uma revisão, reutilização do estilo e agendamento; conferir original e prévia no WhatsApp.
2. Hospedar voz e disponibilizar acervo de música/efeitos com origem e licença registradas; incluir mixagem com redução da música durante a fala.
3. Integrar Hyperframes ao serviço online, com contrato de render, limites de tempo e testes de composição; ampliar tipografia e cenas animadas.
4. Acrescentar análise temporal, rastreamento e máscaras, com demonstração verificável antes de anunciar como disponível.

## Publicação

As instruções do repositório pedem commit local e proíbem push automático. Produção permanece na versão anterior até o usuário enviar o commit e o deploy concluir. Não considerar testes locais prova do estado publicado.

## Ajuste de duração e diagnóstico de render (18/09/2026)

Uma geração de 15 segundos com MP4, imagens, dissoluções e apenas efeitos sonoros foi rejeitada em produção na validação final. O mesmo plano e os mesmos três arquivos usados nas cenas passaram localmente com FFmpeg 6.1.1, inicialmente em 15,04 segundos; portanto a divergência exata da hospedagem ainda não foi reproduzida.

O renderizador agora normaliza relógios de vídeo/áudio antes das transições, recorta o áudio de cada trecho à duração planejada e limita a concatenação, as transições e a mixagem de efeitos à duração total solicitada. A validação de codec, resolução e duração foi preservada. Falhas registram somente medidas esperadas/obtidas, sem caminhos ou conteúdo privado.

Validação: seis testes de renderização com FFmpeg real passaram, incluindo a combinação vertical sem música; 29 testes de criação passaram em execução isolada e quatro de empacotamento passaram. A rodada de integração simultânea à renderização teve uma falha; a repetição isolada concluiu sem falhas. Sintaxe de 109 arquivos verificada. O plano real renderizou após o ajuste em 15 segundos, 1080 × 1920, e foi completamente decodificado sem erro.

A confirmação em produção depende do próximo deploy. A revisão visual também identificou gravação de tela incluída como filmagem e materiais Helpu junto de textos EME no plano já salvo; o render de diagnóstico não representa uma peça editorial aprovada.
