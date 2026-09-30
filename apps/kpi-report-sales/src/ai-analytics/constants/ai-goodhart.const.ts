/**
 * Константы детектора Гудхарта (план Фазы 3, поток П9 `p3-goodhart`):
 * пары «метрика давления ↔ противовес» на кодах метрик трендов и подписи
 * метрик для заголовков карточек «Внимания».
 *
 * Пары — `as const`, магических строк в коде среза нет
 * (ai/rules/pbx-typing.md). Сам детектор — библиотека (`detectGoodhart`);
 * здесь только то, что знает приложение: какие метрики есть и как они
 * называются для человека.
 */
import { AI_ANALYTICS_BUCKETS } from '@lib/portal-lib/pbx/pbx-aicall-smart';
import type { GoodhartPair } from '@lib/sales-ai-analytics';
import type { AiAnalyticsFunnelEdgeCode } from './ai-overview.const';
import {
    AI_TREND_BUCKET_METRIC_PREFIX,
    AI_TREND_EDGE_METRIC_PREFIX,
    AI_TREND_WEEK_METRIC,
    bucketOfTrendMetric,
    edgeOfTrendMetric,
    type AiTrendMetric,
} from './ai-trend.const';

/** Пара детектора на кодах метрик трендов приложения. */
export interface AiGoodhartPair extends GoodhartPair {
    readonly pressure: AiTrendMetric;
    readonly counter: AiTrendMetric;
}

const edgeMetric = (code: AiAnalyticsFunnelEdgeCode) =>
    `${AI_TREND_EDGE_METRIC_PREFIX}${code}` as const;

/**
 * Пары «давление ↔ противовес» (план П9): рост объёма при падении оценки,
 * рост оценки при падении доли КП после презентаций, рост доли ребра при
 * падении следующего ребра. Порядок — порядок показа при равных
 * величинах.
 */
export const AI_GOODHART_PAIRS = [
    {
        code: 'volume_vs_quality',
        pressure: AI_TREND_WEEK_METRIC.volume,
        counter: AI_TREND_WEEK_METRIC.quality,
    },
    {
        code: 'quality_vs_offer',
        pressure: AI_TREND_WEEK_METRIC.quality,
        counter: edgeMetric('presentation_to_offer'),
    },
    {
        code: 'call_to_presentation_vs_offer',
        pressure: edgeMetric('call_to_presentation'),
        counter: edgeMetric('presentation_to_offer'),
    },
    {
        code: 'presentation_to_offer_vs_invoice',
        pressure: edgeMetric('presentation_to_offer'),
        counter: edgeMetric('offer_to_invoice'),
    },
    {
        code: 'offer_to_invoice_vs_sale',
        pressure: edgeMetric('offer_to_invoice'),
        counter: edgeMetric('invoice_to_sale'),
    },
] as const satisfies readonly AiGoodhartPair[];

export const AI_GOODHART_PAIR_CODES = AI_GOODHART_PAIRS.map(
    pair => pair.code,
) as readonly AiGoodhartPairCode[];
export type AiGoodhartPairCode = (typeof AI_GOODHART_PAIRS)[number]['code'];

export function isAiGoodhartPairCode(
    value: unknown,
): value is AiGoodhartPairCode {
    return (
        typeof value === 'string' &&
        (AI_GOODHART_PAIR_CODES as readonly string[]).includes(value)
    );
}

/** Подписи корзин для заголовков. */
const BUCKET_TITLES: Record<(typeof AI_ANALYTICS_BUCKETS)[number], string> = {
    contact: 'оценка контакта',
    presentation: 'оценка презентации',
    closing: 'оценка закрытия',
};

/**
 * Подписи рёбер воронки для заголовков: доля исхода после входа словами,
 * без стрелок (правило владельца: в клиентских текстах нет «→»). Новое
 * ребро без подписи не соберётся — `Record` по коду ребра.
 */
const EDGE_TREND_TITLES: Record<AiAnalyticsFunnelEdgeCode, string> = {
    call_to_presentation: 'доля презентаций после звонков',
    presentation_to_offer: 'доля КП после презентаций',
    offer_to_invoice: 'доля счетов после КП',
    invoice_to_sale: 'доля продаж после счетов',
};

/**
 * Подпись метрики тренда для человека в именительном падеже: «оценка»,
 * «число разборов», «оценка контакта», «доля КП после презентаций» —
 * она стоит подлежащим в заголовке карточки. Незнакомый код (чужая
 * нагрузка) — сам код, чтобы карточка не потеряла смысл.
 */
export function trendMetricTitle(metric: string): string {
    if (metric === AI_TREND_WEEK_METRIC.quality) return 'оценка';
    if (metric === AI_TREND_WEEK_METRIC.volume) return 'число разборов';
    if (metric.startsWith(AI_TREND_BUCKET_METRIC_PREFIX)) {
        const bucket = bucketOfTrendMetric(metric as AiTrendMetric);

        return bucket === null ? metric : BUCKET_TITLES[bucket];
    }
    const edge = edgeOfTrendMetric(metric as AiTrendMetric);

    return edge === null ? metric : EDGE_TREND_TITLES[edge];
}
