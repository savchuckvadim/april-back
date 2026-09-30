/**
 * Факты менеджера за период из KPI-слоя, финансов и планов (план §2.2,
 * §6.3): сумма месячных сегментов KPI (вместе с сырыми счётчиками
 * kpi-report — факт плана руководителя по factKey, как блок «Планы»),
 * план-факт CRM (дисциплина) и финансовый хвост с источником чисел.
 *
 * Рёбра воронки живут в `funnel-edges.assembler.ts`, KPI-часть ячейки
 * типа — в `cell-kpi.assembler.ts` (Фаза 2, поток 16b: файл перестал
 * влезать в лимит «≤ 300 строк»). Реэкспорт ниже сохраняет прежние
 * импорты соседей — им переезд не виден.
 *
 * Чистые функции.
 */
import {
    AI_ANALYTICS_EVENT_KINDS,
    CALL_REPORT_CALL_TYPE_CODES,
    CallReportCallTypeCode,
} from '@lib/portal-lib/pbx/pbx-aicall-smart';
import { AttentionDiscipline } from '@lib/sales-ai-analytics';
import { AiFinanceTailDto } from '../../dto/ai-manager-row.dto';
import { emptyPipelineFacts } from '../loaders/finance-pipeline.assembler';
import type {
    AiFinanceManagerSummary,
    AiFinancePipelineFacts,
} from '../loaders/finance.types';
import type {
    AiKpiManagerMonth,
    AiKpiMonthsResult,
    AiKpiPlanFact,
    AiKpiTypeFact,
} from '../loaders/kpi.types';
import type { ManagerKpiPeriod } from './overview-model.types';

/**
 * KPI-факты менеджера за период + то, что нужно плану руководителя:
 * границы периода KPI-слоя и Σ счётчиков kpi-report по месяцам (строки
 * отчёта KPI по innerCode — факт блока «Планы»).
 */
export interface ManagerKpiPeriodFacts extends ManagerKpiPeriod {
    /** Период KPI-слоя (он же период обзора), yyyy-MM-dd включительно. */
    period: { from: string; to: string };
    /** Σ счётчиков kpi-report по месяцам периода: innerCode → число. */
    counters: Readonly<Record<string, number>>;
}

export {
    emptyCellKpi,
    sumCellKpi,
    toCellKpi,
    type CellKpiPart,
} from './cell-kpi.assembler';
export {
    edgeRate,
    toFunnel,
    toFunnelShape,
    toFunnelWithNorms,
} from './funnel-edges.assembler';

const addPlanFact = (a: AiKpiPlanFact, b: AiKpiPlanFact): AiKpiPlanFact => ({
    plan: a.plan + b.plan,
    done: a.done + b.done,
});

function addTypeFact(a: AiKpiTypeFact, b: AiKpiTypeFact): AiKpiTypeFact {
    const done = new Map(a.kpi.map(fact => [fact.code, fact.done]));
    for (const fact of b.kpi) {
        done.set(fact.code, (done.get(fact.code) ?? 0) + fact.done);
    }
    const primaryDone =
        a.primaryDone === null && b.primaryDone === null
            ? null
            : (a.primaryDone ?? 0) + (b.primaryDone ?? 0);
    return {
        kind: a.kind,
        kpi: [...done.entries()].map(([code, value]) => ({
            code,
            done: value,
        })),
        primaryDone,
        reason: primaryDone === null ? (a.reason ?? b.reason) : null,
    };
}

function emptyKpiPeriod(managerId: number): ManagerKpiPeriod {
    const zero = (): AiKpiPlanFact => ({ plan: 0, done: 0 });
    return {
        managerId,
        calls: zero(),
        presentations: zero(),
        presentationsUniq: zero(),
        presentationsContactUniq: zero(),
        documents: {
            offers: 0,
            offersAfterPresentation: 0,
            invoices: 0,
            invoicesAfterPresentation: 0,
            contracts: 0,
        },
        outcomes: { success: 0, fail: 0 },
        // Полный Record по всем кодам типов: аккумулятор объявлен с
        // целевым типом, чтобы не приводить результат Object.fromEntries
        // (он теряет литеральные ключи).
        byType: CALL_REPORT_CALL_TYPE_CODES.reduce(
            (acc, kind) => {
                acc[kind] = {
                    kind,
                    kpi: [],
                    primaryDone: null,
                    reason: AI_ANALYTICS_EVENT_KINDS[kind].kpiReason,
                };
                return acc;
            },
            {} as Record<CallReportCallTypeCode, AiKpiTypeFact>,
        ),
    };
}

