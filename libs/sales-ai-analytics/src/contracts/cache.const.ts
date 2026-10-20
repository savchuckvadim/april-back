/**
 * Адрес кэша витрины AI-аналитики ОП в центральном AppCache — ЕДИНСТВЕННЫЙ
 * источник для приложения kpi-report-sales (пишет и сбрасывает кэш) и для
 * админки (кнопка «Сбросить кэш витрины AI»). Раньше префикс жил в
 * приложении, и админка не могла сбросить тот же кэш без копии литерала.
 *
 * Ключи приложения: `sales-ai-analytics:v1:{domain}:{section}:...`; в
 * AppCache это app = префикс, domain, key = '{section}:...'.
 */

/** Префикс ключей кэша (app в AppCache). Смена версии инвалидирует всё. */
export const AI_ANALYTICS_CACHE_PREFIX = 'sales-ai-analytics:v1' as const;

/**
 * Области сброса кэша: all — весь кэш модуля по домену (включая периметры
 * доступа), остальные — секции ключей (первый сегмент после домена).
 */
export const AI_ANALYTICS_CACHE_SCOPES = [
    'all',
    'pulse',
    'agenda',
    'settings',
    'overview',
    'attention',
    'kpi-month',
    'plans',
    // Фаза 2: секции модели, плана дня, резюме и тяжёлых источников.
    'model',
    'plan',
    'brief',
    'brief-quota',
    'stage-history',
    'calendar',
] as const;
export type AiAnalyticsCacheScope = (typeof AI_ANALYTICS_CACHE_SCOPES)[number];

/** Фильтр AppCache.reset для сброса кэша витрины по домену и области. */
export interface AiAnalyticsCacheResetFilter {
    app: typeof AI_ANALYTICS_CACHE_PREFIX;
    domain: string;
    /** Секция ключей; нет — весь кэш домена (сброс с SCAN-подчисткой Redis). */
    keyPrefix?: string;
}

/**
 * Фильтр сброса — тот же, что получает AppCache из `resetByPattern`
 * приложения: all — без keyPrefix, иначе keyPrefix = секция.
 */
export function aiAnalyticsCacheResetFilter(
    domain: string,
    scope: AiAnalyticsCacheScope,
): AiAnalyticsCacheResetFilter {
    return scope === 'all'
        ? { app: AI_ANALYTICS_CACHE_PREFIX, domain }
        : { app: AI_ANALYTICS_CACHE_PREFIX, domain, keyPrefix: scope };
}
