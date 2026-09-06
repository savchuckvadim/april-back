import { XmrPoint, xmrLimits } from '../model/xmr';

const toPoints = (values: readonly number[]): XmrPoint[] =>
    values.map((value, index) => ({ key: `p${index}`, value, n: 10 }));

/** Детерминированный ГПСЧ (mulberry32) для синтетического ряда. */
function mulberry32(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

describe('xmrLimits', () => {
    it('меньше трёх точек → null', () => {
        expect(xmrLimits([])).toBeNull();
        expect(xmrLimits(toPoints([0.1, 0.2]))).toBeNull();
    });

    it('центр = среднее, MR̄ = среднее |x_i − x_{i−1}|, границы ± 2,66·MR̄', () => {
        const result = xmrLimits(toPoints([0.2, 0.4, 0.3, 0.5]));
        expect(result).not.toBeNull();
        const { center, movingRangeMean, ucl, lcl, state } =
            result as NonNullable<typeof result>;
        expect(center).toBeCloseTo(0.35, 10);
        expect(movingRangeMean).toBeCloseTo(0.5 / 3, 10);
        expect(ucl).toBeCloseTo(0.35 + 2.66 * (0.5 / 3), 10);
        // доли: нижняя граница обрезана в 0
        expect(lcl).toBe(0);
        expect(state).toBe('in');
    });

    it('не-доли: границы не обрезаются, выброс вверх → above', () => {
        const result = xmrLimits(toPoints([10, 11, 10, 11, 10, 40]));
        expect(result?.state).toBe('above');
        expect(result?.lcl).toBeLessThan(0);
        expect(result?.ucl).toBeLessThan(40);
    });

    it('провал последней точки ниже LCL → below', () => {
        const result = xmrLimits(
            toPoints([0.5, 0.5, 0.6, 0.5, 0.6, 0.5, 0.6, 0.0]),
        );
        expect(result?.state).toBe('below');
        expect(result?.lcl).toBeGreaterThan(0);
    });

    it('серия из 7 точек выше центра внутри границ → run', () => {
        const base = [
            0.35, 0.45, 0.35, 0.45, 0.35, 0.45, 0.35, 0.45, 0.35, 0.45,
        ];
        const tail = [0.5, 0.52, 0.5, 0.52, 0.5, 0.52, 0.5];
        const points = toPoints([...base, ...tail]);

        const result = xmrLimits(points);
        expect(result?.state).toBe('run');
        expect(tail.every(v => v > (result?.center ?? 1))).toBe(true);
        expect(tail.every(v => v <= (result?.ucl ?? 0))).toBe(true);

        // с более длинной серией сигнала нет
        expect(xmrLimits(points, { runLength: 9 })?.state).toBe('in');
    });

    it('серия ниже центра тоже даёт run', () => {
        const base = [
            0.55, 0.65, 0.55, 0.65, 0.55, 0.65, 0.55, 0.65, 0.55, 0.65,
        ];
        const tail = [0.5, 0.48, 0.5, 0.48, 0.5, 0.48, 0.5];
        expect(xmrLimits(toPoints([...base, ...tail]))?.state).toBe('run');
    });

    it('sigma из опций меняет ширину границ', () => {
        const points = toPoints([0.2, 0.4, 0.3, 0.5, 0.3]);
        const narrow = xmrLimits(points, { sigma: 1 });
        const wide = xmrLimits(points, { sigma: 3 });
        expect((narrow?.ucl ?? 0) < (wide?.ucl ?? 0)).toBe(true);
    });

    it('стационарный ряд из 100 точек: ≤ 1 ложного сигнала above/below по префиксам', () => {
        const random = mulberry32(20260905);
        const values = Array.from(
            { length: 100 },
            () => 0.5 + (random() + random() - 1) * 0.1,
        );
        const points = toPoints(values);

        let falseSignals = 0;
        for (let length = 3; length <= points.length; length += 1) {
            const state = xmrLimits(points.slice(0, length))?.state;
            if (state === 'above' || state === 'below') {
                falseSignals += 1;
            }
        }
        expect(falseSignals).toBeLessThanOrEqual(1);
    });

    it('детерминирован: одинаковый вход → одинаковый результат', () => {
        const points = toPoints([0.2, 0.4, 0.3, 0.5, 0.3, 0.6]);
        expect(xmrLimits(points)).toEqual(xmrLimits(points));
    });
});
