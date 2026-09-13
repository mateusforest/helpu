# Implantação da Helpu

- Repositório: `https://github.com/mateusforest/helpu.git`, branch `main`.
- Projeto Vercel existente: `helpu`, equipe `mateus-maraschin-forests-projects`.
- Endereço público: `https://helpu-seven.vercel.app`.
- Supabase: `pgwoyxtcrkwtricejdbl`; ver [migração e verificações](supabase/README.md).

## Build reproduzível

O `vercel.json` na raiz executa `node scripts/build-landing.mjs` e publica
`.superdesign/vercel-landing`. O build usa uma lista explícita de arquivos
públicos. `.vercelignore` limita também os arquivos enviados pelo CLI.
Credenciais, `.local-data/`, backups, perfis de navegador, relatórios privados
de migração e configurações locais da Vercel ficam fora da publicação.

A conexão ao Git deve usar o projeto existente. A conta GitHub precisa
autorizar o aplicativo Vercel para `mateusforest/helpu` em **Settings → Git**.
Uma conexão local em `.vercel/project.json` não confirma esse vínculo remoto.

## Estado do produto publicado

A configuração atual publica a landing. Os links de cadastro e portal
continuam apontando para o aviso de acesso futuro. As páginas e o código
completos do portal estão no repositório, mas não são ativados por este build.

A importação verificada no Supabase preservou os dados; o servidor existente
ainda usa `node:sqlite`, arquivos locais, a chave local de criptografia e um
worker contínuo. A Vercel não oferece o armazenamento local permanente
necessário a esse runtime, conforme sua [documentação de SQLite](https://vercel.com/kb/guide/is-sqlite-supported-in-vercel).
Subir os arquivos HTML do portal não disponibiliza sua API nem suas automações.

Para liberar o sistema completo, é necessário concluir a escolha do runtime:
um servidor contínuo para o backend existente ou a adaptação do acesso a
PostgreSQL/Storage e do processamento de jobs para o ambiente serverless.
Perfis de navegador precisam de um executor persistente com autenticação e
identidade verificadas. Não ativar o acesso público ao portal antes de validar
login, isolamento entre empresas, gravação, arquivos privados e execução nesse
runtime. A landing permanece disponível durante essa transição.
