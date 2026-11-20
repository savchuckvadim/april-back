import {
    DEAL_MOVEMENT_SNAPSHOT_FORM,
    type DealMovementNightDeal,
    type DealMovementStatus,
} from '@lib/sales-ai-analytics';
import {
    buildDealMovementProblemDeals,
    dealMovementStatusSums,
} from '../lib/deal-movement-night-records';
import { dealMovementProgressChecks } from '../lib/deal-movement-progress-checks';
import { buildDealMovementNightRecords } from '../lib/deal-movement-report';
import type { DealMovementCallRef } from '../types/deal-movement.types';
import { dealRow } from './deal-movement.fixture';
import { entry, evaluation, NOW } from './deal-movement-run.fixture';

/** Сделка ночи с готовым вердиктом: статус, сумма, ответственный. */
const nightDeal = (
    dealId: number,
    status: DealMovementStatus,
    fields: Partial<Omit<DealMovementNightDeal, 'verdict'>> = {},
    daysInStage = 30,
): DealMovementNightDeal => ({
    verdict: {
        dealId: String(dealId),
        status,
        reasons: status === 'moving' ? ['no_signals'] : ['stage_back'],
        facts: {
            daysInStage,
            stageLimitDays: 21,
            stageLimitSource: 'default',
            idleDays: null,
            idleLookbackDays: 60,
            recentWork: null,
            stepDate: null,
            lastProgress: null,
            daysSinceAgreed: null,
        },
    },
    title: `Сделка ${dealId}`,
    stageCode: 'sales_pres',
    amount: 100_000,
    assignedById: 7,
    lastActivityAt: null,
    ...fields,
});

describe('счёт и сумма по статусам для витрины', () => {
    it('всего и по ответственным; без ответственного — только во всего; без суммы — 0', () => {
        const sums = dealMovementStatusSums([
            nightDeal(1, 'stuck', { amount: 50_000 }),
            nightDeal(2, 'stuck', { amount: null }),
            nightDeal(3, 'moving', { assignedById: 8, amount: 10_000 }),
            nightDeal(4, 'at_risk', { assignedById: null, amount: 7_000 }),
        ]);

        expect(sums.totals.stuck).toEqual({ count: 2, amountSum: 50_000 });
        expect(sums.totals.at_risk).toEqual({ count: 1, amountSum: 7_000 });
        expect(sums.totals.abandoned).toEqual({ count: 0, amountSum: 0 });
        expect(Object.keys(sums.byManager).sort()).toEqual(['7', '8']);
        expect(sums.byManager['7'].stuck).toEqual({
            count: 2,
            amountSum: 50_000,
        });
        expect(sums.byManager['8'].moving.count).toBe(1);
    });
});

describe('список проблемных сделок ночи', () => {
    it('по ответственному и статусу не больше предела, крупные первыми; «Движется» мимо', () => {
        const record = buildDealMovementProblemDeals({
            deals: [
                nightDeal(1, 'stuck', { amount: 10_000 }),
                nightDeal(2, 'stuck', { amount: 90_000 }),
                nightDeal(3, 'stuck', { amount: 50_000 }),
                nightDeal(4, 'moving', { amount: 1_000_000 }),
                nightDeal(5, 'abandoned', { assignedById: 8, amount: null }),
            ],
            state: new Map([
                [
                    '2',
                    {
                        ...entry('stuck'),
                        changedAt: '2026-11-15T23:30:00.000Z',
                    },
                ],
            ]),
            stageTitles: new Map([['sales_pres', 'Презентация']]),
            day: '2026-11-18',
            generatedAt: '2026-11-17T23:40:00.000Z',
            perGroup: 2,
        });

        expect(record.groups).toEqual([
            { managerId: '7', status: 'stuck', total: 3, shown: 2 },
            { managerId: '8', status: 'abandoned', total: 1, shown: 1 },
        ]);
        expect(record.deals.map(deal => deal.dealId)).toEqual(['2', '3', '5']);
        expect(record.deals[0]).toMatchObject({
            managerId: '7',
            status: 'stuck',
            stageTitle: 'Презентация',
            daysInStage: 30,
            stageLimitDays: 21,
            since: '2026-11-15T23:30:00.000Z',
        });
        expect(record.deals[0].reasons).not.toBe('');
        // В статусе с первого счёта — «с какой ночи» неизвестно.
        expect(record.deals[1].since).toBeNull();
        expect(record.perGroup).toBe(2);
    });

    it('при равной сумме — дольше в стадии первым', () => {
        const record = buildDealMovementProblemDeals({
            deals: [
                nightDeal(1, 'at_risk', {}, 10),
                nightDeal(2, 'at_risk', {}, 40),
            ],
            state: new Map(),
            stageTitles: new Map(),
            day: '2026-11-18',
            generatedAt: '2026-11-17T23:40:00.000Z',
        });

        expect(record.deals.map(deal => deal.dealId)).toEqual(['2', '1']);
        expect(record.deals[0].stageTitle).toBeNull();
    });
});

