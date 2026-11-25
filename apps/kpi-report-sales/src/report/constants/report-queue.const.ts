/**
 * Константы очереди/кэша KPI-отчёта и статистики звонков.
 * Никаких magic strings в остальном коде модуля (правило pbx-typing);
 * runtime-массивы as const переиспользуются в @IsIn и Swagger enum.
 */

/** Пространства AppCache (инспекция: POST /app-cache/list { app }). */
export const KPI_REPORT_CACHE_APP = 'kpi-report' as const;
export const CALLING_STAT_CACHE_APP = 'calling-stat' as const;

/** Версия формата ключей — входит в ключ (дешёвая инвалидация). */
export const KPI_REPORT_CACHE_VERSION = 'v1' as const;

/**
 * TTL ready-конверта ОТКРЫТОГО периода (задевает текущий месяц):
 * ТРАНСПОРТНЫЙ БУФЕР доставки очереди, а НЕ кэш (решение 2026-07-30:
 * счётчики берутся одной цифрой за период, долгоживущий кэш скрывал бы
 * правки данных). Буфер нужен, чтобы поллинг/повторный POST забрал
 * результат воркера. Закрытый период — см. KPI_CLOSED_PERIOD_TTL_SECONDS.
 */
export const KPI_RESULT_TTL_SECONDS = 180;

/**
 * TTL ready-конверта ЗАКРЫТОГО периода (целиком в прошлых месяцах):
 * долгий кэш по решению владельца 2026-11-25 (180 суток). Сам не
 * пересчитывается — обновляется только запросом с forceRefresh: true
 * (кнопка «Пересчитать»): контроллер сразу удаляет прежний конверт, чтобы
 * поллинг не выдал старый результат за свежий, воркер записывает новый.
 * Сброс кэша портала — общая ручка `POST /app-cache/reset { app, domain }`
 * для пространств KPI_REPORT_CACHE_APP и CALLING_STAT_CACHE_APP, отдельная
 * ручка не нужна.
 */
export const KPI_CLOSED_PERIOD_TTL_SECONDS = 180 * 24 * 3600;

/** TTL error-конверта: ломает вечный queued у поллинга, гасит crash-loop. */
export const KPI_RESULT_ERROR_TTL_SECONDS = 120;

/** События WS (kpi-report:done — имя, исторически ожидаемое фронтом). */
export const KPI_REPORT_WS_EVENTS = {
    REPORT_DONE: 'kpi-report:done',
    REPORT_ERROR: 'kpi-report:error',
    CALLING_DONE: 'kpi-report:calling-statistic:done',
    CALLING_ERROR: 'kpi-report:calling-statistic:error',
} as const;

/** Статусы ответа очереди. */
export const KPI_QUEUE_RESPONSE_STATUSES = [
    'ready',
    'queued',
    'error',
] as const;
export type KpiQueueResponseStatus =
    (typeof KPI_QUEUE_RESPONSE_STATUSES)[number];

/**
 * Режим запроса: 'sync' (default, легаси — расчёт в HTTP-запросе для
 * старого фронта) | 'queue' (очередь + WS/поллинг). Тот же дискриминатор,
 * что в kpi-airtime.
 */
export const KPI_REQUEST_MODES = ['sync', 'queue'] as const;
export type KpiRequestMode = (typeof KPI_REQUEST_MODES)[number];

/** Ретраи job'ов отчёта: backoff больше окна восстановления лимитера. */
export const KPI_JOB_ATTEMPTS = 2;
export const KPI_JOB_BACKOFF_DELAY_MS = 30_000;
