import { ApiProperty } from '@nestjs/swagger';
import {
    AI_GOODHART_PAIR_CODES,
    type AiGoodhartPairCode,
} from '../constants/ai-goodhart.const';
import {
    AI_TREND_METRICS,
    type AiTrendMetric,
} from '../constants/ai-trend.const';

/**
 * Флаг детектора Гудхарта (Фаза 3, П9): за окно месяцев сглаженная
 * метрика давления выросла, а её противовес упал не меньше `goodhart_drop`.
 * Формулировка нейтральная — «метрика растёт, результат — нет»: детектор
 * описывает расхождение рядов, а не намерение сотрудника.
 */
export class AiGoodhartFlagDto {
    @ApiProperty({
        description:
            'Пара «давление ↔ противовес»: volume_vs_quality — объём ' +
            'разборов против оценки; quality_vs_offer — оценка против доли ' +
            '«презентация → КП»; *_vs_* по рёбрам — доля ребра против доли ' +
            'следующего ребра.',
        enum: AI_GOODHART_PAIR_CODES,
        example: 'volume_vs_quality',
    })
    pair: AiGoodhartPairCode;

    @ApiProperty({
        description: 'Метрика давления (код метрики трендов).',
        enum: AI_TREND_METRICS,
        example: 'volume',
    })
    pressure: AiTrendMetric;

    @ApiProperty({
        description: 'Метрика-противовес (код метрики трендов).',
        enum: AI_TREND_METRICS,
        example: 'quality',
    })
    counter: AiTrendMetric;

    @ApiProperty({
        description: 'Первый месяц окна YYYY-MM.',
        type: String,
        example: '2026-06',
    })
    fromKey: string;

    @ApiProperty({
        description: 'Последний месяц окна YYYY-MM.',
        type: String,
        example: '2026-08',
    })
    toKey: string;

    @ApiProperty({
        description:
            'Относительное изменение сглаженного давления за окно, доля ' +
            '(0,5 = +50 %).',
        type: Number,
        example: 0.5,
    })
    pressureChange: number;

    @ApiProperty({
        description:
            'Относительное изменение сглаженного противовеса за окно, доля ' +
            '(−0,36 = −36 %); не выше −goodhart_drop.',
        type: Number,
        example: -0.36,
    })
    counterChange: number;

    @ApiProperty({
        description: 'Общих месяцев окна у обоих рядов.',
        type: Number,
        example: 3,
    })
    points: number;
}
