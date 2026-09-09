import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    AI_ANALYTICS_EVIDENCE_LEVELS,
    AI_ANALYTICS_LEVERS,
    AiAnalyticsEvidenceLevel,
    AiAnalyticsLever,
} from '../constants/ai-overview.const';

/**
 * Рекомендация строки менеджера — рычаг из дневного снапшота прогноза
 * (`ai-analytics-forecast`): не более трёх на менеджера, каждый с опорой
 * в числах (`basis`), кодом правила и уровнем доказательности.
 *
 * Совет «делай X вместо Y» разрешён только с уровня E2; на E1 фронт
 * формулирует наблюдение («ниже нормы по X»), а не императив.
 */
export class AiRecommendationDto {
    @ApiProperty({
        description:
            'Рычаг: volume — объём активностей, quality — качество ' +
            'разговора, checklist — пункт чек-листа, pipeline — работа с ' +
            'открытыми сделками, objection — работа с возражением.',
        enum: AI_ANALYTICS_LEVERS,
        example: 'quality',
    })
    lever: AiAnalyticsLever;

    @ApiPropertyOptional({
        description: 'AI-тип звонка.',
        type: String,
        example: 'presentation',
    })
    callType?: string;

    @ApiPropertyOptional({
        description: 'Раздел рубрики либо код пункта чек-листа.',
        type: String,
        example: 'PRICE',
    })
    section?: string;

    @ApiPropertyOptional({
        description: 'Категория возражения.',
        type: String,
        example: 'price',
    })
    category?: string;

    @ApiPropertyOptional({
        description:
            'Ожидаемый прирост продаж; нет — уровень E0 (сцепки звонков со ' +
            'сделками ещё нет, число называть нечестно).',
        type: Number,
        example: 0.4,
    })
    deltaSales?: number;

    @ApiProperty({
        description:
            'Стоимость рекомендации: минуты активности либо часы коучинга.',
        type: Number,
        example: 1,
    })
    cost: number;

    @ApiProperty({
        description:
            'Уровень доказательности: E0 — факт с интервалом, E1 — связь ' +
            'в данных, E2 — пул порталов либо квази-эксперимент, E3 — ' +
            'пререгистрированный эксперимент.',
        enum: AI_ANALYTICS_EVIDENCE_LEVELS,
        example: 'E1',
    })
    evidence: AiAnalyticsEvidenceLevel;

    @ApiProperty({
        description: 'Опоры рекомендации в числах.',
        type: [String],
        example: ['S=6.4 → 7.4', 'разборов 24'],
    })
    basis: string[];

    @ApiProperty({
        description: 'Код правила, породившего рекомендацию.',
        type: String,
        example: 'quality-weak-section',
    })
    ruleCode: string;
}
