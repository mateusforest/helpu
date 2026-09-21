# F03 — vídeos, referências e memória de estilo

## Implementado

A Biblioteca → Criar conteúdo → Vídeo contém a **Biblioteca de modelos de vídeo**. Há seis receitas novas, além dos cinco estilos existentes: teaser de lançamento, gastronomia sensorial, arquitetura editorial, antes/depois, especialista em cena e palavras de impacto. A seleção aplica fonte, movimento, transição e ritmo ao pedido real; não é só um catálogo descritivo.

Receitas têm versão, proporções de duração e direção editorial. A marca da empresa deve orientar os textos e cores; escolher uma receita não inclui copiar os textos ou a marca das referências. O cliente ainda pode mudar as escolhas. Chat e WhatsApp usam os mesmos identificadores e opções do portal.

Sete opções tipográficas, com arquivos distribuídos na hospedagem: sans natural, sans de impacto, serifada, serifada itálica, serifada forte, condensada e monoespaçada. São variantes de DejaVu e uma condensação controlada, não sete famílias diferentes nem identificação das fontes originais. O plano permite variação por cena de fonte, tamanho, animação e cor. Há escolha de faixa de contraste, contorno ou ausência de fundo, e de destaque da última palavra ou nenhum destaque automático.

Legendas sincronizadas aceitam texto **SRT fornecido pelo cliente**, com validação de ordem, duração, limites e caracteres. O texto é gravado no MP4 com seus tempos. O campo está nos controles avançados, também disponível pela ferramenta de criação do chat. Não há leitura automática de arquivo SRT anexado pelo WhatsApp nesta entrega: o texto SRT pode ser colado no pedido/portal. Títulos animados por palavras não são transcrição de fala.

Referências de estilo recebem seis amostras temporais, enquanto materiais de edição mantêm duas amostras por vídeo. Isso melhora a cobertura visual sem afirmar análise de cada quadro ou do áudio. Referências continuam separadas das cenas e da música.

Após aprovação, **Salvar meu estilo** guarda parâmetros, proporções, posições e tipografia de cada cena, por empresa. Não guarda o texto das legendas, música ou os arquivos para reutilização automática. A criação de origem permanece identificada para rastreabilidade. A reutilização mantém a variação entre cenas, salvo alteração explícita. Isso é memória de receita, não treinamento do modelo.

Exportação mantém 1080p vertical e horizontal, 15 ou 30 segundos, com alta qualidade ou arquivo menor. O motor verifica duração, dimensões, codec e agora decodifica o MP4 inteiro antes de entregar. O original permanece para download; quando necessário, há uma prévia menor para o WhatsApp.

## Referências analisadas

46 arquivos locais, 1.021,9 segundos de duração total, 46 hashes diferentes. Catálogo privado fora do repositório: `output/f03-referencias/catalogo.html`, com inventário JSON, hash, seis tempos de amostra, quadros, descrição tipográfica, texto visível e composição por arquivo. As gravações de tela foram interpretadas ignorando barras, botões e rolagem. Interfaces que fazem parte intencional do criativo, como a chamada de telefone do teaser, foram registradas como composição.

A análise é por amostras temporais distribuídas; não determina todos os cortes, a curva exata de easing, sincronização com música ou a família tipográfica exata. Não houve transcrição, identificação de trilhas, análise sonora ou treinamento automático. Os vídeos e miniaturas de terceiros não foram copiados para a biblioteca pública ou enviados para um provedor nesta tarefa.

## Vocabulário e decisão editorial

| Linguagem observada | Adaptação / estado |
|---|---|
| Kinetic typography / revelação por palavras | Entrada por palavras, escala, subida e fade; controle por cena |
| Tipografia editorial e contraste de escala | Serifas, itálico, negrito e tamanho por cena |
| Punch-in / Ken Burns / pan | Zoom e deslocamento programados existentes; não equivalem a tracking |
| B-roll / insert / planos de detalhe | Cortes entre materiais fornecidos; preservação da gravação |
| Dissolve / crossfade | Dissolução e transição lateral existentes |
| Before/after | Comparação sequencial apenas com materiais reais identificados |
| Split-screen / triptych / mosaic | Referência catalogada; montagem simultânea ainda não implementada |
| Picture-in-picture / colagem / cartões flutuantes | Referência catalogada; composição em camadas ainda não implementada |
| Subject cutout / texto atrás da pessoa | Exige máscaras/segmentação; ainda indisponível |
| Tracking / screen replacement | Não inferir de uma tela inserida; ainda indisponível |
| Dolly / orbit / parallax real | Movimento de captura preservado; não simulado a partir de uma foto |
| Light leak / tratamento cinematográfico | Observado em referências; não oferecido como novo filtro |

