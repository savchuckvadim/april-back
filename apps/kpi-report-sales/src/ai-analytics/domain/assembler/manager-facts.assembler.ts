/**
 * Факты менеджера за период из KPI-слоя, финансов и планов (план §2.2,
 * §6.3): сумма месячных сегментов KPI, план-факт CRM (дисциплина), рёбра
 * воронки как доли по самоотчёту без усадки, форма воронки, KPI-факты
 * ячейки типа с планом CRM и планом руководителя, финансовый хвост.
 * Чистые функции.
 */
import {
    AI_ANALYTICS_EVENT_KINDS,
    CALL_REPORT_CALL_TYPE_CODES,
    CallReportCallTypeCode,
    type AiAnalyticsKpiEventTypeCode,
} from '@lib/portal-lib/pbx/pbx-aicall-smart';
import {
    AttentionDiscipline,
    METRIC_CONFIDENCE_REASONS,
    MetricValue,
    rateMetric,
} from '@lib/sales-ai-analytics';
import {
    AI_ANALYTICS_FUNNEL_EDGES,
    AI_ANALYTICS_FUNNEL_SHAPE,
    AiAnalyticsFunnelShape,
} from '../../constants/ai-overview.const';
import {
    AiFinanceTailDto,
    AiFunnelEdgeDto,
} from '../../dto/ai-manager-row.dto';
import { AiCellKpiDto } from '../../dto/ai-manager-type-cell.dto';
import type { AiFinanceManagerSummary } from '../loaders/finance.types';
import type {
    AiKpiManagerMonth,
    AiKpiMonthsResult,
    AiKpiPlanFact,
    AiKpiTypeFact,
} from '../loaders/kpi.types';
import type { AiPlanManagerTargets } from '../loaders/plans.types';
import type { ManagerKpiPeriod } from './overview-model.types';

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

/** Счётчик самоотчёта по innerCode ребра воронки. */
function edgeCounter(kpi: ManagerKpiPeriod, innerCode: string): number {
    switch (innerCode) {
        case 'call_done':
            return kpi.calls.done;
        case 'presentation_uniq_done':
            return kpi.presentationsUniq.done;
        case 'ev_offer_act_send':
            return kpi.documents.offers;
        case 'ev_invoice_act_send':
            return kpi.documents.invoices;
        case 'ev_success_done':
            return kpi.outcomes.success;
        default:
            return 0;
    }
}

/** Доля s/n; s > n — числитель и знаменатель из разных событий. */
export function edgeRate(s: number, n: number): MetricValue {
    const rate = rateMetric(s, n);
    if (s > n && rate.value !== null) {
        return {
            ...rate,
            confidence: {
                level: 'low',
                reason: METRIC_CONFIDENCE_REASONS.mixedSources,
            },
        };
    }
    return rate;
}

/** Рёбра воронки по KPI-фактам, без усадки (priorSource none). */
export function toFunnel(kpi: ManagerKpiPeriod | undefined): AiFunnelEdgeDto[] {
    return AI_ANALYTICS_FUNNEL_EDGES.map(edge => {
        const n = kpi ? edgeCounter(kpi, edge.from) : 0;
        const s = kpi ? edgeCounter(kpi, edge.to) : 0;
        return {
            edge: edge.code,
            title: edge.title,
            n,
            s,
            rate: edgeRate(s, n),
            priorSource: 'none',
        };
    });
}

/** Форма воронки по доле счетов без презентации при ≥ minInvoices счетов. */
export function toFunnelShape(
    kpi: ManagerKpiPeriod | undefined,
): AiAnalyticsFunnelShape {
    const invoices = kpi?.documents.invoices ?? 0;
    if (invoices < AI_ANALYTICS_FUNNEL_SHAPE.minInvoices || !kpi) {
        return 'unknown';
    }
    const withoutPresentation =
        (invoices - kpi.documents.invoicesAfterPresentation) / invoices;
    if (withoutPresentation >= AI_ANALYTICS_FUNNEL_SHAPE.closerShare) {
        return 'closer';
    }
    if (withoutPresentation <= AI_ANALYTICS_FUNNEL_SHAPE.presenterShare) {
        return 'presenter';
    }
    return 'balanced';
}

/** План CRM по KPI-коду (только у кодов с парой *_plan в kpi-report). */
function planCrmFor(kpi: ManagerKpiPeriod, code: string): number | undefined {
    switch (code) {
        case 'call':
            return kpi.calls.plan;
        case 'presentation':
            return kpi.presentations.plan;
        case 'presentation_uniq':
            return kpi.presentationsUniq.plan;
        case 'presentation_contact_uniq':
            return kpi.presentationsContactUniq.plan;
        default:
            return undefined;
    }
}

