import {
    calibrateFamilyThresholds,
    circularBlockBootstrap,
    circularBlockShuffle,
    defaultBlockLength,
    type FamilyCalibrationOptions,
} from '../block-permutation';
import { cusumExcursion, cusumStatistic, detectShift } from '../cusum';
import { driftStatistic } from '../ewma';
import { mulberry32 } from '../../prng';
import { TREND_DEFAULTS } from '../trend-defaults';
import { nullSeries, shiftedSeries, specSeed } from './trend.fixture';

const CUSUM = {
    k: TREND_DEFAULTS.cusumK,
    baselinePoints: TREND_DEFAULTS.baselinePoints,
};
const DRIFT = { alphaShort: 0.3, alphaLong: 0.1, consecutive: 2 };
const FWER = TREND_DEFAULTS.fwer;
const POINTS = 26;
/** Семейство одного портала: пять рядов (менеджеры × метрики). */
const FAMILY = 5;
const SIMULATIONS = 200;

const cusumStat = (values: readonly number[]): number =>
    cusumStatistic(values, CUSUM);
const holdout = (values: readonly number[]): number =>
    Math.min(TREND_DEFAULTS.holdoutPoints, cusumExcursion(values, CUSUM));
const calibration = (seed: number): FamilyCalibrationOptions => ({
    seed,
    iterations: TREND_DEFAULTS.iterations,
    fwer: FWER,
    holdout,
});

const sorted = (values: readonly number[]): number[] =>
    [...values].sort((a, b) => a - b);

describe('circularBlockShuffle — циркулярное блочное перемешивание', () => {
    it('сохраняет длину и мультимножество значений', () => {
        const values = nullSeries(specSeed('shuffle', 1), POINTS);
        const shuffled = circularBlockShuffle(values, 3, mulberry32(7));
        expect(shuffled).toHaveLength(POINTS);
        expect(sorted(shuffled)).toEqual(sorted(values));
        expect(shuffled).not.toEqual(values);
    });

    it('воспроизводимо по seed и не трогает ряды короче двух точек', () => {
        const values = nullSeries(specSeed('shuffle', 2), POINTS);
        expect(circularBlockShuffle(values, 3, mulberry32(11))).toEqual(
            circularBlockShuffle(values, 3, mulberry32(11)),
        );
        expect(circularBlockShuffle([4], 3, mulberry32(1))).toEqual([4]);
        expect(circularBlockShuffle([], 3, mulberry32(1))).toEqual([]);
    });

    it('блок длиннее ряда — только циклический сдвиг: соседи сохраняются', () => {
        const values = [1, 2, 3, 4, 5];
        const shuffled = circularBlockShuffle(values, 99, mulberry32(3));
        const start = shuffled.indexOf(1);
        expect(
            shuffled.map((_, index) => shuffled[(start + index) % 5]),
        ).toEqual(values);
    });

    it('длина блока по умолчанию — кубический корень из длины ряда', () => {
        expect(defaultBlockLength(26)).toBe(3);
        expect(defaultBlockLength(8)).toBe(2);
        expect(defaultBlockLength(0)).toBe(1);
    });

    it('бутстреп добирает нужную длину значениями пула, пустой пул — пусто', () => {
        const pool = [1, 2, 3, 4];
        const out = circularBlockBootstrap(pool, 7, 2, mulberry32(5));
        expect(out).toHaveLength(7);
        expect(out.every(value => pool.includes(value))).toBe(true);
        expect(circularBlockBootstrap([], 3, 2, mulberry32(5))).toEqual([]);
    });
});

