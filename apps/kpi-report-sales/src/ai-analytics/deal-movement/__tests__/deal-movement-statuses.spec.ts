import { dealMovementScopeOf } from '../deal-movement-scope';
import { presentDealMovementStatuses } from '../deal-movement-statuses.presenter';
import { DEAL_MOVEMENT_TEXTS } from '../deal-movement-vitrina.const';
import { CUP, night, OP, sums } from './deal-movement.fixtures';

const NAMES = { '447': 'Иванова Анна', '512': 'Петров Пётр' };

/** Две ночи формы 2: у 447 и 512 и у чужого 900. */
const NIGHTS = [
    night('2026-11-18', {
        totals: sums({ stuck: [5, 500], moving: [10, 1000] }),
        byManager: {
            '447': sums({ stuck: [2, 200], moving: [3, 300] }),
            '900': sums({ stuck: [3, 300], moving: [7, 700] }),
        },
    }),
    night('2026-11-19', {
        totals: sums({ stuck: [6, 600], abandoned: [1, 50], moving: [9, 900] }),
        byManager: {
            '447': sums({ stuck: [1, 100], moving: [4, 400] }),
            '512': sums({ stuck: [2, 200], abandoned: [1, 50] }),
            '900': sums({ stuck: [3, 300], moving: [5, 500] }),
        },
    }),
    // Ночь после периода (хвост проверки) — в статусы не идёт.
    night('2026-11-25', { totals: sums({ stuck: [99, 9900] }) }),
];

const cell = (
    cells: { status: string; count: number; amountSum: number | null }[],
    status: string,
) => cells.find(item => item.status === status);

describe('статусы витрины: последняя ночь и динамика', () => {
    it('видит всех: отдел — итог портала на последнюю ночь периода', () => {
        const result = presentDealMovementStatuses({
            nights: NIGHTS,
            from: '2026-11-14',
            to: '2026-11-20',
            scope: dealMovementScopeOf(CUP, undefined),
            names: NAMES,
        });

        expect(result.day).toBe('2026-11-19');
        expect(cell(result.department, 'stuck')).toMatchObject({
            count: 6,
            amountSum: 600,
            title: 'Без продвижения',
        });
        expect(result.department).toHaveLength(5);
        expect(result.nights.map(item => item.day)).toEqual([
            '2026-11-18',
            '2026-11-19',
        ]);
        expect(result.notes).toEqual([]);
    });

    it('периметр отдела: менеджеры и итог — только видимые; больше проблемных выше', () => {
        const result = presentDealMovementStatuses({
            nights: NIGHTS,
            from: '2026-11-14',
            to: '2026-11-20',
            scope: dealMovementScopeOf(OP, undefined),
            names: NAMES,
        });

        expect(result.managers.map(item => item.managerId)).toEqual([
            '512',
            '447',
        ]);
        expect(result.managers[0]).toMatchObject({
            managerName: 'Петров Пётр',
            total: 3,
            problemCount: 3,
            problemAmountSum: 250,
        });
        expect(cell(result.department, 'stuck')).toMatchObject({
            count: 3,
            amountSum: 300,
        });
        expect(cell(result.department, 'moving')?.count).toBe(4);
        expect(result.nights[0].managers.map(item => item.managerId)).toEqual([
            '447',
        ]);
    });

    it('старый снимок (форма 1): у всех — счёт без сумм, у периметра — итога нет; пометка', () => {
        const old = night('2026-11-17', {
            form: 1,
            byStatus: {
                rolled_back: 1,
                abandoned: 0,
                stuck: 4,
                at_risk: 2,
                moving: 20,
            },
            progressCheckDays: null,
        });

        const whole = presentDealMovementStatuses({
            nights: [old],
            from: '2026-11-14',
            to: '2026-11-20',
            scope: dealMovementScopeOf(CUP, undefined),
            names: {},
        });
        const part = presentDealMovementStatuses({
            nights: [old],
            from: '2026-11-14',
            to: '2026-11-20',
            scope: dealMovementScopeOf(OP, undefined),
            names: {},
        });

        expect(cell(whole.department, 'stuck')).toMatchObject({
            count: 4,
            amountSum: null,
        });
        expect(whole.notes).toEqual([DEAL_MOVEMENT_TEXTS.oldSnapshots]);
        expect(part.nights[0].department).toBeNull();
        expect(part.managers).toEqual([]);
        expect(cell(part.department, 'stuck')).toMatchObject({
            count: 0,
            amountSum: null,
        });
    });

    it('счёта за период нет — пустой блок и пояснение', () => {
        const result = presentDealMovementStatuses({
            nights: [],
            from: '2026-11-14',
            to: '2026-11-20',
            scope: dealMovementScopeOf(CUP, undefined),
            names: {},
        });

        expect(result.day).toBeNull();
        expect(result.nights).toEqual([]);
        expect(result.notes).toEqual([DEAL_MOVEMENT_TEXTS.noSnapshots]);
    });
});
