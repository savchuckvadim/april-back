#!/usr/bin/env bash
# Шаг 2 runbook переключения: если прод ещё доступен — лишить его права
# писать, чтобы после повышения зеркала не оказалось двух пишущих БД.
# ЗАПУСКАТЬ НА СЕРВЕРЕ ПРОДА. Это шаг аварии, а не изменение инфраструктуры:
# compose-файлы и настройки деплоя не правятся.
#
# 1) останавливает контейнеры приложений прод-стека (docker compose stop);
# 2) переводит MySQL прода в super_read_only — одним из способов:
#    PROD_MYSQL_CONTAINER=<контейнер>  (MySQL в docker на этом сервере)
#    или PROD_MYSQL_HOST/PORT/USER/PASSWORD (mysql-клиент на хосте).
#    Ничего не задано — пропускает с предупреждением.
set -euo pipefail

PROD_DIR="${PROD_DIR:-/var/www/html/back-mono.april-app}"
APPS="back kpi-report-sales pbx-install kpi-report-service admin event-sales event-service konstructor rq pbx bot bitrix-app-client"

if [ "${1:-}" != "--yes" ]; then
    echo "Остановка приложений прода и перевод его MySQL в только-чтение. Делать ТОЛЬКО при переключении на зеркало."
    echo "Запустите с --yes, чтобы выполнить."
    exit 1
fi

echo "== Останавливаю приложения прода (${PROD_DIR})"
cd "$PROD_DIR"
# shellcheck disable=SC2086
docker compose --env-file infra/compose/ports.env -f infra/compose/docker-compose.prod.yml stop $APPS

readonly_sql="SET PERSIST super_read_only=ON; SET PERSIST read_only=ON; SELECT @@super_read_only AS super_read_only;"
if [ -n "${PROD_MYSQL_CONTAINER:-}" ]; then
    echo "== MySQL прода (контейнер ${PROD_MYSQL_CONTAINER}) → super_read_only=ON"
    docker exec -e MYSQL_PWD="${PROD_MYSQL_PASSWORD:?PROD_MYSQL_PASSWORD не задан}" "$PROD_MYSQL_CONTAINER" \
        mysql -u "${PROD_MYSQL_USER:-root}" --batch -e "$readonly_sql"
elif [ -n "${PROD_MYSQL_HOST:-}" ]; then
    echo "== MySQL прода (${PROD_MYSQL_HOST}) → super_read_only=ON"
    MYSQL_PWD="${PROD_MYSQL_PASSWORD:?PROD_MYSQL_PASSWORD не задан}" mysql -h "$PROD_MYSQL_HOST" -P "${PROD_MYSQL_PORT:-3306}" \
        -u "${PROD_MYSQL_USER:-root}" --batch -e "$readonly_sql"
else
    echo "⚠️ PROD_MYSQL_CONTAINER/PROD_MYSQL_HOST не заданы — MySQL прода НЕ переведён в только-чтение."
    echo "   Сделайте руками: SET PERSIST super_read_only=ON; SET PERSIST read_only=ON;"
fi

echo
echo "Прод больше не пишет. Дальше — на зеркале: promote.sh --yes"
