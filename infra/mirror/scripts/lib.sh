#!/usr/bin/env bash
# Общие функции скриптов зеркала. Подключение из скрипта рядом:
#   source "$(dirname "$0")/lib.sh"
# Переменные берутся из окружения или из файла MIRROR_ENV
# (по умолчанию /etc/mirror/mirror.env; шаблон — mirror.env.example).

MIRROR_ENV="${MIRROR_ENV:-/etc/mirror/mirror.env}"
if [ -f "$MIRROR_ENV" ]; then
    # shellcheck disable=SC1090
    set -a; source "$MIRROR_ENV"; set +a
fi

# id контейнера сервиса compose-стека зеркала (по label'ам compose, а не по
# имени: имена контейнеров в Dokploy генерируются).
mirror_container() {
    local service="$1"
    local filters=(--filter "label=com.docker.compose.service=${service}")
    if [ -n "${MIRROR_COMPOSE_PROJECT:-}" ]; then
        filters+=(--filter "label=com.docker.compose.project=${MIRROR_COMPOSE_PROJECT}")
    fi
    local id
    id=$(docker ps -q "${filters[@]}" | head -n1)
    if [ -z "$id" ]; then
        echo "Контейнер сервиса '${service}' не найден (MIRROR_COMPOSE_PROJECT=${MIRROR_COMPOSE_PROJECT:-любой})" >&2
        return 1
    fi
    echo "$id"
}

# SQL на реплике от root. Пароль через MYSQL_PWD — не попадает в ps и в stderr.
mysql_exec() {
    local container
    container=$(mirror_container mysql-replica) || return 1
    docker exec -i -e MYSQL_PWD="${MIRROR_MYSQL_ROOT_PASSWORD:?MIRROR_MYSQL_ROOT_PASSWORD не задан}" \
        "$container" mysql -uroot --batch -e "$1"
}

# redis-cli внутри контейнера redis зеркала (пароль — через REDISCLI_AUTH).
redis_cli() {
    local container
    container=$(mirror_container redis) || return 1
    docker exec ${MIRROR_REDIS_PASSWORD:+-e REDISCLI_AUTH="$MIRROR_REDIS_PASSWORD"} "$container" redis-cli "$@"
}

# Сообщение в Telegram вендора; без токена/чата молча пропускается.
telegram_send() {
    if [ -z "${TELEGRAM_BOT_TOKEN:-}" ] || [ -z "${TELEGRAM_ADMIN_CHAT_ID:-}" ]; then
        return 0
    fi
    curl -fsS -o /dev/null -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
        --data-urlencode "chat_id=${TELEGRAM_ADMIN_CHAT_ID}" \
        --data-urlencode "text=$1" || true
}

# Защита от случайного запуска необратимых шагов: нужен аргумент --yes.
confirm_yes() {
    local arg="$1" warning="$2"
    if [ "$arg" != "--yes" ]; then
        echo "$warning"
        echo "Запустите с --yes, чтобы выполнить."
        exit 1
    fi
}
