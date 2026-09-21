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
