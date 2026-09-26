/**
 * Вход «Внимания» Фазы 3 из блока трендов строки (П1 сигналы, П9 флаги
 * Гудхарта): к кодам метрик добавляются подписи для заголовков карточек.
 * Блок трендов у строки `null` — входа нет, карточек Фазы 3 нет.
 *
 * Отдельный файл от `attention.presenter.ts` — лимит 300 строк.
 * Чистые функции.
 */
import type {
    AttentionGoodhartFlag,
    AttentionTrendSignal,
} from '@lib/sales-ai-analytics';
import { trendMetricTitle } from '../../constants/ai-goodhart.const';
import type { AiManagerTrendsDto } from '../../dto/ai-trend.dto';

/** Сигналы трендов строки с подписями; блока нет или сигналов нет — undefined. */
export function trendSignalsOf(
    trends: AiManagerTrendsDto | null | undefined,
): AttentionTrendSignal[] | undefined {
    if (!trends || trends.signals.length === 0) return undefined;

    return trends.signals.map(signal => ({
        metric: signal.metric,
        title: trendMetricTitle(signal.metric),
        kind: signal.kind,
        direction: signal.direction,
        sinceWeek: signal.sinceWeek,
        magnitude: signal.magnitude,
        confidence: signal.confidence,
    }));
}

/** Флаги Гудхарта строки с подписями; блока нет или флагов нет — undefined. */
export function goodhartOf(
    trends: AiManagerTrendsDto | null | undefined,
): AttentionGoodhartFlag[] | undefined {
    const flags = trends?.goodhart;
    if (!flags || flags.length === 0) return undefined;

    return flags.map(flag => ({
        pair: flag.pair,
        pressure: flag.pressure,
        pressureTitle: trendMetricTitle(flag.pressure),
        counter: flag.counter,
        counterTitle: trendMetricTitle(flag.counter),
        fromKey: flag.fromKey,
        toKey: flag.toKey,
        pressureChange: flag.pressureChange,
        counterChange: flag.counterChange,
        points: flag.points,
    }));
}
