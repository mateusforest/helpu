# Marketplace de produtos da Helpu Local

## Demonstração somente local

Com a porta 4173 livre, execute `node scripts/local-marketplace-demo.mjs` em Node 22. O processo atende exclusivamente em `127.0.0.1:4173`, não carrega arquivos `.env`, usa SQLite separado em `.local-data/marketplace-demo` e não altera o lançamento da Vercel nem o banco local anterior.

Na primeira execução são criadas contas fictícias de administrador, loja e pessoa física, com senha aleatória salva somente em `.local-data/marketplace-demo/demo-access.json` (ignorado pelo Git). São incluídos dez anúncios: seis publicados, um vendido, dois em análise e um rascunho. As descrições e os contatos são demonstrativos. As ilustrações locais opcionais ficam em `images/` dentro desse diretório; sem elas os exemplos usam o espaço reservado de imagem. Reiniciar preserva as edições e não duplica anúncios com o mesmo título.

A vitrine fica em `/local/produtos.html`, o login dos anunciantes em `/local/cliente.html` e o login da equipe em `/entrar.html`. Depois de entrar como administrador, abra `/admin.html#/local` ou `/local/anuncios.html?admin=1`.

Encerre esse processo antes de iniciar novamente o servidor normal. Credenciais, imagens de demonstração e banco permanecem fora do commit.

## Acesso

- Vitrine: `/local/produtos.html`, também no menu da Helpu Local.
- Cadastro de anunciantes: `/local/cadastro.html` (pessoa física ou loja).
- Portal existente: `/local/cliente.html`, com acesso a **Meus anúncios de produtos**.
- Gestão dos anúncios: `/local/anuncios.html`.
- Administração: **Helpu Local → Moderar produtos** (`/local/anuncios.html?admin=1`). O parâmetro não concede permissão: a API exige operador autenticado.

## Fluxo

O anunciante cria uma conta ou usa o acesso existente recebido por convite. O cadastro exclusivo para produtos não publica uma página comercial nem ativa o plano de negócios. O nome público identifica o anunciante; e-mail, histórico e informações de moderação não aparecem na vitrine.

Cada anúncio tem título, descrição, categoria, condição Novo/Usado, preço em centavos, cidade, WhatsApp público e até seis fotos JPG/PNG/WebP de 3 MB cada. O limite é de 200 anúncios por conta. As imagens usam o armazenamento de arquivos já existente.

**Rascunho → Em análise → Publicado**. O operador aprova, recusa ou retira um anúncio, com orientação obrigatória para recusa/retirada. Alterações no conteúdo retiram a versão anterior do ar e exigem nova análise. O anunciante pode pausar um anúncio. Reenviar um anúncio pausado ou recusado também exige análise.

Um anúncio aprovado pode ser marcado como **Vendido**, inclusive após pausa feita pelo proprietário. Essa ação encerra o anúncio: ele fica oculto na busca padrão, continua disponível pelo link direto ou pelo filtro de vendidos, e deixa de mostrar WhatsApp. A venda é definitiva; para outro item, é necessário outro anúncio. A administração ainda pode retirar anúncios vendidos do site. Anúncios recusados ou retirados pela equipe não podem contornar a moderação tornando-se vendidos públicos.

A navegação da Helpu Local está liberada pelo código, inclusive quando existe uma configuração antiga de pré-lançamento. Somente empresas publicadas e produtos aprovados ficam visíveis; rascunhos e dados privados continuam protegidos. A configuração histórica de lançamento é preservada para faturamento: liberar a navegação não inicia cobranças nem altera períodos de isenção. Pagamento e entrega dos produtos são combinados diretamente entre as partes; não há checkout, frete ou pagamento integrado.

Na administração, “Excluir do catálogo” retira a empresa e seus produtos do público e bloqueia o acesso do responsável. A exclusão exige confirmação e pode ser revertida pelo filtro “Excluídas”. A restauração mantém o cadastro inativo até revisão e nova publicação. Apenas administradores podem excluir ou restaurar, com controle de versão para impedir alterações sobre cadastros desatualizados.

## Persistência e segurança

Registros `local_product` pertencem ao negócio/contêiner do anunciante (`businessId`), na organização interna `helpu-local-directory`. Contas novas reutilizam `local_account` e `local_session`. Contas com convite continuam compatíveis. Não é necessária nova migração de banco.

As rotas do cliente mantêm cookie HttpOnly e SameSite Strict, validação de origem, autenticação e verificação de proprietário. Modificações usam a versão do registro para evitar sobrescritas concorrentes. Fotos privadas exigem posse; fotos públicas exigem vínculo com anúncio aprovado e visível. Anunciantes inativos deixam de aparecer publicamente.

O cadastro tem limitação de tentativas e unicidade de e-mail. A recuperação de acesso continua assistida pela equipe Helpu; não foi adicionado envio de e-mail nem verificação automática de identidade.

## Validação local

Com Node 22:

```text
node --test tests/local-products.test.mjs tests/local-recovery.test.mjs tests/auth.test.mjs tests/admin-routing.test.mjs tests/customer-portal.test.mjs
node scripts/check.mjs
node --check dist/local/products.js
node --check dist/local/cliente.js
```

Os testes usam banco temporário e cobrem pessoa física, loja nova, loja com convite, fotos, isolamento de contas, origem, validação, conflitos de versão, moderação, lançamento, privacidade, pausa, venda e retirada. O fluxo de criação → aprovação → venda foi conferido também no navegador em servidor separado com dados fictícios.

As falhas anteriormente identificadas na suíte geral (fixtures de inicialização, vídeos/runtime e agrupamento de WhatsApp) estão fora deste módulo. Esta validação não certifica a suíte geral nem representa publicação na Vercel.
