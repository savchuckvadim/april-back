-- Хранилище логов всех приложений монорепо (@lib/logger -> ClickHouse).
-- Скрипт исполняется образом clickhouse-server автоматически при ПЕРВОМ старте
-- (пустой volume) из /docker-entrypoint-initdb.d.
--
-- Ретеншен: TTL 30 дней — старые партиции ClickHouse удаляет сам,
-- диск не переполняется. Изменить срок на живой таблице:
--   ALTER TABLE logs.app_logs MODIFY TTL toDateTime(timestamp) + INTERVAL 60 DAY DELETE;

CREATE DATABASE IF NOT EXISTS logs;

CREATE TABLE IF NOT EXISTS logs.app_logs (
    timestamp DateTime64(3),
    app LowCardinality(String),
    env LowCardinality(String),
    level LowCardinality(String),
    context String,
    message String,
    meta String,
    trace String
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(timestamp)
ORDER BY (app, timestamp)
TTL toDateTime(timestamp) + INTERVAL 30 DAY DELETE
SETTINGS index_granularity = 8192, ttl_only_drop_parts = 1;
