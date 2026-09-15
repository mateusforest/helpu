#!/usr/bin/env bash
set -euo pipefail
umask 077
[[ ${EUID} -eq 0 ]] || { echo 'Execute o backup como root.' >&2; exit 1; }
command -v age >/dev/null || { echo 'Instale age para criptografar o backup.' >&2; exit 1; }
[[ -n ${AGE_RECIPIENT:-} ]] || { echo 'Defina AGE_RECIPIENT com a chave PUBLICA do destinatario.' >&2; exit 1; }
directory=${HELPU_BACKUP_DIR:-/var/backups/helpu-runtime}
[[ "$directory" == /* ]] || { echo 'O diretorio de backup precisa ser absoluto.' >&2; exit 1; }
mkdir -p "$directory"; chmod 0700 "$directory"
for volume in helpu_runtime_data helpu_runtime_caddy_data helpu_runtime_caddy_config; do docker volume inspect "$volume" >/dev/null; done
restart=false
if systemctl is-active --quiet helpu-runtime.service; then restart=true; fi
restore_service(){ if "$restart"; then systemctl start helpu-runtime.service; fi; }
trap restore_service EXIT
systemctl stop helpu-runtime.service
file="$directory/helpu-runtime-$(date -u +%Y%m%dT%H%M%SZ).tar.gz.age"
docker run --rm --network none --user 0:0 --read-only --cap-drop ALL --cap-add DAC_READ_SEARCH --security-opt no-new-privileges:true \
  --mount type=volume,source=helpu_runtime_data,target=/source/runtime,readonly \
  --mount type=volume,source=helpu_runtime_caddy_data,target=/source/caddy-data,readonly \
  --mount type=volume,source=helpu_runtime_caddy_config,target=/source/caddy-config,readonly \
  --mount type=bind,source=/etc/helpu-runtime,target=/source/config,readonly \
  --entrypoint tar helpu-runtime:local -C /source -czf - . \
  | age -r "$AGE_RECIPIENT" -o "$file.partial"
mv -- "$file.partial" "$file"
echo "Backup criptografado salvo em $file"
