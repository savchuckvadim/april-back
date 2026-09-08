/**
 * Разбор чужих значений для шага истории стадий (план Фазы 2, поток 13):
 * строки звонков из шины конвейера и трактовка ребра из последнего снапшота
 * модели портала.
 *
 * Отделено от `stage-history.step.ts` по образцу `sanity.facts.ts`: шаг
 * оркеструет, разбор — здесь, каждый файл в пределах 300 строк. Чужая или
 * неполная форма молча отбрасывается: шаг не должен падать из-за соседа,
 * положившего в шину не то, что ожидалось.
 */
import {
    AI_EDGE_ESTIMANDS,
    type AiEdgeEstimand,
    type CallForLink,
} from '@lib/sales-ai-analytics';
import type { CallEntityRef } from '../domain/loaders/call-entity.loader';

/** Звонок в объёме шага: транскрипция и момент звонка ISO 8601. */
export interface StageHistoryCallFact {
    readonly transcriptionId: string;
    readonly at: string;
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
    value !== null && typeof value === 'object'
        ? (value as Record<string, unknown>)
        : null;

/** Момент звонка ISO 8601: в шине лежит Date, в кэше — строка. */
function instantOf(value: unknown): string {
    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? '' : value.toISOString();
    }

    return typeof value === 'string' ? value : '';
}

/**
 * Строки звонков из шины (`calls.rows` шага звонков) в объёме сцепки.
 * Строка без транскрипции или без времени звонка отбрасывается: её нельзя
 * положить ни в эпизод, ни в долю сцепки.
 */
export function stageHistoryCallFacts(value: unknown): StageHistoryCallFact[] {
    if (!Array.isArray(value)) return [];

    return value.flatMap((item: unknown): StageHistoryCallFact[] => {
        const row = asRecord(item);
        if (!row) return [];
        const transcriptionId =
            typeof row.transcriptionId === 'string' ||
            typeof row.transcriptionId === 'number'
                ? String(row.transcriptionId)
                : '';
        const at = instantOf(row.callStartedAt);

        return transcriptionId && at ? [{ transcriptionId, at }] : [];
    });
}

/**
 * Звонки для сцепки: строка шины + сущность CRM из `ais`.
 *
 * ⚠ Звонок БЕЗ записи разбора остаётся в списке с пустой сущностью и
 * попадает в знаменатель доли сцепки как несцепленный. Иначе портал, где
 * сущность известна у 5 % звонков, показал бы 100 % сцепки и досрочно
 * переключил рёбра с интенсивностей на вероятности — на смещённой выборке.
 */
export function toCallsForLink(
    facts: readonly StageHistoryCallFact[],
    refs: ReadonlyMap<string, CallEntityRef>,
): CallForLink[] {
    return facts.map((fact): CallForLink => {
        const ref = refs.get(fact.transcriptionId);

        return {
            callId: fact.transcriptionId,
            at: fact.at,
            entityType: ref?.entityType ?? 'deal',
            entityId: ref?.entityId ?? '',
        };
    });
}

/**
 * Трактовка ребра из последнего снапшота модели портала (поле `edgeKind`).
 * Снапшота ещё нет или поле чужой формы — undefined: гистерезис стартует
 * с интенсивности, как и положено новому порталу.
 */
export function previousEstimandOf(
    payload: unknown,
): AiEdgeEstimand | undefined {
    const value = asRecord(payload)?.edgeKind;

    return AI_EDGE_ESTIMANDS.includes(value as AiEdgeEstimand)
        ? (value as AiEdgeEstimand)
        : undefined;
}
