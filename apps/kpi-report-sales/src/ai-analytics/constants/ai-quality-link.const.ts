/**
 * Константы шага «связь качества с результатом» (план `ai-sales-analytics`
 * §4.4, §4.11; Фаза 4, П15/П20): код и ритмы шага `quality-link`, окно
 * выборки звонков, причины пропуска, префикс шкал разделов в отчёте
 * согласия и ребро оффсета портал×месяц.
 *
 * Свой файл констант среза — правило владения общими файлами §1.6 п. 3.
 * Магических строк кодов, причин и рёбер в коде среза нет
 * (ai/rules/pbx-typing.md).
 */
import type { AiAnalyticsEdgeViewCode } from '@lib/sales-ai-analytics';
import { AI_PORTAL_MODEL_WINDOW_MONTHS } from './ai-portal-model.const';
import type { AiPipelineRhythm } from './ai-snapshot.const';

/** Код шага конвейера (уникален в массиве шагов). */
export const AI_QUALITY_LINK_STEP_CODE = 'quality-link' as const;

/**
 * Оценка β — месячная: идёт в заморозке закрытого месяца и в догоне истории
 * после `stage-history` (эпизоды из шины) и до `pool`/`portal-model`
 * (они читают результат из шины `qualityLink`).
 */
export const AI_QUALITY_LINK_STEP_RHYTHMS = [
    'monthly',
    'backfill',
] as const satisfies readonly AiPipelineRhythm[];

/** Окно выборки звонков — то же, что у модели портала (12 месяцев). */
export const AI_QUALITY_LINK_WINDOW_MONTHS = AI_PORTAL_MODEL_WINDOW_MONTHS;

/**
 * Причины ПРОПУСКА шага. Нехватка данных пропуском не считается: шаг
 * пишет снапшот со статусом `insufficient` и причиной из
 * `AI_QUALITY_LINK_REASONS` библиотеки — серия гейта обнуляется, причина
 * доходит до витрины.
 */
export const AI_QUALITY_LINK_SKIP_REASONS = {
    rosterEmpty: 'quality-link-roster-empty',
    /**
     * Шаг истории стадий в этом прогоне не запускался (белый список джобы
     * без него): «нет эпизодов» здесь не значит «нет истории», и запись
     * `insufficient` затёрла бы настоящую оценку месяца.
     */
    stageHistoryMissing: 'quality-link-stage-history-missing',
} as const;
export type AiQualityLinkSkipReason =
    (typeof AI_QUALITY_LINK_SKIP_REASONS)[keyof typeof AI_QUALITY_LINK_SKIP_REASONS];

/**
 * Префикс шкалы раздела в отчёте согласия оценщика (`golden-report`):
 * шкала `section_<CODE>` — ICC повторного разбора по разделу. Дубль
 * `RETEST_SECTION_SCALE_PREFIX` приложения event-sales: приложения друг
 * друга не импортируют, литерал сверяется спекой шага.
 */
export const AI_QUALITY_LINK_SECTION_SCALE_PREFIX = 'section_' as const;

/**
 * Ребро оффсета портал×месяц: «презентация → КП» модели портала
 * (логит его нормы μ — сдвиг `offset_i` модели β, план §4.4).
 */
export const AI_QUALITY_LINK_OFFSET_EDGE: AiAnalyticsEdgeViewCode =
    'presentation_to_offer';
