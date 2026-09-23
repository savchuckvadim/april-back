import { mulberry32 } from '../../prng';
import { SetPair } from '../agreement.types';
import { f1FromCounts, setCounts, setF1, setF1ByCode, sumCounts } from '../f1';

const swapped = (pairs: readonly SetPair[]): SetPair[] =>
    pairs.map(pair => ({ first: pair.second, second: pair.first }));

describe('setCounts / f1FromCounts: табличные случаи', () => {
    it('опорный {b, c, d}, проверяемый {a, b, c} → tp 2, fp 1, fn 1, P = R = F1 = 2/3', () => {
        const counts = setCounts({
            first: ['b', 'c', 'd'],
            second: ['a', 'b', 'c'],
        });
        expect(counts).toEqual({ tp: 2, fp: 1, fn: 1 });
        const result = f1FromCounts(counts);
        expect(result.precision).toBeCloseTo(2 / 3, 12);
        expect(result.recall).toBeCloseTo(2 / 3, 12);
        expect(result.f1).toBeCloseTo(2 / 3, 12);
    });

    it('tp 8, fp 2, fn 4 → P = 0,8, R = 2/3, F1 = 2·8/(16 + 6) = 8/11', () => {
        const result = f1FromCounts({ tp: 8, fp: 2, fn: 4 });
        expect(result.precision).toBeCloseTo(0.8, 12);
        expect(result.recall).toBeCloseTo(2 / 3, 12);
        expect(result.f1).toBeCloseTo(8 / 11, 12);
        expect(result.f1).toBeCloseTo((2 * 0.8 * (2 / 3)) / (0.8 + 2 / 3), 12);
    });

    it('полное совпадение → 1; непересекающиеся → 0; оба пусты → null', () => {
        expect(
            f1FromCounts(setCounts({ first: ['a', 'b'], second: ['b', 'a'] })),
        ).toEqual({
            tp: 2,
            fp: 0,
            fn: 0,
            precision: 1,
            recall: 1,
            f1: 1,
        });
        const disjoint = f1FromCounts(
            setCounts({ first: ['a'], second: ['b'] }),
        );
        expect(disjoint.precision).toBe(0);
        expect(disjoint.recall).toBe(0);
        expect(disjoint.f1).toBe(0);
        expect(f1FromCounts(setCounts({ first: [], second: [] }))).toEqual({
            tp: 0,
            fp: 0,
            fn: 0,
            precision: null,
            recall: null,
            f1: null,
        });
    });

    it('второй пуст → P null, R 0, F1 0; первый пуст → P 0, R null, F1 0', () => {
        const missed = f1FromCounts(setCounts({ first: ['a'], second: [] }));
        expect(missed).toMatchObject({ precision: null, recall: 0, f1: 0 });
        const extra = f1FromCounts(setCounts({ first: [], second: ['a'] }));
        expect(extra).toMatchObject({ precision: 0, recall: null, f1: 0 });
    });

    it('повторы кода внутри прогона считаются одним', () => {
        expect(
            setCounts({ first: ['a', 'a', 'b'], second: ['a', 'b', 'b'] }),
        ).toEqual({
            tp: 2,
            fp: 0,
            fn: 0,
        });
    });
});

describe('setF1 / setF1ByCode: микро-усреднение и разрез по кодам', () => {
    const PAIRS: SetPair[] = [
        { first: ['price', 'time'], second: ['price'] },
        { first: ['price'], second: ['price', 'trust'] },
        { first: [], second: [] },
    ];

    it('микро: tp 2 (price × 2), fp 1 (trust), fn 1 (time) → P = R = F1 = 2/3', () => {
        const result = setF1(PAIRS);
        expect(result).toMatchObject({ tp: 2, fp: 1, fn: 1 });
        expect(result.f1).toBeCloseTo(2 / 3, 12);
        expect(sumCounts([])).toEqual({ tp: 0, fp: 0, fn: 0 });
    });

    it('по кодам, отсортировано: price {2,0,0} → 1, time {0,0,1} → 0, trust {0,1,0} → 0', () => {
        const byCode = setF1ByCode(PAIRS);
        expect(byCode.map(item => item.code)).toEqual([
            'price',
            'time',
            'trust',
        ]);
        expect(byCode[0]).toMatchObject({ tp: 2, fp: 0, fn: 0, f1: 1 });
        expect(byCode[1]).toMatchObject({
            tp: 0,
            fp: 0,
            fn: 1,
            f1: 0,
            precision: null,
        });
        expect(byCode[2]).toMatchObject({
            tp: 0,
            fp: 1,
            fn: 0,
            f1: 0,
            recall: null,
        });
    });

    it('суммы по кодам равны микро-счётчикам', () => {
        const byCode = setF1ByCode(PAIRS);
        expect(sumCounts(byCode)).toEqual(sumCounts(PAIRS.map(setCounts)));
    });
});

describe('setF1: свойства', () => {
    const CODES = ['price', 'time', 'trust', 'need', 'other'] as const;
    const randomSet = (random: () => number): string[] =>
        CODES.filter(() => random() < 0.4);
    const randomPairs = (random: () => number): SetPair[] =>
        Array.from({ length: 30 }, () => ({
            first: randomSet(random),
            second: randomSet(random),
        }));

    it('перестановка прогонов меняет P и R местами, F1 не меняет (100 случайных наборов)', () => {
        const random = mulberry32(41);
        for (let round = 0; round < 100; round += 1) {
            const pairs = randomPairs(random);
            const direct = setF1(pairs);
            const mirror = setF1(swapped(pairs));
            expect(mirror.precision).toBe(direct.recall);
            expect(mirror.recall).toBe(direct.precision);
            expect(mirror.f1).toBe(direct.f1);
            expect(mirror.fp).toBe(direct.fn);
        }
    });

    it('F1 ∈ [0, 1] и равен гармоническому среднему P и R, когда оба определены', () => {
        const random = mulberry32(42);
        for (let round = 0; round < 100; round += 1) {
            const result = setF1(randomPairs(random));
            if (result.f1 === null) continue;
            expect(result.f1).toBeGreaterThanOrEqual(0);
            expect(result.f1).toBeLessThanOrEqual(1);
            const { precision, recall } = result;
            if (
                precision !== null &&
                recall !== null &&
                precision + recall > 0
            ) {
                expect(result.f1).toBeCloseTo(
                    (2 * precision * recall) / (precision + recall),
                    12,
                );
            }
        }
    });
});
