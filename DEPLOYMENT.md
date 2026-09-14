# Produção da Helpu

- Vercel: projeto **helpu**, equipe **mateus-maraschin-forests-projects**.
- Endereço principal: https://helpu-seven.vercel.app.
- GitHub: https://github.com/mateusforest/helpu.git, branch **main** conectada à Vercel.
- Supabase: **pgwoyxtcrkwtricejdbl**, schema privado **helpu**, bucket privado **helpu-private**.

## Runtime e dados

A Vercel serve landing, cadastro, login e portal de `dist`. A função Node.js 22
`api/runtime.mjs` recebe todas as rotas `/api/:path*` por rewrite explícito.
O nome com colchetes usado inicialmente não capturava rotas aninhadas no runtime
Node da Vercel; a verificação do pacote passou a testar esse caso.

O servidor e o Operating Kernel usam consultas assíncronas, mantendo os IDs,
contratos e históricos existentes. PostgreSQL e Storage persistem os dados da
nuvem. SQLite permanece no desenvolvimento e nos testes. Transações reutilizam
a mesma conexão; gravações conferem a versão anterior. Sessões e tentativas de
login persistem no banco.

O papel **helpu_runtime** não é superusuário nem ignora RLS. Acessa as tabelas
operacionais do schema Helpu; **portal_migrations** é somente leitura e
**cloud_imports** não é acessível. **anon** e **authenticated** continuam sem
acesso ao schema, que não é exposto pela Data API. O servidor verifica a empresa
antes de consultar ou gravar seus registros.

A conexão cliente verifica CA e hostname com TLS 1.3. O certificado foi obtido
da URL usada pelo código público oficial do painel Supabase, em
`apps/studio/hooks/custom-content/custom-content.json`. A terminação TLS ocorre
no pooler; o campo interno pg_stat_ssl não descreve o socket cliente da Vercel.
Não usar `rejectUnauthorized:false` para contornar erros de certificado.

O servidor autoriza upload para um único objeto e confere empresa, tipo,
tamanho e SHA-256 antes de registrá-lo. Repetir a conclusão retorna o mesmo
asset. Arquivos grandes usam links privados de leitura de 60 segundos, emitidos
após verificar sessão e empresa.

## Configuração privada

Variáveis do ambiente Production da Vercel:

- `DATABASE_URL`: pooler com o papel exclusivo helpu_runtime.
- `DATABASE_CA_CERT`: certificado público da autoridade Supabase.
- `SUPABASE_URL`: https://pgwoyxtcrkwtricejdbl.supabase.co.
- `SUPABASE_SERVICE_ROLE_KEY`: chave de Storage somente no backend.
- `HELPU_INTEGRATION_KEY`: os mesmos 32 bytes originais, em base64, para ler o cofre.
- `HELPU_PUBLIC_URL`: https://helpu-seven.vercel.app.
- `CRON_SECRET`: segredo exclusivo do worker, também guardado no Supabase Vault.
- `HELPU_AUTOMATIONS_ENABLED`: true para habilitar o worker validado.

A autorização específica do usuário foi recebida. As migrações
`20260913140000_activate_cloud_runtime.sql` e
`20260913150000_activate_cloud_schedule.sql` foram aplicadas. Nenhum segredo
consta nos arquivos versionados. Bancos, WAL, cookies, perfis e `.local-data`
permanecem fora do Git e dos pacotes enviados.

## Rotina e limites reais

`POST /api/worker` exige CRON_SECRET. Uma lease no PostgreSQL impede workers
simultâneos. O worker chama o mesmo `portal.tick()`, mantendo a prioridade dos
trabalhos pendentes e o limite da EME de oito execuções de inteligência por dia.
Não há outro Kernel nem um segundo agendador de negócio.

O Supabase Cron usa um único job, **helpu-operating-kernel**, a cada minuto.
O segredo é lido do Vault pela função privada **helpu.invoke_cloud_worker**.
A migração cria o acionamento inativo; ativá-lo somente depois de confirmar
que o domínio principal atende à nova API. Conferir o retorno HTTP de pg_net
e o last_completed_at de worker_leases. Um disparo aceito pelo Cron sozinho
não comprova que o worker concluiu.

O timer local não inicia na Vercel. `waitUntil` também pode acordar o mesmo
worker após ações autenticadas. Jobs interrompidos passam pela recuperação
existente; efeitos incertos não são repetidos automaticamente.

A primeira execução real na Vercel terminou com seis jobs e três reservas de
uso, iguais aos valores anteriores: nenhuma nova chamada de inteligência,
geração ou publicação. A EME mantém autoMedia, allowPublishing e autoReply
como false. Suas três entregas criativas e o bloqueio de materiais oficiais
foram preservados. Publicar o portal não produz nem aprova essas peças.

Perfis de navegador não são transferidos. Esses canais informam
`blocked_persistent_browser_required` na nuvem até existir um executor
persistente, autenticado e com identidade confirmada. Conta salva não comprova
sessão autenticada.

## Build e validação

O Git publica somente arquivos versionados. Para compilar localmente no Windows,
usar uma árvore isolada: a ferramenta ignorou parte das exclusões e chegou a
copiar arquivos privados em um build local inicial. Esse pacote não foi
publicado e foi removido; os originais foram preservados.

1. Executar `node scripts/stage-production.mjs` com `.superdesign/production-source` vazia.
2. Executar `vercel build --prod` nessa cópia.
3. Na raiz, executar `node scripts/verify-production-build.mjs .superdesign/production-source/.vercel/output`.
4. Conferir ausência dos valores reais de credenciais no pacote antes de enviar.
5. Validar uma implantação protegida antes de promover o domínio principal.

O pacote conferido tem uma função Node.js 22, rotas aninhadas explícitas e zero
arquivos privados. Os 156 testes passaram; a sintaxe de 52 arquivos foi
conferida. Uma execução paralela ao build excedeu o tempo dos testes de
inicialização: os nove testes passaram isoladamente e a suíte completa foi
repetida sem falhas. Nenhum tempo limite ou asserção foi removido.

A validação real com duas contas temporárias confirmou cadastro, login, cookies
seguros, logout, isolamento entre empresas, gravação de perfil, upload/download
privado, SHA-256 e conclusão idempotente. As contas não tinham acesso à EME.
O Chromium cobriu cinco áreas em desktop e mobile, com dez capturas, sem
overflow horizontal ou erros de JavaScript. Credenciais de teste e relatórios
ficam apenas em `.superdesign/async-migration`, ignorada pelo Git. A limpeza
remove somente os IDs sintéticos registrados na verificação.

Os 153 registros do snapshot original e os dois arquivos privados foram
comparados antes da ativação. A rotina pode acrescentar suas transições reais
ao histórico. `.local-data` não é alterada pela produção na Vercel.

## Conferência operacional

`GET /api/health` verifica acesso ao schema. Login, escrita e arquivos precisam
de verificações próprias. Conferir a versão ativa da Vercel, a branch main,
o retorno real do Cron e as políticas da empresa ao investigar uma falha.
As evidências ficam em `.superdesign/async-migration/deployment-evidence.json`,
sem valores de credenciais.

## Minha conta, Instagram e Stripe

A configuração opcional do login oficial e dos pagamentos está em [CONTA-E-CONEXOES.md](CONTA-E-CONEXOES.md). As rotas novas reutilizam o runtime existente e as tabelas atuais; não requerem migração adicional. Cadastre as credenciais na Vercel antes de testar os serviços externos.
