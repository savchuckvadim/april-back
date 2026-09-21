/**
 * Ключи кэша и снапшота AI-резюме (план Фазы 2, поток 18).
 *
 * Схема кэша (общая с `cache/cache-key.util.ts`, тот файл — чужой и не правится):
 *   sales-ai-analytics:v1:{domain}:brief:{packHash}        — резюме по пакету
 *   sales-ai-analytics:v1:{domain}:brief-quota:{YYYY-MM-DD} — вызовов LLM за день
 *
 * Ключ резюме он же `requestKey` конверта и он же `jobId` джобы
 * SALES_AI_ANALYTICS_BRIEF: одинаковый пакет фактов даёт один расчёт, а
 * повторный клик подписывается на идущий (ai/rules/heavy-endpoint-queue.md).
 *
 * Ключ периода снапшота `ai-analytics-brief` (`activity_id` в ais) — другой:
 *   {from}_{to}_{ростер}
 * Ростер нормализован как в отчётах (`buildReportUsersKey`: уникальные
 * id по возрастанию через `_`, пусто — `all`), а длинный ростер заменяется
 * его sha1-хэшем (16 hex), чтобы ключ уложился в форму зерна
 * `portal-hash` стора. Так резюме одного периода и состава замещают друг
 * друга (`superseded`), а packHash живёт в нагрузке и `inputsHash`.
 *
 * Чистые функции: без DI и без времени.
 */
import {
    AI_ANALYTICS_CACHE_PREFIX,
    AI_ANALYTICS_CACHE_SECTIONS,
} from '../constants/ai-analytics.const';
import { AI_BRIEF_PERIOD_KEY_MAX_LENGTH } from '../constants/ai-brief.const';
import { buildReportUsersKey } from '../../report/cache/report-cache-key.util';
import { snapshotHashKey } from '../store/snapshot-serialize.util';

const { BRIEF, BRIEF_QUOTA } = AI_ANALYTICS_CACHE_SECTIONS;

/** `sales-ai-analytics:v1:{domain}:brief:{packHash}` — ключ резюме и jobId. */
export function buildBriefKey(domain: string, packHash: string): string {
    return `${AI_ANALYTICS_CACHE_PREFIX}:${domain}:${BRIEF}:${packHash}`;
}

/** `sales-ai-analytics:v1:{domain}:brief-quota:{date}` — счётчик вызовов за день. */
export function buildBriefQuotaKey(domain: string, date: string): string {
    return `${AI_ANALYTICS_CACHE_PREFIX}:${domain}:${BRIEF_QUOTA}:${date}`;
}

/**
 * Нормализованный ростер для ключа периода: короткий — как есть
 * (`10_20`, `all`), длинный — его хэш, чтобы ключ не вышел за потолок
 * зерна. Один и тот же состав в любом порядке даёт один ключ.
 */
export function buildBriefRosterKey(
    from: string,
    to: string,
    managerIds: readonly (string | number)[],
): string {
    const roster = buildReportUsersKey(managerIds);
    const prefixLength = `${from}_${to}_`.length;

    return prefixLength + roster.length <= AI_BRIEF_PERIOD_KEY_MAX_LENGTH
        ? roster
        : snapshotHashKey([roster]);
}

/** `{from}_{to}_{ростер}` — ключ периода снапшота `ai-analytics-brief`. */
export function buildBriefPeriodKey(
    from: string,
    to: string,
    managerIds: readonly (string | number)[],
): string {
    return `${from}_${to}_${buildBriefRosterKey(from, to, managerIds)}`;
}
