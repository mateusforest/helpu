# Implantação da Helpu

- Repositório: `https://github.com/mateusforest/helpu.git`, branch `main`.
- Projeto Vercel existente: `helpu`, equipe `mateus-maraschin-forests-projects`.
- Endereço público: `https://helpu-seven.vercel.app`.
- Supabase: `pgwoyxtcrkwtricejdbl`; ver [migração e verificações](supabase/README.md).

## Build reproduzível

O build publicado anteriormente executa `node scripts/build-landing.mjs` e
publica `.superdesign/vercel-landing`. A adaptação em andamento usa
`node scripts/build-production.mjs`, publica `dist` e inclui `api/[...path].mjs`.
Essa nova configuração ainda não foi promovida. `.vercelignore` limita os arquivos enviados pelo CLI.
Credenciais, `.local-data/`, backups, perfis de navegador, relatórios privados
de migração e configurações locais da Vercel ficam fora da publicação.

No Windows, o rastreamento local de dependências ignorou exclusões e incluiu
arquivos privados em um build de teste. Esse pacote não foi publicado e foi
removido; os originais continuam preservados. Para compilar localmente, executar
`node scripts/stage-production.mjs` com `.superdesign/production-source` vazia,
rodar `vercel build --prod` nessa cópia e conferir, na raiz do projeto:
`node scripts/verify-production-build.mjs .superdesign/production-source/.vercel/output`.
O script copia somente os diretórios e arquivos de código autorizados, sem
variáveis de ambiente ou dados locais. O pacote conferido contém 151 arquivos,
uma função Node.js 22 e nenhum arquivo privado. Não enviar um pacote que não
passe nessa conferência. O build do Git utiliza somente arquivos versionados.

A conexão GitHub foi confirmada no projeto existente, com `main` como branch
de produção. Uma publicação pelo Git foi verificada. Isso ainda publica a landing.

## Estado do produto publicado

A configuração atual publica a landing. Os links de cadastro e portal
continuam apontando para o aviso de acesso futuro. As páginas e o código
completos do portal estão no repositório, mas não são ativados por este build.

A importação verificada no Supabase preservou os dados; o servidor existente
ainda usa `node:sqlite`, arquivos locais, a chave local de criptografia e um
worker contínuo. A Vercel não oferece o armazenamento local permanente
necessário a esse runtime, conforme sua [documentação de SQLite](https://vercel.com/kb/guide/is-sqlite-supported-in-vercel).
Subir os arquivos HTML do portal não disponibiliza sua API nem suas automações.

O usuário escolheu Vercel + Supabase. Para liberar o sistema completo, é
necessário validar a adaptação de PostgreSQL/Storage e jobs em produção.
Perfis de navegador precisam de um executor persistente com autenticação e
identidade verificadas. Não ativar o acesso público ao portal antes de validar
login, isolamento entre empresas, gravação, arquivos privados e execução nesse
runtime. A landing permanece disponível durante essa transição.

## Adaptação para Vercel + Supabase

O servidor e o Kernel agora usam consultas assíncronas. O driver PostgreSQL
reutiliza o schema privado e os IDs existentes; SQLite permanece para testes e
desenvolvimento. Transações usam a mesma conexão por escopo. Atualizações
verificam a versão antes de gravar. Sessões e tentativas de login são persistidas.

O Storage continua privado. Upload direto é autorizado para um único objeto;
o servidor confere empresa, tipo, tamanho e SHA-256 antes de registrá-lo.
Repetir a conclusão retorna o mesmo asset. Arquivos grandes usam links de
leitura de 60 segundos emitidos somente após verificar sessão e empresa.

A migração `20260913140000_activate_cloud_runtime.sql` foi conferida com dry-run
e testada em PostgreSQL local. Sua aplicação foi bloqueada pela revisão automática
por exigir autorização específica das permissões de produção. A confirmação
foi solicitada ao usuário. Não contornar o bloqueio.

Após autorização, configurar no ambiente Production da Vercel:

- `DATABASE_URL`: TLS no pooler do projeto, usuário exclusivo `helpu_runtime.pgwoyxtcrkwtricejdbl`.
- `SUPABASE_URL`: `https://pgwoyxtcrkwtricejdbl.supabase.co`.
- `SUPABASE_SERVICE_ROLE_KEY`: somente backend, nunca enviada ao cliente.
- `HELPU_INTEGRATION_KEY`: os mesmos 32 bytes locais, em base64, para ler o cofre já criptografado.
- `HELPU_PUBLIC_URL`: `https://helpu-seven.vercel.app`.
- `CRON_SECRET`: segredo exclusivo do worker.
- `HELPU_AUTOMATIONS_ENABLED`: manter `false` até validar o worker remoto.

A migração cria `helpu_runtime` sem LOGIN, superusuário, criação de roles ou
bypass de RLS. Após autorização, habilitar LOGIN com senha forte gerada e guardada
nas variáveis privadas da Vercel. O papel acessa apenas as tabelas operacionais
do schema Helpu; `portal_migrations` é somente leitura, `cloud_imports` não é
acessível e `anon`/`authenticated` continuam sem acesso. O schema não é exposto
na Data API pública.

`POST /api/worker` exige o segredo Bearer. Uma lease no PostgreSQL impede
workers simultâneos. O worker reutiliza `portal.tick()`, a prioridade por trabalhos
pendentes e os limites das empresas. Jobs interrompidos passam pela recuperação
do Kernel; efeitos incertos não são repetidos automaticamente.

Após validar o deployment, configurar um único acionamento no Supabase Cron,
com o segredo no Vault. O timer local fica desativado na Vercel. `waitUntil`
também pode acordar esse mesmo worker após ações autenticadas. O agendamento
remoto ainda precisa ser configurado e verificado.

Navegadores locais não são transferidos. Na nuvem, esses canais informam
`blocked_persistent_browser_required`; conta salva não é sessão autenticada.

Antes de promover: conferir possível divergência entre banco local e snapshot,
aplicar a migração autorizada, configurar e validar credenciais, testar o
deployment sem trocar o domínio e conferir login, isolamento, arquivos e jobs.
Os testes automatizados usam dados sintéticos, PostgreSQL em memória e
Storage/provedores simulados. Não iniciam geração real nem publicação.

Validação desta adaptação: 156 testes aprovados, sintaxe de 52 arquivos e
diagnóstico local sem erros. A inspeção com Chromium em desktop e mobile
concluiu 17 verificações e 27 capturas, sem erros de JavaScript ou chamadas
externas. Três testes da conversa inicialmente falharam porque o harness VM
não carregava o novo import de upload; o harness passou a usar o módulo real
e a suíte completa foi repetida. Isso não substitui a validação do runtime
com as credenciais e os serviços de produção.

Última conferência dos dados: os 153 registros das 15 tabelas do snapshot
continuam iguais no SQLite e no Supabase, comparados por quantidade e SHA-256.
Os dois arquivos locais também continuam iguais ao snapshot. Essa consulta
foi somente leitura; a migração de acesso do runtime permanece pendente.
