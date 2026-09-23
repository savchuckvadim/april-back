import {
    toTrendsBlock,
    type TrendsView,
} from '../domain/presenter/trends.presenter';

/**
 * Презентер трендов строки: молчит при n < n_min_none, доверии none и
 * чужой форме; отдаёт не больше трёх сигналов в порядке нагрузки.
 */
const signal = (overrides: Record<string, unknown> = {}) => ({
    metric: 'quality',
    grain: 'week',
    kind: 'shift',
    direction: 'down',
    sinceKey: '2026-W31',
    sinceIndex: 19,
    magnitude: -0.8,
    statistic: 9.4,
    threshold: 6.1,
    sinceWeek: '2026-W31',
    confidence: 'ok',
    ...overrides,
});

const view = (overrides: Partial<TrendsView> = {}): TrendsView => ({
    weekKey: '2026-W38',
    calls: 214,
    confidence: 'ok',
    metrics: [
        { metric: 'quality', points: 21 },
        { metric: 'volume', points: 26 },
    ],
    signals: [signal()],
    ...overrides,
});

describe('toTrendsBlock — тренды строки менеджера', () => {
    it('сигнал нагрузки → DTO без внутренних полей статистики', () => {
        expect(toTrendsBlock(view(), { n: 40 })).toEqual({
            weekKey: '2026-W38',
            calls: 214,
            weeks: 21,
            confidence: 'ok',
            signals: [
                {
                    metric: 'quality',
                    grain: 'week',
                    kind: 'shift',
                    direction: 'down',
                    sinceWeek: '2026-W31',
                    magnitude: -0.8,
                    confidence: 'ok',
                },
            ],
        });
    });

    it('n < n_min_none — блока нет, ни одного числа наружу', () => {
        expect(toTrendsBlock(view(), { n: 7 })).toBeNull();
        expect(toTrendsBlock(view(), { n: 8 })).not.toBeNull();
        expect(toTrendsBlock(view(), { n: 30, minN: 40 })).toBeNull();
    });

    it('снапшота нет или доверие none → null', () => {
        expect(toTrendsBlock(null, { n: 40 })).toBeNull();
        expect(toTrendsBlock(undefined, { n: 40 })).toBeNull();
        expect(
            toTrendsBlock(view({ confidence: 'none' }), { n: 40 }),
        ).toBeNull();
        expect(
            toTrendsBlock(view({ confidence: 'сомнительно' }), { n: 40 }),
        ).toBeNull();
        expect(toTrendsBlock(view({ weekKey: 38 }), { n: 40 })).toBeNull();
    });

    it('чужая или неполная форма сигнала отбрасывается, сигнал с доверием none тоже', () => {
        const block = toTrendsBlock(
            view({
                signals: [
                    signal({ metric: 'mood' }),
                    signal({ kind: 'jump' }),
                    signal({ magnitude: 'много' }),
                    signal({ confidence: 'none' }),
                    signal({
                        metric: 'volume',
                        kind: 'outlier',
                        direction: 'up',
                        magnitude: 5,
                    }),
                    'не сигнал',
                ],
            }),
            { n: 40 },
        );
        expect(block?.signals).toEqual([
            {
                metric: 'volume',
                grain: 'week',
                kind: 'outlier',
                direction: 'up',
                sinceWeek: '2026-W31',
                magnitude: 5,
                confidence: 'ok',
            },
        ]);
    });

    it('не больше трёх сигналов, порядок нагрузки сохраняется; max = 0 — пусто', () => {
        const signals = [
            signal({ metric: 'quality' }),
            signal({ metric: 'bucket_presentation', kind: 'drift' }),
            signal({ metric: 'volume', kind: 'drift' }),
            signal({
                metric: 'edge_invoice_to_sale',
                grain: 'month',
                kind: 'outlier',
            }),
        ];
        const block = toTrendsBlock(view({ signals }), { n: 40 });
        expect(block?.signals.map(item => item.metric)).toEqual([
            'quality',
            'bucket_presentation',
            'volume',
        ]);
        expect(
            toTrendsBlock(view({ signals }), { n: 40, max: 0 })?.signals,
        ).toEqual([]);
    });

    it('чужая форма metrics и calls деградирует до нулей', () => {
        const block = toTrendsBlock(
            view({ metrics: 'нет', calls: '214', signals: [] }),
            { n: 40 },
        );
        expect(block).toEqual({
            weekKey: '2026-W38',
            calls: 0,
            weeks: 0,
            confidence: 'ok',
            signals: [],
        });
    });
});
