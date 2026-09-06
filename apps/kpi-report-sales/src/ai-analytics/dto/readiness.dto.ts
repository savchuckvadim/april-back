import { ApiProperty } from '@nestjs/swagger';
import {
    AI_ANALYTICS_READINESS_MODES,
    AiAnalyticsReadinessMode,
} from '../constants/ai-analytics.const';

/**
 * Готовность витрины (план, 4.11): режим по объёму истории, число
 * презентаций и продаж, дата сопоставимости версий разбора, причины.
 */
export class ReadinessDto {
    @ApiProperty({
        description:
            'Режим: calibration (< 3 мес. или < 60 презентаций) → descriptive → ' +
            'norms (≥ 3 мес., ≥ 100 презентаций) → hypothesis → forecast → ' +
            'recommendations; kpi-only — аналитика включена, но разборов нет.',
        enum: AI_ANALYTICS_READINESS_MODES,
        example: 'calibration',
    })
    mode: AiAnalyticsReadinessMode;

    @ApiProperty({
        description:
            'Месяцев истории разборов (по первому разобранному звонку).',
        type: Number,
        example: 2,
    })
    historyMonths: number;

    @ApiProperty({
        description: 'Разобранных презентаций за окно готовности.',
        type: Number,
        example: 37,
    })
    presentations: number;

    @ApiProperty({
        description:
            'Продаж за окно готовности (Фаза 1b — из закрытых сделок; ' +
            'в Фазе 1a всегда 0).',
        type: Number,
        example: 0,
    })
    sales: number;

    @ApiProperty({
        description:
            'Дата (YYYY-MM-DD), с которой разборы сопоставимы по версиям ' +
            '(max по датам версий prompt/rubric/registry/attribution/classifier); ' +
            'пусто — версий нет.',
        type: String,
        example: '2026-09-05',
    })
    comparableFrom: string;

    @ApiProperty({
        description: 'Причины текущего режима (для баннера).',
        type: [String],
        example: ['history-months-below-3', 'presentations-below-60'],
    })
    reasons: string[];
}
