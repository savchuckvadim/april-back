import type {
    AiSnapshotMeta,
    ForecastBacktest,
    ForecastBacktestSnapshot,
    PoolSnapshot,
    QualityLinkSnapshot,
    RecommendationEffectSnapshot,
} from '@lib/sales-ai-analytics';

/**
 * Синтетические нагрузки снапшотов Фазы 4 (контракт
 * `contracts/snapshot.phase4.types.ts`) для спек модели портала,
 * готовности, настроек и «Как считаем». Числа правдоподобные, не
 * «настоящие»: спеки проверяют раскладку и правила, а не математику.
 */

export const PHASE4_META: AiSnapshotMeta = {
    calcVersion: 'sam-1.0.0',
    paramsVersion: 'pv-phase4',
    comparableFrom: null,
    generatedAt: '2026-10-03T01:00:00.000Z',
    modelSnapshotId: null,
};

/** Оценка связи качества: гейт пройден и опубликован. */
export function qualityLinkSnapshot(
    over: Partial<QualityLinkSnapshot> = {},
): QualityLinkSnapshot {
    return {
        monthKey: '2026-09',
        status: 'published',
        reasons: [],
        sample: {
            n: 420,
            events: 150,
            managers: 9,
            windowDays: 14,
            dropped: {},
            fromMonth: '2025-10',
            toMonth: '2026-09',
        },
        within: { value: 0.21, se: 0.05, ci90: [0.13, 0.29] },
        between: { value: 0.3, se: 0.12, ci90: [0.1, 0.5] },
        pooled: { value: 0.24, se: 0.04, ci90: [0.17, 0.31] },
        form: { mundlak: 'full', pooled: 'full' },
        epv: 25,
        reliability: {
            r: 0.7,
            rBetween: 0.95,
            within: 0.3,
            between: 0.32,
            pooled: 0.34,
        },
        calibration: {
            slope: {
                slope: 0.97,
                se: 0.1,
                ci90: [0.81, 1.13],
                coversOne: true,
                n: 420,
            },
            bins: [],
        },
        placebo: {
            lead: { value: 0.02, se: 0.05, ci90: [-0.06, 0.1] },
            passed: true,
            n: 400,
        },
        gate: {
            passedNow: true,
            streak: 2,
            months: 2,
            published: true,
            timestampLeakOk: true,
        },
        curve: [
            { s: 5, p: 0.25 },
            { s: 7, p: 0.35 },
            { s: 9, p: 0.46 },
        ],
        sRef: 7,
        pRef: 0.35,
        countdown: {
            seNow: 0.04,
            presentationsLeft: 0,
            monthsLeft: 0,
            presentationsForSe: 300,
            holdMonths: 0,
        },
        meta: PHASE4_META,
        ...over,
    };
}

/** Оценённый пул трёх порталов; текущий портал вошёл. */
export function poolSnapshot(over: Partial<PoolSnapshot> = {}): PoolSnapshot {
    return {
        monthKey: '2026-09',
        status: 'estimated',
        reasons: [],
        eligible: 3,
        edges: [
            {
                edge: 'e1',
                estimand: 'rate',
                mu0: 0.3,
                kappaBar: 40,
                tau0: 0.2,
                portals: 3,
            },
        ],
        beta: {
            betaPool: 0.2,
            se: 0.05,
            ci90: [0.12, 0.28],
            q: 3.1,
            df: 2,
            iSquared: 0.35,
            tau2: 0.01,
            tau2Source: 'prior',
            label: 'hybrid',
            portals: 3,
        },
        lagCdf: {
            kind: 'table',
            medianDays: 20,
            n: 400,
            points: [
                { days: 10, value: 0.25 },
                { days: 20, value: 0.5 },
                { days: 40, value: 0.8 },
                { days: 60, value: 1 },
            ],
        },
        lognormal: { m: 11, v: 0.5, n: 300 },
        seasonIndex: [0.8, 0.9, 1.1, 1.1, 1, 1, 0.9, 0.9, 1, 1.1, 1.1, 1.1],
        evidence: { betaPortals: 3, minPortalsE2: 8, ready: false },
        portals: [
            { portalKey: 'self-key', included: true, reason: 'included' },
            { portalKey: 'other', included: false, reason: 'no-consent' },
        ],
        selfKey: 'self-key',
        meta: PHASE4_META,
        ...over,
    };
}

/** Полный результат бэктеста, прошедший гейт. */
export function forecastBacktest(
    over: Partial<ForecastBacktest> = {},
): ForecastBacktest {
    return {
        status: 'pass',
        reasons: [],
        months: ['2026-06', '2026-07', '2026-08'],
        days: 60,
        level: 0.8,
        coverage: {
            share: 0.82,
            covered: 49,
            days: 60,
            ci90: [0.72, 0.89],
            target: 0.8,
        },
        errors: { p50: 2, naive: 3, mean3: 2.8 },
        mase: {
            naive: { value: 0.67, ci90: [0.5, 0.85], draws: 500 },
            mean3: { value: 0.71, ci90: [0.55, 0.9], draws: 500 },
            max: 1,
        },
        pinball: { low: 0.4, high: 0.5, mean: 0.45 },
        pit: { belowP50Share: 0.5, bins: [] },
        ...over,
    };
}

/** Снапшот точности прогноза: 10 теневых месяцев, гейт пройден. */
export function backtestSnapshot(
    over: Partial<ForecastBacktestSnapshot> = {},
): ForecastBacktestSnapshot {
    return {
        monthKey: '2026-08',
        status: 'pass',
        reasons: [],
        shadowMonths: 10,
        shadowMinMonths: 9,
        backtest: forecastBacktest(),
        meta: PHASE4_META,
        ...over,
    };
}

/** Снапшот эффекта советов: гейт пройден. */
export function effectSnapshot(
    over: Partial<RecommendationEffectSnapshot> = {},
): RecommendationEffectSnapshot {
    return {
        monthKey: '2026-08',
        issuedMonths: ['2026-05', '2026-06'],
        issued: 30,
        completedWindows: 24,
        done: 20,
        disagree: 2,
        doneShare: { value: 0.67, ci90: [0.52, 0.79], n: 30 },
        disagreeShare: { value: 0.07, ci90: [0.02, 0.19], n: 30 },
        byLever: [],
        beforeAfter: [
            {
                edge: 'presentation_to_offer',
                before: { s: 30, n: 100 },
                after: { s: 42, n: 100 },
                diff: 0.12,
                ci90: [0.02, 0.22],
                n: 12,
            },
        ],
        gate: { status: 'pass', reasons: [] },
        params: {
            minIssued: 20,
            doneShareMin: 0.5,
            disagreeMax: 0.3,
            minN: 8,
            z: 1.645,
        },
        goodhart: { flags: 0, managersWithFlags: 0 },
        meta: PHASE4_META,
        ...over,
    };
}
