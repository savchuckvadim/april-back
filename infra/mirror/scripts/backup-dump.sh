#!/usr/bin/env bash
# Ежедневный дамп базы с РЕПЛИКИ (не нагружает прод) + выгрузка в S3.
# Cron на зеркале:
#   15 3 * * * /opt/mirror/scripts/backup-dump.sh >> /var/log/mirror-backup.log 2>&1
# Нужны: BACKUP_DIR, BACKUP_KEEP_DAYS; для S3 — aws cli и S3_BUCKET,
# S3_PREFIX, S3_ENDPOINT_URL (+ AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY в
# окружении cron или ~/.aws/credentials).
set -euo pipefail
source "$(dirname "$0")/lib.sh"

: "${BACKUP_DIR:?}" "${SOURCE_DB:?}"
keep_days="${BACKUP_KEEP_DAYS:-14}"
mkdir -p "$BACKUP_DIR"

file="${BACKUP_DIR}/${SOURCE_DB}-$(date +%Y%m%d-%H%M%S).sql.gz"
container=$(mirror_container mysql-replica)

docker exec -e MYSQL_PWD="${MIRROR_MYSQL_ROOT_PASSWORD:?}" "$container" \
    mysqldump -uroot --single-transaction --set-gtid-purged=OFF --triggers --routines --events \
    --hex-blob --databases "$SOURCE_DB" | gzip -6 > "$file"
echo "$(date '+%F %T') дамп: $(ls -lh "$file" | awk '{print $5, $9}')"

find "$BACKUP_DIR" -name "${SOURCE_DB}-*.sql.gz" -mtime +"$keep_days" -delete

if [ -n "${S3_BUCKET:-}" ]; then
    aws s3 cp "$file" "s3://${S3_BUCKET}/${S3_PREFIX:-mirror-mysql}/$(basename "$file")" \
        ${S3_ENDPOINT_URL:+--endpoint-url "$S3_ENDPOINT_URL"} --only-show-errors
    echo "$(date '+%F %T') выгружен в s3://${S3_BUCKET}/${S3_PREFIX:-mirror-mysql}/"
fi
