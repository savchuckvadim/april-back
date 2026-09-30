/**
 * Rolling-origin бэктест прогноза отдела на дневном ряду — гейт L4
 * (план §10: «coverage с биномиальным 90 %-интервалом, накрывающим 0,8;
 * MASE с бутстрап-интервалом ниже 1 vs naive/среднее-3»; §4.11
 * «rolling-origin бэктест (MASE, coverage, pinball)»; Фаза 4, поток
 * `p4-forecast-model`). Образец структуры — `norms-backtest.ts`.
 *
 * Каждый день закрытого месяца — точка отсчёта: прогноз, сделанный в этот
 * день, сравнивается с фактом месяца. Ошибки копятся по всем дням всех
 * месяцев; CI90 MASE — блочный бутстрап по месяцам (блоки подряд идущих
 * месяцев, `mulberry32(seed)`, см. `forecast-backtest.mase.ts`), покрытие —
 * Уилсон, pinball — по двум квантилям вилки, PIT — корзины положения
 * факта относительно вилки.
 *
 * Гейт мягкий: `fail` — не баг, а невыполнение L4 на данных;
 * `insufficient` — мало закрытых месяцев.
 *
 * Чистая математика: без DI, Bitrix, Prisma, `Date.now`/`Math.random`.
 */
import { registryDefault } from '../params/registry.access';
import {
    bootInterval,
    bootstrapMase,
    errorSums,
    maseOf,
    originDaysOf,
    type MaseReference,
    type OriginDay,
} from './forecast-backtest.mase';
import type {
    ForecastBacktest,
    ForecastBacktestInput,
    ForecastBacktestMonth,
    ForecastBacktestReason,
    ForecastMase,
    ForecastPit,
    ForecastPitBin,
} from './forecast-backtest.types';
import { AI_FORECAST_PIT_BINS } from './forecast-backtest.types';
import { mulberry32 } from './prng';
import { AI_ANALYTICS_THRESHOLDS } from './thresholds.const';
import { wilsonInterval } from './wilson';

/** Дефолты бэктеста из реестра и константы процедуры. */
export const FORECAST_BACKTEST_DEFAULTS = {
    /** `forecast_backtest_min_months`. */
    minMonths: registryDefault('forecast_backtest_min_months'),
    /** `forecast_coverage_target`. */
    coverageTarget: registryDefault('forecast_coverage_target'),
    /** `forecast_mase_max`. */
    maseMax: registryDefault('forecast_mase_max'),
    /** `forecast_interval_level`. */
    level: registryDefault('forecast_interval_level'),
    /** Розыгрышей блочного бутстрапа — константа процедуры. */
    bootstrapDraws: 500,
    /** Длина блока месяцев — константа процедуры (квартал). */
    blockMonths: 3,
} as const;

const finite = (value: number): number => (Number.isFinite(value) ? value : 0);

const mean = (values: readonly number[]): number =>
    values.length === 0
        ? 0
        : values.reduce((sum, value) => sum + value, 0) / values.length;

/** Месяцы в порядке ключей, дни — в порядке дат; невалидные дни отброшены. */
function orderedMonths(
    months: readonly ForecastBacktestMonth[],
): ForecastBacktestMonth[] {
    return [...months]
        .filter(month => Number.isFinite(month.actual))
        .sort((a, b) => a.monthKey.localeCompare(b.monthKey))
        .map(month => ({
            ...month,
            days: [...month.days]
                .filter(day =>
                    [day.low, day.p50, day.high, day.naive, day.mean3].every(
                        Number.isFinite,
                    ),
                )
                .sort((a, b) => a.day.localeCompare(b.day)),
        }));
}

/** Pinball loss `ρ_τ(u) = u·(τ − 1[u < 0])`, `u = actual − quantile`. */
const pinballLoss = (actual: number, quantile: number, tau: number): number => {
    const u = actual - quantile;

    return u >= 0 ? tau * u : (tau - 1) * u;
};

const pitBinOf = (day: OriginDay): ForecastPitBin => {
    if (day.actual < day.low) return 'below-low';
    if (day.actual < day.p50) return 'low-to-p50';
    if (day.actual <= day.high) return 'p50-to-high';

    return 'above-high';
};

