import {
    type AicallSmartInfo,
    CALL_REPORT_SMART_FIELDS,
} from '@lib/portal-lib/pbx/pbx-aicall-smart';
import type { ReanalysisRunStatus } from '../../../contracts/reanalysis.types';
import type { CostSummary } from '../../services/ai-analytics-cost.service';
import type { EtlStatusRun } from '../../services/ai-analytics-etl-status.service';
import type { Phase4BacktestView } from '../../services/ai-analytics-phase4.types';
import type { LaunchStatusInput } from '../launch.types';

/** Фикстуры сводки запуска: «всё хорошо» и точечные поломки поверх. */
export const DOMAIN = 'gsr.bitrix24.ru';
export const NOW = new Date('2026-10-21T09:00:00.000Z');

/** Смарт со всеми полями и значениями const-конфига. */
export function completeSmart(): AicallSmartInfo {
    const ufKeyByCode: Record<string, string> = {};
    const enumItems: Record<string, Record<string, number>> = {};
    let id = 1;
    for (const def of CALL_REPORT_SMART_FIELDS) {
        ufKeyByCode[def.code] = `ufCrm7${def.code}`;
        if (def.type === 'enumeration' && def.items?.length) {
            enumItems[def.code] = Object.fromEntries(
                def.items.map(item => [item.CODE, id++]),
            );
        }
    }
    return { entityTypeId: 1040, typeId: 7, ufKeyByCode, enumItems };
}

export const etlRun = (over: Partial<EtlStatusRun>): EtlStatusRun => ({
    id: '1',
    day: '2026-10-20',
    rhythm: 'nightly',
    status: 'ok',
    durationMs: 1000,
    rowsLoaded: 10,
    bitrixCalls: 2,
    inputsDrift: false,
    steps: [],
    skipped: [],
    failed: [],
    warnings: [],
    metrics: {},
    generatedAt: '2026-10-20T23:00:00.000Z',
    calcVersion: 'c',
    paramsVersion: 'p',
    ...over,
});

/** 24 месяца догона: 2024-10 … 2026-09. */
export function backfillRuns(
    count: number,
    generatedAt: string,
): EtlStatusRun[] {
    const runs: EtlStatusRun[] = [];
    for (let index = 0; index < count; index += 1) {
        const date = new Date(Date.UTC(2024, 9 + index, 1));
        const month = date.toISOString().slice(0, 7);
        runs.push(
            etlRun({
                id: `b${index}`,
                rhythm: 'backfill',
                day: `${month}-28`,
                generatedAt,
            }),
        );
    }
    return runs;
}

export const backtest = (
    over: Partial<Phase4BacktestView> = {},
): Phase4BacktestView => ({
    monthKey: '2026-09',
    generatedAt: '2026-10-02T01:00:00.000Z',
    status: 'pass',
    reasons: [],
    shadowMonths: 10,
    shadowMinMonths: 9,
    replayedMonths: 8,
    months: 6,
    days: 120,
    coverageShare: 0.82,
    coverageCi90: [0.75, 0.88],
    coverageTarget: 0.8,
    maseNaive: 0.8,
    maseNaiveCi90: [0.7, 0.9],
    maseMean3: 0.85,
    maseMean3Ci90: [0.75, 0.95],
    maseMax: 1,
    pinballMean: 1.2,
    ...over,
});

export const reanalysisRun = (
    over: Partial<ReanalysisRunStatus> = {},
): ReanalysisRunStatus => ({
    domain: DOMAIN,
    from: '2026-07-21',
    to: '2026-10-20',
    userIds: [317],
    dryRun: false,
    promptVersion: 'focus-v2.4-2026-10-20',
    series: '2026-09-25',
    part: 1,
    candidates: 400,
    done: 100,
    failed: 2,
    skipped: 30,
    skippedBy: { upToDate: 30, noAnalysis: 0, notInRoster: 0, noActive: 0 },
    tokens: 250000,
    price: 60,
    startedAt: '2026-10-21T08:00:00.000Z',
    updatedAt: '2026-10-21T08:50:00.000Z',
    finished: false,
    lastError: null,
    timeBudgetHit: false,
    continuedWith: null,
    estimate: null,
    ...over,
});

export const cost = (over: Partial<CostSummary> = {}): CostSummary => ({
    domain: DOMAIN,
    month: '2026-10',
    pricePerThousand: 0.25,
    estimated: false,
    calls: 50,
    tokens: 1234567,
    price: 310.4,
    estimatedPrice: 308,
    byType: [],
    ...over,
});

/** Портал, где всё уже сделано. */
export function launchInput(
    over: Partial<LaunchStatusInput> = {},
): LaunchStatusInput {
    return {
        domain: DOMAIN,
        now: NOW,
        costMonth: '2026-10',
        settings: {
            ok: true,
            value: {
                aiAnalyticsEnabled: true,
                modelParamsJson: '{"forecast_stage_enabled":true}',
            },
        },
        portalAi: {
            ok: true,
            value: { enabled: true, allowedUserIds: [317, 447] },
        },
        smart: { ok: true, value: completeSmart() },
        etlRuns: {
            ok: true,
            value: [
                etlRun({}),
                etlRun({ id: 'm', rhythm: 'monthly', day: '2026-09-30' }),
                ...backfillRuns(24, '2026-10-15T23:00:00.000Z'),
            ],
        },
        backtest: { ok: true, value: backtest() },
        reanalysis: {
            ok: true,
            value: reanalysisRun({ finished: true, done: 400 }),
        },
        analysisSince: { ok: true, value: '2026-07-21' },
        cost: { ok: true, value: cost() },
        ...over,
    };
}
