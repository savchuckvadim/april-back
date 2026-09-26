/**
 * Сборка нагрузки `ai-analytics-trends` (план Фазы 3, П1): ряды каждого
 * менеджера из недельных и месячных снапшотов → нормализация по разрывам
 * (`comparableFrom`, версии разбора) → калибровка порогов сдвига и
 * дрейфа по семейству всех менеджеров × метрик зерна (step-down max-T,
 * FWER ≤ `trend_fwer`) → сигналы по каждому ряду.
 *
 * Что нельзя ломать:
 * - менеджер с числом разборов в окне меньше `trend_window_calls` записи
 *   не получает — точка из трёх звонков не ряд;
 * - семейство калибровки собирается ДО обнаружения и в детерминированном
 *   порядке (ростер × метрики): `recompute` с тем же seed воспроизводит
 *   пороги с точностью 1e-9;
 * - пороги реестра (`cusumH`, `trend_sigma_k`) — нижняя граница: калибровка
 *   их только поднимает.
 *
 * Чистая детерминированная функция: без DI, Bitrix и `new Date()`.
 */
import {
    calibrateFamilyThresholds,
    cusumExcursion,
    cusumStatistic,
    detectTrendSignals,
    driftStatistic,
    normalizeTrendSeries,
    personalSigma,
    registryDefault,
    resolveNumberParam,
    seedOf,
    TREND_CONFIDENCE_REASONS,
    TREND_DEFAULTS,
    type ConfidenceLevel,
    type ParamContext,
    type TrendDetection,
    type TrendSeries,
    type TrendSignal,
} from '@lib/sales-ai-analytics';
import {
    AI_TREND_GRAINS,
    AI_TREND_WEEK_METRIC,
    type AiTrendGrain,
} from '../../constants/ai-trend.const';
import { isoWeekKey } from '../loaders/period.util';
import type {
    AiSnapshotMeta,
    ManagerSnapshotRow,
} from './manager-snapshot.types';
import {
    analyzedCallsOf,
    monthSeriesOf,
    weekSeriesOf,
    type TrendSeriesInput,
    type TrendSnapshotRecord,
} from './trends.series';
import type {
    ManagerTrendMetricFacts,
    ManagerTrendSignalFacts,
    ManagerTrendsPayload,
    TrendFamilyCalibrationFacts,
} from './trends.types';
import { buildGoodhartFacts } from './goodhart.series';

/** Параметры трендов после разрешения по слоям реестра портала. */
export interface TrendsParams {
    alphaShort: number;
    alphaLong: number;
    sigmaK: number;
    fwer: number;
    windowCalls: number;
    xmrSigma: number;
    comparableWeeks: number;
    /** `n_min_none` — ниже знаменателя доля ребра не считается. */
    minN: number;
    /** `goodhart_window_months` — окно детектора Гудхарта (П9). */
    goodhartWindowMonths: number;
    /** `goodhart_drop` — падение противовеса для флага. */
    goodhartDrop: number;
}

export interface TrendsAssemblyInput {
    weekKey: string;
    /** Ключи окна по возрастанию (для нагрузки). */
    weekKeys: readonly string[];
    monthKeys: readonly string[];
    /** Ростер в порядке обхода — он же порядок семейства калибровки. */
    managerIds: readonly string[];
    weeks: readonly TrendSnapshotRecord[];
    months: readonly TrendSnapshotRecord[];
    /** Начало сравнимой истории 'YYYY-MM-DD'; null — ряд не рвался. */
    comparableFrom: string | null;
    params: TrendsParams;
    seed: number;
    meta: AiSnapshotMeta;
}

export interface TrendsAssembly {
    rows: ManagerSnapshotRow<ManagerTrendsPayload>[];
    /** Менеджеры без записи: разборов в окне меньше `trend_window_calls`. */
    fewCalls: string[];
}

/** Ряд менеджера после нормализации — единица семейства калибровки. */
interface SeriesEntry extends TrendSeriesInput {
    managerId: string;
    series: TrendSeries;
    /** Минимум точек с учётом гейта после разрыва. */
    minPoints: number;
}

/** Пороги сдвига и дрейфа ряда после калибровки семейства. */
interface SeriesThresholds {
    cusumH: number;
    driftK: number;
}

const CUSUM = {
    k: TREND_DEFAULTS.cusumK,
    baselinePoints: TREND_DEFAULTS.baselinePoints,
};

const CONFIDENCE_RANK: Record<ConfidenceLevel, number> = {
    none: 0,
    low: 1,
    ok: 2,
};

