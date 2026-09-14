import {
    SEED_SEPARATOR,
    fnv1a,
    mulberry32,
    sampleBeta,
    sampleBinomial,
    sampleGamma,
    sampleNormal,
    seedOf,
} from '../model/prng';

/**
 * Детерминированный ГПСЧ (план §2.4 «воспроизводимость»): один seed — одна
 * последовательность, а распределения проверяются по моментам с допуском в
 * несколько стандартных ошибок среднего на выборке N.
 */
const N = 20000;

/** Среднее и выборочная дисперсия N значений генератора. */
function moments(
    draw: () => number,
    count: number = N,
): { mean: number; variance: number } {
    let sum = 0;
    let sumSq = 0;
    for (let index = 0; index < count; index += 1) {
        const value = draw();
        sum += value;
        sumSq += value * value;
    }
    const mean = sum / count;

    return { mean, variance: sumSq / count - mean * mean };
}

describe('fnv1a и seedOf', () => {
    it('стандартные векторы FNV-1a (32 бита)', () => {
        // Пустая строка — offset basis; "a" и "foobar" — векторы из спецификации FNV.
        expect(fnv1a('')).toBe(0x811c9dc5);
        expect(fnv1a('a')).toBe(0xe40c292c);
        expect(fnv1a('foobar')).toBe(0xbf9cf968);
    });

    it('seedOf — fnv1a от частей через разделитель, порядок частей значим', () => {
        expect(SEED_SEPARATOR).toBe('|');
        expect(seedOf('portal', 42, '2026-09-14', 'sam-1.0.0')).toBe(
            fnv1a('portal|42|2026-09-14|sam-1.0.0'),
        );
        expect(seedOf('a', 'b')).not.toBe(seedOf('b', 'a'));
        expect(seedOf('a', 'b')).toBe(seedOf('a', 'b'));
    });
});

describe('mulberry32', () => {
    it('один seed — одна последовательность, разные seed — разные', () => {
        const first = mulberry32(12345);
        const second = mulberry32(12345);
        const other = mulberry32(12346);
        const a = Array.from({ length: 16 }, () => first());
        const b = Array.from({ length: 16 }, () => second());
        const c = Array.from({ length: 16 }, () => other());

        expect(a).toEqual(b);
        expect(a).not.toEqual(c);
    });

    it('значения в [0; 1) с моментами равномерного распределения', () => {
        const random = mulberry32(seedOf('uniform'));
        let min = 1;
        let max = 0;
        const { mean, variance } = moments(() => {
            const value = random();
            min = Math.min(min, value);
            max = Math.max(max, value);

            return value;
        });

        expect(min).toBeGreaterThanOrEqual(0);
        expect(max).toBeLessThan(1);
        // SE среднего = 1/√(12·N) ≈ 0,002; допуск — пять SE.
        expect(Math.abs(mean - 0.5)).toBeLessThan(0.01);
        expect(Math.abs(variance - 1 / 12)).toBeLessThan(0.004);
    });
});

describe('sampleNormal', () => {
    it('среднее 0 и дисперсия 1', () => {
        const random = mulberry32(seedOf('normal'));
        const { mean, variance } = moments(() => sampleNormal(random));

        // SE среднего = 1/√N ≈ 0,007; SE дисперсии = √(2/N) ≈ 0,01.
        expect(Math.abs(mean)).toBeLessThan(0.035);
        expect(Math.abs(variance - 1)).toBeLessThan(0.05);
    });
});

describe('sampleGamma', () => {
    it.each([2.5, 1, 0.5])(
        'Gamma(%s, 1): среднее и дисперсия равны shape',
        shape => {
            const random = mulberry32(seedOf('gamma', shape));
            const { mean, variance } = moments(() =>
                sampleGamma(shape, random),
            );
            // SE среднего = √(shape/N); дисперсия при shape < 1 тяжелохвостая —
            // допуск 15 % от shape накрывает пять SE.
            const meanTolerance = 5 * Math.sqrt(shape / N);

            expect(Math.abs(mean - shape)).toBeLessThan(meanTolerance);
            expect(Math.abs(variance - shape)).toBeLessThan(0.15 * shape);
        },
    );

    it('вырожденная форма даёт ноль', () => {
        const random = mulberry32(1);

        expect(sampleGamma(0, random)).toBe(0);
        expect(sampleGamma(-1, random)).toBe(0);
        expect(sampleGamma(Number.NaN, random)).toBe(0);
    });
});

describe('sampleBeta', () => {
    it('Beta(2, 5): среднее a/(a+b) и дисперсия ab/((a+b)²(a+b+1))', () => {
        const random = mulberry32(seedOf('beta'));
        const alpha = 2;
        const beta = 5;
        const expectedMean = alpha / (alpha + beta);
        const expectedVariance =
            (alpha * beta) / ((alpha + beta) ** 2 * (alpha + beta + 1));
        const { mean, variance } = moments(() =>
            sampleBeta(alpha, beta, random),
        );

        // SE среднего = √(var/N) ≈ 0,0011; допуск — пять SE.
        expect(Math.abs(mean - expectedMean)).toBeLessThan(
            5 * Math.sqrt(expectedVariance / N),
        );
        expect(Math.abs(variance - expectedVariance)).toBeLessThan(0.003);
    });

    it('вырожденные параметры: масса на одной стороне', () => {
        const random = mulberry32(1);

        expect(sampleBeta(0, 3, random)).toBe(0);
        expect(sampleBeta(3, 0, random)).toBe(1);
        expect(sampleBeta(Number.NaN, 1, random)).toBe(0);
    });
});

describe('sampleBinomial', () => {
    it('Binomial(20, 0.3): среднее np и дисперсия np(1 − p)', () => {
        const random = mulberry32(seedOf('binomial'));
        const trials = 20;
        const p = 0.3;
        const { mean, variance } = moments(
            () => sampleBinomial(trials, p, random),
            10000,
        );

        // SE среднего = √(np(1−p)/10000) ≈ 0,02; допуск — пять SE.
        expect(Math.abs(mean - trials * p)).toBeLessThan(0.1);
        expect(Math.abs(variance - trials * p * (1 - p))).toBeLessThan(0.3);
    });

    it('вероятность клипуется в [0; 1], испытания — целое ≥ 0', () => {
        const random = mulberry32(1);

        expect(sampleBinomial(5, 2, random)).toBe(5);
        expect(sampleBinomial(5, -1, random)).toBe(0);
        expect(sampleBinomial(0, 0.5, random)).toBe(0);
        expect(sampleBinomial(-3, 0.5, random)).toBe(0);
    });
});
