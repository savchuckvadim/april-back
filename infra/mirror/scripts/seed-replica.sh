#!/usr/bin/env bash
# Первичная заливка реплики с прода и запуск репликации (фаза 3 runbook,
# infra/mirror/README.md). ЗАПУСКАТЬ НА СЕРВЕРЕ ЗЕРКАЛА, когда:
#   - поднят WireGuard и с зеркала виден SOURCE_HOST:SOURCE_PORT;
#   - на проде включён GTID и создан пользователь REPL_USER;
#   - compose-стек зеркала задеплоен (контейнер mysql-replica здоровый).
# Путь через mysqldump: подходит для базы до ~20–30 GB. Больше — clone-плагин
# (README, фаза 3, вариант Б).
#
# Что делает: сбрасывает GTID-историю реплики → (опц.) создаёт пользователя
# приложений → льёт дамп → CHANGE REPLICATION SOURCE TO ... AUTO_POSITION →
# START REPLICA → включает super_read_only.
set -euo pipefail
source "$(dirname "$0")/lib.sh"

: "${SOURCE_HOST:?}" "${SOURCE_PORT:?}" "${SOURCE_DB:?}" "${SOURCE_USER:?}" "${SOURCE_PASSWORD:?}"
: "${REPL_USER:?}" "${REPL_PASSWORD:?}"

confirm_yes "${1:-}" "Заливка реплики: данные базы '${SOURCE_DB}' на зеркале будут ЗАМЕНЕНЫ дампом с ${SOURCE_HOST}."

container=$(mirror_container mysql-replica)
dump_dir="${SEED_DUMP_DIR:-/var/tmp}"
dump_file="${dump_dir}/seed-${SOURCE_DB}-$(date +%Y%m%d-%H%M%S).sql"

echo "== Проверка доступности источника ${SOURCE_HOST}:${SOURCE_PORT}"
docker exec -e MYSQL_PWD="$SOURCE_PASSWORD" "$container" \
    mysql -h "$SOURCE_HOST" -P "$SOURCE_PORT" -u "$SOURCE_USER" --batch -e \
    "SELECT @@version AS source_version, @@gtid_mode AS gtid_mode, @@server_id AS server_id"

echo "== Версии должны совпадать (реплика не ниже источника)"
mysql_exec "SELECT @@version AS replica_version, @@gtid_mode AS gtid_mode, @@server_id AS server_id"

echo "== Сброс истории реплики (чтобы дамп смог выставить gtid_purged)"
mysql_exec "STOP REPLICA; RESET REPLICA ALL;" >/dev/null 2>&1 || true
mysql_exec "RESET MASTER" >/dev/null 2>&1 || mysql_exec "RESET BINARY LOGS AND GTIDS"

if [ -n "${MIRROR_DB_APP_USER:-}" ]; then
    echo "== Пользователь приложений ${MIRROR_DB_APP_USER} на зеркале"
    mysql_exec "CREATE USER IF NOT EXISTS '${MIRROR_DB_APP_USER}'@'%' IDENTIFIED BY '${MIRROR_DB_APP_PASSWORD:?MIRROR_DB_APP_PASSWORD не задан}';
GRANT ALL PRIVILEGES ON \`${SOURCE_DB}\`.* TO '${MIRROR_DB_APP_USER}'@'%';
FLUSH PRIVILEGES;"
fi

echo "== Дамп ${SOURCE_DB} с прода → ${dump_file}"
docker exec -e MYSQL_PWD="$SOURCE_PASSWORD" "$container" \
    mysqldump -h "$SOURCE_HOST" -P "$SOURCE_PORT" -u "$SOURCE_USER" \
    --single-transaction --set-gtid-purged=ON --triggers --routines --events \
    --hex-blob --databases "$SOURCE_DB" > "$dump_file"
ls -lh "$dump_file"

echo "== Заливка дампа в реплику"
docker exec -i -e MYSQL_PWD="$MIRROR_MYSQL_ROOT_PASSWORD" "$container" mysql -uroot < "$dump_file"

echo "== Настройка и запуск репликации (GTID auto-position)"
mysql_exec "CHANGE REPLICATION SOURCE TO
    SOURCE_HOST='${SOURCE_HOST}', SOURCE_PORT=${SOURCE_PORT},
    SOURCE_USER='${REPL_USER}', SOURCE_PASSWORD='${REPL_PASSWORD}',
    SOURCE_AUTO_POSITION=1, SOURCE_SSL=${SOURCE_SSL:-0},
    SOURCE_CONNECT_RETRY=10, SOURCE_RETRY_COUNT=0;
START REPLICA;"

echo "== Только чтение для всех, включая root (переживает перезапуск)"
mysql_exec "SET PERSIST super_read_only=ON; SET PERSIST read_only=ON;"

sleep 5
echo "== Статус"
mysql_exec "SHOW REPLICA STATUS\G" | grep -E "Replica_(IO|SQL)_Running|Seconds_Behind_Source|Last_(IO_)?Error|Executed_Gtid_Set" || true

echo
echo "Готово. Дамп оставлен в ${dump_file} — удалите после проверки."
echo "Дальше: Redis (files/redis/redis.conf → replicaof), sync-storage.sh, cron check-lag.sh."
