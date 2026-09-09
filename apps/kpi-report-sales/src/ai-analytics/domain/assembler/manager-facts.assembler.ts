/**
 * Факты менеджера за период из KPI-слоя, финансов и планов (план §2.2,
 * §6.3): сумма месячных сегментов KPI, план-факт CRM (дисциплина) и
 * финансовый хвост.
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

/** Сумма месячных сегментов KPI по каждому менеджеру ростера. */
export function sumKpiMonths(
    result: AiKpiMonthsResult,
): Map<number, ManagerKpiPeriod> {
    const totals = new Map<number, ManagerKpiPeriod>(
        result.managerIds.map(id => [id, emptyKpiPeriod(id)]),
    );
    for (const month of result.months) {
        for (const manager of month.managers) {
            const current =
                totals.get(manager.managerId) ??
                emptyKpiPeriod(manager.managerId);
            totals.set(manager.managerId, addMonth(current, manager));
        }
    }
    return totals;
}

/** План-факт CRM по звонкам и презентациям «всего». */
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
 * Финансовый хвост менеджера: закрытые продажи периода + пайплайн v2
 * («горячие» ≥ «В решении», разрезы по цвету, предложению, типу и сроку
 * договора); без строки — нули и пустые разрезы. Разрезы копируются,
 * чтобы DTO не делил массивы с доменной сводкой.
 */
export function toFinanceTail(
    summary: AiFinanceManagerSummary | undefined,
): AiFinanceTailDto {
    const live: AiFinancePipelineFacts = summary ?? emptyPipelineFacts();
    return {
        salesCount: summary?.salesCount ?? 0,
        advanceAmount: summary?.advanceAmount ?? 0,
        monthlyAmount: summary?.monthlyAmount ?? 0,
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
