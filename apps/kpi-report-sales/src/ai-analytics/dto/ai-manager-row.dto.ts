import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    AI_ANALYTICS_BUCKETS,
    AiAnalyticsBucket,
} from '@lib/portal-lib/pbx/pbx-aicall-smart';
import {
    AI_ANALYTICS_FUNNEL_SHAPES,
    AI_ANALYTICS_LEVEL_SOURCES,
    AI_ANALYTICS_MANAGER_LEVELS,
    AiAnalyticsFunnelShape,
    AiAnalyticsLevelSource,
    AiAnalyticsManagerLevel,
} from '../constants/ai-overview.const';
import { AiAttentionItemDto } from './ai-attention.dto';
import { AiFinanceTailDto } from './ai-finance-tail.dto';
import { AiFunnelEdgeDto } from './ai-funnel-edge.dto';
import { AiManagerTypeCellDto } from './ai-manager-type-cell.dto';
import { AiNextStepRateDto, AiRiskCallDto } from './ai-manager-signals.dto';
import { AiRecommendationDto } from './ai-recommendation.dto';
import { AiStyleProfileDto } from './ai-style-profile.dto';
import { MetricDto } from './metric.dto';

// Финансовый хвост вынесен в ai-finance-tail.dto.ts (v2, «≤ 300 строк»);
// реэкспорт сохраняет импорты соседних DTO (ai-by-type.dto).
export {
    AiFinanceTailDto,
    AiHotByColorDto,
    AiPipelineByContractTypeDto,
    AiPipelineByTermDto,
    AiPipelineDto,
} from './ai-finance-tail.dto';

// Ребро воронки, рекомендации, профиль стиля и сигнальные части строки —
// в своих файлах (Фаза 2 их расширила, «≤ 300 строк»); реэкспорт
// сохраняет прежние импорты соседей.
export { AiFunnelEdgeDto } from './ai-funnel-edge.dto';
export { AiNextStepRateDto, AiRiskCallDto } from './ai-manager-signals.dto';
export { AiRecommendationDto } from './ai-recommendation.dto';
export { AiStyleProfileDto, AiStyleTagDto } from './ai-style-profile.dto';

/** Оценка корзины за период (контакт / презентация / закрытие). */
export class AiBucketScoreDto {
    @ApiProperty({
        description: 'Корзина типов звонков.',
        enum: AI_ANALYTICS_BUCKETS,
        example: 'contact',
    })
    bucket: AiAnalyticsBucket;

    @ApiProperty({
        description: 'Оценок в корзине.',
        type: Number,
        example: 25,
    })
    n: number;

    @ApiProperty({
        description: 'Среднее 1–10 при n ≥ 8, иначе value = null.',
        type: MetricDto,
    })
    score: MetricDto;
}

/** План CRM: запланировано / сделано за период (самоотчёт). */
export class AiDisciplineDto {
    @ApiProperty({
        description: 'Звонков запланировано (call_plan).',
        type: Number,
        example: 40,
    })
    callPlan: number;

    @ApiProperty({
        description: 'Звонков сделано (call_done).',
        type: Number,
        example: 33,
    })
    callDone: number;

    @ApiProperty({
        description: 'Презентаций запланировано (presentation_plan).',
        type: Number,
        example: 12,
    })
    presentationPlan: number;

    @ApiProperty({
        description: 'Презентаций сделано (presentation_done).',
        type: Number,
        example: 10,
    })
    presentationDone: number;
}

/** Строка менеджера в обзоре (план 6.3, ТЗ FR-13/14). */
export class AiManagerRowDto {
    @ApiProperty({ description: 'Bitrix-id менеджера.', type: String })
    managerId: string;

    @ApiProperty({
        description: 'Id отдела продаж по структуре; null — вне ростера.',
        type: Number,
        nullable: true,
        example: 37,
    })
    departmentId: number | null;

    @ApiProperty({
        description: 'Id группы внутри ОП; null — группы нет.',
        type: Number,
        nullable: true,
        example: 41,
    })
    groupId: number | null;

