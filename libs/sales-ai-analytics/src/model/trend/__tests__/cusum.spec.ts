import { calibrateFamilyThresholds } from '../block-permutation';
import {
    cusumExcursion,
    cusumStatistic,
    cusumTrajectory,
    detectShift,
} from '../cusum';
import { TREND_DEFAULTS } from '../trend-defaults';
import { MOVING_RANGE_D2 } from '../trend-series';
import { nullSeries, shiftedSeries, specSeed } from './trend.fixture';

const OPTIONS = {
    k: TREND_DEFAULTS.cusumK,
    baselinePoints: TREND_DEFAULTS.baselinePoints,
};
/** Нижняя граница порога h (TREND_DEFAULTS.cusumH). */
const H = TREND_DEFAULTS.cusumH;
/** Неделя сдвига (нулевой индекс) и его величина: +2 балла при σ = 0,5. */
const SHIFT_AT = 13;
const DELTA = 2;
const SEEDS = 200;
/** Семейство фикстуры: сдвинутый ряд и четыре шумовых той же длины. */
const NULL_NEIGHBOURS = 4;

const cusumStat = (values: readonly number[]): number =>
    cusumStatistic(values, OPTIONS);

/** Порог сдвинутого ряда (первого в семействе) после калибровки. */
function calibratedH(shifted: readonly number[], seed: number): number {
    const family = [
        shifted,
        ...Array.from({ length: NULL_NEIGHBOURS }, (_, index) =>
            nullSeries(specSeed('neighbour', seed * 4 + index), shifted.length),
        ),
    ];
    const result = calibrateFamilyThresholds(family, cusumStat, {
        seed: specSeed('cusum-calibrate', seed),
        iterations: TREND_DEFAULTS.iterations,
        fwer: TREND_DEFAULTS.fwer,
        holdout: values =>
            Math.min(
                TREND_DEFAULTS.holdoutPoints,
                cusumExcursion(values, OPTIONS),
            ),
    });

    return Math.max(H, result?.thresholds[0] ?? 0);
}

describe('cusumTrajectory — табличный CUSUM на стандартизованных остатках', () => {
    it('меньше двух точек или без разброса → null', () => {
        expect(cusumTrajectory([1], OPTIONS)).toBeNull();
        expect(cusumTrajectory([2, 2, 2, 2], OPTIONS)).toBeNull();
    });

    it('совпадает с ручным расчётом S⁺ = max(0, S⁺ + z − k), S⁻ = max(0, S⁻ − z − k)', () => {
        const values = [0, 0, 0, 0, 2, 2, 2];
        const result = cusumTrajectory(values, { k: 0.5, baselinePoints: 4 });
        expect(result).not.toBeNull();
        const { mu0, sigma, upper, lower } = result as NonNullable<
            typeof result
        >;
        expect(mu0).toBe(0);
        // MR: 0,0,0,2,0,0 → MR̄ = 1/3, σ = MR̄ / d₂.
        expect(sigma).toBeCloseTo(1 / 3 / MOVING_RANGE_D2, 12);
        const z = 2 / sigma;
        expect(upper.slice(0, 4)).toEqual([0, 0, 0, 0]);
        expect(upper[4]).toBeCloseTo(z - 0.5, 12);
        expect(upper[5]).toBeCloseTo(2 * (z - 0.5), 12);
        expect(upper[6]).toBeCloseTo(3 * (z - 0.5), 12);
        expect(lower).toEqual([0, 0, 0, 0, 0, 0, 0]);
        expect(cusumStatistic(values, { k: 0.5, baselinePoints: 4 })).toBe(
            upper[6],
        );
        // Текущий выброс — три точки после последнего нуля.
        expect(cusumExcursion(values, { k: 0.5, baselinePoints: 4 })).toBe(3);
        expect(
            cusumExcursion([0, 0, 0, 0], { k: 0.5, baselinePoints: 4 }),
        ).toBe(0);
    });
});

