/**
 * Константы прогноза отдела Фазы 4 (план §4.8, §10 L4; поток B2b):
 * теневой журнал прогноза отдела (`department-forecast`, еженочно после
 * прогноза менеджеров) и бэктест точности (`forecast-backtest`, в месячном
 * ритме по закрытому месяцу и в догоне истории).
 *
 * Файл отдельный от `ai-portal-model.const.ts` и `ai-snapshot.const.ts`
 * (правило владения общими файлами §1.6 п. 3). Коды шагов, ритмы и причины
 * пропуска — `as const`, магических строк в шагах нет
 * (ai/rules/pbx-typing.md).
 */
import type { AiPipelineRhythm } from './ai-snapshot.const';

/** Код шага прогноза отдела (журнал дня в `ai-analytics-forecast-log`). */
export const AI_DEPARTMENT_FORECAST_STEP_CODE = 'department-forecast' as const;

/** Прогноз отдела считается каждую ночь — сразу после прогноза менеджеров. */
export const AI_DEPARTMENT_FORECAST_RHYTHMS = [
    'nightly',
] as const satisfies readonly AiPipelineRhythm[];

/** Код шага бэктеста прогноза отдела. */
export const AI_FORECAST_BACKTEST_STEP_CODE = 'forecast-backtest' as const;

/**
 * Бэктест — раз в месяц по закрытому месяцу (факт уже заморожен) и в
 * догоне истории: там ключ месяца джобы — тоже закрытый месяц.
 */
export const AI_FORECAST_BACKTEST_RHYTHMS = [
    'monthly',
    'backfill',
] as const satisfies readonly AiPipelineRhythm[];

/** Окно бэктеста: журналы 12 последних месяцев, включая закрытый. */
export const AI_FORECAST_BACKTEST_WINDOW_MONTHS = 12;

/** Простое среднее считается по трём последним замороженным месяцам. */
export const AI_FORECAST_MEAN_MONTHS = 3;

/** Причины пропуска шагов прогноза отдела (журнал прогона). */
export const AI_FORECAST_LOG_REASONS = {
    /** Ростер ОП пуст: считать нечего. */
    rosterEmpty: 'roster-empty',
    /** Прогнозов менеджеров за день нет ни в шине, ни в хранилище. */
    forecastDayMissing: 'forecast-day-missing',
    /** Журнала прогноза за закрытый месяц нет — сверять не с чем. */
    logMissing: 'forecast-log-missing',
    /** Месячных снапшотов менеджеров за закрытый месяц нет — факта нет. */
    actualMissing: 'forecast-actual-missing',
} as const;
export type AiForecastLogReason =
    (typeof AI_FORECAST_LOG_REASONS)[keyof typeof AI_FORECAST_LOG_REASONS];
