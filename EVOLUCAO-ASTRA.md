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
- **Exportação e entrega:** original H.264/AAC em 1080×1920 ou 1920×1080. Acima de 15 MB, é criada uma prévia 720×1280 ou 1280×720 para a conversa; o original permanece na Biblioteca. Duração de 15 ou 30 segundos, até oito anexos no Reels (seis em imagens), 25 MB por arquivo e 30 MB no conjunto; imagens somam até 20 MB. Não há opção 4K nesta etapa.

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


## Contexto e recebimento pelo WhatsApp (18/09/2026)

Diagnóstico confirmado na conversa real e no código: anexos sem legenda viravam instruções artificiais de usuário, cada um gerando uma execução de IA. O consumidor processava um por vez, atrasava os comandos reais e esgotava a cota. Na sequência analisada, o comando para usar música acabou bloqueado pela cota; a resposta sem música era do comando anterior. A retomada também escolhia a última mensagem da conversa, mesmo quando pertencia a outro pedido.

Correções:

- Reúne eventos após seis segundos sem novas mensagens (HELPU_WHATSAPP_BATCH_MS, entre zero e quinze segundos). Conserva ordem de envio/recebimento, assinatura, isolamento da empresa, vínculo e deduplicação. Registros duráveis de lote permitem retomar downloads sem criar novamente o pedido. A continuação autenticada do worker também acompanha conversas e entradas pendentes.
- Arquivos sem legenda têm confirmação determinística, sem IA ou nova ordem de produção. O comando seguinte recebe o conjunto de referências da sessão de envio; imagens/PDFs efetivamente acompanham a chamada. Recibos antigos são neutralizados no contexto, sem reescrever o histórico do cliente.
- Execução vinculada à mensagem original por job_id; retomada usa rootJobId. O histórico termina nessa mensagem e não absorve anexos de outro pedido posterior. Um novo conjunto de uploads separado por mais de quinze minutos substitui o conjunto implícito anterior.
- Instruções distinguem empresa ativa de marca visível nas referências, priorizam correções do cliente e evitam repetir perguntas sobre um objetivo já definido. Referências de estilo não devem virar filmagem. Essas orientações de linguagem dependem do modelo e ainda exigem avaliação em produção; não representam garantia de entendimento irrestrito.
- A correção explícita de música prevalece sobre opções antigas na ferramenta. MP4 com áudio pode fornecer a trilha; não há separação de música/voz. musicAssetId null não volta a selecionar automaticamente um áudio anexado.
- “Todas as imagens” gera uma lista de materiais obrigatórios, aumenta o número de cenas necessário e valida presença antes de renderizar. Até oito referências por Reels; excedentes ficam preservados e pedem seleção, sem cortes silenciosos. Imagens isoladas mantêm limite de seis referências.
- Respostas de enfileiramento devem ser breves e baseadas no retorno real da ferramenta. Cada formato usa chave estável por execução para evitar pedidos duplicados no mesmo turno.

Validações locais desta rodada: 97 testes direcionados passaram em execução sequencial, incluindo SQLite e PostgreSQL/PGlite, álbuns, debounce, replay, cotas, retomada com anexos posteriores, escolha de música e omissão de imagens. Seis testes com FFmpeg 6.1.1 real passaram, incluindo trilha extraída de MP4, efeitos sem música, duração, resolução, compactação e decodificação completa. Verificação de sintaxe: 111 arquivos. A execução inicial dos testes de banco em paralelo teve falha transitória de conexão local; a execução sequencial passou.

Produção observada estava no commit 1e66a68. Os dois renders recentes falharam no FFmpeg com código 234, sem detalhes suficientes no log para atribuir causa exata. Os decodificadores das transições agora limitam threads em cada entrada; o diagnóstico registra etapa e categoria sem vazar conteúdo ou caminhos. Isso é uma mitigação e melhoria de diagnóstico, não confirmação da correção daquele erro na hospedagem. A cota da EME continua em 20 execuções/dia; não foi aumentada ou zerada nesta rodada.

