Veja [Conta, Instagram e Stripe](CONTA-E-CONEXOES.md) para a revisão atual da conta, login oficial, faturamento e configuração na Vercel.

# Helpu — portal de marketing

O portal começa pela conversa e reúne 17 áreas da operação, com informações persistentes e empresas separadas. A landing e a animação original do Higgsfield foram preservadas.

Pedidos operacionais agora geram uma ordem compartilhada entre conversa, campanha, entregas, tarefas, agenda e atividades. A primeira vertical prepara uma publicação com conceito, legenda e briefing, passa por revisão e registra aprovação antes de executar. Consulte [HELPU-OPERATING-KERNEL.md](HELPU-OPERATING-KERNEL.md) para ciclo, políticas, evidências, retomada e limites verificados.

## Abrir

Abra `INICIAR-HELPU.cmd` e aguarde a abertura automática de `http://127.0.0.1:4173/portal.html` (ou da porta configurada). Entre com sua conta existente ou faça um cadastro. Login e cadastro levam diretamente ao portal. Para instalação, desenvolvimento, configuração de `.env` e diagnóstico, consulte **LEIA-ME.md**.

É necessário Node.js 22.13 ou posterior. Na primeira abertura, o inicializador instala as dependências com `npm ci --ignore-scripts`. Chrome ou Edge precisa estar instalado para operar sessões locais. Mantenha o servidor aberto durante a utilização e as rotinas; use **Ctrl+C** para encerrar. Não inicie uma segunda cópia na mesma porta.

## Preparar a primeira empresa

1. Selecione a EME no seletor de empresas ou adicione a empresa.
2. Em **Marca e negócio**, informe oferta, público, posicionamento, identidade, tom e restrições. A Helpu não preenche informações comerciais desconhecidas.
3. Em **Integrações**, configure a inteligência. Em **Contas conectadas**, abra o canal, faça login e confirme qual conta a Helpu pode operar. As APIs dos canais são um caminho adicional.
4. Crie uma campanha e peça um briefing ao agente. As peças geradas ficam vinculadas à campanha.
5. Revise no **Estúdio**, gere ou envie a mídia e aprove o conteúdo. Em **Calendário**, programe a publicação.
6. Em **Autonomia**, escolha a rotina diária, geração de imagens, publicação de aprovados e respostas automáticas. Defina os limites.

## Conversar e operar contas

A aba **Helpu** é a entrada principal. Escreva o objetivo, anexe referências e escolha **Conversar e executar** ou **Somente planejar**. A conversa pode consultar registros, salvar rascunhos, atualizar a memória da empresa e usar as ferramentas disponíveis. Imagens e PDFs do pedido atual são enviados ao modelo; vídeos permanecem como referências da biblioteca.

Em **Contas conectadas**, os canais Instagram, WhatsApp, Google e Higgsfield têm perfis exclusivos desta empresa, preservados neste computador. Faça login na janela aberta e confirme a conta. Permissão de operação é uma escolha separada. **Ver sessão** acompanha a janela; a prévia é ocultada durante desafios de autenticação detectados. Login, códigos e CAPTCHA são resolvidos diretamente por você no serviço.

A inteligência recebe os elementos observados e a imagem da página. Cliques não são apresentados como confirmação de publicação ou envio. Se a execução perder a confirmação, a sessão exige conferência antes de continuar. A pausa cancela ações derivadas ainda pendentes e é aplicada nos pontos de controle; não desfaz o que já aconteceu.

O navegador precisa rodar junto com a Helpu neste computador. O adaptador para Chrome pessoal já aberto, o executor remoto pareado, o navegador hospedado e o login via Codex App Server são evoluções descritas em **ARQUITETURA-HELPU.md**, ainda não conectadas nesta entrega.

## Áreas disponíveis

