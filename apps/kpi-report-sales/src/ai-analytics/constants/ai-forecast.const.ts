/**
 * Ручка прогноза отдела `POST ai-analytics/forecast` (Фаза 4, план §4.8,
 * §10 L4; поток B3): маршрут, режимы показа и коды причин «почему вилка
 * не показана». Журнал и бэктест пишет конвейер (коды шагов — в
 * `ai-forecast-log.const.ts`); здесь только поверхность витрины.
 *
 * Коды причин — те же, что у готовности Фазы 4: источник один,
 * `AI_READINESS_PHASE4_REASON_CODES` библиотеки (волна B, решение «Коды
 * причин Фазы 4»); подписи по-русски делает фронт (ai/rules/pbx-typing.md).
 */
import {
    AI_READINESS_PHASE4_REASON_CODES,
    type ForecastBacktestReason,
    type LognormalCheckSource,
    readinessStageReason,
} from '@lib/sales-ai-analytics';
import type { AiAnalyticsReadinessMode } from './ai-analytics.const';

const CODES = AI_READINESS_PHASE4_REASON_CODES;

/** Маршрут ручки под префиксом `ai-analytics`. */
export const AI_FORECAST_ROUTE = 'forecast' as const;

/**
 * Режим показа прогноза: shadow — вилка считается, но наружу не
 * отдаётся (идёт проверка на истории или ступень не включена);
 * published — гейт пройден и ступень включена флагом портала.
 */
export const AI_FORECAST_MODES = ['shadow', 'published'] as const;
export type AiForecastMode = (typeof AI_FORECAST_MODES)[number];

/**
 * Источники чека вилки в деньгах — те же, что `AI_LOGNORMAL_CHECK_SOURCES`
 * библиотеки (равенство закреплено спекой презентера). Свой список, а не
 * импорт значения: иначе поверхность ручки тянула бы файл чека с кодами
 * реестра, которые «Как считаем» прогноза не показывает.
 */
export const AI_FORECAST_CHECK_SOURCES = [
    'default',
    'estimated',
    'shrunk',
] as const satisfies readonly LognormalCheckSource[];

/** Причины режима shadow (плоские коды). */
export const AI_FORECAST_REASONS = {
    /**
     * Гейт пройден, но ступень «прогноз» выключена флагом портала
     * `forecast_stage_enabled` (при непройденном гейте не ставится).
     */
    stageDisabled: CODES.forecastDisabled,
    /**
     * Прогноз ещё не начал копиться: нет ни проверки точности, ни журнала
     * за текущий месяц (тот же смысл, что у готовности Фазы 4).
     */
    logMissing: CODES.forecastLogMissing,
    /** Проверки точности нет или данных для неё мало. */
    backtestInsufficient: CODES.forecastBacktestInsufficient,
    /** Факт попадает в вилку реже цели. */
    coverageOutside: CODES.forecastCoverage,
    /** Прогноз не точнее простых («по темпу с начала месяца», «среднее за три»). */
    maseNotBelow: CODES.forecastMase,
    /**
     * Гейт L4 пройден и ступень включена, но итоговый режим готовности
     * портала ниже «прогноза» (базовая готовность упала: нет модели
     * портала, календаря, подтверждения состава). Код только этой ручки —
     * у готовности свои причины базовой ступени, баннер показывает их.
     */
    readinessBelow: 'forecast-readiness-below',
} as const;
export type AiForecastFlatReason =
    (typeof AI_FORECAST_REASONS)[keyof typeof AI_FORECAST_REASONS];

/**
 * Код причины «мало теневых месяцев» с порогом:
 * `forecast-shadow-months-below-{N}` (N — `forecast_shadow_min_months`).
 */
export function forecastShadowMonthsReason(minMonths: number): string {
    return readinessStageReason(CODES.forecastShadowMonths, minMonths);
}

/**
 * Режимы готовности, при которых вилку можно показывать: ступень
 * «прогноз» и выше (`elevateReadiness` поднимает до них только с базовых
 * «нормы»/«гипотеза»).
 */
export const AI_FORECAST_PUBLISH_READINESS_MODES = [
    'forecast',
    'recommendations',
] as const satisfies readonly AiAnalyticsReadinessMode[];

/** Причина бэктеста библиотеки → причина режима витрины. */
export const AI_FORECAST_BACKTEST_REASON_MAP = {
    'not-enough-months': AI_FORECAST_REASONS.backtestInsufficient,
    'no-days': AI_FORECAST_REASONS.backtestInsufficient,
    'coverage-below': AI_FORECAST_REASONS.coverageOutside,
    'mase-naive': AI_FORECAST_REASONS.maseNotBelow,
    'mase-mean3': AI_FORECAST_REASONS.maseNotBelow,
    'mase-undefined': AI_FORECAST_REASONS.maseNotBelow,
} as const satisfies Record<ForecastBacktestReason, AiForecastFlatReason>;
