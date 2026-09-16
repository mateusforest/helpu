# Operação online da Helpu

Implementação de 15/09/2026. O código está preparado para execução independente do computador do usuário. Isso não significa que o novo serviço já foi hospedado: não houve deploy, conexão a contas reais ou publicação nesta alteração.

## Onde cada parte funciona

| Parte | Hospedagem | Trabalho |
|---|---|---|
| Painel, autenticação e API | Vercel | Conversa, permissões, Biblioteca, fila e acesso autenticado às ferramentas |
| Dados e arquivos privados | Supabase já usado pela Helpu | Empresas, pedidos, agendamentos e MP4 concluídos |
| Serviço online | Servidor Linux com Docker e volume persistente | Chromium por empresa/canal, editor de cenas, FFmpeg e acionamento periódico da fila |

O serviço chama `POST /api/worker` a cada minuto, com `CRON_SECRET`, sem depender de uma aba aberta. A fila existente continua com trava persistente no banco. Exportações têm fila própria e volume persistente. Acompanhar o resultado no painel não é o que mantém o trabalho executando.

## O que foi conectado

- **Minha empresa → Telas das contas:** Instagram, WhatsApp, Facebook e Perfil da Empresa no Google. É uma tela real de navegador remoto com mouse, rolagem e entrada de texto. Não é um iframe dos sites externos.
- **Biblioteca → Astra Vídeo:** projetos por empresa, cenas, texto, cores, fade, ordem e cortes de MP4 da Biblioteca. O mesmo projeto pode ser editado pelo chat e pelo cliente.
- **Conversa:** ferramentas para consultar, criar, editar e exportar vídeo. A exportação concluída e verificada retorna à Biblioteca e à conversa, inclusive se o usuário saiu do painel.
- **Arquivos:** MP4 H264 vertical 1080×1920, até 120 segundos, 32 cenas, corte individual de até 60 segundos. O vídeo mantém áudio do arquivo de origem; cenas sem áudio recebem silêncio.

Este editor online não é uma cópia completa do aplicativo local ASTRA-VIDEO. Não inclui timeline avançada, geração de filmagens por modelo, avatar, locução, trilha automática, transcrição/legendas automáticas ou aplicação de logo/fonte oficial. A exportação foi testada com uma gravação sintética, sem arquivos privados do usuário.

## Login e autorização

1. Abra a tela do canal e assuma o controle.
2. Faça login na página oficial exibida e conclua as verificações da plataforma.
3. Informe a conta aberta, confirme a identidade e escolha se permite operação pelo Astra.
4. Libere o controle humano para o agente. Durante o controle humano, a IA não recebe imagem nem texto dessa sessão.

As senhas digitadas nesse controle vão apenas ao navegador remoto, por requisições autenticadas. Não entram na conversa nem em logs de conteúdo. Perfis e cookies ficam no volume privado do servidor. As sessões podem expirar ou exigir nova verificação; após reinício do serviço, as contas precisam de nova confirmação antes da automação. Interações incertas também suspendem a autorização.

Entrar pelo navegador não configura OAuth/API nem comprova publicação. O login oficial por API do Instagram continua dependendo do aplicativo da Meta. WhatsApp API, Google e Meta Ads continuam com suas credenciais próprias. Facebook aberto na tela não significa campanhas de tráfego totalmente automáticas: o Astra não está autorizado a comprar ou ativar anúncios por esse controle.

## Criação e aprovação

Em **Conversar e executar**, o pedido autoriza gerar imagens e exportar o vídeo solicitado; não há uma segunda aprovação só para produzir o arquivo. A autorização de vídeo é vinculada à empresa, ao usuário, ao projeto e à revisão. Proibições explícitas, limites diários e pausas continuam valendo. **Somente planejar** não altera projetos nem exporta.

A rotina automática depende de Autonomia, OpenAI configurada e processamento habilitado. A rotina existente prepara textos e pode gerar imagens; não foi convertida em produção diária automática de vídeos. Publicar e enviar mensagens continuam seguindo as regras e aprovações existentes. A criação de um arquivo não o publica.

## Ativação pendente

Use o pacote em `deploy/runtime` para instalar o serviço em um servidor Linux ligado continuamente, com HTTPS, volume privado, Chromium com sandbox e firewall de saída. O serviço tem uma única réplica por volume. Não coloque o diretório de perfis em armazenamento público.

Na **Vercel / Production**, configure:

```text
HELPU_RUNTIME_URL=https://runtime.seu-dominio
HELPU_RUNTIME_SECRET=<segredo aleatório de pelo menos 32 caracteres>
HELPU_AUTOMATIONS_ENABLED=true
```

No serviço online, use o mesmo `HELPU_RUNTIME_SECRET`, `HELPU_PUBLIC_URL=https://www.helpumkt.com` e o mesmo `CRON_SECRET` da Vercel. Segredos nunca entram no frontend nem no Git. Faça o deploy manual dos commits e inicie o serviço conforme o guia. A tela de ferramentas mostra a disponibilidade real do serviço e avisa quando a fila está desativada.

Depois da hospedagem, ainda é necessário testar com uma conta autorizada: login, confirmação, retomada da sessão, uma criação real e uma ação com evidência no canal. O fluxo OAuth/API também precisa de validação real separada. Esses testes não foram executados nesta alteração.

## Verificação do código

Testes do navegador usam Playwright simulado: isolamento por empresa, controle humano, snapshots, identidade, rede, recuperação e arquivos. Testes do gateway cobrem autenticação, limites, erro incerto e relógio da fila. A integração exercita chat → fila → MP4 verificado → Biblioteca/conversa, com provedor simulado. Há também um teste real de FFmpeg com fonte sintética, sem API paga.

