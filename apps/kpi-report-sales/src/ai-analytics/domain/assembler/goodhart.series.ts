/**
 * Месячные ряды для детектора Гудхарта (план Фазы 3, П9) из нагрузок
 * `manager-month`: оценка месяца (взвешенная по объёму по типам), объём
 * разборов и доли рёбер воронки — те же правила чтения, что у рядов
 * трендов (`trends.series.ts`): чужая или неполная нагрузка даёт «нет
 * точки», а не падение прогона; «мало данных» — не ноль.
 *
 * Чистые функции.
 */
import {
    detectGoodhart,
    normalizeTrendSeries,
    type GoodhartFlag,
    type GoodhartSeriesInput,
    type TrendPoint,
} from '@lib/sales-ai-analytics';
import { AI_GOODHART_PAIRS } from '../../constants/ai-goodhart.const';
import {
    AI_TREND_EDGE_METRICS,
    AI_TREND_WEEK_METRIC,
    edgeOfTrendMetric,
} from '../../constants/ai-trend.const';
import { edgeRateOf, type TrendSnapshotRecord } from './trends.series';

/** Параметры детектора после разрешения по реестру. */
export interface GoodhartParams {
    /** `n_min_none` — ниже объёма оценка месяца не считается. */
    minN: number;
    /** `goodhart_window_months`. */
    windowMonths: number;
    /** `goodhart_drop`. */
    drop: number;
    /** `trend_ewma_long` — α сглаживания. */
    alpha: number;
}

/** Факты детектора в нагрузке трендов менеджера. */
export interface ManagerGoodhartFacts {
    windowMonths: number;
    drop: number;
    /** Флаги, худший противовес первым; пусто — расхождений нет. */
    flags: GoodhartFlag[];
}

type Unknown = Record<string, unknown>;

const isObject = (value: unknown): value is Unknown =>
    typeof value === 'object' && value !== null;

const numberOf = (value: unknown): number | null =>
    typeof value === 'number' && Number.isFinite(value) ? value : null;

/** Оценка и объём месяца по `byType[]`: среднее оценок типов, взвешенное по n. */
export function monthQualityOf(
    payload: Unknown,
    minN: number,
): { quality: number | null; volume: number } {
    const list = Array.isArray(payload.byType) ? payload.byType : [];
    let weighted = 0;
    let scored = 0;
    let volume = 0;
    for (const item of list) {
        if (!isObject(item)) continue;
        const n = numberOf(item.n) ?? 0;
        volume += Math.max(0, n);
        const value = isObject(item.score) ? numberOf(item.score.value) : null;
        if (value === null || n <= 0) continue;
        weighted += value * n;
        scored += n;
    }

    return {
        quality: scored >= minN && scored > 0 ? weighted / scored : null,
        volume,
    };
}

/** Точки одной метрики по месяцам. */
function pointsOf(
    months: readonly TrendSnapshotRecord[],
    read: (payload: Unknown) => { value: number | null; n: number },
): TrendPoint[] {
    return months.flatMap(record => {
        if (!isObject(record.payload)) return [];
        const item = read(record.payload);

        return [
            {
                key: record.periodKey,
                value: item.value,
                n: item.n,
                signature: null,
            },
        ];
    });
}

/**
 * Месячные ряды менеджера для пар детектора: оценка, объём и доли рёбер,
 * нормализованные по границе сравнимой истории (ключ месяца).
 */
export function goodhartSeriesOf(
    months: readonly TrendSnapshotRecord[],
    minN: number,
    comparableFromKey: string | null,
): GoodhartSeriesInput[] {
    const inputs: { metric: string; points: TrendPoint[] }[] = [
        {
            metric: AI_TREND_WEEK_METRIC.quality,
            points: pointsOf(months, payload => {
                const month = monthQualityOf(payload, minN);

                return { value: month.quality, n: month.volume };
            }),
        },
        {
            metric: AI_TREND_WEEK_METRIC.volume,
            points: pointsOf(months, payload => {
                const month = monthQualityOf(payload, minN);

                return { value: month.volume, n: month.volume };
            }),
        },
        ...AI_TREND_EDGE_METRICS.map(metric => {
            const edge = edgeOfTrendMetric(metric);

            return {
                metric,
                points:
                    edge === null
                        ? []
                        : pointsOf(months, payload =>
                              edgeRateOf(payload, edge, minN),
                          ),
            };
        }),
    ];

    return inputs.map(input => ({
        metric: input.metric,
        points: normalizeTrendSeries(input.points, { comparableFromKey })
            .points,
    }));
}

/**
 * Факты детектора для нагрузки трендов; `null` — ни одна пара не набрала
 * окна `goodhart_window_months` (детектор молчит, а не выдумывает).
 */
export function buildGoodhartFacts(
    months: readonly TrendSnapshotRecord[],
    params: GoodhartParams,
    comparableFromKey: string | null,
): ManagerGoodhartFacts | null {
    const flags = detectGoodhart(
        goodhartSeriesOf(months, params.minN, comparableFromKey),
        AI_GOODHART_PAIRS,
        {
            windowMonths: params.windowMonths,
            drop: params.drop,
            alpha: params.alpha,
        },
    );

    return flags === null
        ? null
        : { windowMonths: params.windowMonths, drop: params.drop, flags };
}
