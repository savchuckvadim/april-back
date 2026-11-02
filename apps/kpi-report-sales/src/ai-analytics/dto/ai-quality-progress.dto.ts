import { ApiProperty } from '@nestjs/swagger';
import {
    QUALITY_PROGRESS_QUADRANTS,
    type QualityProgressQuadrant,
    type QualityProgressThresholds,
} from '@lib/sales-ai-analytics';
import { MetricDto } from './metric.dto';

/**
 * Блок обзора «качество × продвижение» (этап 2 плана методики Полянского,
 * 02.11.2026): каждый звонок с оценкой и продвижением сделки (ядро
 * focus-v3.0) попадает в одну из четырёх клеток по порогам портала; по
 * менеджеру — счётчики клеток, средние обеих осей и положение по средним.
 * Клетка «низкое качество, высокое продвижение» — «клиент купил бы и без
 * менеджера».
 */

/** Пороги клеток (слой портала). */
export class AiQualityProgressThresholdsDto
    implements QualityProgressThresholds
{
    @ApiProperty({
        description:
            'Оценка звонка 1–10, с которой качество достаточно (quality_progress_score_min).',
        type: Number,
        example: 6,
    })
    qualityScoreMin: number;

    @ApiProperty({
        description:
            'Продвижение сделки 1–5, с которого сделка движется (deal_progress_moving_min).',
        type: Number,
        example: 4,
    })
    progressMovingMin: number;
}

/** Название и смысл клетки для витрины. */
export class AiQualityProgressQuadrantDto {
    @ApiProperty({
        description: 'Код клетки.',
        enum: QUALITY_PROGRESS_QUADRANTS,
        example: 'progress_no_quality',
    })
    code: QualityProgressQuadrant;

    @ApiProperty({
        description: 'Название клетки по-русски.',
        type: String,
        example: 'Купил бы и без менеджера',
    })
    title: string;

    @ApiProperty({
        description: 'Что значит клетка и что с ней делать.',
        type: String,
        example:
            'Сделка продвинулась при слабом разговоре: клиент сам готов покупать, вклад менеджера мал.',
    })
    hint: string;
}

/** Звонков в каждой клетке. */
export class AiQualityProgressCountsDto {
    @ApiProperty({
        description: 'Качество есть, сделка движется.',
        type: Number,
        example: 8,
    })
    strong: number;

    @ApiProperty({
        description: 'Качество есть, сделка стоит.',
        type: Number,
        example: 2,
    })
    qualityNoProgress: number;

    @ApiProperty({
        description:
            'Качества нет, сделка движется — «купил бы и без менеджера».',
        type: Number,
        example: 3,
    })
    progressNoQuality: number;

    @ApiProperty({
        description: 'Качества нет, сделка стоит.',
        type: Number,
        example: 1,
    })
    weak: number;
}

/** Клетки и средние по набору звонков (менеджер или весь периметр). */
export class AiQualityProgressCellDto {
    @ApiProperty({
        description: 'Звонков с оценкой и продвижением сделки.',
        type: Number,
        example: 14,
    })
    n: number;

    @ApiProperty({
        description:
            'Средняя оценка 1–10 по этим звонкам; мало данных при n < 8.',
        type: MetricDto,
    })
    score: MetricDto;

    @ApiProperty({
        description: 'Среднее продвижение сделки 1–5; мало данных при n < 8.',
        type: MetricDto,
    })
    dealProgress: MetricDto;

    @ApiProperty({
        description: 'Звонков в каждой клетке.',
        type: AiQualityProgressCountsDto,
    })
    counts: AiQualityProgressCountsDto;

    @ApiProperty({
        description: 'Клетка по средним; null — мало данных.',
        enum: QUALITY_PROGRESS_QUADRANTS,
        nullable: true,
        example: 'strong',
    })
    position: QualityProgressQuadrant | null;

    @ApiProperty({
        description: 'Объяснение словами: объём, средние, клетки.',
        type: String,
        example:
            'Звонков с продвижением: 14; оценка 6,8 из 10, продвижение 4,1 из 5. Качество и движение — 8, качество без движения — 2, купил бы и без менеджера — 3, слабые — 1.',
    })
    explanation: string;
}

/** Строка менеджера в матрице. */
export class AiQualityProgressManagerDto extends AiQualityProgressCellDto {
    @ApiProperty({
        description: 'Bitrix-id менеджера.',
        type: String,
        example: '10',
    })
    managerId: string;

    @ApiProperty({
        description:
            'Id транскрипций звонков «купил бы и без менеджера», по возрастанию.',
        type: [String],
        example: ['10245', '10301'],
    })
    progressNoQualityCallIds: string[];
}

export class AiQualityProgressDto {
    @ApiProperty({
        description: 'Пороги клеток.',
        type: AiQualityProgressThresholdsDto,
    })
    thresholds: AiQualityProgressThresholdsDto;

    @ApiProperty({
        description: 'Клетки с названиями и смыслом в порядке показа.',
        type: [AiQualityProgressQuadrantDto],
    })
    quadrants: AiQualityProgressQuadrantDto[];

    @ApiProperty({
        description: 'Строки менеджеров периметра по managerId.',
        type: [AiQualityProgressManagerDto],
    })
    managers: AiQualityProgressManagerDto[];

    @ApiProperty({
        description: 'Все звонки менеджеров вместе.',
        type: AiQualityProgressCellDto,
    })
    totals: AiQualityProgressCellDto;
}