| Área | Operação implementada |
| --- | --- |
| Helpu / Conversa | Pedidos, histórico por empresa, anexos e ferramentas de execução |
| Contas conectadas | Login por navegador, perfis persistentes, confirmação e prévia da sessão |
| Visão geral | Contagem de registros, preparação da empresa e fila de trabalho |
| Marca e negócio | Memória da empresa, posicionamento, tom, oferta e base de conhecimento |
| Campanhas | Objetivo, público, oferta, canais, orçamento e briefing com IA |
| Estúdio criativo | Textos, imagens, vídeos, stories, carrosséis, aprovação e biblioteca privada |
| Calendário | Agenda mensal e fila de publicações aprovadas |
| Contatos e funil | Etapas, valor, próximos passos, consentimento, CSV e campanhas de mensagens |
| Atendimento | Histórico, rascunhos, sugestões de IA, envio e confirmação dos canais |
| Captação | Páginas com formulário que grava contatos no funil |
| Presença no Google | Consulta de contas/perfis, cadastro de estabelecimento, atualização e avaliações |
| Agentes | Diretor, estratégia, criação, distribuição, relacionamento e análise |
| Tarefas | Prioridade, prazo, campanha, andamento e conclusão |
| Resultados | Medições com fonte, importação de Meta Ads e gráfico |
| Integrações | Credenciais separadas por empresa, criptografia e verificação de acesso |
| Autonomia | Rotina diária e limites de IA, mídia e mensagens |
| Atividades | Pedidos, resultados, erros e histórico de alterações |

## Ativação da inteligência e conexões por API

As integrações e o gerenciador de sessões estão implementados, mas não foram exercitados com as suas contas reais nesta entrega. Os testes usam respostas controladas e não publicam ou enviam mensagens reais. A conexão Higgsfield desta conversa não fornece automaticamente credenciais ao portal.

- **OpenAI:** chave da API com acesso ao modelo configurado. A conversa usa `gpt-6-astra` como padrão; os agentes de textos estruturados continuam com `gpt-5-mini` como padrão. Ambos são configuráveis e usam a Responses API. A execução utiliza a memória da empresa e registra a entrega.
Os requisitos dos canais abaixo se referem ao caminho por API. A conexão pela janela do navegador usa o login no próprio serviço.

- **Integração legada Higgsfield (removida das opções da interface):** identificador e segredo da API da sua conta de desenvolvedor. Imagens usam `higgsfield-ai/soul/v2/standard`; vídeos usam o contrato image-to-video DoP, padrão `dop-turbo`, com uma imagem inicial HTTPS. Disponibilidade e cobrança dependem da conta. A biblioteca preserva o resultado quando o endereço retornado pertence aos hosts permitidos.
- **Instagram:** conta profissional, token e permissões de publicação/mensagens do fluxo Instagram Login. A versão da Graph API é configurável. Publicação de foto, reel, story e carrossel de 2–10 fotos. O canal precisa conseguir baixar a mídia de uma URL HTTPS pública; fotos devem atender ao formato JPEG exigido pelo Instagram. Arquivos privados enviados à biblioteca não se tornam públicos automaticamente. Stories também dependem do tipo e das permissões da conta.
- **WhatsApp:** token, identificador do número e modelos aprovados. Mensagem livre depende de uma mensagem real recebida nas últimas 24 horas. Fora da janela, exige modelo aprovado e consentimento registrado. O envio em grupo cria pedidos individuais para os contatos elegíveis; não ultrapassa o limite diário. A aceitação da API não é apresentada como entrega.
- **Google:** acesso autorizado a Business Profile APIs, OAuth `business.manage`, conta e perfil. Há renovação quando refresh token, client ID e secret são informados. Cadastro guiado contempla estabelecimento que atende no endereço físico; a verificação continua com o Google. Publicações e avaliações exigem perfil e permissões compatíveis.
- **Meta Ads:** token e conta de anúncios. O portal cria a campanha de captação **pausada** e importa impressões, cliques e investimento. Conjuntos de anúncios, criativos, segmentação e ativação de gasto precisam ser concluídos no Gerenciador de Anúncios. O orçamento do portal é uma referência de planejamento, não um limite aplicado pela Meta.

O portal organiza e executa esses fluxos. Não inclui varredura automática de pessoas na internet, prospecção por scraping, criação de contas externas sem verificação ou todas as funções dos gerenciadores nativos de anúncios.

