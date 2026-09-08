/**
 * Разбор значений шины конвейера и нагрузок снапшотов в узкие формы
 * санити-панели (план Фазы 2, §4.11): чужая или неполная форма молча
 * отбрасывается — панель не должна падать из-за шага-соседа, который
 * положил в шину не то, что ожидалось.
 *
 * Отделено от `sanity.rules.ts` (правила) и `sanity.types.ts` (словарь):
 * каждый файл — одна ответственность и лимит 300 строк.
 */
import type { AiModelParams, StageSlaFact } from '@lib/sales-ai-analytics';
import { AI_ANALYTICS_URGENT_COACHING } from '../constants/ai-analytics.const';
import {
    AI_SANITY_SLA_STAGES,
    SanityCallFact,
    SanityExposureFact,
    SanityLevelFact,
} from './sanity.types';

const asRecord = (value: unknown): Record<string, unknown> | null =>
    value !== null && typeof value === 'object'
        ? (value as Record<string, unknown>)
        : null;

const num = (value: unknown): number =>
    typeof value === 'number' && Number.isFinite(value) ? value : 0;

/** Bitrix-id менеджера строкой; чужая форма даёт пустую строку. */
const idOf = (value: unknown, fallback = ''): string =>
    typeof value === 'string' || typeof value === 'number'
        ? String(value)
        : fallback;

/** Договорённости об SLA из настроек портала: код параметра → стадия. */
export function agreedSla(params: AiModelParams): Record<string, number> {
    const agreed: Record<string, number> = {};
    for (const [code, value] of Object.entries(params)) {
        const pair = Object.entries(AI_SANITY_SLA_STAGES).find(
            ([sla]) => sla === code,
        );
        if (pair && typeof value === 'number') agreed[pair[1]] = value;
    }
    return agreed;
}

/** Строки звонков из шины в объёме панели (чужая форма отбрасывается). */
export function callFacts(value: unknown): SanityCallFact[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((item: unknown) => {
        const row = asRecord(item);
        if (!row) return [];
        const flags = row.riskFlags;
        return [
            {
                managerId: idOf(row.managerId),
                callType: typeof row.callType === 'string' ? row.callType : '',
                durationSec:
                    typeof row.durationSec === 'number'
                        ? row.durationSec
                        : null,
                alert:
                    (Array.isArray(flags) && flags.length > 0) ||
                    row.coachingPriority === AI_ANALYTICS_URGENT_COACHING,
            },
        ];
    });
}

/** Факты сроков стадий из шины (`stageSlaFacts` шага истории стадий). */
export function slaFacts(value: unknown): Record<string, StageSlaFact> {
    const source = asRecord(value);
    if (!source) return {};
    const facts: Record<string, StageSlaFact> = {};
    for (const [stage, item] of Object.entries(source)) {
        const fact = asRecord(item);
        if (!fact || typeof fact.p50 !== 'number') continue;
        facts[stage] = {
            p25: num(fact.p25),
            p50: fact.p50,
            p90: num(fact.p90),
            n: num(fact.n),
        };
    }
    return facts;
}

/** Экспозиция из шины: массив записей либо словарь по менеджеру. */
export function exposureFacts(value: unknown): SanityExposureFact[] {
    const entries: [string, unknown][] = Array.isArray(value)
        ? value.map((item: unknown, index: number) => [String(index), item])
        : Object.entries(asRecord(value) ?? {});
    return entries.flatMap(([key, item]) => {
        const row = asRecord(item);
        if (!row || typeof row.daysSource !== 'string') return [];
        return [
            {
                managerId: idOf(row.managerId, key),
                daysSource: row.daysSource,
            },
        ];
    });
}

/** Уровень и продажи менеджер-месяца из нагрузки снапшота. */
export function levelFactOf(payload: unknown): SanityLevelFact[] {
    const record = asRecord(payload);
    const finance = asRecord(record?.finance);
    const level = record?.level;
    const sales = finance?.salesCount;
    return typeof level === 'string' && typeof sales === 'number'
        ? [{ level, sales }]
        : [];
}

/** Нагрузка снапшота модели портала как словарь (для дописывания поля). */
export function modelPayloadOf(
    payload: unknown,
): Record<string, unknown> | null {
    return asRecord(payload);
}
