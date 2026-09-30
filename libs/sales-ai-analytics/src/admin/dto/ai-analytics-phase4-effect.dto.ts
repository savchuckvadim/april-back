/**
 * Ответ админ-ручки `GET admin/ai-analytics/recommendation-effect`
 * (Фаза 4, поток B3): доля выполненных советов и несогласий с
 * интервалами, «до/после» по шагам воронки, гейт L5 и контроль подгонки.
 */
import { ApiProperty } from '@nestjs/swagger';
import { AI_LEVERS, type AiLever } from '../../model/lever.types';
import {
    RECOMMENDATION_GATE_STATUSES,
    type RecommendationGateStatus,
} from '../../model/recommendation-effect.types';
import type {
    Phase4EdgeBeforeAfter,
    Phase4EffectView,
    Phase4LeverEffect,
    Phase4RecommendationEffect,
    Phase4Share,
} from '../services/ai-analytics-phase4.types';

/** Доля с интервалом 90 % (Уилсон). */
export class AiAnalyticsPhase4ShareDto implements Phase4Share {
    @ApiProperty({
        description: 'Доля; null — наблюдений меньше порога n_min_none.',
        example: 0.55,
        type: Number,
        nullable: true,
    })
    value: number | null;

    @ApiProperty({
        description: 'Интервал 90 %; null — наблюдений меньше порога.',
        example: [0.38, 0.71],
        type: [Number],
        nullable: true,
    })
    ci90: number[] | null;

    @ApiProperty({
        description: 'Знаменатель доли.',
        example: 24,
        type: Number,
    })
    n: number;
}

export class AiAnalyticsLeverEffectDto implements Phase4LeverEffect {
    @ApiProperty({
        description: 'Рычаг совета.',
        enum: AI_LEVERS,
        example: 'volume',
    })
    lever: AiLever;

    @ApiProperty({ description: 'Выдано советов.', example: 24, type: Number })
    issued: number;

    @ApiProperty({
        description: 'Советов с закрытым окном «после».',
        example: 20,
        type: Number,
    })
    completedWindows: number;

    @ApiProperty({
        description: 'Отмечено «Сделано».',
        example: 13,
        type: Number,
    })
    done: number;

    @ApiProperty({
        description: 'Отмечено «не согласен».',
        example: 2,
        type: Number,
    })
    disagree: number;

    @ApiProperty({
        description: 'Доля выполненных.',
        type: AiAnalyticsPhase4ShareDto,
    })
    doneShare: AiAnalyticsPhase4ShareDto;
}

export class AiAnalyticsEdgeBeforeAfterDto implements Phase4EdgeBeforeAfter {
    @ApiProperty({
        description: 'Код шага воронки.',
        example: 'presentation_to_offer',
        type: String,
    })
    edge: string;

    @ApiProperty({
        description: 'Переходов «до» выдачи.',
        example: 30,
        type: Number,
    })
    beforeS: number;

    @ApiProperty({
        description: 'Знаменатель «до».',
        example: 90,
        type: Number,
    })
    beforeN: number;

    @ApiProperty({
        description: 'Переходов «после».',
        example: 36,
        type: Number,
    })
    afterS: number;

    @ApiProperty({
        description: 'Знаменатель «после».',
        example: 88,
        type: Number,
    })
    afterN: number;

    @ApiProperty({
        description:
            'Разность долей «после − до»; null — знаменатель «до» или ' +
            '«после» меньше n_min_none.',
        example: 0.08,
        type: Number,
        nullable: true,
    })
    diff: number | null;

    @ApiProperty({
        description: 'Интервал разности 90 % (Ньюкомб); null — вместе с diff.',
        example: [-0.05, 0.2],
        type: [Number],
        nullable: true,
    })
    ci90: number[] | null;

    @ApiProperty({
        description: 'Окон «менеджер × месяц выдачи» (не советов).',
        example: 12,
        type: Number,
    })
    windows: number;
}

export class AiAnalyticsRecommendationEffectDto implements Phase4EffectView {
    @ApiProperty({
        description: 'Месяц расчёта (YYYY-MM).',
        example: '2026-09',
        type: String,
    })
    monthKey: string;

    @ApiProperty({
        description: 'Момент формирования (ISO, UTC).',
        example: '2026-10-03T01:00:00.000Z',
        type: String,
    })
    generatedAt: string;

    @ApiProperty({
        description: 'Месяцы выдачи, вошедшие в расчёт.',
        example: ['2026-06', '2026-07'],
        type: [String],
    })
    issuedMonths: string[];

    @ApiProperty({ description: 'Выдано советов.', example: 24, type: Number })
    issued: number;

    @ApiProperty({
        description: 'Советов с закрытым окном «после».',
        example: 20,
        type: Number,
    })
    completedWindows: number;

    @ApiProperty({
        description: 'Отмечено «Сделано».',
        example: 13,
        type: Number,
    })
    done: number;

    @ApiProperty({
        description: 'Отмечено «не согласен».',
        example: 2,
        type: Number,
    })
    disagree: number;

    @ApiProperty({
        description: 'Доля выполненных.',
        type: AiAnalyticsPhase4ShareDto,
    })
    doneShare: AiAnalyticsPhase4ShareDto;

    @ApiProperty({
        description: 'Доля несогласий.',
        type: AiAnalyticsPhase4ShareDto,
    })
    disagreeShare: AiAnalyticsPhase4ShareDto;

    @ApiProperty({
        description: 'Итог гейта ступени «рекомендации».',
        enum: RECOMMENDATION_GATE_STATUSES,
        example: 'insufficient',
    })
    gateStatus: RecommendationGateStatus;

    @ApiProperty({
        description: 'Коды причин гейта.',
        example: ['issued-below-min'],
        type: [String],
    })
    gateReasons: string[];

    @ApiProperty({
        description: 'Свод по рычагам.',
        type: [AiAnalyticsLeverEffectDto],
    })
    byLever: AiAnalyticsLeverEffectDto[];

    @ApiProperty({
        description: 'До/после по шагам воронки.',
        type: [AiAnalyticsEdgeBeforeAfterDto],
    })
    beforeAfter: AiAnalyticsEdgeBeforeAfterDto[];

    @ApiProperty({
        description:
            'Флагов подгонки показателей (Гудхарт) в последних трендах.',
        example: 0,
        type: Number,
    })
    goodhartFlags: number;

    @ApiProperty({
        description: 'Менеджеров с флагом подгонки.',
        example: 0,
        type: Number,
    })
    goodhartManagers: number;
}

export class AiAnalyticsRecommendationEffectResultDto
    implements Phase4RecommendationEffect
{
    @ApiProperty({
        description: 'Домен портала запроса.',
        example: 'april.bitrix24.ru',
        type: String,
    })
    domain: string;

    @ApiProperty({
        description: 'Последний расчёт; null — ещё не считался.',
        type: AiAnalyticsRecommendationEffectDto,
        nullable: true,
    })
    latest: AiAnalyticsRecommendationEffectDto | null;
}