Referências de infraestrutura: [Docker e sandbox do Playwright](https://playwright.dev/docs/docker), [limite de payload das Vercel Functions](https://vercel.com/docs/errors/function_payload_too_large). Arquivos de vídeo são transferidos entre servidores e o armazenamento privado; o frontend envia identificadores de arquivos, evitando transportar MP4 pela resposta da Function.


## Chave e modelos da OpenAI

O iniciador local le `.env.local` e depois `.env`, preservando variaveis ja definidas no terminal. Preencha `OPENAI_API_KEY` e `OPENAI_MODEL=gpt-6-astra` no `.env.local` privado e reinicie o servidor. `OPENAI_TASK_MODEL` e opcional e mantem `gpt-5-mini` como padrao das tarefas especificas.

Na Vercel, cadastre essas mesmas variaveis em Production e faca um novo deploy manual: arquivos locais nao sao enviados como configuracao da hospedagem. A chave permanece no servidor e nao deve ser incluida no Git. Configuracoes salvas em Conexoes de cada empresa tem prioridade sobre os padroes do ambiente. A chave da plataforma atende empresas sem chave propria, com cobranca na conta do titular da chave; esta configuracao nao implementa um teto financeiro.

Desconectar a OpenAI no painel bloqueia tambem o uso da chave do ambiente para aquela empresa. Salvar a conexao novamente reabilita o uso dos padroes. Os valores do ambiente nao sao copiados para os registros das empresas. Chave preenchida indica configuracao, nao validacao de acesso: use Verificar acesso antes de iniciar a operacao.

## Astra Vídeo: conversa ao lado do editor

A seção Biblioteca → Astra Vídeo reúne o chat à esquerda e a prévia das cenas à direita. O pedido usa a conversa existente da Helpu, com o identificador e a revisão do projeto aberto. Edições locais são salvas antes do envio; enquanto o pedido estiver em andamento, a edição manual fica bloqueada para evitar sobrescrita. O botão Pausar usa a pausa da conversa existente; a liberação depende da confirmação do andamento.

A tela acompanha novas revisões e a exportação, preserva a conversa por projeto na sessão do navegador e oferece edição manual de textos, cores, duração e cortes. A criação manual tem escolhas de duração inicial (15, 30 ou 60 segundos) e estilo claro/escuro. O formato disponível continua vertical. A prévia é uma representação aproximada da cena; o MP4 final é conferido após exportação.

A interface permanece visível quando falta o serviço online, com os controles de execução desabilitados. Esta alteração não hospeda o serviço, não muda a automação de acesso e não realiza chamadas pagas. A interface foi conferida em navegador com dados simulados, em computador e celular; a exportação real foi testada separadamente com vídeo sintético e FFmpeg.


## Conversa do painel no WhatsApp oficial da Helpu

O chat inicial tem **Expandir para WhatsApp**. Cada usuário informa o próprio telefone, autoriza o recebimento e escolhe conversar e executar ou somente planejar. Pode vincular a conversa aberta ou iniciar uma conversa dedicada, acessível também pelo painel. A verificação é feita enviando ao número oficial uma mensagem com código aleatório, de uso único, válido por dez minutos. O servidor confere a assinatura da Meta, o número oficial e o remetente; salvar um telefone não autoriza acesso à empresa. Um telefone fica vinculado a uma empresa/usuário por vez.

Número oficial indicado pelo responsável: **+55 54 99990-2688**. É o destinatário dos pedidos, separado dos números pessoais dos usuários e dos canais de atendimento das empresas. Não reutilize automaticamente o token/Phone Number ID do número anterior: devem pertencer a este número registrado na Cloud API.

Na Vercel/servidor, configurar os campos de .env.example:

- HELPU_WHATSAPP_NUMBER=5554999902688
- HELPU_WHATSAPP_PHONE_NUMBER_ID: identificador fornecido pela Meta, não o telefone.
- HELPU_WHATSAPP_ACCESS_TOKEN: token do número oficial.
- HELPU_WHATSAPP_APP_SECRET: segredo do aplicativo responsável pelos webhooks.
- HELPU_WHATSAPP_VERIFY_TOKEN: segredo de verificação do webhook.
- HELPU_WHATSAPP_API_VERSION=v24.0
- HELPU_WHATSAPP_DAILY_MESSAGES=60: limite de tentativas de envio por empresa em 24 horas; entre 1 e 500.

Callback: https://www.helpumkt.com/webhooks/helpu-whatsapp. Cadastrar o mesmo token de verificação na Meta e assinar o campo messages. A criação deste código não registra o telefone na Meta nem publica o aplicativo. O status configurado indica presença das credenciais; a confirmação efetiva do usuário depende de um webhook válido. Sem credenciais, a interface salva a preferência e explica a pendência.

As mensagens de texto recebidas são persistidas e processadas pelo worker já existente, usando o mesmo motor, contexto da empresa, ferramentas, limites e regras de aprovação do chat. A rotina não usa um novo agente nem uma chamada de IA para confirmar telefone. Respostas e arquivos da conversa vinculada são enviados pela Cloud API; mídia privada é transferida ao endpoint de mídia autenticado da Meta. PNG/JPEG até 5 MB, MP4 até 16 MB e PDF até 25 MB são enviados como arquivo; outros formatos/tamanhos recebem aviso para baixar na Biblioteca.

O worker precisa continuar ativo online (HELPU_AUTOMATIONS_ENABLED, CRON_SECRET e invocação recorrente de /api/worker conforme este documento). Fechar o computador não interrompe um worker hospedado. Esta entrega não configura a infraestrutura automaticamente.

Proteções: isolamento por empresa e usuário, revalidação de associação, consumo atômico do código, deduplicação de mensagens/eventos, reserva de cada envio antes da chamada externa e ausência de repetição automática quando a entrega fica incerta. Desativar no painel ou enviar SAIR bloqueia novos pedidos e envios. Pedidos já iniciados devem ser pausados na conversa. Reativar exige nova comprovação do telefone.

Limites desta etapa: entrada pelo WhatsApp é por texto; arquivos de referência são enviados no painel. Fora da janela de atendimento de 24 horas, respostas ficam aguardando uma nova mensagem do usuário. Lembretes proativos e modelos aprovados para envio fora da janela ainda não foram implementados neste fluxo. Não há publicação automática por habilitar o WhatsApp. Testes usam números fictícios e transportes simulados, em SQLite e PostgreSQL; nenhuma mensagem real foi enviada.

Referência: [Meta — WhatsApp Cloud API](https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api).

## Anexos diretamente no Astra Vídeo

O editor aceita upload de MP4, PNG, JPEG, WebP e PDF, até 25 MB por arquivo, e seleção de referências já salvas. Até seis arquivos por pedido, com limite conjunto de 20 MB para imagens e PDFs. O upload usa o armazenamento privado existente e fica disponível mesmo sem runtime de vídeo; os identificadores seguem no pedido da conversa. Trocar de empresa/projeto durante o upload não anexa o arquivo à conversa seguinte.

Um MP4 enviado pode ser selecionado como vídeo de base e editado por cortes, textos e cores. Imagens e PDFs são referências para o Astra; esta entrega não implementa inclusão de imagens como camadas da timeline, edição de áudio ou importação completa da interface original ASTRA-VIDEO. A pasta original já foi localizada, sem necessidade de reenvio.

**Falta conectar o serviço online** significa que o runtime de vídeo ainda não foi hospedado/configurado. Não é aprovação do cliente. **Validar conexão**, na inteligência do chat, é uma verificação diferente: testa o acesso ao provedor configurado. A presença de uma chave não prova acesso ao modelo.
