import {
    CALL_REPORT_CALL_TYPE_CODES,
    CallReportCallTypeCode,
} from '@lib/portal-lib/pbx/pbx-aicall-smart';
import {
    aggregateBucketScores,
    leaveOneOutNorm,
    scoreMetric,
    type NormCell,
} from '@lib/sales-ai-analytics';
import { toFunnel } from '../../domain/assembler/funnel-edges.assembler';
import {
    toDiscipline,
    toFinanceTail,
} from '../../domain/assembler/manager-facts.assembler';
import type {
    ManagerKpiPeriod,
    PortalModelView,
} from '../../domain/assembler/overview-model.types';
import type {
    PortalManagerMonth,
    PortalManagerNorms,
    PortalMonthEdge,
} from '../../domain/assembler/portal-model.types';
import type { AiKpiTypeFact } from '../../domain/loaders/kpi.types';
import {
    emptyCellCore,
    toCellDto,
} from '../../domain/presenter/type-cell.presenter';
import { AiManagerRowDto } from '../../dto/ai-manager-row.dto';

/** Ребро воронки, на котором строятся нормы фикстур. */
export const NORM_EDGE = 'call_to_presentation';

/** KPI-факты менеджера за период: заданы только счётчики рёбер. */
export function kpiPeriod(
    overrides: {
        managerId?: number;
        calls?: number;
        presentations?: number;
        offers?: number;
        invoices?: number;
        invoicesAfterPresentation?: number;
        success?: number;
        callPlan?: number;
        presentationPlan?: number;
    } = {},
): ManagerKpiPeriod {
    const empty = (): AiKpiTypeFact => ({
        kind: 'call',
        kpi: [],
        primaryDone: null,
        reason: null,
    });

    return {
        managerId: overrides.managerId ?? 10,
        calls: {
            plan: overrides.callPlan ?? 0,
            done: overrides.calls ?? 0,
        },
        presentations: {
            plan: overrides.presentationPlan ?? 0,
            done: overrides.presentations ?? 0,
        },
        presentationsUniq: {
            plan: overrides.presentationPlan ?? 0,
            done: overrides.presentations ?? 0,
        },
        presentationsContactUniq: { plan: 0, done: 0 },
        documents: {
            offers: overrides.offers ?? 0,
            offersAfterPresentation: 0,
            invoices: overrides.invoices ?? 0,
            invoicesAfterPresentation: overrides.invoicesAfterPresentation ?? 0,
            contracts: 0,
        },
        outcomes: { success: overrides.success ?? 0, fail: 0 },
        byType: CALL_REPORT_CALL_TYPE_CODES.reduce(
            (acc, kind) => {
                acc[kind] = { ...empty(), kind };
                return acc;
            },
            {} as Record<CallReportCallTypeCode, AiKpiTypeFact>,
        ),
    };
}

/** Менеджер-ячейка нормы: переходы s из знаменателя n за окно оценки. */
export function normCell(
    managerId: string,
    s: number,
    n: number,
    tenureBand: string | null = '6-18',
): NormCell {
    return { managerId, s, n, tenureBand };
}

/**
 * Нормы менеджера по ребру, посчитанные ТОЙ ЖЕ функцией библиотеки, что
 * и на месячном шаге конвейера: витрина обязана только прочитать слой,
 * а не вычислить его заново.
 */
export function managerNormsFrom(
    cells: readonly NormCell[],
    managerId: string,
    tenureBand: string | null,
    kappa = 30,
): PortalManagerNorms {
    const norm = leaveOneOutNorm({ cells, managerId, tenureBand });

    return {
        managerId,
        tenureBand,
        edges: [
            {
                edge: NORM_EDGE,
                mu: norm.value,
                layer: norm.layer,
                n: norm.n,
                w: norm.w,
                kappa,
            },
        ],
    };
}

/** Нагрузка модели портала: норма ребра портала + нормы менеджеров. */
export function portalModel(
    overrides: Partial<PortalModelView> & {
        portalMu?: number;
        portalN?: number;
        kappa?: number;
        managerNorms?: PortalManagerNorms[];
    } = {},
): PortalModelView {
    const kappa = overrides.kappa ?? 30;

    return {
        edges: [
            {
                edge: NORM_EDGE,
                mu: overrides.portalMu ?? 0.2,
                n: overrides.portalN ?? 400,
                kappa,
                layer: 'portal',
                managers: 4,
                kappaSource: 'default',
                kappaKind: 'default',
                kappaGateOpen: false,
                rho: null,
                homogeneous: false,
            },
        ],
        kappa,
        managerNorms: overrides.managerNorms ?? [],
        ...overrides,
    };
}

/** Рёбра месяца менеджера в объёме модели портала. */
export function monthEdges(s: number, n: number): PortalMonthEdge[] {
    return [{ edge: NORM_EDGE, s, n }];
}

/**
 * Месяц менеджера в объёме, который читает модель портала: одно ребро
 * воронки, экспозиция по календарю, месяц в нормы входит.
 */
export function portalMonth(
    managerId: string,
    monthKey: string,
    s: number,
    n: number,
    tenureBand: string | null = '6-18',
): PortalManagerMonth {
    return {
        monthKey,
        managerId,
        tenureBand,
        edges: monthEdges(s, n),
        excludeFromNorms: false,
        workedDays: 20,
        daysSource: 'calendar',
        callsDone: n,
        presentations: s,
        salesCount: 1,
        averageCheck: 100_000,
        planSales: null,
        level: 'middle',
        score: null,
    };
}

/** Ячейка типа с планом руководителя по одному KPI-коду. */
function planCell(code: string, planHead: number) {
    return toCellDto(
        'presentation',
        emptyCellCore(),
        {
            kpi: [{ code, fact: 10, planHead }],
            primaryKpi: null,
            kpiReason: null,
        },
        { teamMedian: null },
    );
}

/**
 * Строка менеджера обзора: воронка строится по тем же KPI-фактам, что и в
 * витрине, план руководителя кладётся в ячейку типа «презентация».
 */
export function managerRow(
    overrides: {
        managerId?: string;
        kpi?: ManagerKpiPeriod;
        funnel?: AiManagerRowDto['funnel'];
        planHead?: number;
        analyzedCalls?: number;
        callsTotal?: number;
    } = {},
): AiManagerRowDto {
    const kpi = overrides.kpi ?? kpiPeriod();
    const zeroRate = {
        value: null,
        n: 0,
        confidence: { level: 'none' as const },
    };

    return {
        managerId: overrides.managerId ?? '10',
        departmentId: null,
        groupId: null,
        level: 'middle',
        levelSource: 'default',
        tenureMonths: 12,
        workdays: 20,
        signal: null,
        keyMetric: scoreMetric([]),
        funnelShape: 'unknown',
        buckets: aggregateBucketScores([]),
        byType:
            overrides.planHead === undefined
                ? []
                : [planCell('presentation_uniq', overrides.planHead)],
        funnel: overrides.funnel ?? toFunnel(kpi),
        finance: toFinanceTail(undefined),
        discipline: toDiscipline(kpi),
        callsTotal: overrides.callsTotal ?? 100,
        analyzedCalls: overrides.analyzedCalls ?? 40,
        nextStepRate: {
            windowDays: 14,
            current: zeroRate,
            previous: zeroRate,
        },
        riskCalls: [],
        recommendations: [],
    };
}
