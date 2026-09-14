import type { AnalyticsCallLiteRow } from '@lib/call-lib/call-report-analytics/types/analytics-lite.types';
import { CALL_REPORT_OBJECTION_CODES } from '@lib/portal-lib/pbx/pbx-aicall-smart/type/pbx-aicall-smart.type';
import { isBelowMinDuration, minDurationMapOf } from './manager-type-matrix';
import { MetricValue } from './metric';
import { ratePctMetric } from './metric-pct.util';
import type { MinDurationSecByType } from './pulse';

/** Исходы возражения из справочника агента (AgentObjectionDto.outcome). */
export const OBJECTION_OUTCOMES = [
    'continued',
    'converted',
    'disengaged',
] as const;
export type ObjectionOutcome = (typeof OBJECTION_OUTCOMES)[number];

/** Ключ категории для возражений без категории. */
export const OBJECTION_CATEGORY_UNKNOWN = 'unknown';

/** Счётчики исходов; other — неизвестное значение или отсутствие исхода. */
export interface ObjectionOutcomes {
    continued: number;
    converted: number;
    disengaged: number;
    other: number;
}

export interface ObjectionCategoryStat {
    category: string;
    /** Возражений категории. */
    n: number;
    /** Звонков, в которых встретилась категория. */
    calls: number;
    /** Доля handled = true среди возражений с известным handled, %. */
    handledRatePct: MetricValue;
    outcomes: ObjectionOutcomes;
}

export interface ObjectionsManagerSlice {
    managerId: string;
    n: number;
    byCategory: ObjectionCategoryStat[];
}

export interface ObjectionsSlice {
    /** По managerId по возрастанию. */
    byManager: ObjectionsManagerSlice[];
    /** По всем менеджерам. */
    totals: ObjectionCategoryStat[];
    n: number;
}

export interface ObjectionsOptions {
    /** Звонок короче — вне слоя качества (по умолчанию shortCallSec). */
    shortCallSec?: number;
    /**
     * Порог по типам звонков (реестр `min_duration_sec_by_type`): карта
     * побеждает скаляр, скаляр — запасной порог для типов вне карты.
     */
    minDurationSecByType?: MinDurationSecByType;
}

interface ObjectionRecord {
    managerId: string;
    transcriptionId: string;
    category: string;
    handled: boolean | null;
    outcome: string | null;
}

const isOutcome = (value: string): value is ObjectionOutcome =>
    (OBJECTION_OUTCOMES as readonly string[]).includes(value);

const categoryRank = (category: string): number => {
    if (category === OBJECTION_CATEGORY_UNKNOWN) {
        return CALL_REPORT_OBJECTION_CODES.length + 1;
    }
    const index = (CALL_REPORT_OBJECTION_CODES as readonly string[]).indexOf(
        category,
    );
    return index === -1 ? CALL_REPORT_OBJECTION_CODES.length : index;
};

/** Справочник → по порядку, прочие по алфавиту, unknown последним. */
export const compareObjectionCategories = (a: string, b: string): number =>
    categoryRank(a) - categoryRank(b) || a.localeCompare(b);

function collect(
    rows: readonly AnalyticsCallLiteRow[],
    byType: MinDurationSecByType,
): ObjectionRecord[] {
    const records: ObjectionRecord[] = [];
    for (const row of rows) {
        const managerId = row.managerId;
        if (!row.analysisPresent || managerId === null || managerId === '') {
            continue;
        }
        if (isBelowMinDuration(row, byType)) continue;
        for (const objection of row.objections) {
            records.push({
                managerId,
                transcriptionId: row.transcriptionId,
                category:
                    objection.category && objection.category.trim() !== ''
                        ? objection.category
                        : OBJECTION_CATEGORY_UNKNOWN,
                handled: objection.handled,
                outcome: objection.outcome,
            });
        }
    }
    return records;
}

function countOutcomes(records: readonly ObjectionRecord[]): ObjectionOutcomes {
    const outcomes: ObjectionOutcomes = {
        continued: 0,
        converted: 0,
        disengaged: 0,
        other: 0,
    };
    for (const record of records) {
        if (record.outcome !== null && isOutcome(record.outcome)) {
            outcomes[record.outcome] += 1;
        } else {
            outcomes.other += 1;
        }
    }
    return outcomes;
}

function byCategory(
    records: readonly ObjectionRecord[],
): ObjectionCategoryStat[] {
    const groups = new Map<string, ObjectionRecord[]>();
    for (const record of records) {
        const group = groups.get(record.category) ?? [];
        group.push(record);
        groups.set(record.category, group);
    }
    return [...groups.entries()]
        .sort(([a], [b]) => compareObjectionCategories(a, b))
        .map(([category, group]) => {
            const known = group.filter(record => record.handled !== null);
            return {
                category,
                n: group.length,
                calls: new Set(group.map(record => record.transcriptionId))
                    .size,
                handledRatePct: ratePctMetric(
                    known.filter(record => record.handled === true).length,
                    known.length,
                ),
                outcomes: countOutcomes(group),
            };
        });
}

/**
 * Сквозной срез возражений по всем типам звонков (ТЗ FR-30, уровень E0):
 * менеджер × категория → n, доля отработанных (Уилсон 90 %, только среди
 * возражений с известным handled) и исходы. outcome читается как есть:
 * continued / converted / disengaged, всё прочее и null → other.
 * Возражение без категории → OBJECTION_CATEGORY_UNKNOWN. Строки без
 * разбора, без менеджера и короче порога своего типа (карта
 * `minDurationSecByType`, иначе shortCallSec) не участвуют.
 * Чистая детерминированная функция.
 */
export function buildObjectionsSlice(
    rows: readonly AnalyticsCallLiteRow[],
    options: ObjectionsOptions = {},
): ObjectionsSlice {
    const records = collect(
        rows,
        minDurationMapOf(options.shortCallSec, options.minDurationSecByType),
    );
    const managers = new Map<string, ObjectionRecord[]>();
    for (const record of records) {
        const group = managers.get(record.managerId) ?? [];
        group.push(record);
        managers.set(record.managerId, group);
    }
    return {
        byManager: [...managers.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([managerId, group]) => ({
                managerId,
                n: group.length,
                byCategory: byCategory(group),
            })),
        totals: byCategory(records),
        n: records.length,
    };
}
