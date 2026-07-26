/** Пространство центрального кэша (AppCache) для эфирного времени. */
export const AIRTIME_CACHE_APP = 'airtime' as const;

/** Группа месячных ячеек — для пакетного сброса/инспекции в /app-cache. */
export const AIRTIME_CACHE_GROUP_MONTH = 'month' as const;

/**
 * TTL ячейки прошлого месяца: 180 суток.
 *
 * Как чистится: Redis-ключ протухает сам; строку app_cache (MySQL)
 * удаляет почасовой purgeExpired-cron AppCacheService. После протухания
 * следующий запрос за этот месяц честно пересчитает его из Bitrix и
 * снова закэширует — «не смотрят — не храним». Данные прошлых месяцев
 * неизменяемы, поэтому TTL можно смело увеличивать; 180 дней — баланс
 * между объёмом (100 сотрудников × 24 мес ≈ 300 КБ на портал) и
 * скоростью годовых отчётов.
 *
 * Ручной сброс: POST /app-cache/reset { app: 'airtime', domain }.
 */
export const AIRTIME_MONTH_TTL_SECONDS = 180 * 24 * 3600;
