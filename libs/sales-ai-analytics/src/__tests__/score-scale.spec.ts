import { toScore10 } from '../model/score-scale';

describe('toScore10', () => {
    it('0–100 → 1–10 с одной цифрой после запятой; нет оценки — null', () => {
        expect(toScore10(84)).toBe(8.4);
        expect(toScore10(83.6)).toBe(8.4);
        expect(toScore10(100)).toBe(10);
        expect(toScore10(null)).toBeNull();
        expect(toScore10(undefined)).toBeNull();
        expect(toScore10(Number.NaN)).toBeNull();
    });
});
