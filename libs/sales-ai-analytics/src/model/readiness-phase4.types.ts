/**
 * Словари, входы и гейты ступеней готовности Фазы 4 (`forecast` — L4,
 * `recommendations` — L5; план §4.11, §10). Правила перехода — в
 * `readiness-phase4.ts`; здесь только коды причин, формы входов и чтение
 * гейтов и флагов из реестра параметров.
 *
 * Чистые функции: без DI, `Date.now()` и `Math.random()`.
 */
import { registryDefault } from '../params/registry.access';
import type { ParamContext } from '../params/registry.types';
import { resolveNumberParam, resolveParam } from '../params/resolve';
import type {
    ForecastBacktestReason,
    ForecastBacktestStatus,
} from './forecast-backtest.types';
import type { AiReadinessMode } from './readiness';
import type {
    RecommendationGateReason,
    RecommendationGateStatus,
} from './recommendation-effect.types';

/** Коды причин ступеней L4/L5; к части кодов добавляется значение гейта. */
export const AI_READINESS_PHASE4_REASON_CODES = {
    /** Закрытых месяцев теневого прогноза меньше гейта (с числом в коде). */
    forecastShadowMonths: 'forecast-shadow-months-below',
    /** Проверке точности не хватает месяцев или дней. */
    forecastBacktestInsufficient: 'forecast-backtest-insufficient',
    /** Факт попадает в вилку реже цели. */
    forecastCoverage: 'forecast-coverage-outside',
    /** Прогноз ошибается не реже простых правил. */
    forecastMase: 'forecast-mase-not-below',
    /** Гейт L4 пройден, но показ прогноза выключен флагом портала. */
    forecastDisabled: 'forecast-stage-disabled',
    /** Журнала прогноза и проверки точности ещё нет. */
    forecastLogMissing: 'forecast-log-missing',
    /** Советы проверены, но ступень прогноза не пройдена. */
    recommendationsNeedsForecast: 'recommendations-needs-forecast',
    /** Советов с закрытым окном меньше гейта (с числом в коде). */
    recommendationsIssued: 'recommendations-issued-below',
    /**
     * Выданных советов меньше `n_min_none` — доли выполненных и несогласий
     * ещё не считаются (с числом в коде). Отдельно от закрытых окон: это
     * другой счётчик и другой порог.
     */
    recommendationsSharesIssued: 'recommendations-shares-issued-below',
    /** Доля выполненных советов ниже порога. */
    recommendationsDoneShare: 'recommendations-done-share-below',
    /** Доля несогласий с советами выше порога. */
    recommendationsDisagree: 'recommendations-disagree-above',
    /** Ни по одному шагу воронки нет улучшения «после» против «до». */
    recommendationsNoPositiveEdge: 'recommendations-no-positive-edge',
    /** Контроль подгонки под показатель поднял флаги. */
    recommendationsGoodhart: 'recommendations-goodhart-flags',
    /** Гейт L5 пройден, но показ эффекта выключен флагом портала. */
    recommendationsDisabled: 'recommendations-stage-disabled',
    /** Оценки эффекта советов ещё нет. */
    recommendationsEffectMissing: 'recommendations-effect-missing',
} as const;
export type AiReadinessPhase4ReasonCode =
    (typeof AI_READINESS_PHASE4_REASON_CODES)[keyof typeof AI_READINESS_PHASE4_REASON_CODES];

/** Причина с гейтом в коде: `forecast-shadow-months-below-9`. */
export function readinessStageReason(
    code: AiReadinessPhase4ReasonCode,
    gate?: number,
): string {
    return gate === undefined ? code : `${code}-${gate}`;
}

/** Режимы, с которых рассматривается ступень «прогноз». */
export const AI_READINESS_FORECAST_BASE_MODES = [
    'norms',
    'hypothesis',
] as const satisfies readonly AiReadinessMode[];

/** Итог проверки точности прогноза — вход ступени L4. */
export interface ReadinessForecastBacktestFacts {
    readonly status: ForecastBacktestStatus;
    readonly reasons: readonly ForecastBacktestReason[];
}

/** Вход ступени «прогноз» (L4). */
export interface ReadinessForecastStage {
    /** Флаг портала `forecast_stage_enabled`. */
    readonly stageEnabled: boolean;
    /** Закрытых месяцев теневого прогноза с фактом. */
    readonly shadowMonths: number;
    /** Проверка точности; null — журнала и проверки ещё нет. */
    readonly backtest: ReadinessForecastBacktestFacts | null;
}

/** Итог оценки эффекта советов — вход ступени L5. */
export interface ReadinessRecommendationsEffectFacts {
    readonly status: RecommendationGateStatus;
    readonly reasons: readonly RecommendationGateReason[];
    /** Применённый гейт советов с закрытым окном; нет — из реестра. */
    readonly minIssued?: number;
    /** Применённый минимум выданных для долей; нет — из реестра. */
    readonly minN?: number;
}

/** Вход ступени «рекомендации» (L5). */
export interface ReadinessRecommendationsStage {
    /** Флаг портала `recommendations_stage_enabled`. */
    readonly stageEnabled: boolean;
    /** Оценка эффекта; null — снапшота ещё нет. */
    readonly effect: ReadinessRecommendationsEffectFacts | null;
}

/**
 * Входы ступеней. Ступень не задана (undefined/null) — вызывающий про неё
 * не знает, и режим выше базового не поднимается.
 */
export interface ReadinessStages {
    readonly forecast?: ReadinessForecastStage | null;
    readonly recommendations?: ReadinessRecommendationsStage | null;
}

/** Гейты ступеней; значения — из реестра параметров. */
export interface ReadinessStageGates {
    /** `forecast_shadow_min_months`. */
    readonly forecastShadowMonths: number;
    /** `recommendations_min_issued`. */
    readonly recommendationsMinIssued: number;
    /** `n_min_none` — ниже доли советов наружу не отдаются. */
    readonly recommendationsMinN: number;
}

/** Дефолты гейтов ступеней из реестра. */
export const AI_READINESS_STAGE_GATE_DEFAULTS: ReadinessStageGates = {
    forecastShadowMonths: registryDefault('forecast_shadow_min_months'),
    recommendationsMinIssued: registryDefault('recommendations_min_issued'),
    recommendationsMinN: registryDefault('n_min_none'),
};

/** Гейты ступеней по контексту реестра портала. */
export function readinessStageGatesOf(
    ctx: ParamContext = {},
): ReadinessStageGates {
    const defaults = AI_READINESS_STAGE_GATE_DEFAULTS;

    return {
        forecastShadowMonths:
            resolveNumberParam('forecast_shadow_min_months', ctx) ??
            defaults.forecastShadowMonths,
        recommendationsMinIssued:
            resolveNumberParam('recommendations_min_issued', ctx) ??
            defaults.recommendationsMinIssued,
        recommendationsMinN:
            resolveNumberParam('n_min_none', ctx) ??
            defaults.recommendationsMinN,
    };
}

/** Флаги включения ступеней портала. */
export interface ReadinessStageFlags {
    readonly forecast: boolean;
    readonly recommendations: boolean;
}

/** Флаги ступеней по контексту реестра портала (дефолт — выключены). */
export function readinessStageFlagsOf(
    ctx: ParamContext = {},
): ReadinessStageFlags {
    return {
        forecast: resolveParam('forecast_stage_enabled', ctx).value === true,
        recommendations:
            resolveParam('recommendations_stage_enabled', ctx).value === true,
    };
}
