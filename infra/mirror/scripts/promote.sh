#!/usr/bin/env bash
# Шаг 3 runbook переключения (infra/mirror/README.md): повысить реплики
# зеркала до главных. ЗАПУСКАТЬ НА СЕРВЕРЕ ЗЕРКАЛА и только когда прод точно
# не пишет: он упал или на нём выполнен demote-prod.sh. Иначе — две пишущие
# БД, и свести их обратно руками почти невозможно.
#
# MySQL: STOP REPLICA; RESET REPLICA ALL; запись разрешена (PERSIST
# перекрывает read_only из replica.cnf). Redis: REPLICAOF NO ONE +
# CONFIG REWRITE (replicaof уходит из redis.conf, перезапуск не вернёт его).
set -euo pipefail
source "$(dirname "$0")/lib.sh"

confirm_yes "${1:-}" "Повышение реплик зеркала до главных: MySQL станет записываемым, Redis отвяжется от прода. Откат — только повторной заливкой (seed-replica.sh)."

echo "== MySQL: состояние реплики перед повышением"
mysql_exec "SHOW REPLICA STATUS\G" | grep -E "Replica_(IO|SQL)_Running|Seconds_Behind_Source|Executed_Gtid_Set" || echo "(реплика не настроена)"

echo "== MySQL: STOP REPLICA; RESET REPLICA ALL; запись разрешена"
mysql_exec "STOP REPLICA; RESET REPLICA ALL;" || true
mysql_exec "SET PERSIST super_read_only=OFF; SET PERSIST read_only=OFF;"
mysql_exec "SELECT @@read_only AS read_only, @@super_read_only AS super_read_only, @@server_id AS server_id"

echo "== Redis: REPLICAOF NO ONE"
redis_cli REPLICAOF NO ONE
redis_cli CONFIG REWRITE || echo "⚠️ CONFIG REWRITE не удался — уберите replicaof/masterauth из files/redis/redis.conf руками, иначе перезапуск вернёт реплику"
redis_cli ROLE | head -n1

telegram_send "🔁 Зеркало: реплики MySQL и Redis повышены до главных (promote.sh). Дальше: APP_ROLE=active + Redeploy в Dokploy, затем DNS."

cat <<'MSG'

Дальше по runbook:
  4) Dokploy → Environment: APP_ROLE=active → Redeploy (кроны и очереди включатся);
  5) DNS api.*.april-app.ru → IP зеркала (TTL 300 должен быть выставлен заранее);
  6) проверки: health всех приложений, тестовый исходящий вебхук Битрикса,
     отчёт из kpi-report-sales, рефреш OAuth установки.
MSG
