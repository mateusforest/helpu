# Automações e referências

## Estado verificado em 18/09/2026

Os logs de produção da Vercel mostram chamadas POST a `/api/worker` a cada minuto, com HTTP 200. O processamento imediato e a entrega de imagem e MP4 já foram confirmados no WhatsApp. Isso não substitui o teste de um novo agendamento após publicar esta alteração.

## Agendamentos pela conversa

O Astra dispõe de `creation_schedule` para criar, consultar, pausar, retomar e cancelar agendamentos. Exemplos:

- “Agende um feed da minha empresa para 22/09/2026 às 9h, horário de Brasília.”
- “Toda segunda e quarta às 9h, gere um feed com dicas sobre minha empresa.”
- “Liste minhas rotinas.”
- “Pause a rotina [nome/identificador].”

O horário inicia a geração. A fila e o processamento podem atrasar a conclusão. A rotina guarda briefing, formato e referências autorizados; não improvisa uma campanha sem briefing. Gerações obedecem aos limites da empresa. Uma falha ao iniciar pausa a rotina e registra o erro. Pausar a empresa suspende o disparo. A exclusão do acesso do criador desativa a rotina. As próximas ocorrências semanais são calculadas no fuso informado. Ocorrências perdidas não são acumuladas em uma rajada.

A automação da empresa deve estar ativada em Autonomia para cadastrar um agendamento. A interface nesta entrega é a conversa (portal ou WhatsApp) e a API; não foi adicionado um formulário visual de calendário de recorrência.

API autenticada: GET/POST `/api/portal/:org/creation-schedules`; POST `/api/portal/:org/creation-schedules/:id` com `action: pause|resume|cancel`. Cada criador consulta e altera seus próprios agendamentos. Pausar/cancelar a rotina não cancela uma geração que já iniciou; essa geração deve ser parada na conversa.

## Arquivos recebidos pelo WhatsApp

São aceitos PNG, JPEG, WebP, PDF (até 20 MB), MP4 (até 25 MB) e MP3/WAV/OGG (até 16 MB). O download usa o identificador de mídia recebido em webhook assinado, autenticação da Meta, domínios permitidos, limite de bytes e conferência de integridade. O arquivo fica no armazenamento privado da empresa e como anexo da conversa. Eventos repetidos reutilizam o arquivo e o pedido.

Envie o arquivo com o pedido na legenda ou envie os materiais primeiro e descreva depois o que fazer com eles. Sem pedido, o Astra apenas recebe e pergunta o objetivo, em modo Planejar. Os IDs dos anexos permanecem no histórico recente da conversa para seleção no próximo pedido. PDFs fornecem briefing; não são fundo de imagem ou vídeo. Áudio é aceito como trilha, sem transcrição automática nesta etapa. Na geração de vídeo, o planejador recebe duas amostras visuais por MP4; não analisa todo o movimento nem o som. Peça explicitamente para usar um anexo somente como referência de estilo quando ele não deve aparecer no resultado.

As opções de estilo, qualidade, proporção e referências também são guardadas nos agendamentos. A prévia pode ser aprovada ou ajustada pela conversa; `creation_library` resolve os IDs e `creation_review` registra a ação. Aprovação editorial não publica nas redes. Veja [EVOLUCAO-ASTRA.md](EVOLUCAO-ASTRA.md) para recursos e limites da etapa atual.

## Entrega fora da janela de 24 horas

Arquivos e respostas livres aguardam uma nova mensagem do usuário quando a janela estiver fechada. É possível configurar um aviso via modelo previamente aprovado pela Meta:

- Nome sugerido: `helpu_conteudo_pronto`
- Idioma: `pt_BR`
- Corpo sem variáveis: “Seu conteúdo solicitado está pronto na Helpu. Responda a esta mensagem para receber os arquivos ou consulte sua Biblioteca no painel.”

A categoria e a aprovação são determinadas pela Meta. Configure `HELPU_WHATSAPP_READY_TEMPLATE` apenas após aprovação, e opcionalmente `HELPU_WHATSAPP_TEMPLATE_LANGUAGE`. O código não cria nem aprova o modelo. Sem essa configuração, não envia aviso fora da janela. O aviso não reabre a janela: a resposta do cliente é necessária para enviar os arquivos. Há no máximo um aviso por período sem nova mensagem, e envios incertos não são repetidos automaticamente. Nenhum desses fluxos publica em redes sociais.

## Validação após deploy

1. Enviar uma foto com legenda solicitando uma criação; conferir anexo privado no portal e arquivo retornado.
2. Agendar uma geração para alguns minutos à frente, fechar o portal e confirmar entrega pelo WhatsApp.
3. Criar rotina semanal, consultar próxima ocorrência, pausar e conferir ausência de novo disparo.
4. Validar aviso fora da janela somente depois da aprovação e configuração do modelo na Meta.
