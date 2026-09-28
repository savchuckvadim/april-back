/**
 * Факты прошлого периода той же длины для пакета AI-резюме: выжимка из
 * кэша обзора прошлого окна, которую джоба резюме кладёт в кэш
 * `brief:prev` (сутки), а сборщик пакета читает синхронно — в Bitrix и
 * загрузчики сборщик не ходит.
 *
 * Чистые функции: без DI, Bitrix и времени.
 */
import type { BriefPeriod } from '@lib/sales-ai-analytics';
import type { AiOverviewDto } from '../dto/ai-overview.dto';
import {
    countSignals,
    nextStepShare,
    rowsInScope,
    sumAnalyzed,
    sumRiskCalls,
    sumSales,
} from './evidence-pack.overview';

/** Числа прошлого периода, с которыми сравниваются факты пакета. */
export interface BriefPrevFacts extends BriefPeriod {
    /** Сигналов риска за прошлый период. */
    alerts: number | null;
    /** Закрытых продаж за прошлый период. */
    sales: number | null;
    /** Разобранных звонков за прошлый период. */
    analyzedCalls: number | null;
    /** Менеджеров с сигналом «Внимание» за прошлый период. */
    attention: number | null;
    /** Доля звонков «шаг с датой» за прошлый период (0..1). */
    nextStep: number | null;
}

/** Числовые поля фактов прошлого периода — по ним проверяется форма. */
const PREV_NUMBER_FIELDS = [
    'alerts',
    'sales',
    'analyzedCalls',
    'attention',
    'nextStep',
] as const satisfies readonly (keyof BriefPrevFacts)[];

const isNumberOrNull = (value: unknown): value is number | null =>
    value === null || (typeof value === 'number' && Number.isFinite(value));

/** Запись кэша `brief:prev` в ожидаемой форме; чужая форма отбрасывается. */
export function isPrevFacts(value: unknown): value is BriefPrevFacts {
    if (typeof value !== 'object' || value === null) return false;
    const record = value as Record<string, unknown>;

    return (
        typeof record.from === 'string' &&
        typeof record.to === 'string' &&
        PREV_NUMBER_FIELDS.every(field => isNumberOrNull(record[field]))
    );
}

/** У фактов есть хотя бы одно число (а не пометка «расчёт не готов»). */
export function hasPrevNumbers(facts: BriefPrevFacts | null): boolean {
    return (
        facts !== null &&
        PREV_NUMBER_FIELDS.some(field => facts[field] !== null)
    );
}

/** Пометка «прошлый период не готов»: форма фактов без единого числа. */
export function notReadyPrevFacts(period: BriefPeriod): BriefPrevFacts {
    return {
        from: period.from,
        to: period.to,
        alerts: null,
        sales: null,
        analyzedCalls: null,
        attention: null,
        nextStep: null,
    };
}

/**
 * Факты прошлого периода из его обзора — те же суммы, что у текущего.
 * Если за прошлый период не разобрано ни одного звонка, числа, которые
 * считаются по разборам (сигналы риска, «Внимание», шаг с датой), не
 * отдаются: «сигналов не было» там значит «не разбирали», и сравнивать
 * с этим нельзя. Продажи от разборов не зависят и остаются.
 */
export function extractPrevFacts(
    overview: AiOverviewDto,
    period: BriefPeriod,
    managerIds: readonly string[],
): BriefPrevFacts {
    const rows = rowsInScope(overview, managerIds);
    const analyzedCalls = sumAnalyzed(rows);
    const analyzed = analyzedCalls > 0;

    return {
        from: period.from,
        to: period.to,
        alerts: analyzed ? sumRiskCalls(rows) : null,
        sales: sumSales(rows),
        analyzedCalls,
        attention: analyzed ? countSignals(rows) : null,
        nextStep: analyzed ? (nextStepShare(rows)?.value ?? null) : null,
    };
}
