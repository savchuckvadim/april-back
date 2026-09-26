import {
    alignSeries,
    detectGoodhart,
    GOODHART_DEFAULTS,
    relativeChange,
} from '../model/goodhart';
import type { GoodhartPair } from '../model/goodhart.types';
import type { TrendSeriesPoint } from '../model/trend/trend.types';

/**
 * Детектор Гудхарта (Фаза 3, П9): накрутка давления при падении
 * противовеса даёт флаг, честный рост — нет, короткое окно — null.
 */
const PAIRS: readonly GoodhartPair[] = [
    { code: 'volume_vs_quality', pressure: 'volume', counter: 'quality' },
    { code: 'quality_vs_offer', pressure: 'quality', counter: 'edge_offer' },
];
const OPTIONS = { windowMonths: 3, drop: 0.3, alpha: 0.3 };

const series = (
    metric: string,
    values: readonly (number | null)[],
): { metric: string; points: TrendSeriesPoint[] } => ({
    metric,
    points: values.flatMap((value, index) =>
        value === null
            ? []
            : [
                  {
                      key: `2026-${String(index + 1).padStart(2, '0')}`,
                      value,
                      n: 20,
                  },
              ],
    ),
});

describe('detectGoodhart — расхождение сглаженных рядов', () => {
    it('звонков ×1,5 при продажах −30 % → флаг пары с числами окна', () => {
        const flags = detectGoodhart(
            [
                series('volume', [100, 120, 150]),
                series('quality', [7, 5.5, 4.5]),
            ],
            PAIRS,
            { ...OPTIONS, alpha: 1 },
        );

        expect(flags).toEqual([
            {
                pair: 'volume_vs_quality',
                pressure: 'volume',
                counter: 'quality',
                fromKey: '2026-01',
                toKey: '2026-03',
                pressureChange: 0.5,
                counterChange: expect.closeTo(-0.357, 3) as number,
                points: 3,
            },
        ]);
    });

    it('всё растёт — данных хватило, расхождений нет: пустой список', () => {
        expect(
            detectGoodhart(
                [
                    series('volume', [100, 120, 150]),
                    series('quality', [6, 6.5, 7]),
                ],
                PAIRS,
                OPTIONS,
            ),
        ).toEqual([]);
    });

    it('окно короче goodhart_window_months → null, а не пустой список', () => {
        expect(
            detectGoodhart(
                [series('volume', [100, 150]), series('quality', [7, 4])],
                PAIRS,
                OPTIONS,
            ),
        ).toBeNull();
    });

    it('месяц без точки у одного ряда выпадает из окна обоих', () => {
        const flags = detectGoodhart(
            [
                series('volume', [100, null, 120, 150, 160]),
                series('quality', [7, 7, 6, 4.5, 4]),
            ],
            PAIRS,
            { ...OPTIONS, alpha: 1 },
        );

        // Общие месяцы: 01, 03, 04, 05 → окно 03..05.
        expect(flags?.[0]).toMatchObject({
            fromKey: '2026-03',
            toKey: '2026-05',
        });
    });

    it('нулевая первая точка делает пару непроверяемой, не флагом', () => {
        expect(
            detectGoodhart(
                [series('volume', [0, 10, 20]), series('quality', [7, 5, 4])],
                PAIRS,
                OPTIONS,
            ),
        ).toBeNull();
    });

    it('рост давления ниже minRise — флага нет', () => {
        expect(
            detectGoodhart(
                [
                    series('volume', [100, 101, 102]),
                    series('quality', [7, 5, 4]),
                ],
                PAIRS,
                { ...OPTIONS, alpha: 1 },
            ),
        ).toEqual([]);
        expect(GOODHART_DEFAULTS.minRise).toBe(0.05);
    });

    it('флаги отсортированы: худший противовес первым', () => {
        const flags = detectGoodhart(
            [
                series('volume', [100, 150, 200]),
                series('quality', [7, 8, 9]),
                series('edge_offer', [0.5, 0.3, 0.2]),
            ],
            [
                ...PAIRS,
                {
                    code: 'volume_vs_offer',
                    pressure: 'volume',
                    counter: 'edge_offer',
                },
            ],
            { ...OPTIONS, alpha: 1 },
        );

        expect(flags?.map(flag => flag.pair)).toEqual([
            'quality_vs_offer',
            'volume_vs_offer',
        ]);
        expect(flags?.[0].counterChange).toBeLessThanOrEqual(
            flags?.[1].counterChange ?? 0,
        );
    });
});

describe('помощники', () => {
    it('alignSeries — общие ключи по возрастанию, повтор ключа — последний', () => {
        expect(
            alignSeries(
                [
                    { key: '2026-02', value: 2, n: 1 },
                    { key: '2026-01', value: 1, n: 1 },
                    { key: '2026-02', value: 3, n: 1 },
                ],
                [
                    { key: '2026-02', value: 20, n: 1 },
                    { key: '2026-03', value: 30, n: 1 },
                ],
            ),
        ).toEqual([{ key: '2026-02', pressure: 3, counter: 20 }]);
    });

    it('relativeChange — сглаживание EWMA, меньше двух точек → null', () => {
        expect(relativeChange([100, 150], 1)).toBeCloseTo(0.5, 6);
        expect(relativeChange([100], 1)).toBeNull();
        expect(relativeChange([0, 5], 1)).toBeNull();
        // α = 0,5: y₁ = 0,5·150 + 0,5·100 = 125 → +25 %.
        expect(relativeChange([100, 150], 0.5)).toBeCloseTo(0.25, 6);
    });
});
