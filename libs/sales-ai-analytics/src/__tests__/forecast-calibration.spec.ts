import { backtestForecast } from '../model/forecast-backtest';
import type {
    ForecastBacktestDay,
    ForecastBacktestMonth,
} from '../model/forecast-backtest.types';
import {
    FORECAST_CALIBRATION_MIN_MONTHS,
    calibrateForecast,
    calibratedBand,
    calibratedMoneyBand,
    forecastCalibrationScale,
    rollingCalibration,
} from '../model/forecast-calibration';

/**
 * Месяц с узкой вилкой модели: P50 правильный в среднем, но факт гуляет
 * вокруг него на ±spread, а вилка модели — ±1 продажа.
 */
function narrowMonth(index: number, actual: number): ForecastBacktestMonth {
    const monthKey = `2025-${String(index + 1).padStart(2, '0')}`;
    const days: ForecastBacktestDay[] = Array.from({ length: 20 }, (_, day) => {
        // Закрытое к дню не больше факта месяца, середина — не ниже закрытого.
        const done = Math.floor((actual * day) / 20);
        const p50 = Math.max(10, done);
        return {
            day: `${monthKey}-${String(day + 1).padStart(2, '0')}`,
            low: Math.max(done, p50 - 1),
            p50,
            high: p50 + 1,
            naive: done * (20 / Math.max(1, day)),
            mean3: 10,
            done,
        };
    });
    return { monthKey, actual, days };
}

const ACTUALS = [6, 14, 8, 12, 5, 15, 9, 11, 7, 13, 10, 10];
const MONTHS = ACTUALS.map((actual, index) => narrowMonth(index, actual));

describe('calibrateForecast / calibratedBand', () => {
    it('множители — квантили нормированных остатков уровня, знаки вокруг нуля', () => {
        const calibration = calibrateForecast(
            [
                { p50: 10, done: 6, actual: 6 },
                { p50: 10, done: 6, actual: 10 },
                { p50: 10, done: 6, actual: 14 },
            ],
            0.8,
            3,
        );
        const scale = forecastCalibrationScale(10, 6);

        expect(scale).toBeCloseTo(Math.sqrt(5), 10);
        expect(calibration?.qLow).toBeLessThan(0);
        expect(calibration?.qHigh).toBeGreaterThan(0);
        expect(calibration?.days).toBe(3);
        expect(calibrateForecast([], 0.8, 0)).toBeNull();
    });

    it('калибровка только расширяет, границы целые, низ не ниже закрытого', () => {
        const calibration = {
            qLow: -2,
            qHigh: 2,
            level: 0.8,
            days: 100,
            months: 6,
        };
        const band = calibratedBand(
            { low: 9, p50: 10, high: 11 },
            8,
            calibration,
        );

        // s = √(10 − 8 + 1) ≈ 1,73 → 10 ± 3,46 → [8 (не ниже done); 14]
        expect(band).toEqual({ low: 8, p50: 10, high: 14 });
        // Широкая вилка модели не сужается.
        expect(
            calibratedBand({ low: 2, p50: 10, high: 25 }, 0, calibration),
        ).toEqual({ low: 2, p50: 10, high: 25 });
        expect(calibratedBand({ low: 9, p50: 10, high: 11 }, 8, null)).toEqual({
            low: 9,
            p50: 10,
            high: 11,
        });
    });

    it('деньги расширяются вслед за штуками по среднему чеку середины', () => {
        const money = calibratedMoneyBand(
            { low: 90_000, p50: 100_000, high: 110_000 },
            { low: 9, p50: 10, high: 11 },
            { low: 8, p50: 10, high: 14 },
        );

        expect(money).toEqual({ low: 80_000, p50: 100_000, high: 140_000 });
    });
});

describe('rollingCalibration — без подглядывания в факт', () => {
    it('месяц калибруется только по месяцам до него; первые месяцы — без калибровки', () => {
        const rolling = rollingCalibration(MONTHS, 0.8);

        expect(rolling.months).toBe(
            MONTHS.length - FORECAST_CALIBRATION_MIN_MONTHS,
        );
        expect(rolling.days).toHaveLength(rolling.months * 20);
        expect(rolling.latest?.months).toBe(MONTHS.length);
        // Будущие месяцы не влияют на калибровку месяца 4.
        const changedFuture = MONTHS.map((month, index) =>
            index > FORECAST_CALIBRATION_MIN_MONTHS
                ? { ...month, actual: month.actual * 10 }
                : month,
        );
        const firstOf = (days: typeof rolling.days) => days.slice(0, 20);
        expect(firstOf(rollingCalibration(changedFuture, 0.8).days)).toEqual(
            firstOf(rolling.days).map(day => ({ ...day })),
        );
        expect(rollingCalibration(MONTHS.slice(0, 2), 0.8).latest).toBeNull();
    });
});

describe('backtestForecast: калиброванное покрытие и «среднее за 3 месяца»', () => {
    it('узкая вилка модели: без калибровки покрытие низкое, с калибровкой — около цели', () => {
        const raw = backtestForecast({ months: MONTHS, seed: 7 });
        const calibrated = backtestForecast({
            months: MONTHS,
            seed: 7,
            calibrate: true,
        });

        expect(raw.coverage.share).toBeLessThan(0.5);
        expect(raw.reasons).toContain('coverage-below');
        expect(calibrated.calibratedMonths).toBe(
            MONTHS.length - FORECAST_CALIBRATION_MIN_MONTHS,
        );
        expect(calibrated.coverage.share).toBeGreaterThan(raw.coverage.share);
        expect(calibrated.coverage.share).toBeGreaterThanOrEqual(0.6);
        expect(calibrated.calibration).not.toBeNull();
        // Середина та же — ошибки середины не меняются.
        expect(calibrated.errors).toEqual(raw.errors);
    });

    it('история короче 24 месяцев: у «среднего за 3 месяца» хватает точечной оценки', () => {
        const result = backtestForecast({
            months: MONTHS,
            seed: 7,
            calibrate: true,
        });
        const mean3 = result.mase.mean3;

        // Точечная оценка ниже порога — причины mase-mean3 нет, даже если
        // верх бутстрап-интервала по году выше порога.
        if (mean3.value !== null && mean3.value < result.mase.max) {
            expect(result.reasons).not.toContain('mase-mean3');
        } else {
            expect(result.reasons).toContain('mase-mean3');
        }
    });
});
