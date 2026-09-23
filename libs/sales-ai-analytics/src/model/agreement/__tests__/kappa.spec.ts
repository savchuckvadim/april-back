import { mulberry32 } from '../../prng';
import { CategoryPair } from '../agreement.types';
import {
    cohenKappa,
    confusionTable,
    disagreementWeight,
    kappaLevels,
    pabakOf,
} from '../kappa';

/** Пары из таблицы сопряжённости: counts[i][j] пар (levels[i], levels[j]). */
const pairsOfTable = (
    levels: readonly string[],
    counts: readonly (readonly number[])[],
): CategoryPair[] => {
    const out: CategoryPair[] = [];
    levels.forEach((first, i) =>
        levels.forEach((second, j) => {
            for (let c = 0; c < counts[i][j]; c += 1) {
                out.push({ first, second });
            }
        }),
    );
    return out;
};

const YES_NO = ['yes', 'no'] as const;

const swapped = (pairs: readonly CategoryPair[]): CategoryPair[] =>
    pairs.map(pair => ({ first: pair.second, second: pair.first }));

const table2x2 = (a: number, b: number, c: number, d: number): CategoryPair[] =>
    pairsOfTable(YES_NO, [
        [a, b],
        [c, d],
    ]);

describe('cohenKappa: табличные случаи 2 × 2 (Cohen, 1960; Wikipedia)', () => {
    it('20/5/10/15 → p_o = 0,7, p_e = 0,5, κ = 0,4, PABAK = 2·0,7 − 1 = 0,4', () => {
        const result = cohenKappa(table2x2(20, 5, 10, 15));
        expect(result.n).toBe(50);
        expect(result.categories).toBe(2);
        expect(result.po).toBeCloseTo(0.7, 12);
        expect(result.pe).toBeCloseTo(0.5, 12);
        expect(result.kappa).toBeCloseTo(0.4, 12);
        expect(result.pabak).toBeCloseTo(0.4, 12);
    });

    it('45/15/25/15 → p_o = 0,6, p_e = 0,54, κ = 0,1304', () => {
        const result = cohenKappa(table2x2(45, 15, 25, 15));
        expect(result.po).toBeCloseTo(0.6, 12);
        expect(result.pe).toBeCloseTo(0.54, 12);
        expect(result.kappa).toBeCloseTo(0.06 / 0.46, 12);
        expect(result.kappa).toBeCloseTo(0.1304, 4);
        expect(result.pabak).toBeCloseTo(0.2, 12);
    });

    it('25/35/5/35 → тот же p_o = 0,6, но p_e = 0,46 и κ = 0,2593; PABAK тот же 0,2', () => {
        const result = cohenKappa(table2x2(25, 35, 5, 35));
        expect(result.po).toBeCloseTo(0.6, 12);
        expect(result.pe).toBeCloseTo(0.46, 12);
        expect(result.kappa).toBeCloseTo(0.14 / 0.54, 12);
        expect(result.kappa).toBeCloseTo(0.2593, 4);
        expect(result.pabak).toBeCloseTo(0.2, 12);
    });

    it('полное согласие → 1; полное несогласие 0/10/10/0 → −1; независимость 25/25/25/25 → 0', () => {
        expect(cohenKappa(table2x2(30, 0, 0, 20)).kappa).toBe(1);
        expect(cohenKappa(table2x2(0, 10, 10, 0)).kappa).toBeCloseTo(-1, 12);
        expect(cohenKappa(table2x2(25, 25, 25, 25)).kappa).toBeCloseTo(0, 12);
    });
});

