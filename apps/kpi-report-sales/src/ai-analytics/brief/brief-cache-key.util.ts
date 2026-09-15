/**
 * Ключи кэша AI-резюме (план Фазы 2, поток 18).
 *
 * Схема (общая с `cache/cache-key.util.ts`, тот файл — чужой и не правится):
 *   sales-ai-analytics:v1:{domain}:brief:{packHash}        — резюме по пакету
 *   sales-ai-analytics:v1:{domain}:brief-quota:{YYYY-MM-DD} — вызовов LLM за день
 *
 * Ключ резюме он же `requestKey` конверта и он же `jobId` джобы
 * SALES_AI_ANALYTICS_BRIEF: одинаковый пакет фактов даёт один расчёт, а
 * повторный клик подписывается на идущий (ai/rules/heavy-endpoint-queue.md).
 * Чистые функции: без DI и без времени.
 */
import {
    AI_ANALYTICS_CACHE_PREFIX,
    AI_ANALYTICS_CACHE_SECTIONS,
} from '../constants/ai-analytics.const';

const { BRIEF, BRIEF_QUOTA } = AI_ANALYTICS_CACHE_SECTIONS;

/** `sales-ai-analytics:v1:{domain}:brief:{packHash}` — ключ резюме и jobId. */
export function buildBriefKey(domain: string, packHash: string): string {
    return `${AI_ANALYTICS_CACHE_PREFIX}:${domain}:${BRIEF}:${packHash}`;
}

/** `sales-ai-analytics:v1:{domain}:brief-quota:{date}` — счётчик вызовов за день. */
export function buildBriefQuotaKey(domain: string, date: string): string {
    return `${AI_ANALYTICS_CACHE_PREFIX}:${domain}:${BRIEF_QUOTA}:${date}`;
}
