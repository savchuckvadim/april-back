import type { TrendsView } from '../domain/presenter/trends.presenter';
import { callsOf, overviewFixture } from './fixtures/overview.fixture';

/**
 * Тренды в строке обзора (Фаза 3, П1, доделка волны 1): снапшот
 * `ai-analytics-trends` менеджера доезжает до `managers[].trends` через
 * `applyPhase2`; без снапшота и при малом объёме разборов блок пуст.
 */
const MANAGER_ID = '10';

const trendsView = (overrides: Partial<TrendsView> = {}): TrendsView => ({
    weekKey: '2026-W36',
    calls: 214,
    confidence: 'ok',
    metrics: [{ metric: 'quality', points: 21 }],
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
    ...overrides,
});

function rowWithTrends(
    view: TrendsView | undefined,
    analyzed: number,
): ReturnType<typeof overviewFixture>['managers'][number] | undefined {
    const trends = new Map<string, TrendsView>();
    if (view !== undefined) trends.set(MANAGER_ID, view);
    const dto = overviewFixture(callsOf(MANAGER_ID, analyzed), [10], {
        snapshots: { trends },
    });

    return dto.managers.find(row => row.managerId === MANAGER_ID);
}

describe('Строка обзора — блок трендов из снапшота', () => {
    it('снапшот менеджера → блок с сигналами без внутренних полей', () => {
        const row = rowWithTrends(trendsView(), 40);

        expect(row?.trends).toEqual({
            weekKey: '2026-W36',
            calls: 214,
            weeks: 21,
            confidence: 'ok',
            signals: [
                expect.objectContaining({
                    metric: 'quality',
                    kind: 'shift',
                    direction: 'down',
                    sinceWeek: '2026-W31',
                }),
            ],
            goodhart: null,
        });
    });

    it('снапшота нет — trends: null, остальная строка на месте', () => {
        const row = rowWithTrends(undefined, 40);

        expect(row?.trends).toBeNull();
        expect(row?.analyzedCalls).toBe(40);
    });

    it('разборов меньше n_min_none — блока нет даже при снапшоте', () => {
        expect(rowWithTrends(trendsView(), 3)?.trends).toBeNull();
    });

    it('доверие рядов none — блока нет', () => {
        expect(
            rowWithTrends(trendsView({ confidence: 'none' }), 40)?.trends,
        ).toBeNull();
    });
});
