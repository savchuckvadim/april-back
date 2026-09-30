/**
 * Типы rolling-origin бэктеста прогноза отдела (план §10 L4, §4.11
 * «калибровочный контур»; Фаза 4, поток `p4-forecast-model`).
 */

/** Статус гейта L4. */
export const AI_FORECAST_BACKTEST_STATUSES = [
    'pass',
    'fail',
    'insufficient',
] as const;

export type ForecastBacktestStatus =
    (typeof AI_FORECAST_BACKTEST_STATUSES)[number];

/** Почему гейт не пройден или не рассматривался. */
export const AI_FORECAST_BACKTEST_REASONS = [
    /** Закрытых месяцев с фактом меньше `forecast_backtest_min_months`. */
    'not-enough-months',
    /** В месяцах нет ни одного дня-origin. */
    'no-days',
    /** Интервал Уилсона покрытия целиком ниже цели. */
    'coverage-below',
    /** Верхняя граница CI90 MASE против наивного прогноза ≥ порога. */
    'mase-naive',
    /** Верхняя граница CI90 MASE против среднего за три месяца ≥ порога. */
    'mase-mean3',
    /** Ошибка эталона равна нулю или дней нет — MASE не определён. */
    'mase-undefined',
] as const;

export type ForecastBacktestReason =
    (typeof AI_FORECAST_BACKTEST_REASONS)[number];

/** Корзины положения факта относительно вилки — PIT-гистограмма. */
export const AI_FORECAST_PIT_BINS = [
    'below-low',
    'low-to-p50',
    'p50-to-high',
    'above-high',
] as const;

export type ForecastPitBin = (typeof AI_FORECAST_PIT_BINS)[number];

/** Прогноз, сделанный в день-origin, для месяца этого дня. */
export interface ForecastBacktestDay {
    /** День 'YYYY-MM-DD'. */
    readonly day: string;
    readonly low: number;
    readonly p50: number;
    readonly high: number;
    /**
     * Наивная база из `forecastP50`: темп с начала месяца, растянутый на
     * месяц; при `daysElapsed = 0` — факт прошлого месяца.
     */
    readonly naive: number;
    /** Среднее фактов трёх предыдущих месяцев. */
    readonly mean3: number;
    /** `Y₀` на день-origin. */
    readonly done: number;
}

/** Закрытый месяц с фактом и дневными прогнозами. */
export interface ForecastBacktestMonth {
    /** Месяц 'YYYY-MM'. */
    readonly monthKey: string;
    /** Факт продаж месяца по итогам. */
    readonly actual: number;
    readonly days: readonly ForecastBacktestDay[];
}

/** Вход бэктеста. */
export interface ForecastBacktestInput {
    readonly months: readonly ForecastBacktestMonth[];
    /** Seed блочного бутстрапа (`seedOf(domain, monthKey, calcVersion)`). */
    readonly seed: number;
    /** По умолчанию `forecast_backtest_min_months`. */
    readonly minMonths?: number;
    /** По умолчанию `forecast_coverage_target`. */
    readonly coverageTarget?: number;
    /** По умолчанию `forecast_mase_max`. */
    readonly maseMax?: number;
    /** Уровень вилки; по умолчанию `forecast_interval_level`. */
    readonly level?: number;
    /** Розыгрышей блочного бутстрапа; 0 — гейт MASE по точечной оценке. */
    readonly bootstrapDraws?: number;
    /** Длина блока подряд идущих месяцев в бутстрапе. */
    readonly blockMonths?: number;
    /** Квантиль интервалов (Уилсон, бутстрап); по умолчанию `z_compare`. */
    readonly z?: number;
}

/** Покрытие вилки по дням. */
export interface ForecastCoverage {
    /** Доля дней с `low ≤ actual ≤ high`. */
    readonly share: number;
    readonly covered: number;
    readonly days: number;
    /** Интервал Уилсона доли. */
    readonly ci90: readonly [number, number];
    readonly target: number;
}

/** MASE против одного эталона. */
export interface ForecastMase {
    /** `mean|p50 − actual| / mean|эталон − actual|`; null — эталон без ошибки. */
    readonly value: number | null;
    /** Блочный бутстрап по месяцам: квантили 5 % и 95 %; null — не считался. */
    readonly ci90: readonly [number, number] | null;
    readonly draws: number;
}

/** Средние абсолютные ошибки по всем дням. */
export interface ForecastErrors {
    readonly p50: number;
    readonly naive: number;
    readonly mean3: number;
}

/** Pinball loss по квантилям вилки. */
export interface ForecastPinball {
    /** По нижнему квантилю `τ = (1 − level)/2`. */
    readonly low: number;
    /** По верхнему квантилю `τ = 1 − (1 − level)/2`. */
    readonly high: number;
    /** Среднее двух. */
    readonly mean: number;
}

/** Корзина PIT-гистограммы. */
export interface ForecastPitBucket {
    readonly code: ForecastPitBin;
    readonly days: number;
    readonly share: number;
    /** Ожидаемая доля при калиброванной вилке. */
    readonly expected: number;
}

/** PIT по дням: доля факта ниже P50 и корзины для графика. */
export interface ForecastPit {
    /** Доля дней с `actual < p50`; у калиброванного центра ≈ 0,5. */
    readonly belowP50Share: number;
    readonly bins: readonly ForecastPitBucket[];
}

/** Результат бэктеста — все числа гейта L4 и причины. */
export interface ForecastBacktest {
    readonly status: ForecastBacktestStatus;
    readonly reasons: readonly ForecastBacktestReason[];
    /** Месяцы бэктеста в порядке ключей. */
    readonly months: readonly string[];
    readonly days: number;
    readonly level: number;
    readonly coverage: ForecastCoverage;
    readonly errors: ForecastErrors;
    readonly mase: {
        readonly naive: ForecastMase;
        readonly mean3: ForecastMase;
        readonly max: number;
    };
    readonly pinball: ForecastPinball;
    readonly pit: ForecastPit;
}
