# Hospedar o runtime da Helpu

Este pacote prepara **uma instância persistente** para navegador, edição/exportação de vídeo e execução periódica do worker. A interface e o banco existentes continuam na Vercel/Supabase. Nada neste pacote contrata servidor, configura DNS ou publica automaticamente.

## O que precisa existir

- VM Linux com acesso administrativo, Docker Engine rootful e plugin Docker Compose. O firewall do Docker precisa usar o backend **iptables**, com a cadeia `DOCKER-USER`. Este procedimento não serve diretamente para Docker Desktop, Docker rootless, Swarm ou o backend nftables nativo.
- Kernel com user namespaces disponíveis para Chromium com sandbox. O processo roda como `pwuser`, com seccomp e sem `--no-sandbox`. A inicialização verifica isso e recusa subir sem sandbox. O procedimento segue a combinação de usuário separado e seccomp indicada pelo [Playwright](https://playwright.dev/docs/docker).
- Disco persistente com proteção de acesso e backup; o volume guarda cookies de contas, projetos e arquivos. A capacidade inicial configurada é 4 CPUs, limite de 6 GiB para o runtime e até 4 sessões abertas. Reserve memória adicional para sistema/Caddy e ajuste após medir uso real; isso não é uma estimativa de capacidade por cliente.
- `iptables`, `python3`, `kmod`, `util-linux`/`flock` e OpenSSL no host. Para o backup fornecido, instale também `age`.
- Código deste commit em `/opt/helpu-runtime`, controlado pelo administrador. O build copia apenas módulos de `services/runtime` e os arquivos necessários de `deploy/runtime`; arquivos `.env`, Git, banco e credenciais locais ficam fora do contexto pelo `Dockerfile.dockerignore`.

Não coloque mais de uma réplica nesse volume. O navegador mantém perfil persistente e o serviço assume um único executor. Não exponha Docker socket ou porta de depuração do Chromium.

## Domínio e portas

Crie um registro DNS **A** para `runtime.helpumkt.com` apontando ao IPv4 público da VM. O domínio principal `www.helpumkt.com` continua apontando à Vercel. Não acrescente AAAA sem preparar e testar IPv6 do servidor.

No firewall do provedor, libere TCP 80 e 443 para Caddy e SSH somente dos endereços administrativos. A porta 8080 não é publicada. Caddy encaminha `/v1/*` ao runtime pela rede Docker e obtém/renova o certificado HTTPS automaticamente, conforme sua [documentação de HTTPS](https://caddyserver.com/docs/automatic-https). O endereço não apresenta uma página de login: usuários interagem pela Helpu, cujo servidor autentica e encaminha os pedidos.

## Configuração privada

No host, com o checkout já em `/opt/helpu-runtime`:

```bash
sudo install -d -m 0700 /etc/helpu-runtime
sudo install -m 0600 /opt/helpu-runtime/deploy/runtime/runtime.env.example /etc/helpu-runtime/runtime.env
sudo install -m 0644 /opt/helpu-runtime/deploy/runtime/network.env.example /etc/helpu-runtime/network.env
sudoedit /etc/helpu-runtime/runtime.env
sudoedit /etc/helpu-runtime/network.env
```

Preencha `HELPU_ACME_EMAIL` com o e-mail administrativo e mantenha `HELPU_RUNTIME_DOMAIN=runtime.helpumkt.com`. Configure `HELPU_PUBLIC_URL=https://www.helpumkt.com`.

Gere dois segredos independentes com pelo menos 32 caracteres, por exemplo usando `openssl rand -hex 32`. Grave o primeiro em `HELPU_RUNTIME_SECRET` e o segundo em `CRON_SECRET`. Não use senha de Instagram nesses campos e não envie os valores por chat.

Na Vercel, ambiente Production, configure:

| Variável | Valor |
|---|---|
| `HELPU_RUNTIME_URL` | `https://runtime.helpumkt.com` |
| `HELPU_RUNTIME_SECRET` | Exatamente o primeiro segredo do servidor |
| `CRON_SECRET` | Exatamente o segundo segredo do servidor |
| `HELPU_PUBLIC_URL` | `https://www.helpumkt.com` |
| `HELPU_AUTOMATIONS_ENABLED` | `true`, para o worker processar os pedidos e agendamentos |

Essas variáveis são de servidor. Não use prefixo público nem as exponha no JavaScript entregue ao cliente. Após atualizar a Vercel, publique uma nova versão pelo fluxo habitual do proprietário. Alterar `.env.local` no computador não configura a VM nem a Vercel.

`network.env` centraliza subnet, gateway, IPs fixos de runtime/Caddy e DNS. Verifique conflitos com Docker, VPN e VPC antes de usar `172.30.80.0/24`. Os dois DNS precisam ser IPv4 públicos. Se o provedor tiver outros endereços reservados que devam ser bloqueados, adicione `HELPU_BLOCK_CIDRS` com CIDRs separados por espaços. Pare o serviço antes de alterar IPs/rede; o script recusa trocar regras para um IP diferente enquanto há runtime ativo.

## Build e inicialização

Os comandos seguintes são para a VM Linux e não foram executados nesta entrega:

```bash
cd /opt/helpu-runtime
sudo docker build --pull -f deploy/runtime/Dockerfile -t helpu-runtime:local .
sudo docker pull caddy:2-alpine
sudo install -m 0644 deploy/runtime/helpu-runtime.service /etc/systemd/system/
sudo install -m 0644 deploy/runtime/helpu-runtime-firewall.service /etc/systemd/system/
sudo install -m 0644 deploy/runtime/helpu-runtime-firewall.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now helpu-runtime.service
sudo systemctl enable --now helpu-runtime-firewall.timer
```

O serviço aplica regras de rede antes de iniciar os containers. O entrypoint confere os segredos, marcador do firewall, fontes, FFmpeg/FFprobe e abre/fecha Chromium vazio com sandbox antes de iniciar a API. Não executa login ou navegação externa nessa conferência. Caddy só começa quando a API responde ao healthcheck autenticado.

O runtime chama `POST https://www.helpumkt.com/api/worker` aproximadamente a cada 60 segundos, com `CRON_SECRET`. O servidor evita sobrepor suas próprias chamadas e a fila da Helpu mantém o controle das operações. Isso funciona com o computador pessoal desligado enquanto VM, serviços externos e conexões estiverem disponíveis.

O systemd supervisiona o Compose e reinicia o conjunto se um container encerrar. `restart: "no"` no Compose é intencional: impede o Docker de reabrir o navegador antes da aplicação do firewall durante boot. As unidades habilitadas iniciam depois do Docker em cada reboot. Use `systemctl`, evitando `docker compose up -d` manual em produção.

## Validação antes de liberar aos clientes

```bash
sudo systemctl status helpu-runtime.service --no-pager
sudo systemctl status helpu-runtime-firewall.timer --no-pager
sudo journalctl -u helpu-runtime.service -n 80 --no-pager
sudo iptables -S DOCKER-USER
sudo iptables -S INPUT
sudo docker ps --filter label=com.docker.compose.project=helpu-runtime
```

O container runtime deve estar `healthy`; somente Caddy deve publicar 80/443. Uma requisição sem Authorization para `https://runtime.helpumkt.com/v1/status` deve receber 401. O healthcheck interno usa o segredo por variável de ambiente e não imprime o segredo ou corpo da resposta.

Na Helpu, confira que navegador e editor aparecem disponíveis, abra uma sessão, assuma o controle, entre na conta, confirme a identidade e libere a sessão. Valide geração/exportação com um projeto curto, gravação na Biblioteca e o worker. Repita a conferência após reiniciar a VM. Cookies permanecem, mas cada reinício exige conferir/liberar a sessão novamente; o consentimento de automação não é restaurado automaticamente.

Também teste o firewall no host: DNS e HTTPS público devem funcionar; tentativas a `169.254.169.254`, IP do gateway e outros endereços privados devem falhar. Faça essas verificações sem autenticar em serviços de metadata. Se o container ficar unhealthy ou o worker registrar falha, confira o diagnóstico antes de reenviar uma ação: não presuma que uma publicação ou exportação foi executada.

Este pacote não resolve aprovação de aplicativo Meta, permissões das APIs, desafios de login ou validação de publicação. Uma sessão online disponível não significa que todos os canais estão autorizados.

## Como funciona o firewall

O filtro do runtime aceita respostas de Caddy, DNS dos dois resolvedores públicos e TCP 443 para destinos públicos. Bloqueia rede privada, link-local/metadata, loopback roteado, faixas especiais, o endpoint reservado da plataforma Azure e todo o restante. IPv6 é desabilitado no container e na rede. O DNS interno `127.0.0.11` do Docker continua disponível; seus encaminhamentos usam os DNS públicos configurados.

As regras de saída e entrada entre containers ficam em cadeias próprias chamadas por `DOCKER-USER`; conexões do runtime para o host/gateway são filtradas também em `INPUT`. Respostas de conexões legítimas permanecem permitidas. O script monta cadeias novas completas antes de substituir as antigas e não limpa as regras do Docker nem do restante do host. A posição de `DOCKER-USER` antes das cadeias do Docker e a necessidade de considerar conntrack são documentadas pelo [Docker](https://docs.docker.com/engine/network/firewall-iptables/).

O timer reaplica as regras a cada minuto. Mudanças administrativas de firewall devem ser feitas com o runtime parado; não use flush global de iptables enquanto ele opera. As checagens DNS/allowlist em JavaScript são uma camada adicional: o firewall é necessário para conter resolução alterada e acesso a serviços internos. O endereço especial `168.63.129.16` é usado pela [plataforma Azure](https://learn.microsoft.com/en-us/azure/virtual-network/what-is-ip-address-168-63-129-16) e fica bloqueado somente para o runtime, preservando o restante do host.

## Atualizações, backup e recuperação

Antes de atualizar, faça backup e pause operações importantes. Depois de colocar o commit desejado no servidor, execute novamente o build e `sudo systemctl restart helpu-runtime.service`. Se mudar Compose/unidades, reinstale os arquivos de unidade e execute `daemon-reload`. Perfis e projetos ficam nos volumes `helpu_runtime_data`, `helpu_runtime_caddy_data` e `helpu_runtime_caddy_config`.

O script `backup.sh` para temporariamente o conjunto, exporta os três volumes e `/etc/helpu-runtime`, criptografa o arquivo com a chave pública `AGE_RECIPIENT` e religa o serviço se ele estava ativo. A chave privada de recuperação deve ficar fora da VM. Exemplo:

```bash
sudo env AGE_RECIPIENT='age1SUA_CHAVE_PUBLICA' bash /opt/helpu-runtime/deploy/runtime/backup.sh
```

O arquivo vai para `/var/backups/helpu-runtime/` com permissões privadas. Copie-o para armazenamento externo com retenção adequada e ensaie a restauração. Os backups contêm credenciais de sessão e segredos de infraestrutura, mesmo quando não contêm senhas digitadas.

Para restaurar, pare o serviço, use uma VM/volumes novos, descriptografe o arquivo com `age -d -i caminho-da-chave` e extraia o conteúdo em diretório privado. A pasta `runtime` volta ao volume `helpu_runtime_data`, `caddy-data` a `helpu_runtime_caddy_data`, `caddy-config` a `helpu_runtime_caddy_config` e `config` a `/etc/helpu-runtime`. Preserve donos, grupos e modos ao copiar. Reaplique os arquivos systemd/regras e inicie o serviço; confirme as contas novamente. Não restaure sobre um perfil aberto. Não execute `docker compose down -v`, que apaga volumes.

## Dependências e validação desta entrega

Playwright e imagem de navegador estão fixados em `1.63.0`; a versão Node é 22. O lockfile fixa a dependência NPM. As tags Node 22 e Caddy 2 recebem revisões de segurança; para repetição exata de builds, registre os digests das imagens homologadas antes da produção.

`seccomp_profile.json` deriva do [perfil oficial Playwright v1.63.0](https://github.com/microsoft/playwright/blob/v1.63.0/utils/docker/seccomp_profile.json), sob a licença incluída em `PLAYWRIGHT-LICENSE.txt`. Foi acrescentada apenas a resposta ENOSYS para `clone3`, permitindo fallback para `clone`, de acordo com o [perfil do Moby](https://github.com/moby/profiles/blob/main/seccomp/default.json). Nunca troque por `seccomp=unconfined`, root ou `--no-sandbox` para contornar falhas do host.

Os arquivos foram revisados e tiveram sintaxe/contratos locais conferidos. Docker, Caddy, systemd, firewall Linux, DNS e HTTPS precisam ser validados na VM; não foram executados no computador Windows desta entrega. Nenhum domínio ou infraestrutura foi alterado.
