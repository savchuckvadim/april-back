import type { AiAnalyticsReadinessMode } from '../../constants/ai-analytics.const';

/**
 * Порт итогового режима готовности портала для ручек, которым нужен ровно
 * тот режим, что видит баннер (прогноз отдела). Ручка зависит от режима,
 * а не от расчёта готовности; реализация — `CachedSettingsReader` (кэш
 * `settings/get`), подключается по токену в модуле.
 */
export interface ReadinessModeSource {
    /** Итоговый режим готовности портала. */
    readinessMode(domain: string): Promise<AiAnalyticsReadinessMode>;
}

/** DI-токен порта режима готовности. */
export const AI_READINESS_MODE_SOURCE = 'AI_READINESS_MODE_SOURCE' as const;
