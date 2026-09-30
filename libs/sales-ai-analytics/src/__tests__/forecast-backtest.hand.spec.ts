import {
    FORECAST_BACKTEST_DEFAULTS,
    backtestForecast,
} from '../model/forecast-backtest';
import { ForecastBacktestMonth } from '../model/forecast-backtest.types';
import { seedOf } from '../model/prng';

/**
 * Ручная фикстура бэктеста прогноза (план §10 L4; Фаза 4, поток
 * `p4-forecast-model`): два месяца по два дня — MAE, MASE, покрытие,
 * pinball и PIT сверяются с расчётом на бумаге, а не с другим кодом.
 */
const SEED = seedOf('forecast-backtest', 'hand', 1);

/**
 * Ручная фикстура: два месяца по два дня — все числа считаются на бумаге.
 * Месяц A (факт 10): ошибки p50 1, 2; naive 2, 0; mean3 2, 4.
 * Месяц B (факт 20): ошибки p50 2, 1; naive 4, 6; mean3 5, 10.
 */
const HAND_MONTHS: ForecastBacktestMonth[] = [
    {
        monthKey: '2026-02',
        actual: 20,
        days: [
            {
                day: '2026-02-02',
                low: 19,
                p50: 21,
                high: 25,
                naive: 26,
                mean3: 30,
                done: 9,
            },
            {
                day: '2026-02-01',
                low: 15,
                p50: 18,
                high: 22,
                naive: 16,
                mean3: 25,
                done: 0,
            },
        ],
    },
    {
        monthKey: '2026-01',
        actual: 10,
        days: [
            {
                day: '2026-01-01',
                low: 6,
                p50: 9,
                high: 13,
                naive: 12,
                mean3: 8,
                done: 0,
            },
            {
                day: '2026-01-02',
                low: 11,
                p50: 12,
                high: 14,
                naive: 10,
                mean3: 6,
                done: 5,
            },
        ],
    },
];

describe('backtestForecast — ручная фикстура', () => {
    // Два месяца при блоке 3 → один блок из обоих месяцев: бутстрап вырожден
    // в точечную оценку, поэтому CI90 равен ей — числа проверяются точно.
    const result = backtestForecast({
        months: HAND_MONTHS,
        seed: SEED,
        minMonths: 2,
        level: 0.8,
    });

    it('MAE, MASE, покрытие, pinball и PIT совпадают с расчётом на бумаге', () => {
        expect(result.status).toBe('pass');
        expect(result.months).toEqual(['2026-01', '2026-02']);
        expect(result.days).toBe(4);
        expect(result.errors).toEqual({ p50: 1.5, naive: 3, mean3: 5.25 });
        expect(result.mase.naive.value).toBeCloseTo(0.5, 12);
        expect(result.mase.mean3.value).toBeCloseTo(6 / 21, 12);
        expect(result.mase.naive.ci90).toEqual([0.5, 0.5]);
        expect(result.mase.mean3.ci90?.[0]).toBeCloseTo(6 / 21, 12);
        expect(result.coverage).toMatchObject({
            share: 0.75,
            covered: 3,
            days: 4,
            target: FORECAST_BACKTEST_DEFAULTS.coverageTarget,
        });
        // Pinball: low τ = 0,1 → (0,4 + 0,9 + 0,5 + 0,1)/4; high τ = 0,9 → (0,3 + 0,4 + 0,2 + 0,5)/4.
        expect(result.pinball.low).toBeCloseTo(0.475, 12);
        expect(result.pinball.high).toBeCloseTo(0.35, 12);
        expect(result.pit.belowP50Share).toBe(0.5);
        expect(result.pit.bins.map(bin => bin.days)).toEqual([1, 1, 2, 0]);
        // Ожидаемые доли корзин при уровне 0,8: хвосты по 0,1, середина по 0,4.
        const expectedShares = result.pit.bins.map(bin => bin.expected);
        [0.1, 0.4, 0.4, 0.1].forEach((share, index) => {
            expect(expectedShares[index]).toBeCloseTo(share, 12);
        });
    });

    it('без бутстрапа гейт MASE — по точечной оценке, ci90 null', () => {
        const point = backtestForecast({
            months: HAND_MONTHS,
            seed: SEED,
            minMonths: 2,
            bootstrapDraws: 0,
        });
        expect(point.status).toBe('pass');
        expect(point.mase.naive).toEqual({ value: 0.5, ci90: null, draws: 0 });
        const strict = backtestForecast({
            months: HAND_MONTHS,
            seed: SEED,
            minMonths: 2,
            bootstrapDraws: 0,
            maseMax: 0.4,
        });
        expect(strict.status).toBe('fail');
        expect(strict.reasons).toEqual(['mase-naive']);
    });

    it('нечисловые blockMonths и bootstrapDraws не ломают гейт', () => {
        const odd = backtestForecast({
            months: HAND_MONTHS,
            seed: SEED,
            minMonths: 2,
            blockMonths: Number.NaN,
            bootstrapDraws: Number.NaN,
        });
        expect(odd.status).toBe('pass');
        expect(odd.mase.naive.ci90).toBeNull();
    });
});
