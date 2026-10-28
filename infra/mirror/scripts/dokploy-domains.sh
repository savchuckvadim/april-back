#!/usr/bin/env bash
# Домены всех приложений зеркала в Dokploy (вкладка Domains compose-сервиса)
# одной командой. Повторный запуск безопасен: существующие host пропускаются.
#
#   dokploy-domains.sh test   # {short}.m.april-app.ru — проверка зеркала;
#                             # в DNS одна запись *.m.april-app.ru → IP зеркала
#   dokploy-domains.sh prod   # api.{short}.april-app.ru — боевые, ТОЛЬКО при
#                             # переключении (раньше Let's Encrypt не выпустит
#                             # сертификат: DNS смотрит на прод)
#   dokploy-domains.sh '<шаблон с {short}>'
#
# После добавления доменов нужен деплой (dokploy-deploy.sh или Redeploy):
# labels Traefik Dokploy дописывает в compose при деплое.
# Нужны: DOKPLOY_URL, DOKPLOY_API_KEY, DOKPLOY_COMPOSE_ID (mirror.env или env).
set -euo pipefail
source "$(dirname "$0")/lib.sh"

: "${DOKPLOY_URL:?}" "${DOKPLOY_API_KEY:?}" "${DOKPLOY_COMPOSE_ID:?}"

case "${1:-}" in
    test) pattern='{short}.m.april-app.ru' ;;
    prod) pattern='api.{short}.april-app.ru' ;;
    *'{short}'*) pattern="$1" ;;
    *) echo "Укажите test | prod | шаблон с {short}"; exit 1 ;;
esac

# Сервис compose → короткое имя в домене (как у прода, infra/nginx/README.md).
APPS="back:back kpi-report-sales:kpi-sales pbx-install:install kpi-report-service:kpi-service admin:admin event-sales:event-sales event-service:event-service konstructor:konstructor rq:rq pbx:pbx bot:bot bitrix-app-client:cabinet"

api="${DOKPLOY_URL%/}/api"
existing=$(curl -fsS -H "x-api-key: ${DOKPLOY_API_KEY}" "${api}/domain.byComposeId?composeId=${DOKPLOY_COMPOSE_ID}")

for pair in $APPS; do
    service="${pair%%:*}"
    short="${pair##*:}"
    host="${pattern//\{short\}/$short}"
    if grep -q "\"host\":\"${host}\"" <<<"$existing"; then
        echo "= ${host} → ${service}: уже есть"
        continue
    fi
    curl -fsS -o /dev/null -X POST "${api}/domain.create" \
        -H "x-api-key: ${DOKPLOY_API_KEY}" -H 'Content-Type: application/json' \
        -d "{\"host\":\"${host}\",\"path\":\"/\",\"port\":3000,\"https\":true,\"certificateType\":\"letsencrypt\",\"composeId\":\"${DOKPLOY_COMPOSE_ID}\",\"serviceName\":\"${service}\",\"domainType\":\"compose\"}"
    echo "+ ${host} → ${service}"
done

echo
echo "Дальше: деплой стека (dokploy-deploy.sh), чтобы Traefik подхватил домены."