Direção recomendada: montagem e texto devem servir ao material. Gastronomia e arquitetura usam menos texto e evitam sobrepor zoom a uma câmera já em movimento. Especialistas preservam a fala e distinguem legenda de título. Teasers usam poucas palavras e fechamento claro. A cor da referência não deve substituir silenciosamente a identidade da empresa.

## Limites explícitos

- Mantido o renderizador FFmpeg existente na hospedagem; HyperFrames local não foi apresentado como recurso já integrado à nuvem.
- Sem transcrição automática, novas vozes, segmentação, mosaicos, 3D ou tracking nesta entrega.
- Arquivos: até oito referências, 25 MB por arquivo e 30 MB no conjunto. Receitas não ampliam esses limites.
- Esta tarefa não efetuou deploy nem teste de entrega real pelo WhatsApp. A integração e os arquivos foram verificados localmente.

## Validação

Testes de criação em SQLite e PostgreSQL, isolamento por empresa, salvar/reusar estilo sem transferir legenda/música, tempos SRT inválidos, neutralização de comandos em texto, fontes distribuídas e seleção de receita. Testes de MP4 real com fontes, legendas, imagens, vídeo, trilha, efeitos, transições, orientação e decodificação completa. Interface verificada em desktop, 390 e 320 pixels, incluindo cartões da biblioteca abertos.

As prévias técnicas ficam em `output/f03-referencias/validacao`, fora do Git. Nenhuma geração paga ou envio a cliente foi executado nesta frente.

## Refinamento da direção de vídeo — setembro de 2026

- Chat e WhatsApp verificam direção de vídeo separadamente da identidade de imagens. Cores, logo e um estilo de feed não dispensam a pergunta sobre referência de edição. A pergunta identifica a empresa da conversa e preserva briefing e anexos; “pode sugerir” permite seguir.
- A criação sugere uma receita a partir do assunto e reutiliza automaticamente um estilo de vídeo salvo pela própria empresa, quando não houver outra escolha explícita. Não reutiliza legendas SRT nem trilha do pedido anterior. A biblioteca passa a oferecer sete receitas, incluindo “Evolução da obra”.
- O planejamento recebe orientação para analisar etapas reais, variar cenas, evitar frases repetidas, usar títulos curtos e não acrescentar assinatura de marca sem solicitação. A seleção cronológica depende da leitura do material pelo modelo; não é inferida apenas da ordem dos anexos.
- Verificações locais identificam repetição literal normalizada, títulos com mais de 14 palavras, ausência completa dos materiais fornecidos e um padrão de assinatura automática. Há uma única tentativa adicional de planejamento quando necessário. Ela é registrada como revisão contextual no consumo do provedor. Persistindo a falha, a renderização não começa. Estas verificações não equivalem a uma avaliação estética completa do MP4.
- O renderizador aceita fundo desfocado para preservar a imagem inteira, além de revelações lateral e circular. O editor oferece essas opções. Mosaicos, recorte de pessoas e tracking continuam fora do escopo.
- A identificação da empresa na pergunta e a orientação contra assinatura indevida não alteram o vínculo de uma conta do WhatsApp. O vínculo em produção do caso relatado não foi auditado nesta entrega.

Validação local: fluxos de criação em SQLite e PostgreSQL, referência pendente, uso do provedor, revisão antes de renderizar, reutilização de estilo, MP4 real com foto e vídeo, áudio, duração e novos efeitos; editor em desktop e larguras de 390 e 320 pixels. Prévia técnica de 15 segundos com fotos fornecidas, produzida diretamente pelo renderizador, fora do Git. Nenhum envio pelo WhatsApp, geração paga ou deploy foi executado.
