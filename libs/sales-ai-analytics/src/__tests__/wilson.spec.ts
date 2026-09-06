import { wilsonInterval } from '../model/wilson';

const TOLERANCE = 0.005;

describe('wilsonInterval', () => {
    it('4/35 при z = 1,645 даёт ≈ [0,052; 0,232]', () => {
        const [lower, upper] = wilsonInterval(4, 35, 1.645);
        expect(lower).toBeCloseTo(0.052, 2);
        expect(upper).toBeCloseTo(0.232, 2);
        expect(Math.abs(lower - 0.052)).toBeLessThanOrEqual(TOLERANCE);
        expect(Math.abs(upper - 0.232)).toBeLessThanOrEqual(TOLERANCE);
    });

    it('4/35 при z = 1,96 даёт ≈ [0,045; 0,26]', () => {
        const [lower, upper] = wilsonInterval(4, 35, 1.96);
        expect(Math.abs(lower - 0.045)).toBeLessThanOrEqual(TOLERANCE);
        expect(Math.abs(upper - 0.26)).toBeLessThanOrEqual(TOLERANCE);
    });

    it('по умолчанию использует z90 = 1,645', () => {
        expect(wilsonInterval(4, 35)).toEqual(wilsonInterval(4, 35, 1.645));
    });

    it('0/18 — «правило трёх»: нижняя 0, верхняя ≤ 0,17', () => {
        const [lower, upper] = wilsonInterval(0, 18);
        expect(lower).toBe(0);
        expect(upper).toBeLessThanOrEqual(0.17);
        expect(upper).toBeGreaterThan(0);
    });

    it('n/n даёт верхнюю границу ровно 1', () => {
        const [lower, upper] = wilsonInterval(18, 18);
        expect(upper).toBe(1);
        expect(lower).toBeGreaterThan(0.8);
    });

    it('n = 0 → нет информации, [0, 1]', () => {
        expect(wilsonInterval(0, 0)).toEqual([0, 1]);
        expect(wilsonInterval(3, -1)).toEqual([0, 1]);
    });

    it('successes вне [0, n] обрезаются', () => {
        expect(wilsonInterval(50, 10)).toEqual(wilsonInterval(10, 10));
        expect(wilsonInterval(-3, 10)).toEqual(wilsonInterval(0, 10));
    });

    it('интервал сужается с ростом n при той же доле', () => {
        const [l1, u1] = wilsonInterval(4, 35);
        const [l2, u2] = wilsonInterval(40, 350);
        expect(u2 - l2).toBeLessThan(u1 - l1);
    });
});