describe('detectShift — сдвиг уровня на последней точке', () => {
    const fixture = shiftedSeries(
        specSeed('cusum-shift', 1),
        26,
        SHIFT_AT,
        DELTA,
    );

    it('на фикстуре сигнал появляется на третьей неделе после сдвига при калиброванном пороге', () => {
        // Две недели после сдвига — порог ещё не пробит.
        const twoWeeks = fixture.slice(0, SHIFT_AT + 2);
        expect(
            detectShift(twoWeeks, { ...OPTIONS, h: calibratedH(twoWeeks, 1) }),
        ).toBeNull();
        const thirdWeek = fixture.slice(0, SHIFT_AT + 3);
        const h = calibratedH(thirdWeek, 1);
        const shift = detectShift(thirdWeek, { ...OPTIONS, h });
        expect(shift).not.toBeNull();
        expect(shift?.direction).toBe('up');
        expect(shift?.statistic).toBeGreaterThan(h);
        expect(shift?.threshold).toBe(h);
        // Начало сдвига — не раньше двух недель до истинной точки и не
        // позже неё: S⁺ до сдвига может ненадолго оторваться от нуля.
        expect(shift?.sinceIndex).toBeGreaterThanOrEqual(SHIFT_AT - 2);
        expect(shift?.sinceIndex).toBeLessThanOrEqual(SHIFT_AT);
        // Величина — уровень после сдвига минус базовая линия, ≈ +2.
        expect(shift?.magnitude).toBeGreaterThan(DELTA - 0.75);
        expect(shift?.magnitude).toBeLessThan(DELTA + 0.75);
    });

    it('на всём окне из 26 недель сдвиг остаётся актуальным, начало не уезжает', () => {
        const shift = detectShift(fixture, {
            ...OPTIONS,
            h: calibratedH(fixture, 1),
        });
        expect(shift?.direction).toBe('up');
        expect(shift?.sinceIndex).toBeGreaterThanOrEqual(SHIFT_AT - 2);
        expect(shift?.sinceIndex).toBeLessThanOrEqual(SHIFT_AT);
    });

    it('по 200 seed-ам сдвиг +2 балла при калиброванном пороге ловится к третьей неделе не реже чем в 65 %, к четвёртой — в 85 %', () => {
        let third = 0;
        let fourth = 0;
        for (let seed = 0; seed < SEEDS; seed += 1) {
            const values = shiftedSeries(
                specSeed('cusum-shift', seed),
                SHIFT_AT + 4,
                SHIFT_AT,
                DELTA,
            );
            const atThird = values.slice(0, SHIFT_AT + 3);
            if (
                detectShift(atThird, {
                    ...OPTIONS,
                    h: calibratedH(atThird, seed),
                })?.direction === 'up'
            ) {
                third += 1;
            }
            if (
                detectShift(values, {
                    ...OPTIONS,
                    h: calibratedH(values, seed),
                })?.direction === 'up'
            ) {
                fourth += 1;
            }
        }
        // Замер 22.09.2026: 145 из 200 на третьей неделе, 179 — на
        // четвёртой; порог семейства из пяти рядов держит FWER 0,1.
        expect(third / SEEDS).toBeGreaterThanOrEqual(0.65);
        expect(fourth / SEEDS).toBeGreaterThanOrEqual(0.85);
    }, 300000);

    it('сдвиг вниз даёт direction down и отрицательную величину', () => {
        const values = shiftedSeries(
            specSeed('cusum-shift', 3),
            26,
            SHIFT_AT,
            -DELTA,
        );
        const shift = detectShift(values, { ...OPTIONS, h: H });
        expect(shift?.direction).toBe('down');
        expect(shift?.magnitude).toBeLessThan(0);
    });

    it('на нулевом ряду ложный сдвиг по 200 seed-ам при калиброванном пороге не чаще trend_fwer', () => {
        let flagged = 0;
        for (let seed = 0; seed < SEEDS; seed += 1) {
            const values = nullSeries(specSeed('cusum-null', seed), 26);
            if (
                detectShift(values, {
                    ...OPTIONS,
                    h: calibratedH(values, seed),
                }) !== null
            ) {
                flagged += 1;
            }
        }
        expect(flagged / SEEDS).toBeLessThanOrEqual(TREND_DEFAULTS.fwer);
    }, 300000);

    it('сдвиг, который закончился, сигнала на последней точке не даёт', () => {
        const values = [
            ...Array.from({ length: 10 }, (_, index) => 6 + (index % 2) * 0.2),
            8,
            8.2,
            8,
            ...Array.from({ length: 12 }, (_, index) => 6 + (index % 2) * 0.2),
        ];
        // Без правила актуальности S⁺ всё ещё выше порога — CUSUM без
        // сброса помнит всплеск, — но сторона угасает восемь точек подряд.
        const trajectory = cusumTrajectory(values, OPTIONS);
        expect(trajectory?.upper[values.length - 1]).toBeGreaterThan(H);
        expect(detectShift(values, { ...OPTIONS, h: H })).toBeNull();
    });
});
