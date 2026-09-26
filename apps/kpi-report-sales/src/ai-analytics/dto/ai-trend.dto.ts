import { ApiProperty } from '@nestjs/swagger';
import { AiGoodhartFlagDto } from './ai-goodhart.dto';
import type {
    ConfidenceLevel,
    TrendDirection,
    TrendSignalKind,
} from '@lib/sales-ai-analytics';
import {
    AI_TREND_DIRECTIONS,
    AI_TREND_GRAINS,
    AI_TREND_METRICS,
    AI_TREND_SIGNAL_KINDS,
    type AiTrendGrain,
    type AiTrendMetric,
} from '../constants/ai-trend.const';

const CONFIDENCE_LEVELS: readonly ConfidenceLevel[] = ['ok', 'low', 'none'];

/**
 * Сигнал тренда по ряду менеджера (Фаза 3, П1): сдвиг уровня (CUSUM),
 * дрейф (двойная EWMA) или выброс (XmR-карта) по одной метрике недели
 * или месяца. Величина — в единицах метрики (баллы оценки, разборы в
 * неделю, доля ребра); порог сигнала калиброван по семейству
 * менеджеров × метрик портала, слово «значимо» не используется.
 */
export class AiTrendSignalDto {
    @ApiProperty({
        description:
            'Метрика ряда: quality — оценка недели 1–10, volume — разборов ' +
            'в неделю, bucket_* — оценка корзины, edge_* — доля ребра ' +
            'воронки за месяц.',
        enum: AI_TREND_METRICS,
        example: 'quality',
    })
    metric: AiTrendMetric;

    @ApiProperty({
        description: 'Зерно ряда: недели или закрытые месяцы.',
        enum: AI_TREND_GRAINS,
        example: 'week',
    })
    grain: AiTrendGrain;

    @ApiProperty({
        description:
            'Вид сигнала: shift — уровень сместился и держится, drift — ' +
            'короткая скользящая средняя ушла от длинной, outlier — ' +
            'последняя точка вне границ карты.',
        enum: AI_TREND_SIGNAL_KINDS,
        example: 'shift',
    })
    kind: TrendSignalKind;

    @ApiProperty({
        description: 'Направление относительно прежнего уровня.',
        enum: AI_TREND_DIRECTIONS,
        example: 'down',
    })
    direction: TrendDirection;

    @ApiProperty({
        description:
            'ISO-неделя начала сдвига или дрейфа (у выброса — неделя ' +
            'точки; у месячных рядов — неделя первого дня месяца).',
        type: String,
        example: '2026-W31',
    })
    sinceWeek: string;

    @ApiProperty({
        description:
            'Величина в единицах метрики: сдвиг — новый уровень минус ' +
            'прежний, дрейф — расхождение средних, выброс — отклонение от ' +
            'центра карты.',
        type: Number,
        example: -0.8,
    })
    magnitude: number;

    @ApiProperty({
        description:
            'Доверие к ряду по числу сравнимых точек: ok — 16 и больше, ' +
            'low — от 8 до 15.',
        enum: CONFIDENCE_LEVELS,
        example: 'ok',
    })
    confidence: ConfidenceLevel;
}

/**
 * Тренды строки менеджера из снапшота `ai-analytics-trends` недели:
 * не больше трёх старших сигналов и доверие к рядам. Блок отдаётся
 * только при разборах не меньше `n_min_none` за период и доверии выше
 * «none»: ниже — `trends: null`, ни одного числа наружу.
 */
export class AiManagerTrendsDto {
    @ApiProperty({
        description: 'ISO-неделя расчёта трендов (закончившаяся).',
        type: String,
        example: '2026-W38',
    })
    weekKey: string;

    @ApiProperty({
        description: 'Разборов менеджера в окне недельных рядов (26 недель).',
        type: Number,
        example: 214,
    })
    calls: number;

    @ApiProperty({
        description:
            'Сравнимых недель в ряду оценки качества после разрывов ' +
            '(comparableFrom, смена версий разбора).',
        type: Number,
        example: 21,
    })
    weeks: number;

    @ApiProperty({
        description: 'Лучшее доверие среди рядов менеджера.',
        enum: CONFIDENCE_LEVELS,
        example: 'ok',
    })
    confidence: ConfidenceLevel;

    @ApiProperty({
        description:
            'Сигналы в порядке старшинства (сдвиг, дрейф, выброс), не ' +
            'больше трёх; пусто — ряды спокойны.',
        type: [AiTrendSignalDto],
    })
    signals: AiTrendSignalDto[];

    @ApiProperty({
        description:
            'Флаги детектора Гудхарта (П9), худший противовес первым; пусто — ' +
            'расхождений нет; null — окна goodhart_window_months ещё нет.',
        type: [AiGoodhartFlagDto],
        nullable: true,
    })
    goodhart: AiGoodhartFlagDto[] | null;
}
