import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    ConfidenceLevel,
    MetricTrend,
    MetricValue,
} from '@lib/sales-ai-analytics';

const CONFIDENCE_LEVELS: readonly ConfidenceLevel[] = ['ok', 'low', 'none'];
const METRIC_TRENDS: readonly MetricTrend[] = ['up', 'down', 'flat', 'na'];

/** Доверие к метрике по объёму данных (план, 4.11). */
export class MetricConfidenceDto {
    @ApiProperty({
        description:
            'Уровень доверия: ok — достаточно данных; low — мало для выводов; ' +
            'none — значение не показывается (value = null).',
        enum: CONFIDENCE_LEVELS,
        example: 'ok',
    })
    level: ConfidenceLevel;

    @ApiPropertyOptional({
        description:
            'Причина пониженного доверия: not-enough-data, few-data, ' +
            'version-changed (смена версии разбора), mixed-sources.',
        type: String,
        example: 'few-data',
    })
    reason?: string;
}

/**
 * Метрика с «честным мало данных» (план, 6.3): value = null при
 * confidence none; n — объём; ci90 — 90 %-й интервал Уилсона для долей.
 */
export class MetricDto implements MetricValue {
    @ApiProperty({
        description:
            'Значение метрики: доля 0..1 или средняя оценка; null — мало данных.',
        type: Number,
        nullable: true,
        example: 0.62,
    })
    value: number | null;

    @ApiProperty({
        description: 'Объём данных (число звонков/наблюдений).',
        type: Number,
        example: 41,
    })
    n: number;

    @ApiPropertyOptional({
        description:
            'Доля собственных данных при иерархической усадке (Фаза 2).',
        type: Number,
        example: 0.8,
    })
    w?: number;

    @ApiProperty({
        description: 'Доверие к метрике по объёму данных.',
        type: MetricConfidenceDto,
    })
    confidence: MetricConfidenceDto;

    @ApiPropertyOptional({
        description:
            '90 %-й доверительный интервал [нижняя, верхняя] для долей.',
        type: [Number],
        example: [0.48, 0.74],
    })
    ci90?: [number, number];

    @ApiPropertyOptional({
        description: 'Тренд: up/down/flat; na — не считается.',
        enum: METRIC_TRENDS,
        example: 'flat',
    })
    trend?: MetricTrend;
}
