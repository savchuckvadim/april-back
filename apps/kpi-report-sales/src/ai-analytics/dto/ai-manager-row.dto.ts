import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    AI_ANALYTICS_BUCKETS,
    AiAnalyticsBucket,
} from '@lib/portal-lib/pbx/pbx-aicall-smart';
import {
    AI_ANALYTICS_ALERT_KINDS,
    AiAnalyticsAlertKind,
} from '../constants/ai-analytics.const';
import {
    AI_ANALYTICS_FUNNEL_EDGE_CODES,
    AI_ANALYTICS_FUNNEL_SHAPES,
    AI_ANALYTICS_LEVEL_SOURCES,
    AI_ANALYTICS_MANAGER_LEVELS,
    AI_ANALYTICS_PRIOR_SOURCES,
    AiAnalyticsFunnelEdgeCode,
    AiAnalyticsFunnelShape,
    AiAnalyticsLevelSource,
    AiAnalyticsManagerLevel,
    AiAnalyticsPriorSource,
} from '../constants/ai-overview.const';
import { AiAttentionItemDto } from './ai-attention.dto';
import { AiManagerTypeCellDto } from './ai-manager-type-cell.dto';
import { MetricDto } from './metric.dto';

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

/** Ребро воронки по KPI-фактам (Фаза 1b: без усадки, priorSource none). */
export class AiFunnelEdgeDto {
    @ApiProperty({
        description: 'Код ребра.',
        enum: AI_ANALYTICS_FUNNEL_EDGE_CODES,
        example: 'call_to_presentation',
    })
    edge: AiAnalyticsFunnelEdgeCode;

    @ApiProperty({
        description: 'Подпись ребра.',
        type: String,
        example: 'Звонок → презентация',
    })
    title: string;

    @ApiProperty({
        description: 'Вошло в ребро (знаменатель, факт самоотчёта).',
        type: Number,
        example: 120,
    })
    n: number;

    @ApiProperty({
        description: 'Перешло дальше (числитель).',
        type: Number,
        example: 23,
    })
    s: number;

    @ApiProperty({
        description:
            'Доля s/n (0..1) с интервалом Уилсона; s > n → confidence ' +
            'mixed-sources (числитель и знаменатель из разных событий).',
        type: MetricDto,
    })
    rate: MetricDto;

    @ApiPropertyOptional({
        description: 'Норма уровня (Фаза 2; сейчас не отдаётся).',
        type: Number,
        example: 0.25,
    })
    levelNorm?: number;

    @ApiProperty({
        description: 'Источник приора усадки: Фаза 1b — none.',
        enum: AI_ANALYTICS_PRIOR_SOURCES,
        example: 'none',
    })
    priorSource: AiAnalyticsPriorSource;
}

/** Открытые сделки от пороговой стадии и выше. */
export class AiPipelineDto {
    @ApiProperty({
        description: 'Число открытых сделок.',
        type: Number,
        example: 5,
    })
    count: number;

    @ApiProperty({
        description: 'Их месячный чек, в рублях.',
        type: Number,
        example: 152000,
    })
    monthlyAmount: number;
}

/** Финансовый хвост менеджера (ТЗ FR-40/41). */
export class AiFinanceTailDto {
    @ApiProperty({
        description:
            'Продаж: сделок sales_base в успехе по CLOSEDATE за период.',
        type: Number,
        example: 4,
    })
    salesCount: number;

    @ApiProperty({
        description: 'Аванс: сумма price × qty по товарным строкам.',
        type: Number,
        example: 380000,
    })
    advanceAmount: number;

    @ApiProperty({
        description: 'Месячный чек: сумма (сумма строки / эффективные месяцы).',
        type: Number,
        example: 47500,
    })
    monthlyAmount: number;

    @ApiProperty({
        description:
            'Пайплайн от стадии «Презентация» и выше (открытые сделки).',
        type: AiPipelineDto,
    })
    pipelineFromStage: AiPipelineDto;

    @ApiProperty({
        description:
            'Открытых сделок от стадии «Документы» и выше (стадийное ' +
            'определение sales-finance; событие hot — с Фазы 2).',
        type: Number,
        example: 2,
    })
    hotEvents: number;
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

/** Риск-звонок периода (риск-флаг разбора или срочный коучинг). */
export class AiRiskCallDto {
    @ApiProperty({ description: 'Id транскрипции.', type: String })
    transcriptionId: string;

    @ApiProperty({
        description: 'Вид сигнала.',
        enum: AI_ANALYTICS_ALERT_KINDS,
        example: 'promise',
    })
    kind: AiAnalyticsAlertKind;

    @ApiProperty({
        description: 'Начало звонка (ISO 8601).',
        type: String,
        example: '2026-09-03T10:15:00.000Z',
    })
    callStartedAt: string;
}

/** Доля «шаг с датой» за два последних окна периода (сигнал next_step_drop). */
export class AiNextStepRateDto {
    @ApiProperty({
        description: 'Окно, дней (по умолчанию 14).',
        type: Number,
        example: 14,
    })
    windowDays: number;

    @ApiProperty({
        description: 'Последнее окно периода: доля 0..1, n, Уилсон 90 %.',
        type: MetricDto,
    })
    current: MetricDto;

    @ApiProperty({
        description:
            'Предыдущее окно (может быть урезано началом периода → малое n).',
        type: MetricDto,
    })
    previous: MetricDto;
}

/** Рекомендация (Фаза 2; в Фазе 1b список всегда пуст). */
export class AiRecommendationDto {
    @ApiProperty({
        description:
            'Рычаг: volume | quality | checklist | pipeline | objection.',
        type: String,
        example: 'quality',
    })
    lever: string;

    @ApiPropertyOptional({
        description: 'AI-тип звонка.',
        type: String,
        example: 'presentation',
    })
    callType?: string;

    @ApiPropertyOptional({
        description: 'Раздел рубрики.',
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
        description: 'Ожидаемый прирост продаж.',
        type: Number,
        example: 0.4,
    })
    deltaSales?: number;

    @ApiProperty({
        description: 'Стоимость рекомендации.',
        type: Number,
        example: 1,
    })
    cost: number;

    @ApiProperty({
        description: 'Уровень доказательности: data | prior-only.',
        type: String,
        example: 'data',
    })
    evidence: string;

    @ApiProperty({
        description: 'Опоры.',
        type: [String],
        example: ['score=6.4'],
    })
    basis: string[];

    @ApiProperty({
        description: 'Код правила.',
        type: String,
        example: 'quality-weak-section',
    })
    ruleCode: string;
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
        description: 'Рекомендации (Фаза 2; сейчас пусто).',
        type: [AiRecommendationDto],
    })
    recommendations: AiRecommendationDto[];
}
