# Helpu Local independente

O projeto exclusivo do marketplace está em `D:\HELPU-LOCAL`, com Git próprio e domínio previsto `https://helpulocal.com`.

O código da administração Marketing deixa de montar os módulos de contas, empresas e produtos Local. Os atalhos passam a apontar para o portal independente. Os arquivos legados e o schema `helpu` permanecem disponíveis para conferência e retorno durante a transição; não foram apagados dados.

## Extração inicial

- Projeto novo extraído, dependências próprias, portal administrativo exclusivo e páginas públicas na raiz.
- Cópia privada local do administrador, quatro empresas e sete fotos, obtida sem modificar a produção. Não havia produtos nem contas de anunciantes na exportação de 22/10/2026.
- Os hashes das senhas são preservados na cópia privada; sessões antigas não são transferidas.
- Na extração inicial não houve publicação ou alteração do banco de origem.

## Ativação em 23/10/2026

- Repositório exclusivo: `mateusforest/helpu-local` (privado), pasta `D:\HELPU-LOCAL`, branch `main` enviada ao GitHub por solicitação do responsável.
- Projeto Vercel exclusivo: `helpu-local`. Site, portal e administração disponíveis em `https://helpulocal.com`; `www` redireciona para esse endereço. DNS da Hostinger atualizado e certificado HTTPS emitido.
- Supabase de destino: antigo COS, renomeado Helpu Local. Uma conta administrativa, quatro empresas e sete fotos preservadas. A comparação de leitura da origem nesta ativação não encontrou alterações em relação à exportação importada.
- Testes em produção no domínio final: login administrativo, cadastro e novo login de loja/pessoa física, persistência de rascunho, upload, permissões, recusa/reenvio, aprovação, foto pública e pausa. Somente as contas e os arquivos temporários desses testes foram removidos.
- `vercel.json` aplica os redirecionamentos abaixo; `HELPU_LOCAL_SEPARATED=true` está configurada na Vercel da Marketing e entra em vigor na publicação dessa versão. GET/HEAD das APIs Local redirecionam; escritas antigas recebem 410.
- O vínculo antigo do GitHub no painel Supabase e a autorização do aplicativo Vercel ao novo repositório privado ainda precisam ser concluídos nas sessões autenticadas. Isso não impede a publicação pela CLI nem a conexão direta do site ao banco.
- Entrega de e-mails de confirmação e recuperação continua pendente de configuração de provedor.

## Ordem de ativação

1. Publicar `D:\HELPU-LOCAL` em **outro** projeto Vercel e conectar `helpulocal.com` a esse projeto.
2. Preparar o schema exclusivo `helpulocal`, papel `helpulocal_runtime` e bucket privado `helpu-local-private` conforme o README do novo projeto. A conta de banco da Marketing não deve ter acesso ao novo schema e vice-versa.
3. Antes da cópia final, suspender as escritas antigas com `HELPU_LOCAL_SEPARATED=true` na Marketing. A API antiga devolve 410 para operações de escrita, evitando cadastros em duas bases. Fazer uma exportação atualizada, importar no destino vazio e conferir contagens, hashes das fotos e o login administrativo. A cópia local desta entrega é uma fotografia do momento, não sincronização.
4. Conferir cadastro de loja e pessoa física, aprovação, vitrine, fotos, vendido, bloqueio e notificações no novo endereço. Configurar e validar o envio de e-mail separadamente.
5. Aplicar `deploy/vercel-marketing-separated.json` como `vercel.json` da Marketing e publicar. Ele redireciona `/local` e os caminhos antigos para o novo domínio. A função `portal/local-separation.mjs` também cobre APIs e o servidor local quando a variável está ativa.
6. Manter o banco antigo preservado até a conferência final. Retorno antes de novas escritas no novo banco: remover a variável, restaurar a configuração Vercel anterior e a versão anterior da administração. Depois de novas escritas, reconciliar os dados antes de retornar; não alternar bases sem isso.

Não publicar a remoção da gestão antiga antes de o novo administrativo estar disponível. Push e publicação nesta ativação foram solicitados expressamente pelo responsável; fora dessa solicitação, seguir a preferência de commits locais do AGENTS.md.
