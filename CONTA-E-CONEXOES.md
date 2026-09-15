# Conta, Instagram e Stripe

**Atualização em 15/09/2026:** o acesso às telas remotas de Instagram, WhatsApp, Facebook e Google e o Astra Vídeo online estão implementados, aguardando hospedagem e validação real. Os acessos ficam em Minha empresa → Telas das contas e Biblioteca → Astra Vídeo. A configuração OAuth/API é separada. Veja [Operação online](OPERACAO-ONLINE.md) para ativação e limites atuais; o diagnóstico de ferramentas pendentes abaixo descreve a versão anterior.

As cinco seções da barra inferior foram mantidas. O botão do usuário abre Minha conta, com Plano, Configurações, Segurança e Faturamento. Nome e senha são editáveis, e é possível encerrar as outras sessões. E-mail, recuperação de senha e autenticação em duas etapas ainda não têm fluxo de alteração/ativação.

Conexões reúne a inteligência e os canais. Higgsfield foi retirado das opções visíveis; registros antigos e a integração interna foram preservados. Na Vercel, não são oferecidos botões para abrir sessões locais de navegador. Os títulos antigos “Contexto: positioning”, por exemplo, aparecem em português sem alterar os dados históricos.

## Situação da operação e das telas no painel

O painel distingue a conexão oficial por API da tela de um serviço. O login oficial do Instagram está implementado, mas só é habilitado quando o aplicativo da Meta e suas credenciais estão configurados. O diálogo de preparação mostra o callback atual e os nomes das variáveis ausentes, sem expor segredos. A configuração manual fica nas opções técnicas; ID não aceita e-mail e token não deve receber a senha da conta. Credenciais inválidas não substituem a conexão anterior.

WhatsApp Business, Perfil da Empresa no Google e Meta Ads ainda usam configuração técnica por API. Não há fluxo de login simplificado implementado para esses três canais. O Google atual é Perfil da Empresa, não Google Ads. Meta Ads permite criar campanhas pausadas; a montagem e ativação completas de anúncios ainda não estão prontas.

Em **Autonomia**, o resumo explica o comportamento atual:

- **Pedido no chat:** Conversar e executar autoriza criar a imagem solicitada, com a versão do briefing, limites e proibições. Somente planejar não gera arquivos.
- **Rotina:** pode preparar textos e conteúdos; imagens automáticas dependem da opção de geração e do serviço de execução ativo. Ativar a opção não comprova que o worker está funcionando.
- **Publicação:** a versão atual exige conteúdo aprovado e autorização da operação, além de conta validada e permissão de publicar. Não existe aprovação automática de toda a produção nesta versão.
- **Atendimento:** depende da opção de respostas, do recebimento configurado, das regras e de contexto suficiente.
- **Vídeo e telas remotas:** continuam pendentes; não são habilitados por uma conexão API.

Para as telas das contas dentro da Helpu online, falta implementar e hospedar o executor de navegador com controle humano, autenticação, perfis privados por empresa e armazenamento persistente. Para o Astra Vídeo, falta integrar projetos por empresa, ferramentas de edição do chat, sessão do editor e exportação com retorno à Biblioteca. A animação de textos do zero também exige cenas sem vídeo de origem, ausentes no editor atual. O detalhamento está em [PAINEL-CANAIS-E-ASTRA.md](PAINEL-CANAIS-E-ASTRA.md).

Esta alteração melhora a conexão e informa o estado real; não instala esses serviços nem declara operação 100% validada. A contratação/configuração de hospedagem e os logins externos continuam pendentes.

## Domínio próprio: helpumkt.com

Na conferência de 15/09/2026, `helpumkt.com` redireciona para `www.helpumkt.com`. O servidor responde ao teste de saúde, mas recusa a autenticação nesse domínio com HTTP 403; o endereço antigo da Vercel responde normalmente. Isso indica que o domínio novo ainda não está na lista permitida da aplicação, que usa `HELPU_PUBLIC_URL` e o endereço do deployment.

1. No projeto da Helpu na Vercel, abra **Settings → Environment Variables**.
2. Atualize `HELPU_PUBLIC_URL` no ambiente **Production** para `https://www.helpumkt.com`, sem caminho adicional.
3. Salve antes do próximo push/deploy. A mudança de variável só entra em vigor em um novo deployment. O responsável pode usar o próximo push para publicar também a correção das mensagens de login.
4. Após o deploy, abra `https://www.helpumkt.com/entrar.html`. Sem sessão, `/api/auth/me` deve retornar HTTP 401 com uma mensagem JSON pedindo login, e não HTTP 403 de domínio recusado.

A configuração da Vercel não foi alterada por esta correção. Não é necessário trocar a senha nem criar outra conta por causa desse bloqueio. Ao configurar Instagram, use `https://www.helpumkt.com/api/connect/instagram/callback` como retorno autorizado. Se já houver uma configuração externa com o endereço antigo, atualize-a também.

