# Conexões no VS Code

Pasta: `C:\Users\hub\OneDrive\Documentos\ChatGPT\HELPU`.

GitHub: `mateusforest/helpu`, branch `main`. Vercel: projeto `helpu`, equipe
`mateus-maraschin-forests-projects`. Supabase: `pgwoyxtcrkwtricejdbl`, schema
privado `helpu` e bucket `helpu-private`. Domínio: `https://www.helpumkt.com`.

## Arquivos privados

- `.env.example`: modelo versionado, sem chaves.
- `.env.local`: configuração do desenvolvimento, lida por `npm run dev` e
  `npm start`. Esses comandos usam SQLite, mesmo se existir `DATABASE_URL`.
- `.env.production.local`: exportação privada das variáveis de produção, que pode
  estar incompleta quando a Vercel bloqueia a exportação de segredos. É carregada
  somente quando indicada explicitamente ao Node. O desenvolvimento normal e
  a demonstração não carregam esse arquivo.
- `.vercel/project.json`: vínculo local com o projeto de hospedagem.

Os três últimos caminhos são ignorados pelo Git. Clonar o repositório não baixa
as chaves. A ausência de `.env.local` não significa falta de configuração na
produção. Não coloque segredos em `dist`, documentação ou commits.

## Terminal neste computador

```powershell
$env:PATH = (Get-Content .\helpu-node-path.log) + ';' + $env:PATH
npm run doctor
```

O caminho portátil é específico deste computador. Em outro computador,
instale Node.js 22.13 ou posterior e as dependências do projeto.

## GitHub

O conector GitHub do assistente e o login do Git no Windows são separados.
Confira o repositório e os nomes das contas autenticadas:

```powershell
git remote -v
git credential-manager github list
```

Se a lista estiver vazia, use o fluxo oficial abaixo e confirme o código no
endereço mostrado. Não envie senhas ou tokens pelo chat. Isso não faz push.

```powershell
git credential-manager github login --device --no-ui
```

## Vercel e configuração existente do Supabase

Os comandos abaixo conectam a conta, vinculam esta pasta ao projeto existente
e baixam suas variáveis. Não fazem deploy e não criam outro banco:

```powershell
npx vercel@65.1.0 login
npx vercel@65.1.0 link --project helpu --scope mateus-maraschin-forests-projects
npx vercel@65.1.0 env ls production
npx vercel@65.1.0 env pull .env.production.local --environment=production
```

Preserve uma cópia privada antes de substituir um arquivo existente. Variáveis
marcadas como sensíveis podem não ser exportáveis. Nesse caso, recupere o valor
original por um canal seguro; não invente outra chave do cofre ou senha do banco.
O marcador `[SENSITIVE]` significa valor indisponível, não uma credencial válida.
Preencha os valores ausentes diretamente no arquivo privado, sem enviá-los pelo
chat. Não execute operações no banco até completar a configuração necessária.

O backend espera `DATABASE_URL`, `DATABASE_CA_CERT`, `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `HELPU_INTEGRATION_KEY`, `HELPU_PUBLIC_URL` e
`CRON_SECRET`. A administração depende também das variáveis `HELPU_OPERATOR_*`.
Uma chave pública do Supabase não acessa o schema privado. As contas da Helpu
usam autenticação própria e não ficam na lista Supabase Auth.

Para conferir somente presença, sem mostrar valores, com Node 22:

```powershell
node --input-type=module -e "import fs from 'node:fs'; import {parseEnv} from 'node:util'; const e=parseEnv(fs.readFileSync('.env.production.local','utf8')); for(const k of ['DATABASE_URL','DATABASE_CA_CERT','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','HELPU_INTEGRATION_KEY','HELPU_PUBLIC_URL','CRON_SECRET']) console.log(k, e[k] && e[k] !== '[SENSITIVE]' ? 'configurada' : 'ausente');"
```

## Conferência sem alterar dados

`https://www.helpumkt.com/api/health` verifica o backend publicado e uma leitura
do banco. `storage: supabase` e `status: ok` confirmam essa conexão em produção,
mas não comprovam acesso direto deste computador.

Para a prévia administrativa de contas, consulte `helpu-local-accounts.md`.
O comando abaixo é somente leitura enquanto não receber `--apply`:

```text
node --env-file=.env.production.local scripts/local-account-cleanup.mjs --preserve-email EMAIL_DO_ADMINISTRADOR
```

Não aplique uma limpeza para testar a conexão. Os relatórios contêm contatos
privados e não devem ser publicados ou commitados.

Referências: [Vercel CLI e variáveis](https://vercel.com/docs/cli/env) e
[conexão PostgreSQL do Supabase](https://supabase.com/docs/guides/database/connecting-to-postgres).
