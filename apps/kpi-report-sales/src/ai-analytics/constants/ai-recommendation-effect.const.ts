/**
 * Константы журнала советов и их эффекта Фазы 4 (план §4.10, §10 L5;
 * поток B2b): шаг журнала выдачи (`recommendation-log`, еженочно после
 * прогноза) и месячный шаг эффекта (`recommendation-effect`).
 *
 * Файл отдельный от общих констант (правило владения §1.6 п. 3). Коды
 * шагов, ритмы, причины пропуска и рёбра «до/после» — `as const`,
 * магических строк в шагах нет (ai/rules/pbx-typing.md).
 */
import type { AiAnalyticsFeedbackKind } from '@lib/sales-ai-analytics';
import type { AiAnalyticsFunnelEdgeCode } from './ai-overview.const';
import type { AiPipelineRhythm } from './ai-snapshot.const';

/** Код шага журнала выдачи советов. */
export const AI_RECOMMENDATION_LOG_STEP_CODE = 'recommendation-log' as const;

/** Советы пересчитываются каждую ночь вместе с прогнозом — журнал тоже. */
export const AI_RECOMMENDATION_LOG_RHYTHMS = [
    'nightly',
] as const satisfies readonly AiPipelineRhythm[];

/** Код шага эффекта советов. */
export const AI_RECOMMENDATION_EFFECT_STEP_CODE =
    'recommendation-effect' as const;

/** Эффект — по закрытым месяцам: в месячном ритме и в догоне истории. */
export const AI_RECOMMENDATION_EFFECT_RHYTHMS = [
    'monthly',
    'backfill',
] as const satisfies readonly AiPipelineRhythm[];

/**
 * Рёбра «до/после» (план §10 L5): доля КП после презентаций и доля счетов
 * после КП из месячных снапшотов менеджеров. Коды — из справочника рёбер
 * витрины (`AI_ANALYTICS_FUNNEL_EDGES`), проверяются типом.
 */
export const AI_RECOMMENDATION_EFFECT_EDGES = [
    'presentation_to_offer',
    'offer_to_invoice',
] as const satisfies readonly AiAnalyticsFunnelEdgeCode[];

/** Сколько последних недель трендов смотреть за флагами Гудхарта. */
export const AI_RECOMMENDATION_GOODHART_WEEKS = 6;

/**
 * Запас по времени создания записей журнала, дни: ночной прогон пишет по
 * часам портала, а `created_at` — в UTC, поэтому окно месяца расширяется
 * на сутки с обеих сторон и дальше режется по месяцу из нагрузки.
 */
export const AI_RECOMMENDATION_LOG_SLACK_DAYS = 1;

/** Причины пропуска шагов журнала и эффекта советов. */
export const AI_RECOMMENDATION_REASONS = {
    /** Ростер ОП пуст: считать нечего. */
    rosterEmpty: 'roster-empty',
    /** Прогнозов менеджеров за день нет ни в шине, ни в хранилище. */
    forecastDayMissing: 'forecast-day-missing',
    /** За месяц выдачи советов в журнале нет — эффект не из чего считать. */
    noIssued: 'recommendations-none-issued',
} as const;
export type AiRecommendationReason =
    (typeof AI_RECOMMENDATION_REASONS)[keyof typeof AI_RECOMMENDATION_REASONS];

/**
 * Виды записей обратной связи, из которых складывается журнал советов:
 * выдача (пишет конвейер), «Сделано» (кнопка пользователя) и несогласие
 * с советом (объект `lever:…`).
 */
export const AI_RECOMMENDATION_FEEDBACK_KINDS = {
    issued: 'recommendation_issued',
    done: 'recommendation_done',
    disagree: 'disagree',
} as const satisfies Record<string, AiAnalyticsFeedbackKind>;