    @ApiProperty({
        description:
            'Уровень: manual — назначен РОПом (settings/save), default — ' +
            'по стажу (< 6 мес. junior, иначе middle).',
        enum: AI_ANALYTICS_MANAGER_LEVELS,
        example: 'middle',
    })
    level: AiAnalyticsManagerLevel;

    @ApiProperty({
        description: 'Источник уровня.',
        enum: AI_ANALYTICS_LEVEL_SOURCES,
        example: 'default',
    })
    levelSource: AiAnalyticsLevelSource;

    @ApiProperty({
        description:
            'Стаж, месяцев, от since уровня; null — дата стажа не задана ' +
            '(DATE_REGISTER Bitrix — Фаза 2).',
        type: Number,
        nullable: true,
        example: 14,
    })
    tenureMonths: number | null;

    @ApiProperty({
        description: 'Рабочих дней периода по календарю портала.',
        type: Number,
        example: 20,
    })
    workdays: number;

    @ApiProperty({
        description: 'Старшая карточка «Внимания» менеджера; null — нет.',
        type: AiAttentionItemDto,
        nullable: true,
    })
    signal: AiAttentionItemDto | null;

    @ApiProperty({
        description:
            'Ключевая цифра: оценка качества за период по звонкам с корзиной ' +
            '(1–10; план руководителя по дням — Фаза 2).',
        type: MetricDto,
    })
    keyMetric: MetricDto;

    @ApiProperty({
        description:
            'Форма воронки по доле счетов без презентации при не менее 20 ' +
            'счетов: closer ≥ 50 %, presenter ≤ 20 %, иначе balanced; ' +
            'unknown — мало счетов.',
        enum: AI_ANALYTICS_FUNNEL_SHAPES,
        example: 'balanced',
    })
    funnelShape: AiAnalyticsFunnelShape;

    @ApiProperty({
        description: 'Три корзины оценок.',
        type: [AiBucketScoreDto],
    })
    buckets: AiBucketScoreDto[];

    @ApiProperty({
        description: 'Ячейки по типам звонков в порядке справочника.',
        type: [AiManagerTypeCellDto],
    })
    byType: AiManagerTypeCellDto[];

    @ApiProperty({
        description: 'Рёбра воронки по KPI-фактам.',
        type: [AiFunnelEdgeDto],
    })
    funnel: AiFunnelEdgeDto[];

    @ApiProperty({ description: 'Финансовый хвост.', type: AiFinanceTailDto })
    finance: AiFinanceTailDto;

    @ApiProperty({ description: 'План CRM.', type: AiDisciplineDto })
    discipline: AiDisciplineDto;

    @ApiProperty({
        description:
            'Звонков менеджера в телефонии за период (включая без разбора).',
        type: Number,
        example: 140,
    })
    callsTotal: number;

    @ApiProperty({
        description: 'Разобранных сравнимых звонков менеджера за период.',
        type: Number,
        example: 62,
    })
    analyzedCalls: number;

    @ApiProperty({
        description: 'Доля «шаг с датой» за два окна периода.',
        type: AiNextStepRateDto,
    })
    nextStepRate: AiNextStepRateDto;

    @ApiProperty({
        description: 'Риск-звонки периода.',
        type: [AiRiskCallDto],
    })
    riskCalls: AiRiskCallDto[];

    @ApiProperty({
        description:
            'Топ-3 рычага из дневного снапшота прогноза; пусто — модели ' +
            'портала нет либо разборов меньше порога n_min_none (8).',
        type: [AiRecommendationDto],
    })
    recommendations: AiRecommendationDto[];

    @ApiPropertyOptional({
        description:
            'Профиль стиля из снапшота ai-analytics-style; null — разборов ' +
            'меньше style_min_calls (40) либо коллег для сравнения мало.',
        type: AiStyleProfileDto,
        nullable: true,
    })
    style?: AiStyleProfileDto | null;

    @ApiPropertyOptional({
        description:
            'Дата начала стажа YYYY-MM-DD (since уровня; каскад ' +
            'UF_EMPLOYMENT_DATE → DATE_REGISTER приезжает из паспорта ' +
            'конвейера); нет — дата не задана.',
        type: String,
        example: '2025-04-01',
    })
    since?: string;
}
