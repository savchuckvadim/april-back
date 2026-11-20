import { readDealMovementDealsSnapshot } from '../deal-movement-deals.types';
import { readDealMovementSnapshot } from '../deal-movement-snapshot.view';

/** Снимок формы 1 (до 20.11.2026): без сумм, разреза и проверок. */
const formOne = {
    day: '2026-11-18',
    mode: 'count',
    calcVersion: 'deal-movement-v3',
    generatedAt: '2026-11-17T23:40:00.000Z',
    openTotal: 120,
    evaluated: 120,
    baseline: false,
    firstSeen: 0,
    // «Без внимания» в старых снимках может не быть.
    byStatus: { rolled_back: 1, stuck: 10, at_risk: 9, moving: 100 },
    changes: [],
    changesTotal: 0,
    warnings: [],
};

describe('чтение дневного снимка движения сделок', () => {
    it('старый снимок читается: суммы и разрез — null, проверок нет', () => {
        const view = readDealMovementSnapshot(formOne);

        expect(view).toMatchObject({
            day: '2026-11-18',
            form: 1,
            totals: null,
            byManager: null,
            progressChecks: [],
            progressCheckDays: null,
        });
        expect(view?.byStatus.abandoned).toBe(0);
        expect(view?.byStatus.stuck).toBe(10);
    });

    it('снимок формы 2: суммы, разрез по ответственным и проверки; битое — мимо', () => {
        const view = readDealMovementSnapshot({
            ...formOne,
            form: 2,
            totals: {
                moving: { count: 100, amountSum: 5_000_000 },
                stuck: { count: 10, amountSum: 300_000 },
            },
            byManager: {
                '447': { stuck: { count: 4, amountSum: 120_000 } },
                broken: 'nope',
            },
            progressChecks: [
                {
                    transcriptionId: 't1',
                    dealId: '9041',
                    at: '2026-11-05T10:00:00.000Z',
                    progress: 5,
                    outcome: 'still',
                },
                { transcriptionId: 't2', outcome: 'maybe' },
            ],
            progressCheckDays: 12,
        });

        expect(view?.form).toBe(2);
        expect(view?.totals?.moving).toEqual({
            count: 100,
            amountSum: 5_000_000,
        });
        expect(view?.totals?.abandoned).toEqual({ count: 0, amountSum: 0 });
        expect(Object.keys(view?.byManager ?? {})).toEqual(['447']);
        expect(view?.byManager?.['447'].stuck.count).toBe(4);
        expect(
            view?.progressChecks.map(check => check.transcriptionId),
        ).toEqual(['t1']);
        expect(view?.progressCheckDays).toBe(12);
    });

    it('не снимок движения сделок — null', () => {
        expect(readDealMovementSnapshot({ day: '2026-11-18' })).toBeNull();
        expect(readDealMovementSnapshot(null)).toBeNull();
    });
});

describe('чтение списка проблемных сделок', () => {
    it('битые строки отбрасываются, остальное читается', () => {
        const read = readDealMovementDealsSnapshot({
            form: 1,
            day: '2026-11-20',
            generatedAt: '2026-11-19T23:40:00.000Z',
            calcVersion: 'deal-movement-v3',
            perGroup: 30,
            groups: [
                { managerId: '447', status: 'stuck', total: 40, shown: 30 },
                { managerId: '447', status: 'moving', total: 1, shown: 1 },
            ],
            deals: [
                {
                    dealId: '9041',
                    managerId: '447',
                    status: 'stuck',
                    title: 'ООО Ромашка',
                    amount: 150_000,
                    stageCode: 'sales_pres',
                    stageTitle: 'Презентация',
                    daysInStage: 40,
                    stageLimitDays: 21,
                    stageLimitSource: 'default',
                    reasons: 'дольше срока стадии',
                    since: null,
                },
                { dealId: 'broken' },
            ],
        });

        expect(read?.groups).toHaveLength(1);
        expect(read?.deals.map(deal => deal.dealId)).toEqual(['9041']);
    });

    it('чужая форма — null', () => {
        expect(readDealMovementDealsSnapshot({ day: '2026-11-20' })).toBeNull();
    });
});
