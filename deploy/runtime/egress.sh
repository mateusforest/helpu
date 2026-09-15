#!/usr/bin/env bash
set -euo pipefail
umask 077

# Intended for a rootful Linux Docker host using Docker's iptables backend.
# This script never flushes Docker's chains or the host's existing firewall.
[[ ${EUID} -eq 0 ]] || { echo 'Execute o firewall como root.' >&2; exit 1; }
for tool in iptables python3 docker flock; do command -v "$tool" >/dev/null || { echo "Dependência ausente: $tool" >&2; exit 1; }; done
iptables -w 5 -S DOCKER-USER >/dev/null 2>&1 || { echo 'DOCKER-USER ausente. Use Docker rootful com backend iptables; o runtime não será iniciado.' >&2; exit 1; }

export HELPU_RUNTIME_IP=${HELPU_RUNTIME_IP:-172.30.80.10}
export HELPU_CADDY_IP=${HELPU_CADDY_IP:-172.30.80.20}
export HELPU_NETWORK_SUBNET=${HELPU_NETWORK_SUBNET:-172.30.80.0/24}
export HELPU_NETWORK_GATEWAY=${HELPU_NETWORK_GATEWAY:-172.30.80.1}
export HELPU_DNS1=${HELPU_DNS1:-1.1.1.1}
export HELPU_DNS2=${HELPU_DNS2:-9.9.9.9}
export HELPU_BLOCK_CIDRS=${HELPU_BLOCK_CIDRS:-}
python3 - <<'PY'
import ipaddress, os, sys
try:
    network=ipaddress.IPv4Network(os.environ['HELPU_NETWORK_SUBNET'], strict=True)
    private=[ipaddress.IPv4Network(x) for x in ('10.0.0.0/8','172.16.0.0/12','192.168.0.0/16')]
    assert any(network.subnet_of(n) for n in private)
    addresses=[ipaddress.IPv4Address(os.environ[k]) for k in ('HELPU_RUNTIME_IP','HELPU_CADDY_IP','HELPU_NETWORK_GATEWAY')]
    assert len(set(addresses))==3 and all(a in network and a not in (network.network_address,network.broadcast_address) for a in addresses)
    assert all(ipaddress.IPv4Address(os.environ[k]).is_global for k in ('HELPU_DNS1','HELPU_DNS2'))
    for item in os.environ['HELPU_BLOCK_CIDRS'].split(): ipaddress.IPv4Network(item, strict=True)
except Exception:
    sys.exit('Configuração de rede inválida: use IPv4 privados distintos na mesma sub-rede e DNS público.')
PY

mkdir -p /run/helpu-runtime
chmod 0755 /run/helpu-runtime
exec 9>/run/helpu-runtime/firewall.lock
flock -x 9

# Bridge packets between containers must also reach iptables.
modprobe br_netfilter
sysctl -q -w net.bridge.bridge-nf-call-iptables=1

mapfile -t running < <(docker ps -q --filter label=com.docker.compose.project=helpu-runtime --filter label=com.docker.compose.service=runtime)
[[ ${#running[@]} -le 1 ]] || { echo 'Mais de um runtime foi encontrado. Este modelo exige uma instância.' >&2; exit 1; }
if [[ ${#running[@]} -eq 1 ]]; then
  observed=$(docker inspect --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "${running[0]}")
  [[ "$observed" == "$HELPU_RUNTIME_IP" ]] || { echo 'Pare o runtime antes de alterar a sub-rede/IP do serviço.' >&2; exit 1; }
fi

tag=$(printf '%x%x' "$(date +%s)" "$$")
out="HRT_${tag}_O"; inbound="HRT_${tag}_I"; host="HRT_${tag}_H"
for chain in "$out" "$inbound" "$host"; do iptables -w 5 -N "$chain"; done

# Replies to Caddy are permitted, but initiating connections to Caddy/LAN is not.
iptables -w 5 -A "$out" -d "$HELPU_CADDY_IP" -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
blocked=(0.0.0.0/8 10.0.0.0/8 100.64.0.0/10 127.0.0.0/8 168.63.129.16/32 169.254.0.0/16 172.16.0.0/12 192.0.0.0/24 192.0.2.0/24 192.88.99.0/24 192.168.0.0/16 198.18.0.0/15 198.51.100.0/24 203.0.113.0/24 224.0.0.0/4 240.0.0.0/4)
read -r -a additional <<< "$HELPU_BLOCK_CIDRS"
blocked+=("${additional[@]}")
for cidr in "${blocked[@]}"; do iptables -w 5 -A "$out" -d "$cidr" -j REJECT --reject-with icmp-admin-prohibited; done
iptables -w 5 -A "$out" -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
for dns in "$HELPU_DNS1" "$HELPU_DNS2"; do
  iptables -w 5 -A "$out" -p udp -d "$dns" --dport 53 -j ACCEPT
  iptables -w 5 -A "$out" -p tcp -d "$dns" --dport 53 -j ACCEPT
done
iptables -w 5 -A "$out" -p tcp --dport 443 -j ACCEPT
iptables -w 5 -A "$out" -j REJECT --reject-with icmp-admin-prohibited

iptables -w 5 -A "$inbound" -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
iptables -w 5 -A "$inbound" -s "$HELPU_CADDY_IP" -p tcp --dport 8080 -j ACCEPT
iptables -w 5 -A "$inbound" -j REJECT --reject-with icmp-admin-prohibited

# Container -> host/gateway packets use INPUT, not DOCKER-USER/FORWARD.
iptables -w 5 -A "$host" -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
iptables -w 5 -A "$host" -j REJECT --reject-with icmp-admin-prohibited

# Install complete replacement chains first, then remove previous HRT_ hooks.
# Existing traffic is never left without the previously installed restrictions.
iptables -w 5 -I DOCKER-USER 1 -d "$HELPU_RUNTIME_IP" -j "$inbound"
iptables -w 5 -I DOCKER-USER 1 -s "$HELPU_RUNTIME_IP" -j "$out"
iptables -w 5 -I INPUT 1 -s "$HELPU_RUNTIME_IP" -j "$host"
for parent in DOCKER-USER INPUT; do
  while IFS= read -r rule; do
    read -r -a args <<< "$rule"
    target=${args[${#args[@]}-1]}
    if [[ "$target" =~ ^HRT_[a-f0-9]+_[OIH]$ && "$target" != "$out" && "$target" != "$inbound" && "$target" != "$host" ]]; then
      args[0]=-D
      iptables -w 5 "${args[@]}"
    fi
  done < <(iptables -w 5 -S "$parent")
done
while read -r kind chain; do
  if [[ "$kind" == -N && "$chain" =~ ^HRT_[a-f0-9]+_[OIH]$ && "$chain" != "$out" && "$chain" != "$inbound" && "$chain" != "$host" ]]; then
    iptables -w 5 -F "$chain"
    iptables -w 5 -X "$chain"
  fi
done < <(iptables -w 5 -S | awk '$1=="-N" {print $1, $2}')

python3 - "$out" "$inbound" "$host" <<'PY'
import json, os, sys, time
file='/run/helpu-runtime/ready'
with open(file+'.tmp','w') as out:
    json.dump({'version':1,'runtimeIp':os.environ['HELPU_RUNTIME_IP'],'appliedAt':int(time.time()),'chains':sys.argv[1:]},out)
os.chmod(file+'.tmp',0o644)
os.replace(file+'.tmp',file)
PY
echo 'Firewall da Helpu aplicado: HTTPS público/DNS autorizado; rede privada e metadata bloqueadas.'
