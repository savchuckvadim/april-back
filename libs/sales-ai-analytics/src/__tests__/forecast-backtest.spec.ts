import {
    FORECAST_BACKTEST_DEFAULTS,
    backtestForecast,
} from '../model/forecast-backtest';
import {
    AI_FORECAST_PIT_BINS,
    ForecastBacktestDay,
    ForecastBacktestMonth,
} from '../model/forecast-backtest.types';
import { negBinInterval, sampleNegBin } from '../model/negbin';
import { mulberry32, seedOf } from '../model/prng';
import { registryDefault } from '../params/registry.access';

/**
 * Rolling-origin бэктест прогноза отдела — гейт L4 (план §10, §4.11;
 * Фаза 4, поток `p4-forecast-model`). Синтетика: продажи отдела —
 * Пуассон с известным темпом месяца, калиброванная модель знает темп и
 * строит вилку NegBin(φ = 1) на остаток месяца.
 */

/** Рабочих дней в месяце синтетики. */
const DAYS = 20;
/** Базовый дневной темп продаж отдела. */
const RATE = 2;
/**
 * Множители темпа по месяцам: объём отдела меняется от месяца к месяцу,
 * калиброванная модель знает темп месяца (через пайплайн), простые
 * эталоны «по темпу с начала месяца» и «среднее за три» запаздывают.
 */
const MONTH_FACTOR = [
    1.3, 0.7, 1.2, 0.8, 1.4, 0.6, 1.1, 0.9, 1.3, 0.7, 1.2, 0.8,
];
const rateOf = (month: number): number =>
    RATE * MONTH_FACTOR[month % MONTH_FACTOR.length];
const LEVEL = 0.8;

const monthKey = (index: number): string =>
    `2026-${String(index + 1).padStart(2, '0')}`;
const dayKey = (month: number, day: number): string =>
    `${monthKey(month)}-${String(day + 1).padStart(2, '0')}`;

/** Как искажать калиброванный прогноз. */
interface Distortion {
    /** Множитель к ожиданию остатка (1 — честно, 2 — вдвое завышено). */
    readonly bias?: number;
    /** Множитель к полуширине вилки (1 — честно, 0,5 — вдвое уже). */
    readonly width?: number;
}

/** Синтетика M месяцев: дневные продажи и прогнозы на каждый день-origin. */
function synthetic(
    months: number,
    seed: number,
    distortion: Distortion = {},
): ForecastBacktestMonth[] {
    const random = mulberry32(seed);
    const bias = distortion.bias ?? 1;
    const width = distortion.width ?? 1;
    const actuals: number[] = [];
    const result: ForecastBacktestMonth[] = [];
    for (let month = 0; month < months; month += 1) {
        const rate = rateOf(month);
        const daily = Array.from({ length: DAYS }, () =>
            sampleNegBin(rate, 1, random),
        );
        const actual = daily.reduce((sum, value) => sum + value, 0);
        const previous = actuals.slice(-3);
        const mean3 =
            previous.length === 0
                ? RATE * DAYS
                : previous.reduce((sum, value) => sum + value, 0) /
                  previous.length;
        const lastMonth = actuals.length === 0 ? RATE * DAYS : actuals.at(-1);
        const days: ForecastBacktestDay[] = [];
        let done = 0;
        for (let day = 0; day < DAYS; day += 1) {
            const remaining = DAYS - day;
            const mu = rate * remaining;
            const interval = negBinInterval(mu, 1, LEVEL);
            const p50 = done + mu * bias;
            days.push({
                day: dayKey(month, day),
                low: p50 - (mu - interval.low) * width,
                p50,
                high: p50 + (interval.high - mu) * width,
                naive: day > 0 ? (done * DAYS) / day : (lastMonth ?? 0),
                mean3,
                done,
            });
            done += daily[day];
        }
        actuals.push(actual);
        result.push({ monthKey: monthKey(month), actual, days });
    }

    return result;
}

const SEED = seedOf('forecast-backtest', 'spec', 1);

describe('backtestForecast — дефолты из реестра', () => {
    it('гейт, цель покрытия, порог MASE и уровень — коды реестра', () => {
        expect(FORECAST_BACKTEST_DEFAULTS.minMonths).toBe(
            registryDefault('forecast_backtest_min_months'),
        );
        expect(FORECAST_BACKTEST_DEFAULTS.coverageTarget).toBe(
            registryDefault('forecast_coverage_target'),
        );
        expect(FORECAST_BACKTEST_DEFAULTS.maseMax).toBe(
            registryDefault('forecast_mase_max'),
        );
        expect(FORECAST_BACKTEST_DEFAULTS.level).toBe(
            registryDefault('forecast_interval_level'),
        );
    });
});

