# Helpu Local independente

O projeto exclusivo do marketplace está em `D:\HELPU-LOCAL`, com Git próprio e domínio previsto `https://helpulocal.com`.

O código da administração Marketing deixa de montar os módulos de contas, empresas e produtos Local. Os atalhos passam a apontar para o portal independente. Os arquivos legados e o schema `helpu` permanecem disponíveis para conferência e retorno durante a transição; não foram apagados dados.

## Estado desta entrega

- Projeto novo extraído, dependências próprias, portal administrativo exclusivo e páginas públicas na raiz.
- Cópia privada local do administrador, quatro empresas e sete fotos, obtida sem modificar a produção. Não havia produtos nem contas de anunciantes na exportação de 22/10/2026.
- Os hashes das senhas são preservados na cópia privada; sessões antigas não são transferidas.
- Não houve push, publicação, mudança de DNS nem alteração do banco de produção.

## Ordem de ativação

1. Publicar `D:\HELPU-LOCAL` em **outro** projeto Vercel e conectar `helpulocal.com` a esse projeto.
2. Preparar o schema exclusivo `helpulocal`, papel `helpulocal_runtime` e bucket privado `helpu-local-private` conforme o README do novo projeto. A conta de banco da Marketing não deve ter acesso ao novo schema e vice-versa.
3. Antes da cópia final, suspender as escritas antigas com `HELPU_LOCAL_SEPARATED=true` na Marketing. A API antiga devolve 410 para operações de escrita, evitando cadastros em duas bases. Fazer uma exportação atualizada, importar no destino vazio e conferir contagens, hashes das fotos e o login administrativo. A cópia local desta entrega é uma fotografia do momento, não sincronização.
4. Conferir cadastro de loja e pessoa física, aprovação, vitrine, fotos, vendido, bloqueio e notificações no novo endereço. Configurar e validar o envio de e-mail separadamente.
5. Aplicar `deploy/vercel-marketing-separated.json` como `vercel.json` da Marketing e publicar. Ele redireciona `/local` e os caminhos antigos para o novo domínio. A função `portal/local-separation.mjs` também cobre APIs e o servidor local quando a variável está ativa.
6. Manter o banco antigo preservado até a conferência final. Retorno antes de novas escritas no novo banco: remover a variável, restaurar a configuração Vercel anterior e a versão anterior da administração. Depois de novas escritas, reconciliar os dados antes de retornar; não alternar bases sem isso.

Não publicar a remoção da gestão antiga antes de o novo administrativo estar disponível. A permissão anterior para push não é reutilizada: estes commits ficam locais.
