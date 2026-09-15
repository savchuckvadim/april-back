/**
 * Ключи и TTL кэша жёстких счётчиков стиля (`style-crm`). Общий префикс
 * модуля, своя секция — по образцу `loader-cache-key.util.ts`, который
 * правят другие потоки:
 *
 *   sales-ai-analytics:v1:{domain}:style-crm:{yyyy-MM}:{usersKey}
 *   sales-ai-analytics:v1:{domain}:style-crm:{yyyy-MM}:{usersKey}:{from}_{to}
 *
 * Неполный сегмент обязан нести границы дней в ключе: иначе счётчики за
 * «1–15 августа» легли бы под ключ полного августа и следующий запрос
 * получил бы половину месяца как месяц.
 */
import { AI_ANALYTICS_CACHE_PREFIX } from '../../constants/ai-analytics.const';
import type { MonthSegment } from '../../../shared/lib/month-segments.util';

/** Секция кэша загрузчика (сброс — паттерном `…:style-crm:*`). */
export const STYLE_CRM_CACHE_SECTION = 'style-crm' as const;

/** Закрытый месяц: телефония прошлого месяца уже не меняется. */
export const STYLE_CRM_CLOSED_TTL_SECONDS = 60 * 60 * 24 * 30;
/** Текущий/неполный сегмент: короткий буфер. */
export const STYLE_CRM_LIVE_TTL_SECONDS = 600;
/** Потолок строк телефонии на сегмент (≈ месяц отдела продаж). */
export const STYLE_CRM_MAX_ROWS = 20_000;

export function buildStyleCrmMonthKey(
    domain: string,
    segment: MonthSegment,
    usersKey: string,
): string {
    const base = `${AI_ANALYTICS_CACHE_PREFIX}:${domain}:${STYLE_CRM_CACHE_SECTION}:${segment.month}:${usersKey}`;
    return segment.cacheable ? base : `${base}:${segment.from}_${segment.to}`;
}

/** Паттерн сброса секции домена. */
export function buildStyleCrmResetPattern(domain: string): string {
    return `${AI_ANALYTICS_CACHE_PREFIX}:${domain}:${STYLE_CRM_CACHE_SECTION}:*`;
}

/** TTL сегмента: закрытый полный месяц — 30 дней, иначе живой буфер. */
export function styleCrmTtlSeconds(segment: MonthSegment): number {
    return segment.cacheable
        ? STYLE_CRM_CLOSED_TTL_SECONDS
        : STYLE_CRM_LIVE_TTL_SECONDS;
}
