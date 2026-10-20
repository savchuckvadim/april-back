import { ApiProperty } from '@nestjs/swagger';
import type {
    AttentionLowScoreCall,
    AttentionSectionMean,
} from '@lib/sales-ai-analytics';
import type {
    AttentionThresholds,
    ManagerFollowupFacts,
    ManagerPresentationFacts,
    ManagerQualityFacts,
} from '../domain/assembler/overview-model.types';

/**
 * Факты качества строки менеджера для сигналов «Внимания» этапа 2
 * (решение владельца 19.10.2026): слабые презентации, слабая доработка,
 * звонки с низкой оценкой. Пороги, по которым они собраны, едут рядом —
 * правила читают кэш обзора теми же числами. Строки старого кэша поля не
 * имеют: тогда сигналов этапа 2 нет.
 */

/** Средняя оценка раздела разговора по звонкам менеджера (шкала 1–10). */
export class AiSectionMeanDto implements AttentionSectionMean {
    @ApiProperty({
        description:
            'Код раздела рубрики (NEEDS, PRESENTATION, OBJECTIONS, CLOSING).',
        type: String,
        example: 'NEEDS',
    })
    section: string;

    @ApiProperty({
        description: 'Средняя оценка раздела 1–10 по оценённым звонкам.',
        type: Number,
        example: 4.3,
    })
    mean: number;

    @ApiProperty({
        description: 'Сколько звонков оценено по разделу.',
        type: Number,
        example: 12,
    })
    n: number;
}

/** Презентации периода: средние разделов потребностей и презентации. */
export class AiPresentationFactsDto implements ManagerPresentationFacts {
    @ApiProperty({
        description: 'Звонков-презентаций с разбором за период.',
        type: Number,
        example: 12,
    })
    n: number;

    @ApiProperty({
        description:
            'Средние разделов «Выявление потребностей» и «Презентация под потребности».',
        type: [AiSectionMeanDto],
    })
    sections: AiSectionMeanDto[];

    @ApiProperty({
        description:
            'Id транскрипций презентаций со слабым разделом (не выше порога).',
        type: [String],
        example: ['10245', '10301'],
    })
    weakCallIds: string[];
}

/** Доработка периода (refine / decision): возражения, шаг без даты, разделы. */
export class AiFollowupFactsDto implements ManagerFollowupFacts {
    @ApiProperty({
        description: 'Звонков доработки с разбором за период.',
        type: Number,
        example: 10,
    })
    n: number;

    @ApiProperty({
        description: 'Возражений с известным исходом отработки.',
        type: Number,
        example: 15,
    })
    objectionsKnown: number;

    @ApiProperty({
        description: 'Из них не отработано.',
        type: Number,
        example: 6,
    })
    objectionsUnhandled: number;

    @ApiProperty({
        description: 'Звонков с назначенным следующим шагом.',
        type: Number,
        example: 8,
    })
    nextStepSet: number;

    @ApiProperty({
        description: 'Из них без даты шага.',
        type: Number,
        example: 4,
    })
    nextStepNoDate: number;

    @ApiProperty({
        description:
            'Средние разделов «Работа с возражениями» и «Закрытие разговора».',
        type: [AiSectionMeanDto],
    })
    sections: AiSectionMeanDto[];

    @ApiProperty({
        description:
            'Id транскрипций доработки с неотработанным возражением, шагом без даты или слабым разделом.',
        type: [String],
        example: ['10402'],
    })
    weakCallIds: string[];
}

/** Звонок с низкой общей оценкой. */
export class AiLowScoreCallDto implements AttentionLowScoreCall {
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
        example: 'cold',
    })
    callType: string | null;

    @ApiProperty({
        description: 'Общая оценка звонка 1–10.',
        type: Number,
        example: 3.5,
    })
    score: number;
}

/** Пороги сигналов этапа 2, по которым собраны факты (слой портала). */
export class AiAttentionThresholdsDto implements AttentionThresholds {
    @ApiProperty({
        description:
            'Раздел слабый при средней не выше (weak_section_score_max).',
        type: Number,
        example: 5,
    })
    weakSectionScoreMax: number;

    @ApiProperty({
        description:
            'Раздел слабый, если ниже отдела на столько баллов (weak_section_gap).',
        type: Number,
        example: 1,
    })
    weakSectionGap: number;

    @ApiProperty({
        description:
            'Звонок слабый при общей оценке не выше (low_score_call_max).',
        type: Number,
        example: 4,
    })
    lowScoreCallMax: number;

    @ApiProperty({
        description:
            'Доля неотработанных возражений или шагов без даты у доработки, ' +
            'с которой срабатывает сигнал (weak_followup_share_min); доля 0–1.',
        type: Number,
        example: 0.5,
    })
    weakFollowupShareMin: number;
}

/** Факты качества строки для сигналов «Внимания» этапа 2. */
export class AiManagerQualityFactsDto implements ManagerQualityFacts {
    @ApiProperty({
        description: 'Пороги, по которым собраны факты.',
        type: AiAttentionThresholdsDto,
    })
    thresholds: AiAttentionThresholdsDto;

    @ApiProperty({
        description: 'Презентации периода.',
        type: AiPresentationFactsDto,
    })
    presentation: AiPresentationFactsDto;

    @ApiProperty({
        description: 'Доработка периода (refine / decision).',
        type: AiFollowupFactsDto,
    })
    followup: AiFollowupFactsDto;

    @ApiProperty({
        description: 'Звонки периода с общей оценкой не выше порога.',
        type: [AiLowScoreCallDto],
    })
    lowScoreCalls: AiLowScoreCallDto[];
}
