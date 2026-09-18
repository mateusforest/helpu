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

## 18/09/2026 — cotas da EME e erro 429

O portal de produção confirmou os valores salvos pelo cliente: 30 execuções de IA, 8 mídias e 30 mensagens. A validação da conexão OpenAI também retornou HTTP 429. A versão publicada descartava o código específico do erro; portanto, não foi possível distinguir saldo/crédito de limite temporário nessa versão. Não atribuir o erro atual a uma falha ao salvar a autonomia.

Implementação:
- Valor explícito unlimited para os três limites internos. Sem conversão silenciosa para um teto arbitrário. Habilitação restrita por empresa, via política administrada ou HELPU_USAGE_TEST_ORGS; a API de empresa não permite auto-habilitar essa permissão. Apenas proprietário/administrador ajusta limites ou reinicia consumo.
- Contadores visíveis em Autonomia; reset por marco temporal (usageResetAt), preservando reservas, histórico, idempotência e registros de entrega. A nova rota autenticada POST /api/portal/:org/usage/reset registra auditoria e não modifica outras empresas.
- Envios da conversa WhatsApp seguem dailyMessages da empresa; HELPU_WHATSAPP_DAILY_MESSAGES fica apenas como fallback para políticas legadas sem esse campo. Janela da Meta, confirmação de vínculo, limite de trabalho por passagem e prevenção de duplicidade permanecem.
- Conversa, planejamento e provedores compartilham diagnóstico de erros OpenAI. Cota/saldo, autenticação, modelo e excesso temporário têm mensagens distintas. Erros de cota não são repetidos; erros temporários conhecidos de 429 têm no máximo duas novas tentativas, respeitando Retry-After. Não há retentativa automática de geração de imagem incerta.
- Rejeições confirmadas pelo provedor não consomem a reserva interna da execução; passos com efeitos já realizados continuam sujeitos à conferência. Código HTTP, código/tipo do erro e request ID são auditados sem corpo da resposta, chave ou prompt.

Validação: suíte geral 374 testes, 371 aprovados, 3 opcionais ignorados, zero falhas. 39 testes direcionados finais aprovados, incluindo SQLite e PostgreSQL. Sintaxe de 113 arquivos e build público local aprovados. Navegador local: salvar sem limite, recarregar mantendo a opção e executar reset confirmados.

Produção: HELPU_USAGE_TEST_ORGS foi configurada exclusivamente com o ID da EME. Ainda depende do próximo deploy. Não houve alteração das cotas atuais nem reset do consumo de produção nesta etapa. Após publicar: selecionar EME, marcar Sem limite, salvar, zerar uso interno e repetir Verificar acesso para obter o código exato da OpenAI. Não solicitar nova geração paga para testar antes de confirmar a conexão.

A revisão automática bloqueou o download amplo de variáveis secretas; o diagnóstico restrito não gravou segredos e confirmou que a Vercel não permite recuperar o valor da conexão sensível. A alteração foi limitada a dados de configuração não secretos e a código local. Push/publicação dependem da orientação do AGENTS.md ou de autorização explícita do usuário.

Referência oficial: https://developers.openai.com/api/docs/guides/error-codes
