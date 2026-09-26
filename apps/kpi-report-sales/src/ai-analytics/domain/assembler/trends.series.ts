/**
 * Ряды менеджера из нагрузок снапшотов недели и месяца (план Фазы 3, П1).
 * Нагрузки читаются СТРУКТУРНО: форма чужая (`manager-week` пишет шаг
 * звонков, `manager-month` — шаг финансов) и может быть неполной; чужое
 * или неполное поле даёт «нет точки», а не падение прогона (§5.4).
 *
 * Правила точек:
 * - оценка недели / корзины — `score.value` библиотечной метрики: при
 *   n < `n_min_none` там уже null, точка выпадает — «мало данных» не ноль;
 * - объём недели — `n` всегда число, ноль разборов записи не создаёт,
 *   поэтому нулевых точек в ряду нет;
 * - доля ребра месяца — s / n при n ≥ `n_min_none`, иначе null;
 * - сигнатура версий недели рвёт ряд при смене (`versionsKey`).
 *
 * Чистые функции.
 */
import type { TrendPoint } from '@lib/sales-ai-analytics';
import {
    AI_TREND_BUCKET_METRICS,
    AI_TREND_EDGE_METRICS,
    AI_TREND_WEEK_METRIC,
    bucketOfTrendMetric,
    edgeOfTrendMetric,
    type AiTrendGrain,
    type AiTrendMetric,
} from '../../constants/ai-trend.const';
import { toAnalysisVersions } from './manager-week.assembler';
import { versionsKey } from './manager-snapshot.types';

/** Запись снапшота менеджера в объёме, нужном рядам. */
export interface TrendSnapshotRecord {
    /** Ключ периода: 'YYYY-Www' у недели, 'YYYY-MM' у месяца. */
    periodKey: string;
    managerId: string;
    payload: unknown;
}

/** Ряд одной метрики до нормализации. */
export interface TrendSeriesInput {
    metric: AiTrendMetric;
    grain: AiTrendGrain;
    points: TrendPoint[];
}

type Unknown = Record<string, unknown>;

const isObject = (value: unknown): value is Unknown =>
    typeof value === 'object' && value !== null;

const numberOf = (value: unknown): number | null =>
    typeof value === 'number' && Number.isFinite(value) ? value : null;

/** `{ value, n }` библиотечной метрики; чужая форма → null-значение и n = 0. */
function metricOf(value: unknown): { value: number | null; n: number } {
    if (!isObject(value)) return { value: null, n: 0 };

    return { value: numberOf(value.value), n: numberOf(value.n) ?? 0 };
}

/** Сигнатура версий разбора недели; неполная или чужая → null. */
function signatureOf(payload: Unknown): string | null {
    const raw = payload.versions;
    if (!isObject(raw)) return null;
    const versions = toAnalysisVersions(
        Object.fromEntries(
            Object.entries(raw).filter(
                (entry): entry is [string, string] =>
                    typeof entry[1] === 'string',
            ),
        ),
    );

    return versions === null ? null : versionsKey(versions);
}

/** Оценка корзины недели по коду корзины. */
function bucketScoreOf(
    payload: Unknown,
    bucket: string,
): { value: number | null; n: number } {
    const buckets = Array.isArray(payload.buckets) ? payload.buckets : [];
    const found = buckets.find(
        (item): item is Unknown => isObject(item) && item.bucket === bucket,
    );

    return found === undefined ? { value: null, n: 0 } : metricOf(found.score);
}

/** Счётчики ребра месяца по коду ребра: доля s / n при n ≥ minN. */
export function edgeRateOf(
    payload: Unknown,
    edge: string,
    minN: number,
): { value: number | null; n: number } {
    const edges = Array.isArray(payload.edges) ? payload.edges : [];
    const found = edges.find(
        (item): item is Unknown => isObject(item) && item.edge === edge,
    );
    const n = found === undefined ? 0 : (numberOf(found.n) ?? 0);
    const s = found === undefined ? 0 : (numberOf(found.s) ?? 0);

    return {
        value: n >= minN && n > 0 ? Math.min(1, Math.max(0, s / n)) : null,
        n,
    };
}

/** Разборов менеджера под недельными записями (гейт `trend_window_calls`). */
export function analyzedCallsOf(weeks: readonly TrendSnapshotRecord[]): number {
    return weeks.reduce((sum, record) => {
        const n = isObject(record.payload) ? numberOf(record.payload.n) : null;

        return sum + (n ?? 0);
    }, 0);
}

/** Недельные ряды менеджера: качество, объём и корзины. */
export function weekSeriesOf(
    weeks: readonly TrendSnapshotRecord[],
): TrendSeriesInput[] {
    const quality: TrendPoint[] = [];
    const volume: TrendPoint[] = [];
    const buckets = new Map<AiTrendMetric, TrendPoint[]>(
        AI_TREND_BUCKET_METRICS.map(metric => [metric, []]),
    );
    for (const record of weeks) {
        if (!isObject(record.payload)) continue;
        const payload = record.payload;
        const signature = signatureOf(payload);
        const n = numberOf(payload.n) ?? 0;
        const score = metricOf(payload.score);
        quality.push({
            key: record.periodKey,
            value: score.value,
            n,
            signature,
        });
        volume.push({ key: record.periodKey, value: n, n, signature });
        for (const [metric, points] of buckets) {
            const bucket = bucketOfTrendMetric(metric);
            if (bucket === null) continue;
            const item = bucketScoreOf(payload, bucket);
            points.push({
                key: record.periodKey,
                value: item.value,
                n: item.n,
                signature,
            });
        }
    }

    return [
        {
            metric: AI_TREND_WEEK_METRIC.quality,
            grain: 'week',
            points: quality,
        },
        { metric: AI_TREND_WEEK_METRIC.volume, grain: 'week', points: volume },
        ...[...buckets.entries()].map(([metric, points]) => ({
            metric,
            grain: 'week' as const,
            points,
        })),
    ];
}

/** Месячные ряды менеджера: доли рёбер воронки. */
export function monthSeriesOf(
    months: readonly TrendSnapshotRecord[],
    minN: number,
): TrendSeriesInput[] {
    return AI_TREND_EDGE_METRICS.map(metric => {
        const edge = edgeOfTrendMetric(metric);
        const points: TrendPoint[] = [];
        for (const record of months) {
            if (edge === null || !isObject(record.payload)) continue;
            const item = edgeRateOf(record.payload, edge, minN);
            points.push({
                key: record.periodKey,
                value: item.value,
                n: item.n,
                signature: null,
            });
        }

        return { metric, grain: 'month' as const, points };
    });
}
