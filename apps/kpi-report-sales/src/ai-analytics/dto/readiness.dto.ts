import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AI_BETA_SOURCES, AiBetaSource } from '@lib/sales-ai-analytics';
import {
    AI_ANALYTICS_READINESS_MODES,
    AiAnalyticsReadinessMode,
} from '../constants/ai-analytics.const';

/**
 * Счётчик «до оценки β» (решение А.3): сколько ещё нужно презентаций и
 * месяцев, чтобы связь «качество → исход» считалась по данным портала, а
 * не по гипотезе. Показывается с первого дня — чтобы срок был виден
 * заранее, а не «когда-нибудь».
 */
export class AiBetaCountdownDto {
    @ApiProperty({
        description:
            'Стандартная ошибка наклона при накопленном объёме; null — ' +
            'объёма ещё нет.',
        type: Number,
        nullable: true,
        example: 0.19,
    })
    seNow: number | null;

    @ApiProperty({
        description: 'Сколько презентаций осталось до гейта.',
        type: Number,
        example: 340,
    })
    presentationsLeft: number;

    @ApiProperty({
        description:
            'Месяцев при текущем темпе презентаций; null — темп неизвестен.',
        type: Number,
        nullable: true,
        example: 7,
    })
    monthsLeft: number | null;
}

/**
 * Готовность витрины (план, 4.11): режим по объёму истории, число
 * презентаций и продаж, дата сопоставимости версий разбора, причины,
 * режим связи качества с исходом и счётчик до его гейта.
 */
export class ReadinessDto {
    @ApiProperty({
        description:
            'Режим: calibration (< 3 мес. или < 60 презентаций) → descriptive → ' +
            'norms (≥ 3 мес., ≥ 100 презентаций) → hypothesis → forecast → ' +
            'recommendations; kpi-only — аналитика включена, но разборов нет. ' +
            'Без снапшота месячной модели портала режим не выше descriptive ' +
            '(причина no-portal-model): норм без модели нет.',
        enum: AI_ANALYTICS_READINESS_MODES,
        example: 'calibration',
    })
    mode: AiAnalyticsReadinessMode;

    @ApiProperty({
        description:
            'Месяцев истории: из окна модели портала (глубина истории стадий ' +
            'за 12 месяцев), без модели — по первому разобранному звонку в ' +
            'периоде.',
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
            'Продаж за окно готовности: закрытые сделки финансов, а при ' +
            'пустых финансах — продажи эпизодов из снапшота прогноза.',
        type: Number,
        example: 12,
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
        description:
            'Причины текущего режима (для баннера): коды гейтов с их ' +
            'значением (history-months-below-3, presentations-below-60, ' +
            'norms-presentations-below-100), календарь и состав ' +
            '(calendar-not-imported, roster-not-confirmed), гипотеза ' +
            '(hypothesis-not-set), кап без модели портала (no-portal-model) ' +
            'и качество данных (data-quality-timestamp-leak).',
        type: [String],
        example: ['history-months-below-3', 'presentations-below-60'],
    })
    reasons: string[];

    @ApiProperty({
        description:
            'Связь «качество → исход»: none — не задана, hypothesis — ' +
            'гипотеза портала (ai_analytics_hypothesis), data — оценка по ' +
            'данным портала (гейт β пройден).',
        enum: AI_BETA_SOURCES,
        example: 'none',
    })
    betaSource: AiBetaSource;

    @ApiPropertyOptional({
        description:
            'Счётчик «до оценки β»; null — гейт уже пройден (betaSource = ' +
            'data), режим kpi-only либо считать не из чего.',
        type: AiBetaCountdownDto,
        nullable: true,
    })
    betaCountdown?: AiBetaCountdownDto | null;
}
