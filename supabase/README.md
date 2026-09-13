# Supabase da Helpu

Projeto de destino: `pgwoyxtcrkwtricejdbl` (Helpu).
Landing pública: https://helpu-seven.vercel.app.

Esta migração preserva o modelo de dados existente em PostgreSQL no schema
privado `helpu`. Empresas, registros do Operating Kernel, conversas, ordens,
tarefas, jobs e históricos mantêm seus IDs. Os textos JSON são preservados
integralmente; os índices consultam esses textos como `jsonb`.

O schema não é exposto pela Data API. Todas as tabelas têm RLS habilitada e
forçada. `anon` e `authenticated` não recebem permissões de acesso. O bucket
`helpu-private` é privado, sem políticas de acesso público.

## Estado desta etapa

- Migração `20260913113000_preserve_helpu_data.sql` aplicada ao projeto.
- Os 153 registros foram importados após autorização explícita do usuário,
  incluindo hashes de senhas e credenciais já criptografadas das integrações.
- Os dois arquivos privados (PNG e TTF, 213.213 bytes no total) foram enviados,
  baixados novamente e comparados byte a byte e por SHA-256. Seus vínculos com
  a EME e os registros originais foram confirmados no banco remoto.
- Estado da transferência: `data_and_files_migrated_verified`. A repetição do
  snapshot manteve os 153 registros e uma única importação, sem duplicações.
- Nenhuma conta foi criada no Supabase Auth por esta migração.
- O portal e o worker continuam usando SQLite local. A migração de dados não
  altera o runtime e não coloca cadastro, login ou portal online.
- A landing permanece no Vercel, com o portal indicado como acesso futuro.

Validação local: 148 testes passaram na repetição completa, incluindo quatro
testes novos de transferência. A primeira execução teve uma falha de conexão
HTTP local no Kernel; os 24 testes desse arquivo passaram isoladamente antes
da repetição. Sintaxe: 42 arquivos; diagnóstico local sem erros. A conferência
remota confirmou 16 tabelas privadas, RLS forçada, zero permissões para
`anon`/`authenticated`, 153 registros importados e dois objetos privados.
As URLs públicas dos arquivos recusaram acesso sem autenticação. A landing
retornou HTTP 200. Os dados locais continuam iguais ao snapshot transferido.
As evidências ficam em `.superdesign/supabase-transfer/deployment-evidence.json`.

## Transferência verificável

`node scripts/supabase-transfer.mjs prepare` abre o SQLite em modo somente
leitura, confere integridade e chaves estrangeiras, obtém um snapshot
transacional e copia somente os assets referenciados. Os arquivos resultantes
ficam em `.superdesign/supabase-transfer/`, ignorada pelo Git.

**`import.sql` contém dados privados e hashes de credenciais. Não compartilhar,
versionar, incluir em builds ou imprimir o seu conteúdo.**

O importador gera uma transação que:

1. Exige tabelas vazias na primeira importação e recusa snapshots diferentes.
2. Preserva IDs e não sobrescreve registros remotos.
3. Verifica quantidade e SHA-256 de cada tabela antes de confirmar a transação.
4. Aceita repetir o mesmo snapshot somente se todos os valores continuarem iguais.

Sessões locais e perfis de navegador não são transferidos. O cofre de
integrações é preservado apenas como o ciphertext original; a chave local de
criptografia permanece em `.local-data/`. Isso não valida executores remotos.

Antes de executar a transferência, confirmar que `supabase/.temp/project-ref` contém exatamente
o projeto de destino antes de executar qualquer comando remoto. Aplicar o
arquivo privado com `supabase db query --linked --file ... --output json`,
redirecionando a resposta e os erros para a pasta privada. Conferir a resposta
com `node scripts/supabase-transfer.mjs verify <arquivo-json>`.

Os arquivos são enviados pelo Storage API/CLI para
`helpu-private/<empresa>/<arquivo>`. Baixar novamente e comparar bytes,
tamanho e SHA-256 antes de preencher `assets.storage_bucket`, `storage_path`,
`sha256`, `storage_verified_at` e `cloud_imports.files_verified_at`. Uma linha
importada em `assets` não comprova que o arquivo foi armazenado. Nesta execução,
os dois arquivos passaram por todas essas verificações e os campos foram
persistidos no Supabase. A conferência não altera a oficialidade dos materiais
nem o estado de produção ou aprovação das entregas existentes.

## Limite operacional

O runtime publicado ainda não utiliza estas tabelas. A adaptação assíncrona
para PostgreSQL e Storage está no código local, descrita em
[DEPLOYMENT.md](../DEPLOYMENT.md). A migração de acesso
`20260913140000_activate_cloud_runtime.sql` continua pendente: a revisão
automática exigiu autorização específica para suas permissões de produção.
Nenhuma credencial desse runtime foi configurada e nenhum portal completo foi
promovido. O Supabase não executa automaticamente o servidor Node.js existente
ao receber estas tabelas.

Testes de transferência usam apenas bancos temporários locais. Eles não
acessam o Supabase, não geram mídia e não executam integrações reais.
