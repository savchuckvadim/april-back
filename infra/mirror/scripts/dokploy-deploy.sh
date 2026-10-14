#!/usr/bin/env bash
# Запуск деплоя compose-сервиса зеркала через API Dokploy — то же, что делает
# .github/workflows/deploy-mirror.yml, для ручного запуска с любой машины.
# Нужны: DOKPLOY_URL (https://панель), DOKPLOY_API_KEY (Settings → Profile →
# API/CLI), DOKPLOY_COMPOSE_ID (из URL сервиса в панели или project.all).
set -euo pipefail
source "$(dirname "$0")/lib.sh"

: "${DOKPLOY_URL:?}" "${DOKPLOY_API_KEY:?}" "${DOKPLOY_COMPOSE_ID:?}"

curl -fsS -X POST "${DOKPLOY_URL%/}/api/compose.deploy" \
    -H "x-api-key: ${DOKPLOY_API_KEY}" \
    -H 'Content-Type: application/json' \
    -d "{\"composeId\":\"${DOKPLOY_COMPOSE_ID}\"}"
echo
echo "Деплой поставлен в очередь Dokploy: ${DOKPLOY_URL%/}/dashboard"
