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