/** Параметры трендов из слоёв реестра; слоёв нет — дефолты реестра. */
export function trendParamsOf(registry: ParamContext): TrendsParams {
    const number = (
        code: Parameters<typeof resolveNumberParam>[0],
        fallback: number,
    ) => resolveNumberParam(code, registry) ?? fallback;

    return {
        alphaShort: number('trend_ewma_short', TREND_DEFAULTS.alphaShort),
        alphaLong: number('trend_ewma_long', TREND_DEFAULTS.alphaLong),
        sigmaK: number('trend_sigma_k', TREND_DEFAULTS.sigmaK),
        fwer: number('trend_fwer', TREND_DEFAULTS.fwer),
        windowCalls: number('trend_window_calls', TREND_DEFAULTS.windowCalls),
        xmrSigma: number('xmr_sigma', TREND_DEFAULTS.xmrSigma),
        comparableWeeks: number(
            'calibration_comparable_weeks',
            TREND_DEFAULTS.comparableWeeks,
        ),
        minN: number('n_min_none', registryDefault('n_min_none')),
        goodhartWindowMonths: number(
            'goodhart_window_months',
            registryDefault('goodhart_window_months'),
        ),
        goodhartDrop: number('goodhart_drop', registryDefault('goodhart_drop')),
    };
}

/** Ключ периода зерна, с которого ряд сравним; null — ряд не рвался. */
function comparableKeyOf(
    comparableFrom: string | null,
    grain: AiTrendGrain,
): string | null {
    if (comparableFrom === null || comparableFrom === '') return null;

    return grain === 'week'
        ? isoWeekKey(comparableFrom)
        : comparableFrom.slice(0, 7);
}

/** ISO-неделя начала сигнала: ключ недели либо неделя первого дня месяца. */
const sinceWeekOf = (key: string, grain: AiTrendGrain): string =>
    grain === 'week' ? key : isoWeekKey(`${key}-01`);

/** Записи менеджера по возрастанию ключа. */
function recordsOf(
    records: readonly TrendSnapshotRecord[],
    managerId: string,
): TrendSnapshotRecord[] {
    return records
        .filter(record => record.managerId === managerId)
        .sort((a, b) => a.periodKey.localeCompare(b.periodKey));
}

/** Нормализованные ряды менеджера с гейтом точек после разрыва. */
function entriesOf(
    input: TrendsAssemblyInput,
    managerId: string,
    weeks: readonly TrendSnapshotRecord[],
): SeriesEntry[] {
    const inputs = [
        ...weekSeriesOf(weeks),
        ...monthSeriesOf(recordsOf(input.months, managerId), input.params.minN),
    ];

    return inputs.map(item => {
        const series = normalizeTrendSeries(item.points, {
            comparableFromKey: comparableKeyOf(
                input.comparableFrom,
                item.grain,
            ),
        });
        const broken =
            series.cut.beforeComparable > 0 || series.cut.versionBreak > 0;

        return {
            ...item,
            managerId,
            series,
            minPoints: Math.max(
                TREND_DEFAULTS.minPoints,
                broken ? input.params.comparableWeeks : 0,
            ),
        };
    });
}

/** Ряд входит в семейство: то же зерно, точек не меньше минимума, разброс есть. */
const inFamily = (entry: SeriesEntry, grain: AiTrendGrain): boolean =>
    entry.grain === grain &&
    entry.series.points.length >= entry.minPoints &&
    personalSigma(entry.series.points.map(point => point.value)) !== null;

/** Пороги семейства зерна: step-down max-T по всем рядам зерна. */
function calibrateGrain(
    entries: readonly SeriesEntry[],
    grain: AiTrendGrain,
    input: TrendsAssemblyInput,
): {
    thresholds: Map<SeriesEntry, SeriesThresholds>;
    facts: TrendFamilyCalibrationFacts;
} {
    const family = entries.filter(entry => inFamily(entry, grain));
    const values = family.map(entry =>
        entry.series.points.map(point => point.value),
    );
    const options = (statistic: 'shift' | 'drift') => ({
        seed: seedOf(input.seed, grain, statistic),
        iterations: TREND_DEFAULTS.iterations,
        fwer: input.params.fwer,
        holdout: (series: readonly number[]) =>
            Math.min(
                TREND_DEFAULTS.holdoutPoints,
                cusumExcursion(series, CUSUM),
            ),
    });
    const shift = calibrateFamilyThresholds(
        values,
        series => cusumStatistic(series, CUSUM),
        options('shift'),
    );
    const drift = calibrateFamilyThresholds(
        values,
        series =>
            driftStatistic(series, {
                alphaShort: input.params.alphaShort,
                alphaLong: input.params.alphaLong,
                consecutive: TREND_DEFAULTS.consecutive,
            }),
        options('drift'),
    );
    const thresholds = new Map<SeriesEntry, SeriesThresholds>();
    family.forEach((entry, index) => {
        thresholds.set(entry, {
            cusumH: Math.max(
                TREND_DEFAULTS.cusumH,
                shift?.thresholds[index] ?? 0,
            ),
            driftK: Math.max(
                input.params.sigmaK,
                drift?.thresholds[index] ?? 0,
            ),
        });
    });

    return {
        thresholds,
        facts: {
            grain,
            series: family.length,
            cusumH: shift?.threshold ?? null,
            driftK: drift?.threshold ?? null,
        },
    };
}

