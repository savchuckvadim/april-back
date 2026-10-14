#!/usr/bin/env bash
# Копия storage/ и keys/ прода на зеркало через WireGuard (rsync по SSH).
# Cron на зеркале (каждые 30 минут):
#   */30 * * * * /opt/mirror/scripts/sync-storage.sh >> /var/log/mirror-sync.log 2>&1
# Нужны: PROD_SSH (user@10.10.0.1), PROD_SSH_KEY, PROD_DIR, MIRROR_FILES_DIR.
# --delete: удалённое на проде исчезает и на зеркале (это копия, не архив;
# архив — ежедневный бэкап). После переключения cron ОТКЛЮЧИТЬ: иначе он
# затрёт новые файлы зеркала старыми с прода.
set -euo pipefail
source "$(dirname "$0")/lib.sh"

: "${PROD_SSH:?}" "${PROD_SSH_KEY:?}" "${PROD_DIR:?}" "${MIRROR_FILES_DIR:?}"

ssh_cmd="ssh -i ${PROD_SSH_KEY} -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15"
started=$(date +%s)

mkdir -p "${MIRROR_FILES_DIR}/storage" "${MIRROR_FILES_DIR}/keys"
rsync -az --delete --timeout=600 -e "$ssh_cmd" "${PROD_SSH}:${PROD_DIR}/storage/" "${MIRROR_FILES_DIR}/storage/"
rsync -az --delete --timeout=120 -e "$ssh_cmd" "${PROD_SSH}:${PROD_DIR}/keys/" "${MIRROR_FILES_DIR}/keys/"

echo "$(date '+%F %T') storage+keys синхронизированы за $(( $(date +%s) - started )) с"
