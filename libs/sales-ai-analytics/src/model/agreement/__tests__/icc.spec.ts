import { mulberry32, sampleNormal } from '../../prng';
import { icc21 as reliabilityIcc21 } from '../../reliability';
import { iccOfPairs, iccTwoWay, isBalancedMatrix } from '../icc';

/** Shrout & Fleiss (1979), таблица 2: 6 объектов × 4 оценщика. */
const SHROUT_FLEISS = [
    [9, 2, 5, 8],
    [6, 1, 3, 2],
    [8, 4, 6, 8],
    [7, 1, 2, 6],
    [10, 5, 6, 9],
    [6, 2, 4, 7],
] as const;

describe('iccTwoWay: Shrout & Fleiss (1979), 6 объектов × 4 оценщика', () => {
    const result = iccTwoWay(SHROUT_FLEISS);

    it('ANOVA: MSR = 11,24, MSC = 32,49, MSE = 1,02', () => {
        expect(result).not.toBeNull();
        expect(result?.n).toBe(6);
        expect(result?.k).toBe(4);
        expect(result?.msRows).toBeCloseTo(11.24, 2);
        expect(result?.msCols).toBeCloseTo(32.49, 2);
        expect(result?.msError).toBeCloseTo(1.02, 2);
    });

    it('ICC(2,1) = 0,29 (0,2898), ICC(3,1) = 0,71 (0,7148)', () => {
        expect(result?.icc21).toBeCloseTo(0.2898, 4);
        expect(result?.icc31).toBeCloseTo(0.7148, 4);
    });

    it('совпадает с icc21 из model/reliability на той же матрице', () => {
        const legacy = reliabilityIcc21(
            SHROUT_FLEISS.map((ratings, index) => ({
                key: `t${index}`,
                ratings,
            })),
        );
        expect(result?.icc21).toBeCloseTo(legacy as number, 12);
    });
});

describe('iccTwoWay: два прогона (k = 2)', () => {
    it('второй прогон = первый + 1: ICC(3,1) = 1, ICC(2,1) = 40/43 (сдвиг штрафуется только абсолютным согласием)', () => {
        const result = iccTwoWay([
            [1, 2],
            [3, 4],
            [5, 6],
            [7, 8],
        ]);
        expect(result?.msRows).toBeCloseTo(40 / 3, 12);
        expect(result?.msCols).toBeCloseTo(2, 12);
        expect(result?.msError).toBeCloseTo(0, 12);
        expect(result?.icc31).toBeCloseTo(1, 12);
        expect(result?.icc21).toBeCloseTo(40 / 43, 12);
    });

    it('идентичные прогоны → MSE = 0, ICC(2,1) = ICC(3,1) = 1', () => {
        const result = iccOfPairs([
            { first: 7, second: 7 },
            { first: 4, second: 4 },
            { first: 9, second: 9 },
        ]);
        expect(result?.msError).toBe(0);
        expect(result?.icc21).toBe(1);
        expect(result?.icc31).toBe(1);
    });

    it('между объектами сигнала нет (1/5, 5/1, …): оценка отрицательна и обрезана до 0', () => {
        const result = iccTwoWay([
            [1, 5],
            [5, 1],
            [1, 5],
            [5, 1],
        ]);
        expect(result?.msRows).toBe(0);
        expect(result?.icc21).toBe(0);
        expect(result?.icc31).toBe(0);
    });

    it('все значения одинаковы → MS = 0, коэффициенты null', () => {
        const result = iccTwoWay([
            [5, 5],
            [5, 5],
        ]);
        expect(result?.msRows).toBe(0);
        expect(result?.icc21).toBeNull();
        expect(result?.icc31).toBeNull();
    });
});

describe('iccTwoWay: неполная матрица → null', () => {
    it('меньше двух объектов, меньше двух прогонов, рваные строки, NaN', () => {
        expect(iccTwoWay([])).toBeNull();
        expect(iccTwoWay([[1, 2]])).toBeNull();
        expect(iccTwoWay([[1], [2]])).toBeNull();
        expect(
            iccTwoWay([
                [1, 2],
                [3, 4, 5],
            ]),
        ).toBeNull();
        expect(
            iccTwoWay([
                [1, Number.NaN],
                [3, 4],
            ]),
        ).toBeNull();
        expect(isBalancedMatrix([[1, 2], [3]])).toBe(false);
        expect(
            isBalancedMatrix([
                [1, 2],
                [3, 4],
            ]),
        ).toBe(true);
    });
});

describe('iccTwoWay: свойства', () => {
    const randomMatrix = (
        random: () => number,
        n: number,
        k: number,
    ): number[][] =>
        Array.from({ length: n }, () => {
            const truth = 5 + 2 * sampleNormal(random);
            return Array.from(
                { length: k },
                () => truth + 1.2 * sampleNormal(random),
            );
        });

    it('симметрия: перестановка столбцов и строк не меняет ICC (50 случайных матриц)', () => {
        const random = mulberry32(21);
        for (let round = 0; round < 50; round += 1) {
            const matrix = randomMatrix(random, 12, 3);
            const direct = iccTwoWay(matrix);
            const columnsSwapped = iccTwoWay(
                matrix.map(row => [row[2], row[0], row[1]]),
            );
            const rowsReversed = iccTwoWay([...matrix].reverse());
            expect(columnsSwapped?.icc21).toBeCloseTo(
                direct?.icc21 as number,
                12,
            );
            expect(columnsSwapped?.icc31).toBeCloseTo(
                direct?.icc31 as number,
                12,
            );
            expect(rowsReversed?.icc21).toBeCloseTo(
                direct?.icc21 as number,
                12,
            );
        }
    });

    it('ICC ∈ [0, 1]; при MSC ≥ MSE ICC(2,1) ≤ ICC(3,1); iccOfPairs равен iccTwoWay', () => {
        const random = mulberry32(22);
        for (let round = 0; round < 50; round += 1) {
            const matrix = randomMatrix(random, 20, 2);
            const result = iccTwoWay(matrix);
            expect(result?.icc21 as number).toBeGreaterThanOrEqual(0);
            expect(result?.icc21 as number).toBeLessThanOrEqual(1);
            // Сдвиг между прогонами штрафует только (2,1); при MSC < MSE
            // знаменатель (2,1) становится меньше и неравенство не обязано
            // держаться (McGraw, Wong, 1996).
            if ((result?.msCols as number) >= (result?.msError as number)) {
                expect(result?.icc21 as number).toBeLessThanOrEqual(
                    (result?.icc31 as number) + 1e-12,
                );
            }
            const viaPairs = iccOfPairs(
                matrix.map(row => ({ first: row[0], second: row[1] })),
            );
            expect(viaPairs).toEqual(result);
        }
    });
});
