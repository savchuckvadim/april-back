import { ApiProperty } from '@nestjs/swagger';
import type {
    AttentionPresentationSpirals,
    AttentionProgressCall,
    AttentionProgressFacts,
} from '@lib/sales-ai-analytics';

/**
 * Факты методики в строке менеджера (этап 2 плана методики Полянского,
 * 02.11.2026): спирали презентаций — для сигнала «слабые презентации»,
 * звонки с продвижением сделки без качества — для сигнала «купил бы и без
 * менеджера». Строки старого кэша полей не имеют.
 */

/** Спирали презентаций за период (разборы, где спирали считались). */
export class AiPresentationSpiralsDto implements AttentionPresentationSpirals {
    @ApiProperty({
        description: 'Презентаций, где спирали посчитаны.',
        type: Number,
        example: 10,
    })
    n: number;

    @ApiProperty({
        description: 'Полных витков в среднем на презентацию.',
        type: Number,
        example: 1.2,
    })
    meanFull: number;

    @ApiProperty({
        description:
            'Норма методики: минимум полных витков (по самому свежему разбору).',
        type: Number,
        example: 3,
    })
    minFull: number;

    @ApiProperty({
        description:
            'Id транскрипций презентаций, где полных витков меньше нормы.',
        type: [String],
        example: ['10245', '10301'],
    })
    belowMinCallIds: string[];
}

/** Звонок, где сделка продвинулась, а оценка разговора ниже порога качества. */
export class AiProgressCallDto implements AttentionProgressCall {
    @ApiProperty({
        description: 'Id транскрипции.',
        type: String,
        example: '10245',
    })
    transcriptionId: string;

    @ApiProperty({
        description: 'AI-тип звонка; null — не определён.',
        type: String,
        nullable: true,
        example: 'presentation',
    })
    callType: string | null;

    @ApiProperty({
        description: 'Общая оценка звонка 1–10.',
        type: Number,
        example: 4.5,
    })
    score: number;

    @ApiProperty({
        description: 'Продвижение сделки по звонку 1–5.',
        type: Number,
        example: 4,
    })
    dealProgress: number;
}

/** Продвижение сделок за период: сколько звонков двинули сделку и какие — без качества. */
export class AiProgressFactsDto implements AttentionProgressFacts {
    @ApiProperty({
        description:
            'Звонков с продвижением сделки не ниже порога deal_progress_moving_min.',
        type: Number,
        example: 12,
    })
    n: number;

    @ApiProperty({
        description:
            'Из них с оценкой ниже quality_progress_score_min — «клиент купил бы и без менеджера», по id.',
        type: [AiProgressCallDto],
    })
    calls: AiProgressCallDto[];
}