describe('записи ночи в ais', () => {
    it('снимок формы 2 с суммами, разрезом и проверками; список — по новому состоянию', () => {
        const night = evaluation();
        const records = buildDealMovementNightRecords({
            status: {
                domain: 'garant.bitrix24.ru',
                mode: 'count',
                requestedBy: 'nightly',
                phase: 'saved',
                startedAt: NOW.toISOString(),
                updatedAt: '2026-11-17T23:40:00.000Z',
                finished: false,
                openTotal: 2,
                evaluated: 2,
                capped: false,
                baseline: false,
                firstSeen: 0,
                changed: 0,
                byStatus: {
                    rolled_back: 1,
                    abandoned: 0,
                    stuck: 0,
                    at_risk: 0,
                    moving: 1,
                },
                snapshotDay: null,
                warnings: [],
                error: null,
            },
            day: '2026-11-18',
            plan: { changes: [], state: new Map() },
            evaluation: {
                ...night,
                progressChecks: [
                    {
                        transcriptionId: 't1',
                        dealId: '1',
                        at: '2026-11-03T10:00:00.000Z',
                        progress: 5,
                        outcome: 'still',
                    },
                ],
            },
            notified: new Set(),
            checkDays: 12,
        });

        expect(records.snapshot).toMatchObject({
            form: DEAL_MOVEMENT_SNAPSHOT_FORM,
            progressCheckDays: 12,
            progressChecks: [{ transcriptionId: 't1', outcome: 'still' }],
        });
        expect(records.snapshot.totals?.rolled_back.count).toBe(1);
        expect(records.snapshot.byManager?.['7'].moving.count).toBe(1);
        expect(records.problemDeals.day).toBe('2026-11-18');
        expect(records.problemDeals.deals.map(deal => deal.dealId)).toEqual([
            '1',
        ]);
        expect(records.problemDeals.deals[0].stageTitle).toBe('Презентация');
    });
});

describe('проверка продвижения звонков по сделкам ночи', () => {
    const ref = (
        transcriptionId: string,
        at: string,
        progress: number | null,
    ): DealMovementCallRef => ({
        transcriptionId,
        entityType: 'deal',
        entityId: 1,
        mainDealId: null,
        call: { at, progress, nextStep: null },
    });

    it('история читалась — переход вперёд засчитан; не читалась — смену стадии не проверяем', () => {
        const checks = dealMovementProgressChecks({
            rows: [
                dealRow(1, { movedAt: '2026-11-16T09:00:00.000Z' }),
                dealRow(2, { movedAt: '2026-11-16T09:00:00.000Z' }),
                dealRow(3, { movedAt: '2026-10-01T09:00:00.000Z' }),
            ],
            transitions: new Map([
                [
                    1,
                    [
                        {
                            at: '2026-11-16T09:00:00.000Z',
                            fromOrder: 4,
                            toOrder: 5,
                        },
                    ],
                ],
            ]),
            historyRead: new Set([1]),
            calls: new Map([
                [1, [ref('t1', '2026-11-14T10:00:00.000Z', 4)]],
                [2, [ref('t2', '2026-11-14T10:00:00.000Z', 5)]],
                [3, [ref('t3', '2026-11-02T10:00:00.000Z', 5)]],
            ]),
            now: NOW.toISOString(),
            checkDays: 12,
        });

        expect(
            checks.map(check => [check.transcriptionId, check.outcome]),
        ).toEqual([
            ['t1', 'moved'],
            ['t3', 'still'],
        ]);
    });
});
