# Operação atual: criar, entregar e publicar manualmente

A Helpu cria imagens, Reels, campanhas e legendas. O cliente recebe o material pelo painel e, quando o vínculo estiver ativo, pelo WhatsApp oficial da Helpu; publica manualmente. Não precisa conectar Instagram, Google, Meta Ads nem navegador de contas.

## Criação direta no painel

Abra **Biblioteca → Criar conteúdo**, ou use os atalhos da conversa. O fluxo tem seleção de formato, campo do pedido, anexos e resultados. O antigo endereço **Astra Vídeo** abre a criação de Reels; não renderiza o editor.

| Formato | Entrega |
|---|---|
| Feed | Imagem vertical 4:5 e legenda |
| Story | Imagem vertical 9:16 e legenda |
| Carrossel | De 3 a 10 imagens verticais 4:5, ordenadas, com legenda comum |
| Reels | MP4 vertical de 15 ou 30 segundos, com legenda |

O Astra usa o briefing e as informações da empresa para planejar o conteúdo. Imagens são geradas pela OpenAI. Reels combina textos, cores e referências enviadas, com movimento leve em imagens e cortes de MP4. O áudio original é preservado nas cenas de vídeo; cenas sem áudio ficam em silêncio. Isso é montagem de conteúdo, não geração de novas filmagens, avatar, locução ou trilha por IA. Nenhuma dessas capacidades é anunciada como concluída.

Anexe PNG, JPG ou WebP; Reels também aceita MP4. Até seis arquivos por pedido, 20 MB de imagens no total, 25 MB por arquivo e 30 MB no conjunto de referências do Reels. PDF continua disponível na Biblioteca e na conversa geral, mas não é uma referência aceita pelo novo gerador.

O resultado mostra os arquivos realmente salvos, suas dimensões, download individual e legenda copiável. Em falha parcial do carrossel, as imagens já concluídas ficam disponíveis; a interface não marca a entrega inteira como pronta. Pedidos anteriores do Estúdio podem ter seu briefing reaproveitado sem passar pelas antigas verificações de produção.

## Hospedagem existente

| Parte | Onde funciona |
|---|---|
| Painel, login, pedidos e fila | Vercel |
| Dados e arquivos privados | Supabase/PostgreSQL já usados pela Helpu |
| Planejamento e imagens | OpenAI, chamada apenas pelo servidor |
| Montagem do Reels | FFmpeg dentro da API da Vercel; arquivos temporários durante a execução |

**O fluxo novo não exige Render, servidor Docker adicional, editor remoto nem HELPU_RUNTIME_URL.** Os pacotes em deploy/video e deploy/runtime ficam preservados para os módulos antigos e não são uma etapa de ativação da criação direta. O processamento usa a hospedagem da Helpu e continua sujeito aos limites e custos da Vercel e da OpenAI.

O pacote de produção inclui FFmpeg, ffprobe e uma fonte para a renderização. scripts/build-production.mjs prepara e confere essas dependências; scripts/verify-production-build.mjs confere a inclusão no pacote compilado. A função usa o tempo máximo configurado em vercel.json. Uma compilação local ou um teste sintético não prova que a versão já está publicada.

## Configuração para executar online

Conserve as variáveis de autenticação, banco, armazenamento privado e criptografia já utilizadas. Na Vercel, Production precisa de:

~~~text
OPENAI_API_KEY=<chave privada da plataforma>
OPENAI_MODEL=gpt-6-astra
HELPU_PUBLIC_URL=https://www.helpumkt.com
HELPU_AUTOMATIONS_ENABLED=true
CRON_SECRET=<segredo aleatório de pelo menos 32 caracteres>
~~~

As configurações OpenAI salvas por empresa têm prioridade sobre os padrões do ambiente. Desconectar a inteligência bloqueia o uso do padrão para aquela empresa até reconfigurar. As chaves ficam no servidor, não no frontend, Git ou campos de conversa.

Pedidos explícitos acordam o worker na Vercel. Enquanto há etapas de criação pendentes, o processamento continua por chamadas autenticadas entre execuções da função. Uma invocação recorrente de POST /api/worker com Authorization: Bearer CRON_SECRET serve para recuperação de trabalho e rotinas. A aba aberta apenas acompanha o resultado; não executa FFmpeg nem mantém o trabalho vivo.

Faça a publicação manual do código e das variáveis na hospedagem e valide um pedido no domínio real. .env.local só configura o servidor local; não atualiza a Vercel. Esta implementação não publica commits, não contrata serviços e não registra números na Meta.

## Autorização, limites e conclusão

Ao clicar em Criar, ou solicitar uma criação no modo Conversar e executar, o usuário autoriza a produção solicitada. Não é necessária uma segunda aprovação para gerar o arquivo. Somente planejar prepara a orientação sem produzir. Proibições explícitas, pausas e limites por empresa continuam valendo.

Carrossel consome uma geração de mídia por imagem. A quantidade escolhida precisa caber no limite disponível em Autonomia; o padrão de três páginas evita exceder sozinho o padrão de três mídias diárias. O limite operacional não é um teto financeiro da conta OpenAI.