describe('взвешенная каппа (Cohen, 1968): уровни low < mid < high, таблица 10,2,0 / 1,8,1 / 0,2,6', () => {
    const LEVELS = ['low', 'mid', 'high'] as const;
    const pairs = pairsOfTable(LEVELS, [
        [10, 2, 0],
        [1, 8, 1],
        [0, 2, 6],
    ]);

    it('номинальная: p_o = 24/30, p_e = 308/900, κ = 412/592', () => {
        const result = cohenKappa(pairs, { levels: LEVELS });
        expect(result.n).toBe(30);
        expect(result.po).toBeCloseTo(24 / 30, 12);
        expect(result.pe).toBeCloseTo(308 / 900, 12);
        expect(result.kappa).toBeCloseTo(412 / 592, 12);
    });

    it('линейная: D_o = 3/30, D_e = 382/900, κ_w = 1 − D_o/D_e = 292/382', () => {
        const result = cohenKappa(pairs, {
            levels: LEVELS,
            weighting: 'linear',
        });
        expect(result.po).toBeCloseTo(1 - 3 / 30, 12);
        expect(result.pe).toBeCloseTo(1 - 382 / 900, 12);
        expect(result.kappa).toBeCloseTo(292 / 382, 12);
    });

    it('квадратичная: D_o = 1,5/30, D_e = 277/900, κ_w = 232/277', () => {
        const result = cohenKappa(pairs, {
            levels: LEVELS,
            weighting: 'quadratic',
        });
        expect(result.po).toBeCloseTo(1 - 1.5 / 30, 12);
        expect(result.pe).toBeCloseTo(1 - 277 / 900, 12);
        expect(result.kappa).toBeCloseTo(232 / 277, 12);
    });

    it('соседние расхождения: κ < κ_lin < κ_quad; PABAK = (3·0,8 − 1)/2 = 0,7 при любом взвешивании', () => {
        const none = cohenKappa(pairs, { levels: LEVELS });
        const linear = cohenKappa(pairs, {
            levels: LEVELS,
            weighting: 'linear',
        });
        const quad = cohenKappa(pairs, {
            levels: LEVELS,
            weighting: 'quadratic',
        });
        expect(none.kappa as number).toBeLessThan(linear.kappa as number);
        expect(linear.kappa as number).toBeLessThan(quad.kappa as number);
        for (const result of [none, linear, quad]) {
            expect(result.pabak).toBeCloseTo(0.7, 12);
        }
    });

    it('при двух уровнях взвешивание κ не меняет', () => {
        const two = table2x2(20, 5, 10, 15);
        const plain = cohenKappa(two, { levels: YES_NO }).kappa as number;
        expect(
            cohenKappa(two, { levels: YES_NO, weighting: 'linear' }).kappa,
        ).toBeCloseTo(plain, 12);
        expect(
            cohenKappa(two, { levels: YES_NO, weighting: 'quadratic' }).kappa,
        ).toBeCloseTo(plain, 12);
    });

    it('веса несогласия: 0 на диагонали, |i − j|/(k − 1) линейные, квадрат — квадратичные', () => {
        expect(disagreementWeight(1, 1, 3, 'linear')).toBe(0);
        expect(disagreementWeight(0, 2, 3, 'none')).toBe(1);
        expect(disagreementWeight(0, 1, 3, 'linear')).toBe(0.5);
        expect(disagreementWeight(0, 1, 3, 'quadratic')).toBe(0.25);
        expect(disagreementWeight(0, 3, 4, 'quadratic')).toBe(1);
    });
});

