/**
 * Тренды строки менеджера (план Фазы 3, П1): снапшот `ai-analytics-trends`
 * недели → `AiManagerTrendsDto`. Сигналы, пороги и доверие считает
 * библиотека на недельном шаге — витрина только переводит готовую
 * нагрузку и молчит, когда чисел показывать нельзя: разборов за период
 * меньше `n_min_none`, снапшота нет либо доверие `none` → `null`.
 *
 * Чистые функции.
 */
import { registryDefault, type ConfidenceLevel } from '@lib/sales-ai-analytics';
import {
    AI_TREND_DIRECTIONS,
    AI_TREND_GRAINS,
    AI_TREND_MAX_SIGNALS,
    AI_TREND_SIGNAL_KINDS,
    AI_TREND_WEEK_METRIC,
    isAiTrendMetric,
} from '../../constants/ai-trend.const';
import { AiManagerTrendsDto, AiTrendSignalDto } from '../../dto/ai-trend.dto';

/** Нагрузка трендов глазами витрины: форма чужая, читается структурно. */
export interface TrendsView {
    weekKey?: unknown;
    calls?: unknown;
    confidence?: unknown;
    signals?: unknown;
    metrics?: unknown;
}

/** Опции показа: объём данных менеджера и пороги (по умолчанию — из реестра). */
export interface TrendsBlockOptions {
    /** Разборов менеджера за период обзора; ниже `minN` блок пуст. */
    n: number;
    /** `n_min_none` — порог, ниже которого чисел наружу нет. */
    minN?: number;
    /** Сколько сигналов показываем. */
    max?: number;
}

const CONFIDENCE_LEVELS: readonly ConfidenceLevel[] = ['ok', 'low', 'none'];

const isNumber = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value);

const isConfidence = (value: unknown): value is ConfidenceLevel =>
    CONFIDENCE_LEVELS.some(level => level === value);

const isOneOf = <T extends string>(
    list: readonly T[],
    value: unknown,
): value is T => list.some(item => item === value);

/** Сигнал нагрузки → DTO; чужая или неполная форма отбрасывается. */
function toSignal(value: unknown): AiTrendSignalDto[] {
    const item = (value ?? {}) as Record<string, unknown>;
    if (
        !isAiTrendMetric(item.metric) ||
        !isOneOf(AI_TREND_GRAINS, item.grain) ||
        !isOneOf(AI_TREND_SIGNAL_KINDS, item.kind) ||
        !isOneOf(AI_TREND_DIRECTIONS, item.direction) ||
        typeof item.sinceWeek !== 'string' ||
        !isNumber(item.magnitude) ||
        !isConfidence(item.confidence) ||
        item.confidence === 'none'
    ) {
        return [];
    }

    return [
        {
            metric: item.metric,
            grain: item.grain,
            kind: item.kind,
            direction: item.direction,
            sinceWeek: item.sinceWeek,
            magnitude: item.magnitude,
            confidence: item.confidence,
        },
    ];
}

/** Сравнимых точек ряда качества; чужая форма → 0. */
function qualityPointsOf(metrics: unknown): number {
    const list = Array.isArray(metrics) ? metrics : [];
    const quality = list.find(
        (item): item is Record<string, unknown> =>
            typeof item === 'object' &&
            item !== null &&
            (item as Record<string, unknown>).metric ===
                AI_TREND_WEEK_METRIC.quality,
    );

    return isNumber(quality?.points) ? quality.points : 0;
}

/**
 * Блок трендов строки; `null` — снапшота нет, разборов за период меньше
 * `n_min_none` либо доверие `none`. Сигналов не больше `max` (три).
 */
export function toTrendsBlock(
    view: TrendsView | null | undefined,
    options: TrendsBlockOptions,
): AiManagerTrendsDto | null {
    if (!view) return null;
    const minN = options.minN ?? registryDefault('n_min_none');
    if (options.n < minN) return null;
    if (!isConfidence(view.confidence) || view.confidence === 'none') {
        return null;
    }
    if (typeof view.weekKey !== 'string') return null;
    const signals = (Array.isArray(view.signals) ? view.signals : [])
        .flatMap(toSignal)
        .slice(0, Math.max(0, options.max ?? AI_TREND_MAX_SIGNALS));

    return {
        weekKey: view.weekKey,
        calls: isNumber(view.calls) ? view.calls : 0,
        weeks: qualityPointsOf(view.metrics),
        confidence: view.confidence,
        signals,
    };
}