Referência: [Vercel — alterações de variáveis exigem novo deployment](https://vercel.com/docs/environment-variables/managing-environment-variables).

## Ativar o login do Instagram

Ter o perfil da Helpu no Instagram é diferente de ter um aplicativo no painel de desenvolvedores da Meta. O código do login oficial está preparado; a configuração externa ainda precisa ser feita.

1. Configure um aplicativo Meta com Instagram API / Instagram Login e associe a conta profissional. Configure os papéis de teste; para oferecer a conexão a outras empresas, conclua as exigências de acesso da Meta para as permissões utilizadas.
2. Cadastre exatamente `https://helpu-seven.vercel.app/api/connect/instagram/callback` como endereço de retorno autorizado (ou o domínio definido em `HELPU_PUBLIC_URL`).
3. Na Vercel, configure `HELPU_INSTAGRAM_APP_ID` e `HELPU_INSTAGRAM_APP_SECRET`, além de `HELPU_PUBLIC_URL`. As credenciais são de Instagram Login do aplicativo. Não coloque valores em arquivos públicos, commits ou no chat.
4. Após um novo deploy feito pelo responsável, abra Minha empresa → Conexões → Entrar com Instagram e autorize a conta correta.

O fluxo solicita `instagram_business_basic`, `instagram_business_content_publish`, `instagram_business_manage_comments` e `instagram_business_manage_messages`. O servidor valida estado, navegador, sessão e empresa antes de trocar o código. O token fica criptografado no banco. A identidade pode ser conferida em Ver acesso. O login não publica conteúdo nem prova que todas as ações do canal estão disponíveis.

A validade do token retornada pela Meta é armazenada. A renovação automática ainda não foi implementada: reconecte quando o acesso expirar. Mensagens recebidas exigem também configurar o webhook já previsto no portal; não são habilitadas apenas pelo login. Nenhuma autorização real da Meta foi executada nesta entrega.

## Ativar planos e faturamento pelo Stripe

O faturamento é da empresa selecionada. Somente seu responsável (`owner`) pode consultar faturas, assinar e gerenciar pagamentos.

1. No Stripe, crie o produto Helpu e um preço recorrente fixo, por unidade, com a periodicidade e valor desejados. Nenhum preço foi criado ou presumido no código.
2. Ative/configure o Customer Portal no painel do Stripe, incluindo as operações que deseja oferecer, como atualização do cartão e cancelamento. Checkout e portal são hospedados pelo Stripe.
3. Configure na Vercel `STRIPE_SECRET_KEY` e `STRIPE_PRICE_ID`, e mantenha `HELPU_PUBLIC_URL` com o domínio HTTPS. Comece com a chave de teste e um preço desse mesmo ambiente. Não é necessária chave pública no navegador para este fluxo.
4. Faça o deploy e teste Minha conta → Plano → Assinar pelo Stripe, retorno à conta, faturas e gerenciamento da assinatura. Só use chave e preço de produção quando o plano estiver definido e o teste externo concluído.

Sem configuração, a tela informa que os pagamentos ainda não estão disponíveis. Com configuração, o preço, a assinatura e as últimas 12 faturas são consultados diretamente no Stripe. O botão Atualizar consulta novamente; faturas anteriores ficam no Customer Portal. Um retorno de Checkout não é prova de pagamento. Não há confiança em parâmetros de URL para ativar uma assinatura.

O preço e os endereços de retorno vêm do servidor, não do formulário. O cadastro do cliente é persistido por empresa e separado entre teste e produção. Chaves idempotentes e um bloqueio persistente evitam solicitações concorrentes; pagamentos abertos são retomados. Assinaturas existentes levam ao gerenciamento. Se uma tentativa ficar sem confirmação por mais de 23 horas, o sistema pede conferência no Stripe antes de criar outra. Ao trocar de conta Stripe, confira/migre os cadastros existentes; uma simples rotação da chave na mesma conta preserva os vínculos.

Esta integração permite contratar e gerenciar uma assinatura e exibir faturas. **Ainda não altera automaticamente permissões ou limites da operação conforme o plano.** Esses limites continuam em Autonomia. Não há webhook de provisionamento comercial nesta entrega, pois os dados exibidos são consultados no Stripe; para liberar/bloquear recursos automaticamente, será necessário definir os planos, o vínculo com os limites e implementar eventos assinados do Stripe. As faturas do Stripe não são uma integração de emissão de nota fiscal brasileira.

Nenhuma cobrança real foi criada. Os testes usam respostas simuladas do Stripe e da Meta, contas fictícias e bancos temporários.

## Validação e referências

- `npm test`: autenticação, isolamento, persistência, login Instagram, Stripe e regressões do portal.
- `npm run check` e `node scripts/build-production.mjs`: sintaxe e arquivos públicos.
- `node tests/account-visual.mjs`: telas de conta e conexões em 1440, 390 e 320 px, com dados fictícios e chamadas externas bloqueadas.
- [Meta: Instagram API](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api).
- [Stripe: criar Checkout](https://docs.stripe.com/api/checkout/sessions/create), [Customer Portal](https://docs.stripe.com/api/customer_portal/sessions/create), [assinaturas](https://docs.stripe.com/api/subscriptions/list) e [faturas](https://docs.stripe.com/api/invoices/list).

Esta entrega deve ser commitada localmente. Push e deploy permanecem com o responsável pelo projeto.
