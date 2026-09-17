# Conta e conexões da Helpu

A Helpu cria o material e o cliente publica manualmente. A única integração de canal oferecida no lançamento é o **WhatsApp oficial da Helpu**. Instagram, Google, Meta Ads e telas de navegador de contas não são requisitos para usar a criação. Os dados antigos dessas integrações continuam preservados.

## Imagens e Reels

Na conversa, escolha Feed, Story, Carrossel ou Reels, ou abra **Biblioteca → Criar conteúdo**. Descreva o pedido, escolha a quantidade do carrossel ou a duração do Reels, anexe referências e acompanhe os arquivos e a legenda na mesma tela. Não há editor renderizado nem uma etapa de verificação manual de produção antes de cada pedido.

OpenAI é a infraestrutura de inteligência e imagens, configurada pela administração. Reels de 15 ou 30 segundos são montados dentro da API da Vercel, com textos, cores, imagens e gravações enviadas. Isso não gera filmagens inéditas, voz ou música por IA. **Não é necessário contratar Render ou outro servidor para esse fluxo.**

Para Feed/Carrossel, a imagem é vertical 4:5; Story e Reels são verticais 9:16. Carrossel permite três a dez imagens. Até seis anexos: PNG, JPG, WebP e, para Reels, MP4. Limites: 20 MB de imagens, 25 MB por arquivo e 30 MB no conjunto de referências do Reels. A Biblioteca e o chat geral mantêm seus próprios formatos de arquivo.

Conversar e executar autoriza gerar o material solicitado; Somente planejar não produz arquivos. Limites e proibições definidos em Autonomia continuam valendo. Cada imagem do carrossel consome uma geração do limite diário. A data do calendário é orientação para o cliente, sem publicação automática.

O código precisa estar publicado com suas dependências e variáveis de produção. Consulte [Operação online](OPERACAO-ONLINE.md) para execução da fila, arquivos, configuração e limitações. Configuração salva não é comprovação de que um pedido real já foi produzido no domínio.

## WhatsApp do usuário e número oficial

**Expandir para WhatsApp** fica na tela Conversa. O usuário informa o próprio telefone, autoriza o recebimento e confirma o vínculo enviando um código ao número oficial. Depois, pode ativar ou desativar o canal e escolher conversar e executar ou somente planejar. Essa verificação protege o acesso à empresa; salvar qualquer telefone não permite ler suas conversas.

Número oficial escolhido: **+55 54 99990-2690**. Está na configuração local; cadastro na Meta, Phone Number ID, token, assinatura do webhook e variáveis na hospedagem precisam corresponder ao mesmo número. O WhatsApp do cliente é um destinatário vinculado, não uma conta Business que ele precisa integrar à Helpu.

Mensagens de texto recebidas usam o mesmo contexto e motor do chat. O envio de arquivos ocorre pelo número oficial. Fora da janela de atendimento de 24 horas, respostas aguardam nova mensagem do usuário; lembretes proativos e templates externos a essa janela ainda não estão implementados. Referências de mídia são anexadas no painel nesta etapa. Ativar o WhatsApp não publica nas redes sociais.

Os campos HELPU_WHATSAPP_*, o callback, o worker, os limites de envio e as proteções estão em [Operação online](OPERACAO-ONLINE.md), seção Conversa do painel no WhatsApp oficial da Helpu. Nenhuma credencial deve ser colada no chat ou commitada.

## Minha conta

As cinco seções da barra inferior foram mantidas. O botão do usuário abre Minha conta, com Plano, Configurações, Segurança e Faturamento. Nome e senha são editáveis; é possível encerrar as outras sessões. Alteração de e-mail, recuperação de senha e autenticação em duas etapas ainda não têm fluxo de alteração/ativação.

## Domínio próprio: helpumkt.com

Se o domínio abrir o painel mas o login informar domínio não habilitado, confira na Vercel → Settings → Environment Variables se HELPU_PUBLIC_URL em Production é https://www.helpumkt.com, sem caminho adicional. Faça um novo deploy manual para aplicar a alteração. O arquivo .env.local não configura a hospedagem.

Sem sessão, /api/auth/me deve retornar HTTP 401 pedindo login, em vez de HTTP 403 de domínio recusado. Não é necessário trocar a senha ou criar outra conta apenas por causa da configuração de domínio.

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

## Verificação e publicação

- npm test: autenticação, isolamento, persistência, criação, limites, anexos, WhatsApp, Stripe e regressões do portal.
- npm run check e node scripts/build-production.mjs: sintaxe, arquivos públicos e dependências de criação.
- node scripts/verify-production-build.mjs: conferir o pacote compilado antes da publicação.
- A conferência visual usa contas fictícias e chamadas externas simuladas. Ela não comprova ativação de conta externa, cobrança ou entrega real de WhatsApp.

Esta entrega deve ser commitada localmente. Push e deploy permanecem com o responsável pelo projeto. As configurações e módulos sociais antigos são preservados como histórico e não fazem parte da ativação deste fluxo.