function addMonth(
    target: ManagerKpiPeriod,
    month: AiKpiManagerMonth,
): ManagerKpiPeriod {
    const byType = { ...target.byType };
    for (const kind of CALL_REPORT_CALL_TYPE_CODES) {
        byType[kind] = addTypeFact(target.byType[kind], month.byType[kind]);
    }
    return {
        managerId: target.managerId,
        calls: addPlanFact(target.calls, month.calls),
        presentations: addPlanFact(target.presentations, month.presentations),
        presentationsUniq: addPlanFact(
            target.presentationsUniq,
            month.presentationsUniq,
        ),
        presentationsContactUniq: addPlanFact(
            target.presentationsContactUniq,
            month.presentationsContactUniq,
        ),
        documents: {
            offers: target.documents.offers + month.documents.offers,
            offersAfterPresentation:
                target.documents.offersAfterPresentation +
                month.documents.offersAfterPresentation,
            invoices: target.documents.invoices + month.documents.invoices,
            invoicesAfterPresentation:
                target.documents.invoicesAfterPresentation +
                month.documents.invoicesAfterPresentation,
            contracts: target.documents.contracts + month.documents.contracts,
        },
        outcomes: {
            success: target.outcomes.success + month.outcomes.success,
            fail: target.outcomes.fail + month.outcomes.fail,
        },
        byType,
    };
}

/** Σ счётчиков kpi-report: запись старого кэша без counters — нули. */
function addCounters(
    target: Readonly<Record<string, number>>,
    month: AiKpiManagerMonth['counters'] | undefined,
): Record<string, number> {
    const sum: Record<string, number> = { ...target };
    if (!month) return sum;
    for (const [code, value] of Object.entries(month)) {
        sum[code] = (sum[code] ?? 0) + (value ?? 0);
    }
    return sum;
}

/**
 * Сумма месячных сегментов KPI по каждому менеджеру ростера — вместе с
 * периодом и суммой сырых счётчиков (факт плана руководителя).
 */
export function sumKpiMonths(
    result: AiKpiMonthsResult,
): Map<number, ManagerKpiPeriodFacts> {
    const period = { from: result.from, to: result.to };
    const empty = (managerId: number): ManagerKpiPeriodFacts => ({
        ...emptyKpiPeriod(managerId),
        period,
        counters: {},
    });
    const totals = new Map<number, ManagerKpiPeriodFacts>(
        result.managerIds.map(id => [id, empty(id)]),
    );
    for (const month of result.months) {
        for (const manager of month.managers) {
            const current =
                totals.get(manager.managerId) ?? empty(manager.managerId);
            totals.set(manager.managerId, {
                ...addMonth(current, manager),
                period,
                counters: addCounters(current.counters, manager.counters),
            });
        }
    }
    return totals;
}

/**
 * План-факт CRM по звонкам и презентациям «всего»: самоотчёт менеджера
 * (сколько сам запланировал в CRM и сделал), не план руководителя.
 */
export function toDiscipline(
    kpi: ManagerKpiPeriod | undefined,
): AttentionDiscipline {
    return {
        callPlan: kpi?.calls.plan ?? 0,
        callDone: kpi?.calls.done ?? 0,
        presentationPlan: kpi?.presentations.plan ?? 0,
        presentationDone: kpi?.presentations.done ?? 0,
    };
}

/**
 * Финансовый хвост менеджера: закрытые продажи периода (итоги сотрудника
 * как на вкладке «Финансы») + источник чисел + пайплайн v2 («горячие» ≥
 * «В решении», разрезы по цвету, предложению, типу и сроку договора); без
 * строки — нули и пустые разрезы. Разрезы копируются, чтобы DTO не делил
 * массивы с доменной сводкой.
 */
export function toFinanceTail(
    summary: AiFinanceManagerSummary | undefined,
): AiFinanceTailDto {
    const live: AiFinancePipelineFacts = summary ?? emptyPipelineFacts();
    return {
        salesCount: summary?.salesCount ?? 0,
        advanceAmount: summary?.advanceAmount ?? 0,
        monthlyAmount: summary?.monthlyAmount ?? 0,
        ...(summary?.source ? { source: { ...summary.source } } : {}),
        pipelineFromStage: { ...live.pipelineFromStage },
        hotEvents: live.hotEvents,
        hotByColor: { ...live.hotByColor },
        withOfferCount: live.withOfferCount,
        pipelineByContractType: live.pipelineByContractType.map(group => ({
            ...group,
        })),
        pipelineByTerm: live.pipelineByTerm.map(group => ({ ...group })),
    };
}