describe('calibrateFamilyThresholds — step-down max-T по семейству', () => {
    const family = Array.from({ length: FAMILY }, (_, index) =>
        nullSeries(specSeed('calibrate', index), POINTS),
    );

    it('пустое семейство → null; ряды короче двух точек получают Infinity', () => {
        expect(
            calibrateFamilyThresholds([], cusumStat, calibration(1)),
        ).toBeNull();
        expect(
            calibrateFamilyThresholds([[1], []], cusumStat, calibration(1)),
        ).toBeNull();
        const result = calibrateFamilyThresholds(
            [[1], family[0]],
            cusumStat,
            calibration(1),
        );
        expect(result?.thresholds[0]).toBe(Number.POSITIVE_INFINITY);
        expect(result?.thresholds[1]).toBeGreaterThan(0);
        expect(result?.series).toBe(1);
    });

    it('при фиксированном seed результат воспроизводим и описывает семейство', () => {
        const options = calibration(specSeed('calibrate', 99));
        const first = calibrateFamilyThresholds(family, cusumStat, options);
        const second = calibrateFamilyThresholds(family, cusumStat, options);
        expect(first).toEqual(second);
        expect(first).toMatchObject({
            iterations: TREND_DEFAULTS.iterations,
            series: FAMILY,
            quantile: 1 - FWER,
        });
        expect(first?.thresholds).toHaveLength(FAMILY);
        expect(first?.threshold).toBeGreaterThan(0);
    });

    it('семейство больше — порог первого шага не ниже: max-T растёт с числом гипотез', () => {
        const options = calibration(specSeed('calibrate', 5));
        const one = calibrateFamilyThresholds([family[0]], cusumStat, options);
        const five = calibrateFamilyThresholds(family, cusumStat, options);
        expect(five?.threshold).toBeGreaterThanOrEqual(one?.threshold ?? 0);
    });

    it('шумовые ряды не отвергнуты: цепочка step-down останавливается на первом, пороги ниже равны его порогу', () => {
        const result = calibrateFamilyThresholds(
            family,
            cusumStat,
            calibration(specSeed('calibrate', 7)),
        );
        const thresholds = result?.thresholds ?? [];
        const observed = family.map(cusumStat);
        expect(
            observed.every((value, index) => value <= thresholds[index]),
        ).toBe(true);
        expect(new Set(thresholds).size).toBe(1);
    });

    it('старый сдвиг соседа не слепит семейство: B со свежим сдвигом проверяется уже без A', () => {
        const SEEDS = 20;
        let detectedStepDown = 0;
        let detectedByFirstStep = 0;
        for (let seed = 0; seed < SEEDS; seed += 1) {
            // A — сдвиг +2 балла 13 недель назад, B — тот же сдвиг четыре
            // недели назад, три шумовых соседа; все ряды по 26 недель.
            const a = shiftedSeries(specSeed('cross-a', seed), POINTS, 13, 2);
            const b = shiftedSeries(specSeed('cross-b', seed), POINTS, 22, 2);
            const nulls = Array.from({ length: 3 }, (_, index) =>
                nullSeries(specSeed('cross-null', seed * 3 + index), POINTS),
            );
            const result = calibrateFamilyThresholds(
                [a, b, ...nulls],
                cusumStat,
                calibration(specSeed('cross', seed)),
            );
            const [hA, hB] = result?.thresholds ?? [];
            // Порог A — максимум по всему семейству, включая его же
            // перемешивания со старым сдвигом внутри; A отвергнут, и
            // порог B считается уже без A — он строго ниже.
            expect(hA).toBe(result?.threshold);
            expect(cusumStat(a)).toBeGreaterThan(hA);
            expect(hB).toBeLessThan(hA);
            if (detectShift(b, { ...CUSUM, h: hB })?.direction === 'up') {
                detectedStepDown += 1;
            }
            if (detectShift(b, { ...CUSUM, h: hA })?.direction === 'up') {
                detectedByFirstStep += 1;
            }
        }
        // Замер 22.09.2026: без step-down (порог первого шага для всех)
        // свежий сдвиг B не виден ни на одном seed, со step-down — на 10
        // из 20: порог B — честный max-T над четырьмя 26-недельными рядами
        // (≈ 10–13σ), четырёх недель сдвига +2 балла хватает через раз.
        expect(detectedByFirstStep).toBe(0);
        expect(detectedStepDown).toBeGreaterThanOrEqual(8);
    });

    it('FWER на нулевой гипотезе по 200 симуляциям семейств ≤ trend_fwer', () => {
        let familiesWithFlag = 0;
        let familiesAboveMax = 0;
        for (let simulation = 0; simulation < SIMULATIONS; simulation += 1) {
            const nullFamily = Array.from({ length: FAMILY }, (_, index) =>
                nullSeries(
                    specSeed('fwer', simulation * FAMILY + index),
                    POINTS,
                ),
            );
            const result = calibrateFamilyThresholds(
                nullFamily,
                cusumStat,
                calibration(specSeed('fwer-seed', simulation)),
            );
            const thresholds = result?.thresholds ?? [];
            if (
                nullFamily.some(
                    (values, index) => cusumStat(values) > thresholds[index],
                )
            ) {
                familiesAboveMax += 1;
            }
            if (
                nullFamily.some(
                    (values, index) =>
                        detectShift(values, {
                            ...CUSUM,
                            h: thresholds[index],
                        }) !== null,
                )
            ) {
                familiesWithFlag += 1;
            }
        }
        // FWER сигнала — доля семейств хотя бы с одним флагом сдвига (порог
        // ставится по максимуму ряда, флаг — по последней точке и без
        // угасания). Превышение самого максимума — калибруемая величина:
        // её доля около FWER с выборочным шумом 200 симуляций (СКО ≈ 0,02;
        // замер 22.09.2026 на этих seed-ах: 21 из 200 по максимуму).
        expect(familiesWithFlag / SIMULATIONS).toBeLessThanOrEqual(FWER);
        expect(familiesAboveMax / SIMULATIONS).toBeLessThanOrEqual(FWER + 0.03);
    }, 300000);

    it('калибровка дрейфа даёт порог выше нижней границы k = 1 на семействе из пяти рядов', () => {
        const result = calibrateFamilyThresholds(
            family,
            values => driftStatistic(values, DRIFT),
            calibration(specSeed('drift-calibrate', 1)),
        );
        expect(result?.threshold).toBeGreaterThan(TREND_DEFAULTS.sigmaK);
    });
});