O servidor mantém a chave de cada pedido para evitar duplicação por reenvio. Uma chamada externa com resultado incerto não é repetida automaticamente como se tivesse falhado sem custo. O painel mostra estados de fila, execução, conclusão ou erro e preserva os arquivos disponíveis.

A criação de arquivos não publica nada nas redes. O calendário registra uma sugestão editorial. Lembretes proativos, templates de WhatsApp fora da janela de atendimento e confirmação posterior de postagem continuam pendentes. Não foi definido preço nem quantidade mensal de um plano da Helpu a partir do exemplo de outra agência.

## Conversa do painel no WhatsApp oficial da Helpu

O chat inicial tem **Expandir para WhatsApp**. Cada usuário informa o próprio telefone, autoriza o recebimento e escolhe conversar e executar ou somente planejar. Pode vincular a conversa aberta ou iniciar uma conversa dedicada, acessível também pelo painel. A verificação é feita enviando ao número oficial uma mensagem com código aleatório, de uso único, válido por dez minutos. O servidor confere a assinatura da Meta, o número oficial e o remetente; salvar um telefone não autoriza acesso à empresa. Um telefone fica vinculado a uma empresa/usuário por vez.

Número oficial escolhido: **+55 54 99990-2690**. A configuração local foi atualizada; a ativação na Meta e as credenciais de produção na hospedagem precisam ser conferidas. Phone Number ID, token e webhook devem pertencer a esse número e aplicativo. O número de teste da Meta pode continuar sendo usado em testes controlados, com destinatários autorizados; ele não é o lançamento para todos os clientes.

Na Vercel/servidor, configurar os campos de .env.example:

- HELPU_WHATSAPP_NUMBER=5554999902690: número oficial completo, com código do país, somente dígitos. Para testes, usar o número exibido pela Meta.
- HELPU_WHATSAPP_PHONE_NUMBER_ID: identificador fornecido pela Meta, não o telefone.
- HELPU_WHATSAPP_ACCESS_TOKEN: token do número oficial.
- HELPU_WHATSAPP_APP_SECRET: segredo do aplicativo responsável pelos webhooks.
- HELPU_WHATSAPP_VERIFY_TOKEN: segredo de verificação do webhook.
- HELPU_WHATSAPP_API_VERSION=v24.0
- HELPU_WHATSAPP_DAILY_MESSAGES=60: limite de tentativas de envio por empresa em 24 horas; entre 1 e 500.

Callback: https://www.helpumkt.com/webhooks/helpu-whatsapp. Cadastrar o mesmo token de verificação na Meta e assinar o campo messages. A criação deste código não registra o telefone na Meta nem publica o aplicativo. O status configurado indica presença das credenciais; a confirmação efetiva do usuário depende de um webhook válido. Sem credenciais, a interface salva a preferência e explica a pendência.

As mensagens de texto recebidas são persistidas e processadas pelo worker já existente, usando o mesmo motor, contexto da empresa, ferramentas, limites e regras de aprovação do chat. A rotina não usa um novo agente nem uma chamada de IA para confirmar telefone. Respostas e arquivos da conversa vinculada são enviados pela Cloud API; mídia privada é transferida ao endpoint de mídia autenticado da Meta. PNG/JPEG até 5 MB, MP4 até 16 MB e PDF até 25 MB são enviados como arquivo; outros formatos/tamanhos recebem aviso para baixar na Biblioteca.

O webhook recebido aciona o worker online com HELPU_AUTOMATIONS_ENABLED e CRON_SECRET configurados. Uma invocação recorrente autenticada de POST /api/worker permite recuperar trabalho pendente e manter o processamento do WhatsApp. Isso acontece no servidor, sem depender do computador do usuário; configurar a invocação externa não faz parte de um login no WhatsApp.

Proteções: isolamento por empresa e usuário, revalidação de associação, consumo atômico do código, deduplicação de mensagens/eventos, reserva de cada envio antes da chamada externa e ausência de repetição automática quando a entrega fica incerta. Desativar no painel ou enviar SAIR bloqueia novos pedidos e envios. Pedidos já iniciados devem ser pausados na conversa. Reativar exige nova comprovação do telefone.

Limites desta etapa: entrada pelo WhatsApp é por texto; arquivos de referência são enviados no painel. Fora da janela de atendimento de 24 horas, respostas ficam aguardando uma nova mensagem do usuário. Lembretes proativos e modelos aprovados para envio fora da janela ainda não foram implementados neste fluxo. Não há publicação automática por habilitar o WhatsApp. Testes usam números fictícios e transportes simulados, em SQLite e PostgreSQL; nenhuma mensagem real foi enviada.

Referência: [Meta — WhatsApp Cloud API](https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api).

## Verificação

Os testes da criação cobrem formato, isolamento por empresa, anexos, reenvio idempotente, limites, falha parcial e retorno dos arquivos. O teste do renderizador produz MP4 a partir de material sintético. A interface é conferida em desktop e celular com dados fictícios. Chamadas pagas à OpenAI e a operação no domínio publicado exigem validação separada; não são comprovadas por esses testes.

As conexões e os projetos antigos são preservados para histórico. O fluxo de lançamento não exige login social ou hospedagem do editor antigo.
