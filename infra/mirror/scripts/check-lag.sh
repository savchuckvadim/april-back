#!/usr/bin/env bash
# Контроль репликации на зеркале. Cron (*/5 * * * *):
#   */5 * * * * /opt/mirror/scripts/check-lag.sh >> /var/log/mirror-check.log 2>&1
# Проверяет MySQL (потоки IO/SQL, отставание) и Redis (связь с мастером,
# если MIRROR_EXPECT_REDIS_REPLICA=1). В Telegram — при смене состояния
# (ок ↔ проблема) и напоминание каждые MIRROR_REMIND_HOURS, пока плохо.
set -uo pipefail
source "$(dirname "$0")/lib.sh"

max_lag="${MIRROR_MAX_LAG_SEC:-60}"
state_file="${MIRROR_STATE_FILE:-/var/tmp/mirror-check.state}"
remind_sec=$(( ${MIRROR_REMIND_HOURS:-6} * 3600 ))
problems=()

# ---- MySQL ----
if status=$(mysql_exec "SHOW REPLICA STATUS\G" 2>&1); then
    if [ -z "$status" ]; then
        problems+=("MySQL: репликация не настроена (SHOW REPLICA STATUS пуст)")
    else
        field() { awk -v k="$1" '$1 == k":" { print $2 }' <<<"$status"; }
        io=$(field Replica_IO_Running)
        sql=$(field Replica_SQL_Running)
        lag=$(field Seconds_Behind_Source)
        last_error=$(awk -F': ' '$1 ~ /Last_Error$/ { print $2 }' <<<"$status")
        [ "$io" = "Yes" ] || problems+=("MySQL: Replica_IO_Running=${io:-?}")
        [ "$sql" = "Yes" ] || problems+=("MySQL: Replica_SQL_Running=${sql:-?} ${last_error:+($last_error)}")
        if [ "$lag" = "NULL" ] || [ -z "$lag" ]; then
            problems+=("MySQL: отставание неизвестно (Seconds_Behind_Source=${lag:-пусто})")
        elif [ "$lag" -gt "$max_lag" ]; then
            problems+=("MySQL: отставание ${lag} с (порог ${max_lag})")
        fi
    fi
else
    problems+=("MySQL: статус недоступен: ${status}")
fi

# ---- Redis ----
if info=$(redis_cli INFO replication 2>&1); then
    role=$(awk -F: '$1 == "role" { gsub("\r", "", $2); print $2 }' <<<"$info")
    if [ "$role" = "slave" ]; then
        link=$(awk -F: '$1 == "master_link_status" { gsub("\r", "", $2); print $2 }' <<<"$info")
        [ "$link" = "up" ] || problems+=("Redis: связь с мастером ${link:-?}")
    elif [ "${MIRROR_EXPECT_REDIS_REPLICA:-0}" = "1" ]; then
        problems+=("Redis: роль ${role}, ожидалась реплика")
    fi
else
    problems+=("Redis: недоступен: ${info}")
fi

# ---- Решение об уведомлении ----
now=$(date +%s)
prev_state="ok"; prev_ts=0
if [ -f "$state_file" ]; then
    read -r prev_state prev_ts < "$state_file" || true
fi
if [ ${#problems[@]} -eq 0 ]; then
    state="ok"
    echo "$(date '+%F %T') ok lag=${lag:-?}"
    if [ "$prev_state" != "ok" ]; then
        telegram_send "✅ Зеркало: репликация в норме (отставание ${lag:-?} с)."
    fi
    echo "ok $now" > "$state_file"
    exit 0
fi

state="problem"
text="⚠️ Зеркало: проблемы репликации"$'\n'"$(printf '• %s\n' "${problems[@]}")"
echo "$(date '+%F %T') $text"
if [ "$prev_state" != "problem" ] || [ $(( now - prev_ts )) -ge "$remind_sec" ]; then
    telegram_send "$text"
    echo "$state $now" > "$state_file"
fi
exit 1