## Rotina e confirmações

A rotina diária chama o diretor com os fatos cadastrados. A geração automática de imagens pode acompanhar os conteúdos do agente. A publicação exige aprovação; editar legenda, canal ou mídia revoga a aprovação. O atendimento automático usa mensagens recebidas por webhook assinado e deixa lacunas de contexto para revisão.

Pedidos são persistentes e não desaparecem ao fechar o navegador. A execução depende de o servidor permanecer ativo. Interrupções depois de um pedido externo produzem **Precisa de conferência**, sem repetição automática que possa duplicar publicação, envio ou cobrança. Registros vinculados ficam protegidos até a conferência; a conciliação com um serviço, se necessária, é uma intervenção de suporte nesta versão.

## Acesso externo e operação contínua

Esta instalação está funcionando localmente. Para páginas de captação externas e recebimento de mensagens, hospede o servidor Node continuamente, com disco persistente e proxy HTTPS. Exportar somente `dist/` não executa o portal. Configurar uma origem pública desabilita as sessões locais nesta versão; a operação de navegador exige o executor pareado ou hospedado descrito na arquitetura, ainda a implementar.

- `HELPU_PUBLIC_URL`: origem HTTPS autorizada, por exemplo `https://portal.suaempresa.com`, sem caminho.
- `HELPU_BIND`: endereço da interface, padrão `127.0.0.1`; em contêiner pode ser `0.0.0.0` atrás do proxy.
- `HELPU_PORT`: porta do servidor, padrão `4173`.
- `HELPU_DATA_DIR`: pasta persistente de dados, padrão `.local-data`.

O proxy deve preservar o Host público e terminar o HTTPS. Quando há origem pública, cookies recebem `Secure`. Informe a mesma origem em Autonomia → Endereço público e configure os callbacks em Integrações. Cada canal usa app secret e verify token próprios.

Cadastro local não verifica o e-mail e não inclui recuperação por e-mail ou convites de equipe. Planos e faturamento têm integração com Stripe preparada, com ativação descrita em CONTA-E-CONEXOES.md. Esta entrega não é um lançamento comercial público.

## Dados e manutenção

`.local-data/helpu.sqlite` contém contas, sessões e dados da operação. `.local-data/integration.key` é necessária para ler as credenciais criptografadas. `.local-data/uploads/` contém os arquivos privados. `.local-data/browser-profiles/` guarda perfis autenticados privados; encerre as sessões antes de fazer seu backup. Preserve os componentes de dados e a chave de criptografia. Não compartilhe essa pasta nem a inclua no pacote de distribuição.

As senhas usam scrypt e sal individual; sessões são HttpOnly e expiram em sete dias. Credenciais são criptografadas no servidor por empresa, sem aparecer no navegador após serem salvas. Os resultados de API são dados, nunca instruções para executar ações fora da política configurada.

O código está em `server.mjs`, `portal/`, `dist/` e `tests/`. As migrações preservam as tabelas de contas e sessões anteriores. Execute `npm run check` e `npm test` para as verificações automatizadas.

Os testes cobrem autenticação, isolamento, persistência, ferramentas, cancelamento, recuperação e inicialização local, incluindo configuração, porta ocupada e reinício em desenvolvimento. Eles usam dados temporários, provedores e navegador controlados para teste, sem validar publicação ou atendimento em contas reais. A interface não passou por inspeção visual automatizada no navegador nesta revisão.

## Referências dos contratos implementados

- [OpenAI Responses](https://platform.openai.com/docs/api-reference/responses)
- [Higgsfield Quickstart](https://docs.higgsfield.ai/docs/quickstart) e [contratos DoP no SDK oficial](https://github.com/higgsfield-ai/higgsfield-js/blob/main/src/v2/types.ts)
- [Instagram — coleção oficial Meta](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api)
- [WhatsApp Cloud API](https://developers.facebook.com/docs/whatsapp/cloud-api/)
- [Google Business Profile](https://developers.google.com/my-business/reference/businessinformation/rest)
- [Meta Marketing API](https://developers.facebook.com/docs/marketing-api/)
