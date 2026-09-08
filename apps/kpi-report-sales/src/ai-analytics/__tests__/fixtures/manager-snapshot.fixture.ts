import {
    CALL_REPORT_CALL_TYPE_CODES,
    CallReportCallTypeCode,
} from '@lib/portal-lib/pbx/pbx-aicall-smart';
import { DEFAULT_WORK_CALENDAR } from '@lib/sales-ai-analytics';
import type {
    AiFinanceManagerPipeline,
    AiFinanceMonth,
    AiFinanceResult,
} from '../../domain/loaders/finance.types';
import type {
    AiKpiManagerMonth,
    AiKpiMonth,
    AiKpiMonthsResult,
} from '../../domain/loaders/kpi.types';
import type { AiPipelineStepContext } from '../../steps/step.types';
import type {
    IsoDate,
    IsoMonth,
} from '../../../shared/lib/month-segments.util';
import { portalSettings } from './lite-row.fixture';

/** Контекст прогона конвейера: ночной ритм сентября 2026 по домену a. */
export function stepContext(
    overrides: Partial<AiPipelineStepContext> = {},
): AiPipelineStepContext {
    return {
        domain: 'a.bitrix24.ru',
        rhythm: 'nightly',
        day: '2026-09-08',
        weekKey: '2026-W36',
        monthKey: '2026-09',
        timeZone: 'Europe/Moscow',
        calendar: { ...DEFAULT_WORK_CALENDAR, holidays: [] },
        settings: portalSettings(),
        registry: {},
        paramsVersion: 'pv-1',
        calcVersion: 'sam-1.0.0',
        comparableFrom: '',
        inputsHash: 'hash-1',
        managerIds: [10],
        now: new Date('2026-09-08T00:45:00Z'),
        forceRefresh: false,
        ...overrides,
    };
}

/** Стор снапшотов: upsert/findByKeys/latest как jest-моки. */
export function snapshotStoreMock(
    options: {
        records?: {
            periodKey: string;
            managerId: string | null;
            payload: unknown;
        }[];
        model?: { id: string } | null;
    } = {},
) {
    const findByKeys = jest.fn().mockResolvedValue(options.records ?? []);
    const latest = jest.fn().mockResolvedValue(options.model ?? null);
    const upsert = jest
        .fn()
        .mockResolvedValue({ id: 'ais-1', supersededIds: [] });
    return { findByKeys, latest, upsert };
}

/** Пустые факты по типам звонков (полный Record справочника). */
function emptyByType(): Record<
    CallReportCallTypeCode,
    AiKpiManagerMonth['byType'][CallReportCallTypeCode]
> {
    return CALL_REPORT_CALL_TYPE_CODES.reduce(
        (acc, kind) => {
            acc[kind] = { kind, kpi: [], primaryDone: null, reason: null };
            return acc;
        },
        {} as Record<
            CallReportCallTypeCode,
            AiKpiManagerMonth['byType'][CallReportCallTypeCode]
        >,
    );
}

/** KPI-факты менеджера за месяц: звонки, презентации, документы, исходы. */
export function kpiManagerMonth(
    managerId: number,
    values: {
        callDone?: number;
        presentationUniqDone?: number;
        offers?: number;
        invoices?: number;
        success?: number;
    } = {},
): AiKpiManagerMonth {
    return {
        managerId,
        calls: { plan: 0, done: values.callDone ?? 0 },
        presentations: { plan: 0, done: values.presentationUniqDone ?? 0 },
        presentationsUniq: {
            plan: 0,
            done: values.presentationUniqDone ?? 0,
        },
        presentationsContactUniq: { plan: 0, done: 0 },
        documents: {
            offers: values.offers ?? 0,
            offersAfterPresentation: 0,
            invoices: values.invoices ?? 0,
            invoicesAfterPresentation: 0,
            contracts: 0,
        },
        outcomes: { success: values.success ?? 0, fail: 0 },
        byType: emptyByType(),
        counters: {},
        checks: { perTypeCallDone: 0, callDone: values.callDone ?? 0 },
    };
}

/** Месяц KPI-слоя (по умолчанию закрытый и из кэша). */
export function kpiMonth(
    month: string,
    managers: AiKpiManagerMonth[],
    overrides: Partial<AiKpiMonth> = {},
): AiKpiMonth {
    return {
        month: month as IsoMonth,
        from: `${month}-01` as IsoDate,
        to: `${month}-28` as IsoDate,
        closed: true,
        fromCache: true,
        managers,
        ...overrides,
    };
}

/** Результат KPI-слоя по месяцам. */
export function kpiMonths(
    months: AiKpiMonth[],
    managerIds: number[] = [10],
): AiKpiMonthsResult {
    return {
        from: `${months[0]?.month ?? '2026-09'}-01` as IsoDate,
        to: `${months[months.length - 1]?.month ?? '2026-09'}-28` as IsoDate,
        managerIds,
        months,
    };
}

/** Финансовый месяц с одной строкой менеджера. */
export function financeMonth(
    month: string,
    managerId: number,
    values: { salesCount?: number; monthlyAmount?: number } = {},
): AiFinanceMonth {
    const managers = [
        {
            managerId,
            salesCount: values.salesCount ?? 0,
            advanceAmount: 0,
            paidMonths: 0,
            monthlyAmount: values.monthlyAmount ?? 0,
            expectedContractAmount: 0,
        },
    ];
    return {
        month: month as IsoMonth,
        from: `${month}-01` as IsoDate,
        to: `${month}-28` as IsoDate,
        closed: true,
        fromCache: true,
        managers,
        totals: {
            salesCount: values.salesCount ?? 0,
            advanceAmount: 0,
            paidMonths: 0,
            monthlyAmount: values.monthlyAmount ?? 0,
            expectedContractAmount: 0,
        },
    };
}

/** Пайплайн менеджера: сделки от порога и «горячие». */
export function pipelineRow(
    managerId: number,
    values: { count?: number; hot?: number; withOffer?: number } = {},
): AiFinanceManagerPipeline {
    return {
        managerId,
        pipelineFromStage: { count: values.count ?? 0, monthlyAmount: 0 },
        hotEvents: values.hot ?? 0,
        hotByColor: { green: 0, yellow: 0, red: 0, none: values.hot ?? 0 },
        withOfferCount: values.withOffer ?? 0,
        pipelineByContractType: [],
        pipelineByTerm: [],
    };
}

/** Результат финансового слоя за окно месяцев. */
export function financeResult(
    months: AiFinanceMonth[],
    pipeline: AiFinanceManagerPipeline[],
    overrides: Partial<AiFinanceResult> = {},
): AiFinanceResult {
    return {
        from: `${months[0]?.month ?? '2026-09'}-01` as IsoDate,
        to: `${months[months.length - 1]?.month ?? '2026-09'}-28` as IsoDate,
        managerIds: pipeline.map(row => row.managerId),
        pipelineThreshold: 'presentation',
        hotStageCode: 'sales_in_progress',
        months,
        pipeline: { fromCache: true, managers: pipeline },
        managers: pipeline.map(row => ({
            managerId: row.managerId,
            salesCount: 0,
            advanceAmount: 0,
            paidMonths: 0,
            monthlyAmount: 0,
            expectedContractAmount: 0,
            pipelineFromStage: row.pipelineFromStage,
            hotEvents: row.hotEvents,
            hotByColor: row.hotByColor,
            withOfferCount: row.withOfferCount,
            pipelineByContractType: [],
            pipelineByTerm: [],
        })),
        ...overrides,
    };
}