/** PIT-корзины и доля факта ниже P50. */
function pitOf(days: readonly OriginDay[], level: number): ForecastPit {
    const tail = (1 - level) / 2;
    const expected: Record<ForecastPitBin, number> = {
        'below-low': tail,
        'low-to-p50': level / 2,
        'p50-to-high': level / 2,
        'above-high': tail,
    };
    const counts: Record<ForecastPitBin, number> = {
        'below-low': 0,
        'low-to-p50': 0,
        'p50-to-high': 0,
        'above-high': 0,
    };
    let belowP50 = 0;
    for (const day of days) {
        counts[pitBinOf(day)] += 1;
        if (day.actual < day.p50) belowP50 += 1;
    }
    const total = Math.max(1, days.length);

    return {
        belowP50Share: days.length === 0 ? 0 : belowP50 / total,
        bins: AI_FORECAST_PIT_BINS.map(code => ({
            code,
            days: counts[code],
            share: days.length === 0 ? 0 : counts[code] / total,
            expected: expected[code],
        })),
    };
}

/**
 * Rolling-origin бэктест прогноза отдела — все числа гейта L4 и причины.
 * `pass`: интервал Уилсона покрытия накрывает цель или целиком выше неё
 * **и** верхние границы CI90 MASE против обоих эталонов ниже порога
 * (при `bootstrapDraws = 0` вместо верха CI90 сравнивается точечный MASE).
 */
export function backtestForecast(
    input: ForecastBacktestInput,
): ForecastBacktest {
    const minMonths = input.minMonths ?? FORECAST_BACKTEST_DEFAULTS.minMonths;
    const target =
        input.coverageTarget ?? FORECAST_BACKTEST_DEFAULTS.coverageTarget;
    const maseMax = input.maseMax ?? FORECAST_BACKTEST_DEFAULTS.maseMax;
    const level = Math.min(
        1,
        Math.max(0, input.level ?? FORECAST_BACKTEST_DEFAULTS.level),
    );
    const draws = Math.max(
        0,
        Math.floor(
            finite(
                input.bootstrapDraws ??
                    FORECAST_BACKTEST_DEFAULTS.bootstrapDraws,
            ),
        ),
    );
    const blockMonths = Math.max(
        1,
        Math.floor(
            finite(input.blockMonths ?? FORECAST_BACKTEST_DEFAULTS.blockMonths),
        ),
    );
    const z = input.z ?? AI_ANALYTICS_THRESHOLDS.z90;
    const months = orderedMonths(input.months);
    const days = months.flatMap(originDaysOf);
    const sums = errorSums(days);
    const covered = days.filter(
        day => day.low <= day.actual && day.actual <= day.high,
    ).length;
    const ci90 = wilsonInterval(covered, days.length, z);
    const tail = (1 - level) / 2;
    const pinballLow = mean(
        days.map(day => pinballLoss(day.actual, day.low, tail)),
    );
    const pinballHigh = mean(
        days.map(day => pinballLoss(day.actual, day.high, 1 - tail)),
    );
    const enough = months.length >= minMonths && days.length > 0;
    const boot =
        enough && draws > 0
            ? bootstrapMase(months, draws, blockMonths, mulberry32(input.seed))
            : { naive: [], mean3: [] };
    const maseStat = (reference: MaseReference): ForecastMase => ({
        value: days.length > 0 ? maseOf(sums, reference) : null,
        ci90: bootInterval(boot[reference]),
        draws: boot[reference].length,
    });
    /** Верх CI90; без бутстрапа (`bootstrapDraws = 0`) — точечная оценка. */
    const upperBoundOf = (stat: ForecastMase): number | null =>
        stat.ci90 === null ? stat.value : stat.ci90[1];
    const mase = {
        naive: maseStat('naive'),
        mean3: maseStat('mean3'),
        max: maseMax,
    };
    const reasons: ForecastBacktestReason[] = [];
    if (months.length < minMonths) reasons.push('not-enough-months');
    else if (days.length === 0) reasons.push('no-days');
    if (enough) {
        if (ci90[1] < target) reasons.push('coverage-below');
        for (const reference of ['naive', 'mean3'] as const) {
            const upper = upperBoundOf(mase[reference]);
            if (upper === null) {
                reasons.push('mase-undefined');
            } else if (upper >= maseMax) {
                reasons.push(
                    reference === 'naive' ? 'mase-naive' : 'mase-mean3',
                );
            }
        }
    }
    const status = !enough
        ? 'insufficient'
        : reasons.length === 0
          ? 'pass'
          : 'fail';
    const total = Math.max(1, days.length);

    return {
        status,
        reasons,
        months: months.map(month => month.monthKey),
        days: days.length,
        level,
        coverage: {
            share: days.length === 0 ? 0 : covered / total,
            covered,
            days: days.length,
            ci90,
            target,
        },
        errors: {
            p50: finite(sums.p50 / total),
            naive: finite(sums.naive / total),
            mean3: finite(sums.mean3 / total),
        },
        mase,
        pinball: {
            low: pinballLow,
            high: pinballHigh,
            mean: (pinballLow + pinballHigh) / 2,
        },
        pit: pitOf(days, level),
    };
}