Após deploy: enviar um álbum e um pedido com mudança de instrução; confirmar um único pedido, os materiais escolhidos, a resposta da marca correta e a prévia real no WhatsApp. Repetir a requisição não deve duplicar produção nem entrega. Testes locais usam respostas simuladas da IA e Meta; não foi gerado conteúdo pago nem enviada mensagem a clientes. Base técnica para contexto: [documentação oficial de estado de conversa da OpenAI](https://developers.openai.com/api/docs/guides/conversation-state).

Suíte geral desta rodada: 368 testes, 365 aprovados, zero falhas e três testes de renderização pulados por configuração. Os seis testes do renderizador atual foram executados separadamente com FFmpeg real; o teste de render do serviço legado continua fora desta validação.

Após a revisão final: mais 64 testes direcionados de WhatsApp, retomada de lote após interrupção, contexto, interface e empacotamento passaram; a última rodada de 42 testes de criação/contexto/worker também passou. Build público no Windows e sintaxe de 111 arquivos aprovados. O pacote Linux e o comportamento real após deploy permanecem sujeitos à validação na hospedagem.
`
`#`#` `1`8`/`0`9`/`2`0`2`6` `—` `c`o`t`a`s` `d`a` `E`M`E` `e` `e`r`r`o` `4`2`9`
`
`O` `p`o`r`t`a`l` `d`e` `p`r`o`d`u`ç`ã`o` `c`o`n`f`i`r`m`o`u` `o`s` `v`a`l`o`r`e`s` `s`a`l`v`o`s` `p`e`l`o` `c`l`i`e`n`t`e`:` `3`0` `e`x`e`c`u`ç`õ`e`s` `d`e` `I`A`,` `8` `m`í`d`i`a`s` `e` `3`0` `m`e`n`s`a`g`e`n`s`.` `A` `v`a`l`i`d`a`ç`ã`o` `d`a` `c`o`n`e`x`ã`o` `O`p`e`n`A`I` `t`a`m`b`é`m` `r`e`t`o`r`n`o`u` `H`T`T`P` `4`2`9`.` `A` `v`e`r`s`ã`o` `p`u`b`l`i`c`a`d`a` `d`e`s`c`a`r`t`a`v`a` `o` `c`ó`d`i`g`o` `e`s`p`e`c`í`f`i`c`o` `d`o` `e`r`r`o`;` `p`o`r`t`a`n`t`o`,` `n`ã`o` `f`o`i` `p`o`s`s`í`v`e`l` `d`i`s`t`i`n`g`u`i`r` `s`a`l`d`o`/`c`r`é`d`i`t`o` `d`e` `l`i`m`i`t`e` `t`e`m`p`o`r`á`r`i`o` `n`e`s`s`a` `v`e`r`s`ã`o`.` `N`ã`o` `a`t`r`i`b`u`i`r` `o` `e`r`r`o` `a`t`u`a`l` `a` `u`m`a` `f`a`l`h`a` `a`o` `s`a`l`v`a`r` `a` `a`u`t`o`n`o`m`i`a`.`
`
`I`m`p`l`e`m`e`n`t`a`ç`ã`o`:`
`-` `V`a`l`o`r` `e`x`p`l`í`c`i`t`o` `u`n`l`i`m`i`t`e`d` `p`a`r`a` `o`s` `t`r`ê`s` `l`i`m`i`t`e`s` `i`n`t`e`r`n`o`s`.` `S`e`m` `c`o`n`v`e`r`s`ã`o` `s`i`l`e`n`c`i`o`s`a` `p`a`r`a` `u`m` `t`e`t`o` `a`r`b`i`t`r`á`r`i`o`.` `H`a`b`i`l`i`t`a`ç`ã`o` `r`e`s`t`r`i`t`a` `p`o`r` `e`m`p`r`e`s`a`,` `v`i`a` `p`o`l`í`t`i`c`a` `a`d`m`i`n`i`s`t`r`a`d`a` `o`u` `H`E`L`P`U`_`U`S`A`G`E`_`T`E`S`T`_`O`R`G`S`;` `a` `A`P`I` `d`e` `e`m`p`r`e`s`a` `n`ã`o` `p`e`r`m`i`t`e` `a`u`t`o`-`h`a`b`i`l`i`t`a`r` `e`s`s`a` `p`e`r`m`i`s`s`ã`o`.` `A`p`e`n`a`s` `p`r`o`p`r`i`e`t`á`r`i`o`/`a`d`m`i`n`i`s`t`r`a`d`o`r` `a`j`u`s`t`a` `l`i`m`i`t`e`s` `o`u` `r`e`i`n`i`c`i`a` `c`o`n`s`u`m`o`.`
`-` `C`o`n`t`a`d`o`r`e`s` `v`i`s`í`v`e`i`s` `e`m` `A`u`t`o`n`o`m`i`a`;` `r`e`s`e`t` `p`o`r` `m`a`r`c`o` `t`e`m`p`o`r`a`l` `(`u`s`a`g`e`R`e`s`e`t`A`t`)`,` `p`r`e`s`e`r`v`a`n`d`o` `r`e`s`e`r`v`a`s`,` `h`i`s`t`ó`r`i`c`o`,` `i`d`e`m`p`o`t`ê`n`c`i`a` `e` `r`e`g`i`s`t`r`o`s` `d`e` `e`n`t`r`e`g`a`.` `A` `n`o`v`a` `r`o`t`a` `a`u`t`e`n`t`i`c`a`d`a` `P`O`S`T` `/`a`p`i`/`p`o`r`t`a`l`/`:`o`r`g`/`u`s`a`g`e`/`r`e`s`e`t` `r`e`g`i`s`t`r`a` `a`u`d`i`t`o`r`i`a` `e` `n`ã`o` `m`o`d`i`f`i`c`a` `o`u`t`r`a`s` `e`m`p`r`e`s`a`s`.`
`-` `E`n`v`i`o`s` `d`a` `c`o`n`v`e`r`s`a` `W`h`a`t`s`A`p`p` `s`e`g`u`e`m` `d`a`i`l`y`M`e`s`s`a`g`e`s` `d`a` `e`m`p`r`e`s`a`;` `H`E`L`P`U`_`W`H`A`T`S`A`P`P`_`D`A`I`L`Y`_`M`E`S`S`A`G`E`S` `f`i`c`a` `a`p`e`n`a`s` `c`o`m`o` `f`a`l`l`b`a`c`k` `p`a`r`a` `p`o`l`í`t`i`c`a`s` `l`e`g`a`d`a`s` `s`e`m` `e`s`s`e` `c`a`m`p`o`.` `J`a`n`e`l`a` `d`a` `M`e`t`a`,` `c`o`n`f`i`r`m`a`ç`ã`o` `d`e` `v`í`n`c`u`l`o`,` `l`i`m`i`t`e` `d`e` `t`r`a`b`a`l`h`o` `p`o`r` `p`a`s`s`a`g`e`m` `e` `p`r`e`v`e`n`ç`ã`o` `d`e` `d`u`p`l`i`c`i`d`a`d`e` `p`e`r`m`a`n`e`c`e`m`.`
`-` `C`o`n`v`e`r`s`a`,` `p`l`a`n`e`j`a`m`e`n`t`o` `e` `p`r`o`v`e`d`o`r`e`s` `c`o`m`p`a`r`t`i`l`h`a`m` `d`i`a`g`n`ó`s`t`i`c`o` `d`e` `e`r`r`o`s` `O`p`e`n`A`I`.` `C`o`t`a`/`s`a`l`d`o`,` `a`u`t`e`n`t`i`c`a`ç`ã`o`,` `m`o`d`e`l`o` `e` `e`x`c`e`s`s`o` `t`e`m`p`o`r`á`r`i`o` `t`ê`m` `m`e`n`s`a`g`e`n`s` `d`i`s`t`i`n`t`a`s`.` `E`r`r`o`s` `d`e` `c`o`t`a` `n`ã`o` `s`ã`o` `r`e`p`e`t`i`d`o`s`;` `e`r`r`o`s` `t`e`m`p`o`r`á`r`i`o`s` `c`o`n`h`e`c`i`d`o`s` `d`e` `4`2`9` `t`ê`m` `n`o` `m`á`x`i`m`o` `d`u`a`s` `n`o`v`a`s` `t`e`n`t`a`t`i`v`a`s`,` `r`e`s`p`e`i`t`a`n`d`o` `R`e`t`r`y`-`A`f`t`e`r`.` `N`ã`o` `h`á` `r`e`t`e`n`t`a`t`i`v`a` `a`u`t`o`m`á`t`i`c`a` `d`e` `g`e`r`a`ç`ã`o` `d`e` `i`m`a`g`e`m` `i`n`c`e`r`t`a`.`
`-` `R`e`j`e`i`ç`õ`e`s` `c`o`n`f`i`r`m`a`d`a`s` `p`e`l`o` `p`r`o`v`e`d`o`r` `n`ã`o` `c`o`n`s`o`m`e`m` `a` `r`e`s`e`r`v`a` `i`n`t`e`r`n`a` `d`a` `e`x`e`c`u`ç`ã`o`;` `p`a`s`s`o`s` `c`o`m` `e`f`e`i`t`o`s` `j`á` `r`e`a`l`i`z`a`d`o`s` `c`o`n`t`i`n`u`a`m` `s`u`j`e`i`t`o`s` `à` `c`o`n`f`e`r`ê`n`c`i`a`.` `C`ó`d`i`g`o` `H`T`T`P`,` `c`ó`d`i`g`o`/`t`i`p`o` `d`o` `e`r`r`o` `e` `r`e`q`u`e`s`t` `I`D` `s`ã`o` `a`u`d`i`t`a`d`o`s` `s`e`m` `c`o`r`p`o` `d`a` `r`e`s`p`o`s`t`a`,` `c`h`a`v`e` `o`u` `p`r`o`m`p`t`.`
`
`V`a`l`i`d`a`ç`ã`o`:` `s`u`í`t`e` `g`e`r`a`l` `3`7`4` `t`e`s`t`e`s`,` `3`7`1` `a`p`r`o`v`a`d`o`s`,` `3` `o`p`c`i`o`n`a`i`s` `i`g`n`o`r`a`d`o`s`,` `z`e`r`o` `f`a`l`h`a`s`.` `3`9` `t`e`s`t`e`s` `d`i`r`e`c`i`o`n`a`d`o`s` `f`i`n`a`i`s` `a`p`r`o`v`a`d`o`s`,` `i`n`c`l`u`i`n`d`o` `S`Q`L`i`t`e` `e` `P`o`s`t`g`r`e`S`Q`L`.` `S`i`n`t`a`x`e` `d`e` `1`1`3` `a`r`q`u`i`v`o`s` `e` `b`u`i`l`d` `p`ú`b`l`i`c`o` `l`o`c`a`l` `a`p`r`o`v`a`d`o`s`.` `N`a`v`e`g`a`d`o`r` `l`o`c`a`l`:` `s`a`l`v`a`r` `s`e`m` `l`i`m`i`t`e`,` `r`e`c`a`r`r`e`g`a`r` `m`a`n`t`e`n`d`o` `a` `o`p`ç`ã`o` `e` `e`x`e`c`u`t`a`r` `r`e`s`e`t` `c`o`n`f`i`r`m`a`d`o`s`.`
`
`P`r`o`d`u`ç`ã`o`:` `H`E`L`P`U`_`U`S`A`G`E`_`T`E`S`T`_`O`R`G`S` `f`o`i` `c`o`n`f`i`g`u`r`a`d`a` `e`x`c`l`u`s`i`v`a`m`e`n`t`e` `c`o`m` `o` `I`D` `d`a` `E`M`E`.` `A`i`n`d`a` `d`e`p`e`n`d`e` `d`o` `p`r`ó`x`i`m`o` `d`e`p`l`o`y`.` `N`ã`o` `h`o`u`v`e` `a`l`t`e`r`a`ç`ã`o` `d`a`s` `c`o`t`a`s` `a`t`u`a`i`s` `n`e`m` `r`e`s`e`t` `d`o` `c`o`n`s`u`m`o` `d`e` `p`r`o`d`u`ç`ã`o` `n`e`s`t`a` `e`t`a`p`a`.` `A`p`ó`s` `p`u`b`l`i`c`a`r`:` `s`e`l`e`c`i`o`n`a`r` `E`M`E`,` `m`a`r`c`a`r` `S`e`m` `l`i`m`i`t`e`,` `s`a`l`v`a`r`,` `z`e`r`a`r` `u`s`o` `i`n`t`e`r`n`o` `e` `r`e`p`e`t`i`r` `V`e`r`i`f`i`c`a`r` `a`c`e`s`s`o` `p`a`r`a` `o`b`t`e`r` `o` `c`ó`d`i`g`o` `e`x`a`t`o` `d`a` `O`p`e`n`A`I`.` `N`ã`o` `s`o`l`i`c`i`t`a`r` `n`o`v`a` `g`e`r`a`ç`ã`o` `p`a`g`a` `p`a`r`a` `t`e`s`t`a`r` `a`n`t`e`s` `d`e` `c`o`n`f`i`r`m`a`r` `a` `c`o`n`e`x`ã`o`.`
`
`A` `r`e`v`i`s`ã`o` `a`u`t`o`m`á`t`i`c`a` `b`l`o`q`u`e`o`u` `o` `d`o`w`n`l`o`a`d` `a`m`p`l`o` `d`e` `v`a`r`i`á`v`e`i`s` `s`e`c`r`e`t`a`s`;` `o` `d`i`a`g`n`ó`s`t`i`c`o` `r`e`s`t`r`i`t`o` `n`ã`o` `g`r`a`v`o`u` `s`e`g`r`e`d`o`s` `e` `c`o`n`f`i`r`m`o`u` `q`u`e` `a` `V`e`r`c`e`l` `n`ã`o` `p`e`r`m`i`t`e` `r`e`c`u`p`e`r`a`r` `o` `v`a`l`o`r` `d`a` `c`o`n`e`x`ã`o` `s`e`n`s`í`v`e`l`.` `A` `a`l`t`e`r`a`ç`ã`o` `f`o`i` `l`i`m`i`t`a`d`a` `a` `d`a`d`o`s` `d`e` `c`o`n`f`i`g`u`r`a`ç`ã`o` `n`ã`o` `s`e`c`r`e`t`o`s` `e` `a` `c`ó`d`i`g`o` `l`o`c`a`l`.` `P`u`s`h`/`p`u`b`l`i`c`a`ç`ã`o` `d`e`p`e`n`d`e`m` `d`a` `o`r`i`e`n`t`a`ç`ã`o` `d`o` `A`G`E`N`T`S`.`m`d` `o`u` `d`e` `a`u`t`o`r`i`z`a`ç`ã`o` `e`x`p`l`í`c`i`t`a` `d`o` `u`s`u`á`r`i`o`.`
`
`R`e`f`e`r`ê`n`c`i`a` `o`f`i`c`i`a`l`:` `h`t`t`p`s`:`/`/`d`e`v`e`l`o`p`e`r`s`.`o`p`e`n`a`i`.`c`o`m`/`a`p`i`/`d`o`c`s`/`g`u`i`d`e`s`/`e`r`r`o`r`-`c`o`d`e`s`
`