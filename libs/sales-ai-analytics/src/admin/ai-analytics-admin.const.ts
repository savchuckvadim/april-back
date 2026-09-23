/**
 * Общие константы админ-слоя AI-аналитики ОП (план Фазы 3, П5): форма
 * payload снапшот-джобы, ритмы, детерминированный jobId и опции Bull.
 *
 * Зачем дубль в библиотеке. Расчёт живёт в `apps/kpi-report-sales`
 * (`constants/ai-snapshot.const.ts`), а библиотека приложение
 * импортировать не может (луковая архитектура). Поэтому админ-ручки
 * ставят джобы по тому же контракту очереди: имя джобы
 * `JobNames.SALES_AI_ANALYTICS_SNAPSHOT`, очередь
 * `QueueNames.SALES_KPI_REPORT`, jobId
 * `ai-analytics:snapshot:{rhythm}:{domain}:{key}`. Значения обязаны
 * совпадать с приложением — это закреплено спекой
 * `__tests__/ai-analytics-admin.const.spec.ts` (сверка литералов).
 */

/** Префикс jobId снапшот-джобы (дубль AI_ANALYTICS_SNAPSHOT_JOB_ID_PREFIX). */
export const AI_ANALYTICS_ADMIN_JOB_ID_PREFIX =
    'ai-analytics:snapshot' as const;

/**
 * Ритмы конвейера, доступные админ-ручкам: те же значения, что у
 * приложения (`AI_PIPELINE_RHYTHMS`). `audit` сюда не входит — месячный
 * аудит Фазы 0 запускается своей ручкой `POST admin/ai-analytics/audit`.
 */
export const AI_ANALYTICS_ADMIN_RHYTHMS = [
    'nightly',
    'weekly',
    'monthly',
    'backfill',
] as const;
export type AiAnalyticsAdminRhythm =
    (typeof AI_ANALYTICS_ADMIN_RHYTHMS)[number];

export function isAiAnalyticsAdminRhythm(
    value: unknown,
): value is AiAnalyticsAdminRhythm {
    return (
        typeof value === 'string' &&
        (AI_ANALYTICS_ADMIN_RHYTHMS as readonly string[]).includes(value)
    );
}

/**
 * Опции ручной джобы: приоритет ниже пользовательских ручек, две попытки
 * с паузой 5 минут, таймаут 15 минут (те же числа, что у ночного
 * конвейера — воркер один и тот же).
 */
export const AI_ANALYTICS_ADMIN_JOB_OPTIONS = {
    priority: 10,
    attempts: 2,
    backoff: 300_000,
    timeout: 900_000,
    removeOnComplete: 50,
    removeOnFail: 20,
} as const;

/**
 * Payload снапшот-джобы в том объёме, который ставит админка (форма
 * `AiSnapshotJobData` приложения). Поля, которые админка не заполняет
 * (`backfill`, `slotRetries`), раннер считает сам.
 */
export interface AiAnalyticsAdminSnapshotJob {
    domain: string;
    /** Ритм прогона — он же вид снапшот-джобы. */
    kind: AiAnalyticsAdminRhythm;
    /** Месяц прогона 'YYYY-MM' в TZ портала. */
    monthKey: string;
    /** День прогона 'YYYY-MM-DD'; нет — считает раннер. */
    day?: string;
    /** ISO-неделя прогона 'YYYY-Www'; нет — считает раннер. */
    weekKey?: string;
    /** Белый список кодов шагов; пусто — все шаги ритма. */
    steps?: string[];
    /** Пересчитать, даже если данные уже посчитаны (ручка recompute). */
    forceRefresh?: boolean;
}

/** jobId прогона: 'ai-analytics:snapshot:{rhythm}:{domain}:{key}'. */
export function buildAdminPipelineJobId(
    rhythm: AiAnalyticsAdminRhythm,
    domain: string,
    key: string,
): string {
    return `${AI_ANALYTICS_ADMIN_JOB_ID_PREFIX}:${rhythm}:${domain}:${key}`;
}

/**
 * Ключ периода ритма: недельный дедуплицируется ISO-неделей, остальные —
 * месяцем либо днём (у ночного ритма день точнее месяца).
 */
export function adminPipelineKey(job: AiAnalyticsAdminSnapshotJob): string {
    if (job.kind === 'weekly' && job.weekKey) return job.weekKey;
    if (job.kind === 'nightly' && job.day) return job.day;
    return job.monthKey;
}

/**
 * Суффикс принудительного пересчёта в jobId. Bull молча игнорирует повтор
 * существующего id, поэтому у ручного пересчёта ключ свой: иначе повтор
 * той же ночи (джоба уже в очереди с тем же id) тихо пропал бы.
 */
export function recomputeJobKey(key: string, stamp: string): string {
    return `${key}:recompute:${stamp}`;
}
