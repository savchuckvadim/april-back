/**
 * План руководителя против факта строки обзора — РОВНО как блок «Планы»
 * вкладки KPI (фронтовые buildUserAchievementCells + planFact):
 * - показатели — только включённые в конфиге планов портала, в его
 *   порядке, с именем портала (enabledPlanIndicators);
 * - план — значение «План: …» сотрудника, пересчитанное на даты обзора
 *   (planForRange: месячная ставка по periodType, неполный месяц — по
 *   доле дней); значение не задано или ≤ 0 — плана нет;
 * - факт kpi — строка отчёта KPI с кодом factKey (Σ счётчиков месяцев
 *   периода), нет строки — 0; факт finance — поле итогов сотрудника
 *   закрытых продаж (как вкладка «Финансы»), нет сделок — 0; airtime и
 *   calling вкладка AI не загружает — null;
 * - доля выполнения = факт / план (null без плана или факта).
 *
 * Отсюда же план на период по innerCode факта для ячеек типов звонков
 * (planHead): одна формула на строку и ячейки. Чистые функции.
 */
import {
    enabledPlanIndicators,
    findPlanIndicator,
    PLAN_FACT_SOURCE,
    planForRange,
    type EnabledPlanIndicator,
    type PlanFactSource,
    type PlanIndicatorCode,
    type PlanIndicatorSetting,
    type PlanPeriodType,
    type PlanUnit,
} from '../../../plans';
import type { ClosedSalesTotalsDto } from '../../../sales-finance';
import type { AiFinanceClosedTotals } from '../loaders/finance.types';

/** Ячейка «план руководителя против факта» (контракт AiPlanTargetCellDto). */
export interface AiPlanTargetCell {
    code: PlanIndicatorCode;
    name: string;
    unit: PlanUnit;
    factSource: PlanFactSource;
    periodType: PlanPeriodType;
    target: number | null;
    plan: number | null;
    fact: number | null;
    percent: number | null;
}

export interface PlanTargetsInput {
    /** Конфиг планов портала; нет — план руководителя не строится. */
    config: readonly PlanIndicatorSetting[] | undefined;
    /** Значения «План: …» сотрудника по коду показателя. */
    targets:
        | Readonly<Partial<Record<PlanIndicatorCode, number | null>>>
        | undefined;
    /** Σ счётчиков отчёта KPI за период: innerCode → число. */
    counters: Readonly<Record<string, number>> | undefined;
    /** Закрытые продажи сотрудника за период (итоги sales-finance). */
    finance: AiFinanceClosedTotals | undefined;
    /** Период обзора, yyyy-MM-dd включительно. */
    from: string;
    to: string;
}

/** Поле итогов закрытых продаж (factKey каталога) → число AI-итогов. */
const FINANCE_FACTS: Record<
    keyof ClosedSalesTotalsDto,
    ((totals: AiFinanceClosedTotals) => number) | null
> = {
    dealsCount: totals => totals.salesCount,
    advanceAmount: totals => totals.advanceAmount,
    paidMonths: totals => totals.paidMonths,
    monthlyAmount: totals => totals.monthlyAmount,
    // Количество товара финансовый слой AI не несёт.
    quantity: null,
    expectedContractAmount: totals => totals.expectedContractAmount,
};

/** Ключи — собственные поля карты (не прототип объекта). */
const FINANCE_FACT_KEYS: readonly string[] = Object.keys(FINANCE_FACTS);

function isFinanceFactKey(key: string): key is keyof ClosedSalesTotalsDto {
    return FINANCE_FACT_KEYS.includes(key);
}

/** Факт показателя за период по источнику каталога. */
function factOf(
    indicator: EnabledPlanIndicator,
    input: PlanTargetsInput,
): number | null {
    switch (indicator.factSource) {
        case PLAN_FACT_SOURCE.kpi:
            return input.counters?.[indicator.factKey] ?? 0;
        case PLAN_FACT_SOURCE.finance: {
            if (!isFinanceFactKey(indicator.factKey)) return null;
            const read = FINANCE_FACTS[indicator.factKey];
            if (read === null) return null;
            return input.finance ? read(input.finance) : 0;
        }
        default:
            // airtime / calling: источники вкладка AI не загружает.
            return null;
    }
}

/** План руководителя против факта по включённым показателям портала. */
export function buildPlanTargets(input: PlanTargetsInput): AiPlanTargetCell[] {
    if (!input.config) return [];
    return enabledPlanIndicators(input.config).map(indicator => {
        const target = input.targets?.[indicator.code] ?? null;
        const plan =
            target === null || target <= 0
                ? null
                : planForRange(
                      target,
                      indicator.periodType,
                      input.from,
                      input.to,
                  );
        const fact = factOf(indicator, input);
        return {
            code: indicator.code,
            name: indicator.displayName,
            unit: indicator.unit,
            factSource: indicator.factSource,
            periodType: indicator.periodType,
            target,
            plan,
            fact,
            percent: plan && fact !== null ? fact / plan : null,
        };
    });
}

/**
 * План на период по innerCode факта (только kpi-показатели с планом):
 * ячейка типа звонка берёт его по «{код}_done» своего KPI-кода.
 */
export function planHeadsByFactKey(
    cells: readonly AiPlanTargetCell[],
): Map<string, number> {
    const heads = new Map<string, number>();
    for (const cell of cells) {
        if (cell.factSource !== PLAN_FACT_SOURCE.kpi || cell.plan === null) {
            continue;
        }
        const factKey = findPlanIndicator(cell.code)?.factKey;
        if (factKey) heads.set(factKey, cell.plan);
    }
    return heads;
}