describe('backtestForecast — гейт L4 на синтетике', () => {
    const calibrated = backtestForecast({
        months: synthetic(12, SEED),
        seed: SEED,
    });

    it('калиброванная синтетика проходит гейт: покрытие ≈ 0,8, MASE < 1', () => {
        expect(calibrated.status).toBe('pass');
        expect(calibrated.reasons).toEqual([]);
        expect(calibrated.months).toHaveLength(12);
        expect(calibrated.days).toBe(12 * DAYS);
        expect(calibrated.coverage.share).toBeGreaterThan(0.75);
        expect(calibrated.coverage.share).toBeLessThan(0.95);
        expect(calibrated.coverage.ci90[0]).toBeLessThanOrEqual(
            calibrated.coverage.ci90[1],
        );
        expect(calibrated.mase.naive.value ?? 1).toBeLessThan(1);
        expect(calibrated.mase.mean3.value ?? 1).toBeLessThan(1);
        expect(calibrated.mase.naive.ci90?.[1] ?? 1).toBeLessThan(1);
        expect(calibrated.mase.mean3.ci90?.[1] ?? 1).toBeLessThan(1);
        expect(calibrated.mase.naive.draws).toBe(
            FORECAST_BACKTEST_DEFAULTS.bootstrapDraws,
        );
    });

    it('интервалы упорядочены, доли ∈ [0; 1], PIT-корзины суммируются в 1', () => {
        const { coverage, mase, pit, pinball } = calibrated;
        expect(coverage.ci90[0]).toBeGreaterThanOrEqual(0);
        expect(coverage.ci90[1]).toBeLessThanOrEqual(1);
        for (const stat of [mase.naive, mase.mean3]) {
            expect(stat.ci90?.[0] ?? 0).toBeLessThanOrEqual(
                stat.ci90?.[1] ?? 0,
            );
            expect(stat.ci90?.[0] ?? 0).toBeLessThanOrEqual(stat.value ?? 0);
            expect(stat.ci90?.[1] ?? 0).toBeGreaterThanOrEqual(stat.value ?? 0);
        }
        expect(pit.bins.map(bin => bin.code)).toEqual([
            ...AI_FORECAST_PIT_BINS,
        ]);
        expect(pit.bins.reduce((sum, bin) => sum + bin.share, 0)).toBeCloseTo(
            1,
            10,
        );
        expect(
            pit.bins.reduce((sum, bin) => sum + bin.expected, 0),
        ).toBeCloseTo(1, 10);
        expect(pit.belowP50Share).toBeGreaterThan(0.3);
        expect(pit.belowP50Share).toBeLessThan(0.7);
        expect(pinball.low).toBeGreaterThanOrEqual(0);
        expect(pinball.high).toBeGreaterThanOrEqual(0);
        expect(pinball.mean).toBeCloseTo((pinball.low + pinball.high) / 2, 12);
    });

    it('вилка вдвое уже — покрытие падает, причина coverage-below', () => {
        const narrow = backtestForecast({
            months: synthetic(12, SEED, { width: 0.5 }),
            seed: SEED,
        });
        expect(narrow.status).toBe('fail');
        expect(narrow.reasons).toContain('coverage-below');
        expect(narrow.coverage.ci90[1]).toBeLessThan(
            FORECAST_BACKTEST_DEFAULTS.coverageTarget,
        );
        expect(narrow.coverage.share).toBeLessThan(calibrated.coverage.share);
    });

    it('прогноз хуже наивного — причины mase-naive и mase-mean3', () => {
        const biased = backtestForecast({
            months: synthetic(12, SEED, { bias: 2 }),
            seed: SEED,
        });
        expect(biased.status).toBe('fail');
        expect(biased.reasons).toContain('mase-naive');
        expect(biased.reasons).toContain('mase-mean3');
        expect(biased.mase.naive.ci90?.[1] ?? 0).toBeGreaterThanOrEqual(
            FORECAST_BACKTEST_DEFAULTS.maseMax,
        );
    });

    it('4 месяца — insufficient с причиной not-enough-months, без бутстрапа', () => {
        const short = backtestForecast({
            months: synthetic(4, SEED),
            seed: SEED,
        });
        expect(short.status).toBe('insufficient');
        expect(short.reasons).toEqual(['not-enough-months']);
        expect(short.mase.naive.ci90).toBeNull();
        expect(short.mase.naive.draws).toBe(0);
        expect(short.months).toHaveLength(4);
    });

    it('покрытие целиком выше цели — не причина провала', () => {
        const wide = backtestForecast({
            months: synthetic(12, SEED, { width: 3 }),
            seed: SEED,
        });
        expect(wide.coverage.ci90[0]).toBeGreaterThan(
            FORECAST_BACKTEST_DEFAULTS.coverageTarget,
        );
        expect(wide.reasons).not.toContain('coverage-below');
    });

    it('месяцы без дней — no-days, эталон без ошибки — mase-undefined', () => {
        const empty = backtestForecast({
            months: Array.from({ length: 6 }, (_, index) => ({
                monthKey: monthKey(index),
                actual: 10,
                days: [],
            })),
            seed: SEED,
        });
        expect(empty.status).toBe('insufficient');
        expect(empty.reasons).toEqual(['no-days']);
        const perfectNaive = backtestForecast({
            months: synthetic(6, SEED).map(month => ({
                ...month,
                days: month.days.map(day => ({
                    ...day,
                    naive: month.actual,
                    mean3: month.actual,
                })),
            })),
            seed: SEED,
        });
        expect(perfectNaive.status).toBe('fail');
        expect(perfectNaive.reasons).toContain('mase-undefined');
        expect(perfectNaive.mase.naive.value).toBeNull();
    });
});

describe('backtestForecast — детерминизм', () => {
    it('одинаковый seed → toEqual, другой seed меняет только бутстрап', () => {
        const months = synthetic(12, SEED);
        const first = backtestForecast({ months, seed: SEED });
        expect(backtestForecast({ months, seed: SEED })).toEqual(first);
        const other = backtestForecast({ months, seed: SEED + 7 });
        expect(other.coverage).toEqual(first.coverage);
        expect(other.mase.naive.value).toBe(first.mase.naive.value);
        expect(other.mase.naive.ci90).not.toEqual(first.mase.naive.ci90);
    });

    it('порядок месяцев и дней на входе не влияет на результат', () => {
        const months = synthetic(8, SEED);
        const shuffled = [...months]
            .reverse()
            .map(month => ({ ...month, days: [...month.days].reverse() }));
        expect(backtestForecast({ months: shuffled, seed: SEED })).toEqual(
            backtestForecast({ months, seed: SEED }),
        );
    });
});
