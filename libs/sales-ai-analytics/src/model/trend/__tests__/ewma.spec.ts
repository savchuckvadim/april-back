import {
    detectDrift,
    driftStatistic,
    driftStatistics,
    ewma,
    runningMin,
} from '../ewma';
import { personalSigma } from '../trend-series';
import { nullSeries, specSeed } from './trend.fixture';

const OPTIONS = { alphaShort: 0.3, alphaLong: 0.1, consecutive: 2 };

describe('ewma — экспоненциальная скользящая средняя', () => {
    it('совпадает с ручным расчётом y_t = α·x_t + (1 − α)·y_{t−1}, y₀ = x₀', () => {
        expect(ewma([1, 2, 3], 0.5)).toEqual([1, 1.5, 2.25]);
        const [first, second, third] = ewma([10, 4, 7], 0.3);
        expect(first).toBe(10);
        expect(second).toBeCloseTo(0.3 * 4 + 0.7 * 10, 12);
        expect(third).toBeCloseTo(0.3 * 7 + 0.7 * second, 12);
    });

    it('пустой ряд даёт пустую траекторию, α = 1 повторяет ряд', () => {
        expect(ewma([], 0.3)).toEqual([]);
        expect(ewma([3, 1, 2], 1)).toEqual([3, 1, 2]);
    });

    it('α вне (0; 1] не зануляет ряд: берётся граница', () => {
        expect(ewma([3, 1], 5)).toEqual([3, 1]);
        expect(ewma([3, 1], 0)[1]).toBeCloseTo(3, 6);
    });
});

describe('runningMin — минимум за окно «k окон подряд»', () => {
    it('до набора окна ноль, дальше минимум последних consecutive', () => {
        expect(runningMin([1, 3, 2, 5], 2)).toEqual([0, 1, 2, 2]);
        expect(runningMin([1, 3, 2, 5], 1)).toEqual([1, 3, 2, 5]);
        expect(runningMin([4, 3, 2], 3)).toEqual([0, 0, 2]);
    });
});

describe('driftStatistics и driftStatistic', () => {
    it('ряд без разброса → null, статистика ряда 0', () => {
        expect(driftStatistics([5, 5, 5], OPTIONS)).toBeNull();
        expect(driftStatistic([5, 5, 5], OPTIONS)).toBe(0);
    });

    it('статистика точки = |EWMA_short − EWMA_long| / σ_personal', () => {
        const values = [6, 6.4, 5.8, 7, 7.5, 8];
        const stats = driftStatistics(values, OPTIONS);
        const sigma = personalSigma(values) as number;
        const short = ewma(values, OPTIONS.alphaShort);
        const long = ewma(values, OPTIONS.alphaLong);
        expect(stats).not.toBeNull();
        (stats as number[]).forEach((value, index) =>
            expect(value).toBeCloseTo(
                Math.abs(short[index] - long[index]) / sigma,
                12,
            ),
        );
        expect(driftStatistic(values, OPTIONS)).toBe(
            Math.max(...runningMin(stats as number[], 2)),
        );
    });
});

describe('detectDrift — расхождение короткой и длинной EWMA', () => {
    /**
     * На линейном ряду x_t = a + b·t EWMA отстаёт на b·(1 − α)/α, поэтому
     * short − long → b·[(1 − α_long)/α_long − (1 − α_short)/α_short]
     * = b·(9 − 7/3) = 6,667·b; за 26 точек длинная EWMA сходится не до
     * конца, величина чуть меньше предела.
     */
    const LAG_FACTOR = (1 - 0.1) / 0.1 - (1 - 0.3) / 0.3;

    it('монотонный подъём без шума: дрейф вверх, величина ≈ 6,667·b', () => {
        const slope = 0.2;
        const values = Array.from(
            { length: 26 },
            (_, index) => 5 + slope * index,
        );
        const drift = detectDrift(values, { ...OPTIONS, k: 1 });
        expect(drift).not.toBeNull();
        expect(drift?.direction).toBe('up');
        expect(drift?.threshold).toBe(1);
        expect(drift?.magnitude).toBeGreaterThan(0.85 * slope * LAG_FACTOR);
        expect(drift?.magnitude).toBeLessThanOrEqual(slope * LAG_FACTOR);
        // σ_personal ряда = |b| / d₂; статистика — минимум за два последних
        // окна расхождения EWMA в единицах σ (флаг «два окна подряд»).
        const sigma = slope / 1.128;
        const short = ewma(values, OPTIONS.alphaShort);
        const long = ewma(values, OPTIONS.alphaLong);
        const gap = (index: number): number =>
            Math.abs(short[index] - long[index]) / sigma;
        expect(drift?.statistic).toBeCloseTo(Math.min(gap(24), gap(25)), 9);
        expect(drift?.magnitude).toBeCloseTo(short[25] - long[25], 12);
        expect(drift?.sinceIndex).toBeGreaterThan(0);
        expect(drift?.sinceIndex).toBeLessThan(25);
    });

    it('спуск даёт дрейф вниз с отрицательной величиной', () => {
        const slope = -0.2;
        const values = Array.from(
            { length: 26 },
            (_, index) => 8 + slope * index,
        );
        const drift = detectDrift(values, { ...OPTIONS, k: 1 });
        expect(drift?.direction).toBe('down');
        expect(drift?.magnitude).toBeLessThan(0.85 * slope * LAG_FACTOR);
        expect(drift?.magnitude).toBeGreaterThanOrEqual(slope * LAG_FACTOR);
    });

    it('шумный подъём тоже ловится как дрейф вверх', () => {
        const values = nullSeries(specSeed('ewma-ramp', 1), 26).map(
            (value, index) => value + 0.15 * index,
        );
        const drift = detectDrift(values, { ...OPTIONS, k: 1 });
        expect(drift?.direction).toBe('up');
        expect(drift?.statistic).toBeGreaterThan(1);
    });

    it('шум без тренда при высоком пороге сигнала не даёт', () => {
        const values = nullSeries(specSeed('ewma-null', 1), 26);
        expect(detectDrift(values, { ...OPTIONS, k: 4 })).toBeNull();
    });

    it('флаг требует превышения два окна подряд: одиночный всплеск молчит', () => {
        const values = [...Array.from({ length: 12 }, () => 6), 9];
        // Последняя точка: короткая EWMA прыгнула, но окно из двух
        // ещё не набрано над порогом — минимум за окно ниже k.
        const stats = driftStatistics(values, OPTIONS) as number[];
        expect(stats[stats.length - 1]).toBeGreaterThan(1);
        expect(detectDrift(values, { ...OPTIONS, k: 1 })).toBeNull();
    });
});