/** План руководителя по KPI-коду (calls_done → call, presentations_done → presentation_uniq). */
function planHeadFor(
    plans: AiPlanManagerTargets | undefined,
    code: string,
): number | undefined {
    if (!plans) return undefined;
    if (code === 'call') return plans.calls ?? undefined;
    if (code === 'presentation_uniq') return plans.presentations ?? undefined;
    return undefined;
}

/** KPI-часть ячейки: факты по кодам, главный факт и причина его отсутствия. */
export interface CellKpiPart {
    kpi: AiCellKpiDto[];
    primaryKpi: AiCellKpiDto | null;
    kpiReason: string | null;
}

/** KPI-факты ячейки типа в порядке карты + главный факт. */
export function toCellKpi(
    kind: CallReportCallTypeCode,
    kpi: ManagerKpiPeriod | undefined,
    plans: AiPlanManagerTargets | undefined,
): CellKpiPart {
    const definition = AI_ANALYTICS_EVENT_KINDS[kind];
    const fact = kpi?.byType[kind];
    const doneByCode = new Map(
        (fact?.kpi ?? []).map(item => [item.code, item.done]),
    );
    // Явный тип: индексирование карты union-ключом даёт union readonly-
    // массивов, и .map() по нему выводит элемент как any.
    const codes: readonly AiAnalyticsKpiEventTypeCode[] =
        definition.kpiEventTypeCodes;
    const items: AiCellKpiDto[] = codes.map(code => {
        const done = doneByCode.get(code);
        const planCrm = kpi ? planCrmFor(kpi, code) : undefined;
        const planHead = planHeadFor(plans, code);
        return {
            code,
            fact: done ?? null,
            ...(done === undefined
                ? { reason: `kpi-item-missing:${code}` }
                : {}),
            ...(planCrm !== undefined ? { planCrm } : {}),
            ...(planHead !== undefined ? { planHead } : {}),
        };
    });
    const primaryCode = definition.kpiPrimaryEventTypeCode;
    if (primaryCode === null) {
        return {
            kpi: items,
            primaryKpi: null,
            kpiReason: definition.kpiReason,
        };
    }
    const primary = items.find(item => item.code === primaryCode) ?? null;
    return {
        kpi: items,
        primaryKpi: primary?.fact === null ? null : primary,
        kpiReason:
            primary === null || primary.fact === null
                ? `kpi-item-missing:${primaryCode}`
                : null,
    };
}

/** Пустая KPI-часть для типа вне справочника. */
export const emptyCellKpi = (): CellKpiPart => ({
    kpi: [],
    primaryKpi: null,
    kpiReason: null,
});

/** Сумма KPI-фактов ячейки по менеджерам (итоги по типу). */
export function sumCellKpi(cells: readonly AiCellKpiDto[][]): AiCellKpiDto[] {
    const byCode = new Map<string, AiCellKpiDto>();
    for (const cell of cells) {
        for (const item of cell) {
            const current = byCode.get(item.code);
            if (!current) {
                byCode.set(item.code, { ...item });
                continue;
            }
            const fact =
                current.fact === null && item.fact === null
                    ? null
                    : (current.fact ?? 0) + (item.fact ?? 0);
            const planCrm =
                current.planCrm === undefined && item.planCrm === undefined
                    ? undefined
                    : (current.planCrm ?? 0) + (item.planCrm ?? 0);
            const planHead =
                current.planHead === undefined && item.planHead === undefined
                    ? undefined
                    : (current.planHead ?? 0) + (item.planHead ?? 0);
            byCode.set(item.code, {
                code: item.code,
                fact,
                ...(fact === null && (current.reason ?? item.reason)
                    ? { reason: current.reason ?? item.reason }
                    : {}),
                ...(planCrm !== undefined ? { planCrm } : {}),
                ...(planHead !== undefined ? { planHead } : {}),
            });
        }
    }
    return [...byCode.values()];
}

/** Финансовый хвост менеджера; без строки — нули. */
export function toFinanceTail(
    summary: AiFinanceManagerSummary | undefined,
): AiFinanceTailDto {
    return {
        salesCount: summary?.salesCount ?? 0,
        advanceAmount: summary?.advanceAmount ?? 0,
        monthlyAmount: summary?.monthlyAmount ?? 0,
        pipelineFromStage: {
            count: summary?.pipelineFromStage.count ?? 0,
            monthlyAmount: summary?.pipelineFromStage.monthlyAmount ?? 0,
        },
        hotEvents: summary?.hotEvents ?? 0,
    };
}