describe('cohenKappa: вырожденные входы, уровни и таблица', () => {
    it('пустой набор → n = 0, κ и PABAK null', () => {
        expect(cohenKappa([])).toEqual({
            n: 0,
            categories: 0,
            weighting: 'none',
            po: 0,
            pe: 0,
            kappa: null,
            pabak: null,
        });
    });

    it('одна категория у обоих прогонов: p_e = 1 → κ null; при заданных двух уровнях PABAK = 1', () => {
        const same: CategoryPair[] = [
            { first: 'yes', second: 'yes' },
            { first: 'yes', second: 'yes' },
        ];
        const observed = cohenKappa(same);
        expect(observed.categories).toBe(1);
        expect(observed.kappa).toBeNull();
        expect(observed.pabak).toBeNull();
        const declared = cohenKappa(same, { levels: YES_NO });
        expect(declared.kappa).toBeNull();
        expect(declared.pabak).toBe(1);
        expect(pabakOf(1, 1)).toBeNull();
    });

    it('значения вне заданных уровней в расчёт не входят', () => {
        const result = cohenKappa(
            [
                { first: 'yes', second: 'yes' },
                { first: 'maybe', second: 'yes' },
                { first: 'no', second: 'no' },
            ],
            { levels: YES_NO },
        );
        expect(result.n).toBe(2);
        expect(result.kappa).toBe(1);
    });

    it('kappaLevels: заданные — без повторов в своём порядке, наблюдаемые — по алфавиту', () => {
        expect(kappaLevels([], ['hot', 'cold', 'hot'])).toEqual([
            'hot',
            'cold',
        ]);
        expect(
            kappaLevels([
                { first: 'warm', second: 'cold' },
                { first: 'hot', second: 'warm' },
            ]),
        ).toEqual(['cold', 'hot', 'warm']);
    });

    it('confusionTable: строки — первый прогон, столбцы — второй', () => {
        const table = confusionTable(
            [
                { first: 'yes', second: 'no' },
                { first: 'yes', second: 'no' },
                { first: 'no', second: 'yes' },
            ],
            YES_NO,
        );
        expect(table.counts).toEqual([
            [0, 2],
            [1, 0],
        ]);
        expect(table.n).toBe(3);
    });
});

describe('cohenKappa: свойства', () => {
    const LEVELS = ['a', 'b', 'c'] as const;
    /** Второй прогон с вероятностью 0,6 повторяет первый, иначе случайный. */
    const randomPairs = (random: () => number, n: number): CategoryPair[] =>
        Array.from({ length: n }, () => {
            const first = LEVELS[Math.floor(random() * 3)];
            const second =
                random() < 0.6 ? first : LEVELS[Math.floor(random() * 3)];
            return { first, second };
        });

    it('симметрия: перестановка прогонов не меняет κ, κ_w и PABAK (100 случайных наборов)', () => {
        const random = mulberry32(7);
        for (let round = 0; round < 100; round += 1) {
            const pairs = randomPairs(random, 40);
            for (const weighting of ['none', 'linear', 'quadratic'] as const) {
                const direct = cohenKappa(pairs, { levels: LEVELS, weighting });
                const mirror = cohenKappa(swapped(pairs), {
                    levels: LEVELS,
                    weighting,
                });
                expect(mirror.kappa).toBeCloseTo(direct.kappa as number, 12);
                expect(mirror.pabak).toBeCloseTo(direct.pabak as number, 12);
                expect(mirror.po).toBeCloseTo(direct.po, 12);
            }
        }
    });

    it('κ ∈ [−1, 1] и PABAK ∈ [−1, 1] на случайных наборах; p_o и p_e — доли', () => {
        const random = mulberry32(11);
        for (let round = 0; round < 100; round += 1) {
            const result = cohenKappa(randomPairs(random, 25), {
                levels: LEVELS,
            });
            expect(result.kappa as number).toBeGreaterThanOrEqual(-1 - 1e-12);
            expect(result.kappa as number).toBeLessThanOrEqual(1 + 1e-12);
            expect(result.pabak as number).toBeGreaterThanOrEqual(-1 - 1e-12);
            expect(result.pabak as number).toBeLessThanOrEqual(1 + 1e-12);
            expect(result.po).toBeGreaterThanOrEqual(0);
            expect(result.po).toBeLessThanOrEqual(1);
            expect(result.pe).toBeGreaterThanOrEqual(0);
            expect(result.pe).toBeLessThanOrEqual(1);
        }
    });

    it('идентичные прогоны → κ = 1 точно при любом взвешивании', () => {
        const random = mulberry32(3);
        const pairs = randomPairs(random, 60).map(pair => ({
            first: pair.first,
            second: pair.first,
        }));
        for (const weighting of ['none', 'linear', 'quadratic'] as const) {
            expect(cohenKappa(pairs, { levels: LEVELS, weighting }).kappa).toBe(
                1,
            );
        }
    });
});
