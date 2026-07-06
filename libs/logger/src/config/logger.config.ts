/**
 * Конфигурация централизованного логгера. Читается из env приложения-потребителя
 * (ConfigModule загружает .env в process.env до этапа DI):
 *
 * - LOG_LEVEL          — error | warn | log | debug | verbose | silent
 *                        (дефолт: production → log, иначе → debug)
 * - LOGS_ENABLED       — 'false' полностью отключает логи (эквивалент silent)
 * - LOG_TELEGRAM_LEVEL — error | none: с какого уровня дублировать лог в Telegram
 *                        (дефолт none — ошибки и так шлёт GlobalExceptionFilter)
 */

/** Уровни в порядке убывания важности — имена совпадают с NestJS. */
export const LOG_LEVELS = ['error', 'warn', 'log', 'debug', 'verbose'] as const;
export type AppLogLevel = (typeof LOG_LEVELS)[number];

/** Значение уровня c возможностью полного отключения логов. */
export type AppLogLevelSetting = AppLogLevel | 'silent';

/**
 * Приоритеты уровней для winston. Свои (а не npm-набор winston), чтобы порядок
 * совпадал с NestJS: в npm-наборе debug «ниже» verbose — обратно семантике
 * Nest, где verbose самый подробный. Nest-уровень 'log' хранится как 'info'
 * ('log' конфликтует с методом winston logger.log и каноничнее для хранилищ).
 */
export const WINSTON_LEVELS = {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3,
    verbose: 4,
} as const;
export type WinstonLevel = keyof typeof WINSTON_LEVELS;

/** Nest-уровень → winston-уровень (отличается только log → info). */
export function toWinstonLevel(level: AppLogLevel): WinstonLevel {
    return level === 'log' ? 'info' : level;
}

export type TelegramLogLevel = 'error' | 'none';

export interface LoggerConfig {
    /** Итоговый уровень логирования (учитывает LOGS_ENABLED). */
    level: AppLogLevelSetting;
    /** С какого уровня дублировать сообщения в Telegram ('none' — не слать). */
    telegramLevel: TelegramLogLevel;
    /** Значение NODE_ENV (метка env в каждом логе). */
    env: string;
    /** true — прод-формат (JSON-line), false — цветной dev-вывод. */
    json: boolean;
}

export interface ClickHouseLoggerConfig {
    /** true — писать логи в ClickHouse (LOG_CLICKHOUSE_ENABLED + CLICKHOUSE_URL). */
    enabled: boolean;
    url: string;
    database: string;
    username: string;
    password: string;
    /** Интервал сброса буфера, мс. */
    flushIntervalMs: number;
    /** Размер батча, при котором буфер сбрасывается не дожидаясь таймера. */
    maxBatch: number;
}

const DEFAULT_CH_FLUSH_MS = 5_000;
const DEFAULT_CH_MAX_BATCH = 500;

export function buildClickHouseConfig(
    env: NodeJS.ProcessEnv = process.env,
): ClickHouseLoggerConfig {
    const url = env.CLICKHOUSE_URL ?? '';
    return {
        enabled: env.LOG_CLICKHOUSE_ENABLED === 'true' && url.length > 0,
        url,
        database: env.CLICKHOUSE_DB ?? 'logs',
        username: env.CLICKHOUSE_USER ?? 'default',
        password: env.CLICKHOUSE_PASSWORD ?? '',
        flushIntervalMs: parsePositiveInt(
            env.LOG_CH_FLUSH_MS,
            DEFAULT_CH_FLUSH_MS,
        ),
        maxBatch: parsePositiveInt(env.LOG_CH_MAX_BATCH, DEFAULT_CH_MAX_BATCH),
    };
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
    const value = Number(raw);
    return Number.isInteger(value) && value > 0 ? value : fallback;
}

const LEVEL_SETTINGS: readonly string[] = [...LOG_LEVELS, 'silent'];

export function buildLoggerConfig(
    env: NodeJS.ProcessEnv = process.env,
): LoggerConfig {
    const nodeEnv = env.NODE_ENV ?? 'development';
    const isProd = nodeEnv === 'production';

    let level: AppLogLevelSetting;
    if (env.LOG_LEVEL && LEVEL_SETTINGS.includes(env.LOG_LEVEL)) {
        level = env.LOG_LEVEL as AppLogLevelSetting;
    } else {
        level = isProd ? 'log' : 'debug';
    }
    if (env.LOGS_ENABLED === 'false') {
        level = 'silent';
    }

    return {
        level,
        telegramLevel: env.LOG_TELEGRAM_LEVEL === 'error' ? 'error' : 'none',
        env: nodeEnv,
        json: isProd,
    };
}