/** Сигналы ряда с адресом метрики и доверием ряда. */
function toSignalFacts(
    entry: SeriesEntry,
    detection: TrendDetection,
): ManagerTrendSignalFacts[] {
    return detection.signals.map((signal: TrendSignal) => ({
        ...signal,
        metric: entry.metric,
        grain: entry.grain,
        sinceWeek: sinceWeekOf(signal.sinceKey, entry.grain),
        confidence: detection.confidence,
    }));
}

/** Факты ряда: обнаружение с порогами ряда (нет порогов — ряд молчит). */
function toMetricFacts(
    entry: SeriesEntry,
    thresholds: SeriesThresholds | undefined,
    input: TrendsAssemblyInput,
): ManagerTrendMetricFacts {
    const effective = thresholds ?? {
        cusumH: Number.POSITIVE_INFINITY,
        driftK: Number.POSITIVE_INFINITY,
    };
    const detection = detectTrendSignals(entry.series, {
        alphaShort: input.params.alphaShort,
        alphaLong: input.params.alphaLong,
        cusumK: TREND_DEFAULTS.cusumK,
        baselinePoints: TREND_DEFAULTS.baselinePoints,
        consecutive: TREND_DEFAULTS.consecutive,
        minPoints: entry.minPoints,
        okPoints: Math.max(TREND_DEFAULTS.okPoints, entry.minPoints),
        thresholds: { ...effective, xmrSigma: input.params.xmrSigma },
    });

    return {
        metric: entry.metric,
        grain: entry.grain,
        points: detection.points,
        cut: entry.series.cut,
        n: entry.series.points.reduce((sum, point) => sum + point.n, 0),
        confidence: detection.confidence,
        reason: detection.reason,
        sigma: detection.sigma,
        thresholds: {
            cusumH: Number.isFinite(effective.cusumH) ? effective.cusumH : 0,
            driftK: Number.isFinite(effective.driftK) ? effective.driftK : 0,
            xmrSigma: input.params.xmrSigma,
        },
        signals: toSignalFacts(entry, detection),
    };
}

/** Сигналы менеджера в порядке старшинства вида, внутри вида — порядок метрик. */
function orderedSignals(
    metrics: readonly ManagerTrendMetricFacts[],
): ManagerTrendSignalFacts[] {
    const kinds = ['shift', 'drift', 'outlier'] as const;

    return kinds.flatMap(kind =>
        metrics.flatMap(metric =>
            metric.signals.filter(signal => signal.kind === kind),
        ),
    );
}

/** Нагрузки трендов по менеджерам ростера с общей калибровкой семейства. */
export function buildTrendsPayload(input: TrendsAssemblyInput): TrendsAssembly {
    const fewCalls: string[] = [];
    const byManager = new Map<
        string,
        { calls: number; entries: SeriesEntry[] }
    >();
    for (const managerId of input.managerIds) {
        const weeks = recordsOf(input.weeks, managerId);
        const calls = analyzedCallsOf(weeks);
        if (calls < input.params.windowCalls) {
            fewCalls.push(managerId);
            continue;
        }
        byManager.set(managerId, {
            calls,
            entries: entriesOf(input, managerId, weeks),
        });
    }
    const entries = [...byManager.values()].flatMap(item => item.entries);
    const calibrations = AI_TREND_GRAINS.map(grain =>
        calibrateGrain(entries, grain, input),
    );
    const thresholds = new Map<SeriesEntry, SeriesThresholds>(
        calibrations.flatMap(item => [...item.thresholds.entries()]),
    );
    const rows = [...byManager.entries()].map(([managerId, item]) => {
        const metrics = item.entries.map(entry =>
            toMetricFacts(entry, thresholds.get(entry), input),
        );
        const best = metrics.reduce<ManagerTrendMetricFacts | null>(
            (acc, metric) =>
                acc === null ||
                CONFIDENCE_RANK[metric.confidence] >
                    CONFIDENCE_RANK[acc.confidence]
                    ? metric
                    : acc,
            null,
        );
        const quality = metrics.find(
            metric => metric.metric === AI_TREND_WEEK_METRIC.quality,
        );
        const payload: ManagerTrendsPayload = {
            weekKey: input.weekKey,
            window: {
                weeks: [...input.weekKeys],
                months: [...input.monthKeys],
            },
            calls: item.calls,
            confidence: best?.confidence ?? 'none',
            reason:
                best === null || best.confidence === 'none'
                    ? (quality?.reason ?? TREND_CONFIDENCE_REASONS.fewPoints)
                    : null,
            metrics,
            signals: orderedSignals(metrics),
            goodhart: buildGoodhartFacts(
                recordsOf(input.months, managerId),
                {
                    minN: input.params.minN,
                    windowMonths: input.params.goodhartWindowMonths,
                    drop: input.params.goodhartDrop,
                    alpha: input.params.alphaLong,
                },
                comparableKeyOf(input.comparableFrom, 'month'),
            ),
            calibration: {
                seed: input.seed,
                iterations: TREND_DEFAULTS.iterations,
                fwer: input.params.fwer,
                families: calibrations.map(item => item.facts),
            },
            meta: input.meta,
        };

        return { managerId, payload };
    });

    return { rows, fewCalls };
}
