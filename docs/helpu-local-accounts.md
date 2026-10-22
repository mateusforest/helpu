# Contas e páginas da Helpu Local

## Entrada única

- Cadastro: `/local/cadastro.html`. Empresas selecionam **Empresa ou loja**; pessoas físicas selecionam **Pessoa física**. O responsável define a senha e recebe sessão imediatamente.
- Para convidar uma empresa nova, compartilhe `/local/cadastro.html?tipo=empresa`. Não há pedido para a equipe cadastrar manualmente.
- Login e recuperação: `/local/cliente.html`. Empresas gerenciam página comercial, contatos e produtos; pessoas físicas gerenciam produtos.
- `/local#/empresas` redireciona ao cadastro novo. `/api/local/apply` e a criação manual administrativa retornam 410, sem gravar pedidos.
- Marketing e administração continuam com contas próprias em `/entrar.html`. A página indica o acesso à Helpu Local. Contas de anunciante nunca concedem acesso de administrador.

## Contas existentes

Não é necessário recadastrar. Os identificadores, senhas, produtos e fotos existentes são preservados. Lojas anteriormente marcadas como exclusivas de produtos passam a ter página comercial; contas sem tipo explícito são empresas antigas. Pessoas físicas continuam somente com produtos.

O botão administrativo **Acesso de cadastro existente** serve para vincular empresas antigas sem conta ou recuperar seu acesso. Convites pessoais existentes continuam válidos, vencem em 72 horas e só podem ser usados uma vez. Ativar um convite não aprova a página. Novas empresas usam sempre o cadastro público. A emissão de convite não altera o e-mail já vinculado.

Estados antigos “Novo cadastro”, “Em contato” e “Em preparação” são apresentados como “Rascunho”. A compatibilidade é feita na leitura, sem migração destrutiva ou cópia de dados.

## Página e produtos

Ambos seguem **Rascunho → Em análise → Publicado**. Só a equipe aprova. Recusas mostram o motivo no portal e permitem corrigir e reenviar. Alterações em conteúdo, contato ou fotos retiram a página do público, inclusive a mídia pública. O responsável pode salvar rascunho ou enviar para análise. Pausar também exige reenvio e nova aprovação para voltar.

A página comercial e cada produto têm revisões independentes. Pausar a página não pausa produtos já aprovados. Excluir ou inativar o anunciante retira ambos e bloqueia seu acesso. Ao restaurar um cadastro excluído, ele permanece inativo: a equipe salva a página como rascunho para reabilitar o acesso, e o responsável a envia para revisão.

O nome do vendedor é guardado na aprovação de novos produtos para que edições pendentes da página não modifiquem produtos aprovados. Produtos anteriores sem esse campo usam o nome existente por compatibilidade.

## Ativar os e-mails

O adaptador usa a [API oficial da Resend](https://resend.com/docs/api-reference/emails/send-email). Não há chave incluída no repositório.

1. Criar a conta de envio e verificar um domínio da Helpu na Resend, incluindo os registros DNS solicitados.
2. Criar uma chave de envio e configurar apenas no servidor/Vercel, em Production:
   - `RESEND_API_KEY`: chave privada do serviço.
   - `HELPU_EMAIL_FROM`: remetente autorizado, por exemplo `Helpu Local <acesso@seu-dominio-verificado>`.
   - `HELPU_PUBLIC_URL`: `https://www.helpumkt.com`.
3. Publicar a versão com essas variáveis e testar com uma caixa de e-mail controlada pela equipe: cadastro, confirmação, recuperação e login com nova senha. Conferir também o spam e os registros de entrega da Resend.

O cadastro envia confirmação automaticamente quando o serviço está configurado; o portal oferece reenvio. O link expira em 24 horas. A recuperação envia um link de 1 hora, que só funciona uma vez. Trocar/redefinir senha invalida sessões anteriores e links de recuperação. Tokens são aleatórios, guardados somente como hash, não aparecem no portal nem nos logs da aplicação, e vão no fragmento do link para não entrarem nos logs HTTP. Todas as operações têm controle de origem e limites de tentativas.

Sem configuração, cadastro/login e preparação dos anúncios funcionam normalmente; a recuperação informa que o envio não foi ativado. Falhas de envio não apagam a conta criada. A confirmação de e-mail não é condição para entrar ou enviar conteúdo para revisão: a publicação continua dependendo da equipe. A resposta de recuperação é a mesma para endereços existentes e desconhecidos; falha de entrega também não revela se existe conta.

Esta entrega prepara e testa a integração com um remetente simulado. Não cria conta na Resend, não altera DNS e não confirma entrega externa sem credenciais. Nenhuma mensagem real é enviada pelos testes ou pelo servidor de demonstração.

## Verificação

`npm run test:marketplace` cobre cadastro, login, convites antigos, rascunho, recusa/correção, aprovação, pausa, permissões, fotos de produtos, confirmação, expiração e reutilização de links, falhas de envio e troca de senha. O fluxo novo roda em SQLite e em PostgreSQL local com as migrações e a função de banco da aplicação cloud. Não substitui teste de entrega externa na Resend.

`npm run check` verifica a sintaxe do projeto. A demonstração em `node scripts/local-marketplace-demo.mjs` usa somente dados fictícios e desabilita e-mail externo.
