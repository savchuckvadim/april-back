import type { AnalyticsCallLiteRow } from '@lib/call-lib/call-report-analytics/types/analytics-lite.types';
import { CALL_REPORT_OBJECTION_CODES } from '@lib/portal-lib/pbx/pbx-aicall-smart/type/pbx-aicall-smart.type';
import { isBeforeComparable, matrixComparability } from './comparable-row';
import { isBelowMinDuration, minDurationMapOf } from './manager-type-matrix';
import type { MatrixComparability, MatrixOptions } from './matrix.types';
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
    /**
     * Возражений с handled = true — числитель доли отработанных. Вместе с
     * `handledKnown` позволяет пересчитать долю по окну из нескольких
     * периодов (доли периодов между собой не складываются).
     */
    handled: number;
    /** Возражений с известным handled (true или false) — знаменатель доли. */
    handledKnown: number;
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

/**
 * Опции среза. Границы сравнимости — те же, что у матрицы менеджер × тип
 * (`comparableFrom` / `comparableVersionFrom` / `seriesBreakFrom` +
 * `timeZone`, правило — `comparable-row.ts`): срез, собранный с опциями
 * матрицы периода, считает возражения по тем же звонкам, что и её `n`.
 * Границы не заданы — звонки по дате не отсекаются.
 */
export interface ObjectionsOptions
    extends Pick<
        MatrixOptions,
        | 'comparableFrom'
        | 'comparableVersionFrom'
        | 'seriesBreakFrom'
        | 'timeZone'
    > {
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

/** Разбор в слое качества: менеджер известен (строка идёт в срез). */
type QualityRow = AnalyticsCallLiteRow & { managerId: string };

/**
 * Те же фильтры, что у матрицы менеджер × тип: разбор есть, менеджер и
 * тип звонка известны, звонок не короче порога своего типа и не раньше
 * границы сравнимости. Иначе «N возражений в M звонках» считалось бы по
 * другому набору звонков, чем объём и оценки периода.
 */
function inQualityLayer(
    row: AnalyticsCallLiteRow,
    byType: MinDurationSecByType,
    comparability: MatrixComparability,
): row is QualityRow {
    return (
        row.analysisPresent &&
        row.managerId !== null &&
        row.managerId !== '' &&
        row.callType !== null &&
        row.callType !== '' &&
        !isBelowMinDuration(row, byType) &&
        !isBeforeComparable(row, comparability)
    );
}

function collect(
    rows: readonly AnalyticsCallLiteRow[],
    byType: MinDurationSecByType,
    comparability: MatrixComparability,
): ObjectionRecord[] {
    const records: ObjectionRecord[] = [];
    for (const row of rows) {
        if (!inQualityLayer(row, byType, comparability)) continue;
        for (const objection of row.objections) {
            records.push({
                managerId: row.managerId,
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
            const handled = known.filter(
                record => record.handled === true,
            ).length;
            return {
                category,
                n: group.length,
                calls: new Set(group.map(record => record.transcriptionId))
                    .size,
                handled,
                handledKnown: known.length,
                handledRatePct: ratePctMetric(handled, known.length),
                outcomes: countOutcomes(group),
            };
        });
}

/**
 * Сквозной срез возражений по всем типам звонков (ТЗ FR-30, уровень E0):
 * менеджер × категория → n, доля отработанных (Уилсон 90 %, только среди
 * возражений с известным handled) со счётчиками handled / handledKnown и
 * исходы. outcome читается как есть: continued / converted / disengaged,
 * всё прочее и null → other. Возражение без категории →
 * OBJECTION_CATEGORY_UNKNOWN. Звонки — те же, что у матрицы менеджер ×
 * тип: без разбора, без менеджера, без типа, короче порога своего типа
 * (карта `minDurationSecByType`, иначе shortCallSec) и до границы
 * сравнимости (если задана) не участвуют.
 * Чистая детерминированная функция.
 */
export function buildObjectionsSlice(
    rows: readonly AnalyticsCallLiteRow[],
    options: ObjectionsOptions = {},
): ObjectionsSlice {
    const records = collect(
        rows,
        minDurationMapOf(options.shortCallSec, options.minDurationSecByType),
        matrixComparability(options),
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
