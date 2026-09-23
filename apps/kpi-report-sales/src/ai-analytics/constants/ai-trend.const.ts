/**
 * Константы трендов рядов менеджера (план Фазы 3, поток П1): код и ритм
 * шага `trends`, окна рядов, метрики недели и месяца, причины пропуска,
 * причины «Внимания» и лимит сигналов в строке обзора.
 *
 * Свой файл констант среза — правило владения общими файлами §1.6 п. 3:
 * `constants/ai-analytics.const.ts` правит только поток настроек,
 * `constants/ai-snapshot.const.ts` — поток конвейера. Магических строк
 * метрик, видов сигнала и причин в коде среза нет (ai/rules/pbx-typing.md).
 */
import {
    AI_ANALYTICS_BUCKETS,
    type AiAnalyticsBucket,
} from '@lib/portal-lib/pbx/pbx-aicall-smart';
import {
    shiftDate,
    TREND_DIRECTIONS,
    TREND_SIGNAL_KINDS,
} from '@lib/sales-ai-analytics';
import { isoWeekKey } from '../domain/loaders/period.util';
import { weekMondayOfKey } from './ai-manager-snapshot.const';
import {
    AI_ANALYTICS_FUNNEL_EDGE_CODES,
    type AiAnalyticsFunnelEdgeCode,
} from './ai-overview.const';
import type { AiPipelineRhythm } from './ai-snapshot.const';

/** Код шага конвейера (уникален в массиве шагов). */
export const AI_TREND_STEP_CODE = 'trends' as const;

/**
 * Тренды считаются раз в неделю после закрытия ISO-недели: шаг читает
 * недельные снапшоты, которые только что записал шаг `calls` того же
 * недельного прогона, и закрытые месяцы.
 */
export const AI_TREND_STEP_RHYTHMS = [
    'weekly',
] as const satisfies readonly AiPipelineRhythm[];

/** Окно недельных рядов — полгода ISO-недель, включая неделю расчёта. */
export const AI_TREND_WEEKS_WINDOW = 26;

/** Окно месячных рядов — год закрытых месяцев до месяца расчёта. */
export const AI_TREND_MONTHS_WINDOW = 12;

/** Зерно ряда: недели (`manager-week`) или месяцы (`manager-month`). */
export const AI_TREND_GRAINS = ['week', 'month'] as const;
export type AiTrendGrain = (typeof AI_TREND_GRAINS)[number];

/** Недельные метрики: оценка качества и объём разборов. */
export const AI_TREND_WEEK_METRIC = {
    quality: 'quality',
    volume: 'volume',
} as const;

/** Префиксы кодов метрик корзин и рёбер воронки. */
export const AI_TREND_BUCKET_METRIC_PREFIX = 'bucket_' as const;
export const AI_TREND_EDGE_METRIC_PREFIX = 'edge_' as const;

export type AiTrendBucketMetric =
    `${typeof AI_TREND_BUCKET_METRIC_PREFIX}${AiAnalyticsBucket}`;
export type AiTrendEdgeMetric =
    `${typeof AI_TREND_EDGE_METRIC_PREFIX}${AiAnalyticsFunnelEdgeCode}`;

/** Метрики корзин недели в порядке справочника корзин. */
export const AI_TREND_BUCKET_METRICS = AI_ANALYTICS_BUCKETS.map(
    bucket => `${AI_TREND_BUCKET_METRIC_PREFIX}${bucket}` as const,
) as readonly AiTrendBucketMetric[];

/** Метрики рёбер воронки месяца в порядке справочника рёбер. */
export const AI_TREND_EDGE_METRICS = AI_ANALYTICS_FUNNEL_EDGE_CODES.map(
    code => `${AI_TREND_EDGE_METRIC_PREFIX}${code}` as const,
) as readonly AiTrendEdgeMetric[];

/** Все метрики трендов в порядке показа: качество, объём, корзины, рёбра. */
export const AI_TREND_METRICS = [
    AI_TREND_WEEK_METRIC.quality,
    AI_TREND_WEEK_METRIC.volume,
    ...AI_TREND_BUCKET_METRICS,
    ...AI_TREND_EDGE_METRICS,
] as const;
export type AiTrendMetric = (typeof AI_TREND_METRICS)[number];

export function isAiTrendMetric(value: unknown): value is AiTrendMetric {
    return (
        typeof value === 'string' &&
        (AI_TREND_METRICS as readonly string[]).includes(value)
    );
}

/** Корзина по коду метрики корзины; иначе null. */
export function bucketOfTrendMetric(
    metric: AiTrendMetric,
): AiAnalyticsBucket | null {
    const bucket = AI_ANALYTICS_BUCKETS.find(
        item => `${AI_TREND_BUCKET_METRIC_PREFIX}${item}` === metric,
    );

    return bucket ?? null;
}

/** Код ребра по коду метрики ребра; иначе null. */
export function edgeOfTrendMetric(
    metric: AiTrendMetric,
): AiAnalyticsFunnelEdgeCode | null {
    const edge = AI_ANALYTICS_FUNNEL_EDGE_CODES.find(
        item => `${AI_TREND_EDGE_METRIC_PREFIX}${item}` === metric,
    );

    return edge ?? null;
}

/** Виды сигнала и направления — словари библиотеки, для DTO и валидации. */
export const AI_TREND_SIGNAL_KINDS = TREND_SIGNAL_KINDS;
export const AI_TREND_DIRECTIONS = TREND_DIRECTIONS;

/**
 * Причины пропуска шага (штатная деградация §5.4): каждая объясняет
 * руководителю, почему записи за неделю нет.
 */
export const AI_TREND_REASONS = {
    /** Ростер ОП пуст: считать нечего. */
    rosterEmpty: 'roster-empty',
    /** В окне нет ни недельных, ни месячных снапшотов менеджеров. */
    windowEmpty: 'trends-window-empty',
    /** Ни у одного менеджера нет `trend_window_calls` разборов в окне. */
    fewCalls: 'trends-few-calls',
} as const;
export type AiTrendReason =
    (typeof AI_TREND_REASONS)[keyof typeof AI_TREND_REASONS];

/**
 * Причины карточки «Внимания» по трендам (план П1: сигналы входят в
 * `POST attention`); сами правила «Внимания» подключает поток, владеющий
 * `model/attention.*` — здесь только коды, чтобы не разошлись.
 */
export const AI_TREND_ATTENTION_REASONS = {
    shift: 'trend-shift',
    drift: 'trend-drift',
} as const;

/** Сколько сигналов отдаём в строке обзора (старшие — первыми). */
export const AI_TREND_MAX_SIGNALS = 3;

/** Ключи ISO-недель окна по возрастанию, заканчивая неделей `weekKey`. */
export function trendWeekKeys(weekKey: string, count: number): string[] {
    const monday = weekMondayOfKey(weekKey);

    return Array.from({ length: Math.max(0, count) }, (_, index) =>
        isoWeekKey(shiftDate(monday, -7 * (count - 1 - index))),
    );
}
