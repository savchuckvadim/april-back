import type {
    ForecastBacktestView,
    ForecastLogDayView,
} from '../domain/assembler/forecast-snapshots.reader';
import {
    presentForecast,
    type ForecastSources,
} from '../domain/presenter/forecast.presenter';

const DAY: ForecastLogDayView = {
    day: '2026-11-04',
    band: { low: 9, p50: 10, high: 11 },
    level: 0.8,
    naive: 9,
    mean3: 10,
    done: 8,
    money: { low: 90_000, p50: 100_000, high: 110_000 },
    checkSource: null,
};

const BACKTEST: ForecastBacktestView = {
    monthKey: '2026-10',
    status: 'pass',
    reasons: [],
    shadowMonths: 12,
    shadowMinMonths: 9,
    numbers: null,
    calibration: { qLow: -2, qHigh: 2, level: 0.8, days: 240, months: 12 },
};

const sources = (over: Partial<ForecastSources> = {}): ForecastSources => ({
    monthKey: '2026-11',
    day: DAY,
    backtest: BACKTEST,
    stageEnabled: true,
    shadowMinMonths: 9,
    readinessMode: null,
    ...over,
});

describe('presentForecast: вилка с калибровкой по истории', () => {
    it('показанная вилка расширена калибровкой, деньги — вслед за штуками', () => {
        const dto = presentForecast(sources());

        expect(dto.mode).toBe('published');
        expect(dto.band).toEqual({ low: 8, p50: 10, high: 14 });
        expect(dto.money).toEqual({ low: 80_000, p50: 100_000, high: 140_000 });
    });

    it('калибровки нет — вилка модели как есть; в тени вилки нет', () => {
        const plain = presentForecast(
            sources({ backtest: { ...BACKTEST, calibration: null } }),
        );
        expect(plain.band).toEqual(DAY.band);
        expect(plain.money).toEqual(DAY.money);

        const shadow = presentForecast(sources({ stageEnabled: false }));
        expect(shadow.mode).toBe('shadow');
        expect(shadow.band).toBeNull();
        expect(shadow.money).toBeNull();
    });
});
