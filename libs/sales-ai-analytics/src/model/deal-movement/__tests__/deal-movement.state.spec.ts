import {
    DEAL_MOVEMENT_NIGHT_DEFAULTS,
    markDealMovementNotified,
    planDealMovementNight,
    type DealMovementNightDeal,
    type DealMovementStateEntry,
} from '../deal-movement.state';
import type {
    DealMovementStatus,
    DealMovementVerdict,
} from '../deal-movement.types';

const NOW = '2026-11-17T23:30:00.000Z';

const verdict = (
    dealId: string,
    status: DealMovementStatus,
): DealMovementVerdict => ({
    dealId,
    status,
    reasons: status === 'moving' ? ['no_signals'] : ['stage_back'],
    facts: {
        daysInStage: 3,
        stageLimitDays: 21,
        stepDate: null,
        lastProgress: null,
        daysSinceAgreed: null,
    },
});

const deal = (
    dealId: string,
    status: DealMovementStatus,
    amount: number | null = null,
): DealMovementNightDeal => ({
    verdict: verdict(dealId, status),
    title: `Сделка ${dealId}`,
    stageCode: 'sales_pres',
    amount,
    assignedById: 7,
    lastActivityAt: null,
});

const entry = (
    status: DealMovementStatus,
    fields: Partial<DealMovementStateEntry> = {},
): DealMovementStateEntry => ({
    status,
    notifiedStatus: status,
    reasons: [],
    stageCode: 'sales_pres',
    amount: null,
    assignedById: 7,
    lastActivityAt: null,
    changedAt: null,
    notifiedAt: null,
    checkedAt: '2026-11-16T23:30:00.000Z',
    ...fields,
});

const notifyLimits = { notify: 10, minDaysBetween: 3 };

describe('план ночи движения сделок', () => {
    it('нет прошлого состояния — базовая линия: смен нет, писать некому, все впервые', () => {
        const plan = planDealMovementNight({
            previous: null,
            deals: [deal('1', 'at_risk'), deal('2', 'moving')],
            mode: 'notify',
            limits: notifyLimits,
            now: NOW,
        });

        expect(plan.firstSeen).toBe(2);
        expect(plan.changes).toEqual([]);
        expect(plan.toNotify).toEqual([]);
        expect(plan.state.get('1')).toMatchObject({
            status: 'at_risk',
            notifiedStatus: 'at_risk',
            changedAt: null,
            checkedAt: NOW,
        });
        expect(plan.byStatus).toEqual({
            rolled_back: 0,
            stuck: 0,
            at_risk: 1,
            moving: 1,
        });
    });

    it('ночной счёт молча сдвигает notifiedStatus и помнит смену статуса', () => {
        const plan = planDealMovementNight({
            previous: new Map([
                ['1', entry('moving')],
                ['2', entry('stuck')],
            ]),
            deals: [deal('1', 'at_risk', 500), deal('2', 'stuck')],
            mode: 'silent',
            limits: DEAL_MOVEMENT_NIGHT_DEFAULTS,
            now: NOW,
        });

        expect(plan.changes).toEqual([
            {
                dealId: '1',
                title: 'Сделка 1',
                assignedById: 7,
                amount: 500,
                from: 'moving',
                to: 'at_risk',
                reasons: ['stage_back'],
            },
        ]);
        expect(plan.state.get('1')).toMatchObject({
            status: 'at_risk',
            notifiedStatus: 'at_risk',
            changedAt: NOW,
            notifiedAt: null,
        });
        expect(plan.toNotify).toEqual([]);
        expect(plan.deferred).toBe(0);
        expect(plan.firstSeen).toBe(0);
    });

    it('режим записи: расхождения по важности и сумме, в пределах лимита, остальное — отложено', () => {
        const plan = planDealMovementNight({
            previous: new Map([
                ['1', entry('moving')],
                ['2', entry('moving')],
                ['3', entry('at_risk')],
                ['4', entry('moving')],
            ]),
            deals: [
                deal('1', 'at_risk', 100),
                deal('2', 'at_risk', 900),
                deal('3', 'moving'),
                deal('4', 'rolled_back', 1),
            ],
            mode: 'notify',
            limits: { notify: 3, minDaysBetween: 3 },
            now: NOW,
        });

        expect(plan.toNotify).toEqual(['4', '2', '1']);
        expect(plan.deferred).toBe(1);
        // Пока запись не удалась — расхождение остаётся.
        expect(plan.state.get('3')?.notifiedStatus).toBe('at_risk');
    });

    it('защита от метаний: по сделке не чаще одной записи в N суток', () => {
        const previous = new Map([
            [
                '1',
                entry('at_risk', {
                    notifiedStatus: 'at_risk',
                    notifiedAt: '2026-11-16T23:30:00.000Z',
                }),
            ],
            [
                '2',
                entry('at_risk', {
                    notifiedStatus: 'at_risk',
                    notifiedAt: '2026-11-10T23:30:00.000Z',
                }),
            ],
        ]);

        const plan = planDealMovementNight({
            previous,
            deals: [deal('1', 'moving'), deal('2', 'moving')],
            mode: 'notify',
            limits: notifyLimits,
            now: NOW,
        });

        expect(plan.toNotify).toEqual(['2']);
        expect(plan.deferred).toBe(1);
        expect(plan.state.get('1')?.notifiedStatus).toBe('at_risk');
    });

    it('сделки сверх потолка ночи сохраняют прошлое состояние, закрытые выпадают', () => {
        const plan = planDealMovementNight({
            previous: new Map([
                ['1', entry('moving')],
                ['2', entry('stuck')],
                ['3', entry('at_risk')],
            ]),
            deals: [deal('1', 'moving')],
            carryOver: ['2', '99'],
            mode: 'silent',
            limits: DEAL_MOVEMENT_NIGHT_DEFAULTS,
            now: NOW,
        });

        expect([...plan.state.keys()].sort()).toEqual(['1', '2']);
        expect(plan.state.get('2')?.status).toBe('stuck');
        expect(plan.byStatus.stuck).toBe(0);
    });

    it('отметка записи: о текущем статусе сказали', () => {
        expect(
            markDealMovementNotified(
                entry('at_risk', { notifiedStatus: 'moving' }),
                NOW,
            ),
        ).toMatchObject({ notifiedStatus: 'at_risk', notifiedAt: NOW });
    });
});
