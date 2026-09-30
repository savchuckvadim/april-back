/**
 * Фикстуры шагов Фазы 4 «прогноз отдела / бэктест / журнал советов /
 * эффект» (поток B2b): прогноз менеджера, совет, месяц менеджера, журнал
 * месяца и запись стора. Синтетика с известными суммами.
 */
import type {
    AiAnalyticsSnapshotType,
    ForecastLogDay,
    ForecastLogSnapshot,
    LeverCandidate,
} from '@lib/sales-ai-analytics';
import type { ForecastPayload } from '../../domain/assembler/forecast.types';
import type { PortalManagerMonth } from '../../domain/assembler/portal-model.types';
import type { AiAnalyticsSnapshotRecord } from '../../store/ai-analytics-snapshot.store';

export const FIXTURE_DOMAIN = 'a.bitrix24.ru';

export const FIXTURE_META = {
    calcVersion: 'sam-1.0.0',
    paramsVersion: 'pv-1',
    comparableFrom: null,
    generatedAt: '2026-09-08T00:45:00.000Z',
    modelSnapshotId: 'ais-model-3',
} as const;

/** Совет объёма с интервалом. */
export function lever(overrides: Partial<LeverCandidate> = {}): LeverCandidate {
    return {
        lever: 'volume',
        ruleCode: 'volume-gap',
        callType: 'call',
        deltaSales: 1.5,
        ci80: [0.5, 2.5],
        cost: 1,
        evidence: 'E0',
        adviceAllowed: false,
        basis: ['cap'],
        ...overrides,
    };
}

/** Прогноз менеджера за день: P50, сделанное, наивная база, советы. */
export function forecastPayload(
    overrides: Partial<ForecastPayload> = {},
): ForecastPayload {
    return {
        day: '2026-09-08',
        monthKey: '2026-09',
        p50: 6,
        descriptive: 4,
        naive: 5,
        naiveLastMonth: 4,
        pipelineExpected: 2,
        pipelineReason: null,
        newFlowExpected: 2,
        doneSales: 2,
        target: { value: 6, source: 'plan', empty: false },
        requiredVolume: 40,
        daysElapsed: 5,
        daysLeft: 17,
        plan: {
            items: [],
            steps: [],
            budget: { minutes: 0, limitMinutes: 480, withinBudget: true },
        },
        levers: [],
        leaks: [],
        meta: { ...FIXTURE_META },
        ...overrides,
    };
}

/** Месяц менеджера: продажи и рёбра «презентация → КП», «КП → счёт». */
export function managerMonth(
    managerId: string,
    monthKey: string,
    salesCount: number,
    edges: PortalManagerMonth['edges'] = [
        { edge: 'presentation_to_offer', n: 20, s: 10 },
        { edge: 'offer_to_invoice', n: 10, s: 4 },
    ],
): PortalManagerMonth {
    return {
        monthKey,
        managerId,
        tenureBand: '6-18',
        edges,
        excludeFromNorms: false,
        workedDays: 20,
        daysSource: 'calendar',
        callsDone: 200,
        presentations: 20,
        salesCount,
        averageCheck: 100_000,
        planSales: 5,
        level: 'middle',
        score: { value: 7, n: 30 },
    };
}

/** День журнала отдела с вилкой вокруг p50. */
export function logDay(
    day: string,
    p50: number,
    overrides: Partial<ForecastLogDay> = {},
): ForecastLogDay {
    return {
        day,
        low: p50 - 3,
        p50,
        high: p50 + 3,
        level: 0.8,
        phi: 2.5,
        phiSource: 'default',
        naive: p50 + 1,
        mean3: p50 - 1,
        done: 2,
        money: null,
        managers: 2,
        pipelineUnknown: 0,
        modelSnapshotId: 'ais-model-3',
        ...overrides,
    };
}

/** Журнал месяца. */
export function forecastLog(
    monthKey: string,
    days: readonly ForecastLogDay[],
    actual: number | null = null,
): ForecastLogSnapshot {
    return {
        monthKey,
        days,
        actual,
        checkSource: 'default',
        meta: { ...FIXTURE_META },
    };
}

/** Запись стора снапшотов. */
export function snapshotRecord(
    type: AiAnalyticsSnapshotType,
    periodKey: string,
    managerId: string | null,
    payload: unknown,
    id = `ais-${type}-${periodKey}-${managerId ?? 'portal'}`,
): AiAnalyticsSnapshotRecord {
    return {
        id,
        createdAt: new Date('2026-09-08T00:45:00Z'),
        status: 'done',
        domain: FIXTURE_DOMAIN,
        type,
        periodKey,
        managerId,
        calcVersion: 'sam-1.0.0',
        paramsVersion: 'pv-1',
        inputsHash: 'hash-1',
        generatedAt: '2026-09-08T00:45:00.000Z',
        payload,
    };
}
