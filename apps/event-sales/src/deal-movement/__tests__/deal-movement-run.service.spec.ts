import {
    dealMovementVerdict,
    type DealMovementRunStatus,
    type DealMovementStateEntry,
} from '@lib/sales-ai-analytics';
import {
    buildDealMovementDossier,
    toNightDeal,
} from '../lib/deal-movement-dossier.mapper';
import type { DealMovementEvaluation } from '../services/deal-movement-evaluator.service';
import { DealMovementRunService } from '../services/deal-movement-run.service';
import { dealRow } from './deal-movement.fixture';

const DOMAIN = 'garant.bitrix24.ru';
const NOW = new Date('2026-11-17T23:27:00.000Z');

/** Две сделки: 1 — откатилась, 2 — спокойная. */
const evaluation = (): DealMovementEvaluation => {
    const rows = [dealRow(1, { stageOrder: 5 }), dealRow(2)];
    const transitions = new Map([
        [1, [{ at: '2026-11-15T09:00:00.000Z', fromOrder: 7, toOrder: 5 }]],
    ]);
    const deals = rows.map(row =>
        toNightDeal(
            row,
            dealMovementVerdict(
                buildDealMovementDossier(
                    row,
                    transitions.get(row.dealId) ?? [],
                    [],
                ),
                NOW.toISOString(),
            ),
        ),
    );
    return {
        openTotal: 2,
        deals,
        verdicts: new Map(
            deals.map(deal => [deal.verdict.dealId, deal.verdict]),
        ),
        carryOver: [],
        capped: false,
        warnings: [],
    };
};

const entry = (
    status: DealMovementStateEntry['status'],
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
});

interface Setup {
    lock?: string | null;
    lastRunAt?: string | null;
    previous?: Map<string, DealMovementStateEntry>;
    evaluate?: jest.Mock;
}

const build = (setup: Setup = {}) => {
    const statuses: DealMovementRunStatus[] = [];
    const runState = {
        lock: jest
            .fn()
            .mockResolvedValue(setup.lock === undefined ? 'token' : setup.lock),
        unlock: jest.fn().mockResolvedValue(undefined),
        extend: jest.fn().mockResolvedValue(undefined),
        saveStatus: jest.fn((status: DealMovementRunStatus) => {
            statuses.push(
                JSON.parse(JSON.stringify(status)) as DealMovementRunStatus,
            );
            return Promise.resolve();
        }),
        lastRun: jest
            .fn()
            .mockResolvedValue(
                setup.lastRunAt
                    ? { day: '2026-11-17', at: setup.lastRunAt }
                    : null,
            ),
        markRun: jest.fn().mockResolvedValue(undefined),
    };
    const stateStore = {
        load: jest.fn().mockResolvedValue(setup.previous ?? new Map()),
        save: jest.fn().mockResolvedValue(undefined),
    };
    const snapshots = { save: jest.fn().mockResolvedValue('501') };
    const evaluator = {
        evaluate:
            setup.evaluate ??
            jest.fn(
                async (
                    _domain: string,
                    _options: unknown,
                    _now: Date,
                    onPhase: (phase: string) => Promise<void>,
                ) => {
                    await onPhase('deals');
                    return evaluation();
                },
            ),
    };
    const settings = { resolve: jest.fn().mockResolvedValue({}) };
    const service = new DealMovementRunService(
        settings as never,
        evaluator as never,
        runState as never,
        stateStore as never,
        snapshots as never,
    );
    return { service, runState, stateStore, snapshots, statuses };
};

describe('прогон движения сделок портала', () => {
    it('ночной счёт: смены статуса по прошлому состоянию, состояние и снимок сохранены, notifiedStatus молча', async () => {
        const { service, runState, stateStore, snapshots } = build({
            lastRunAt: '2026-11-16T23:30:00.000Z',
            previous: new Map([
                ['1', entry('moving')],
                ['2', entry('moving')],
            ]),
        });

        const outcome = await service.run(DOMAIN, 'count', 'nightly', NOW);

        expect(outcome.kind).toBe('ran');
        const status = outcome.kind === 'ran' ? outcome.status : null;
        expect(status).toMatchObject({
            phase: 'done',
            finished: true,
            openTotal: 2,
            evaluated: 2,
            baseline: false,
            firstSeen: 0,
            changed: 1,
            snapshotDay: '2026-11-18',
            byStatus: { rolled_back: 1, moving: 1, stuck: 0, at_risk: 0 },
        });
        const [, saved] = stateStore.save.mock.calls[0] as [
            string,
            Map<string, DealMovementStateEntry>,
        ];
        expect(saved.get('1')).toMatchObject({
            status: 'rolled_back',
            notifiedStatus: 'rolled_back',
        });
        expect(snapshots.save).toHaveBeenCalledWith(
            DOMAIN,
            expect.objectContaining({
                day: '2026-11-18',
                changesTotal: 1,
                changes: [
                    expect.objectContaining({
                        dealId: '1',
                        from: 'moving',
                        to: 'rolled_back',
                        reasons: ['стадия сделки вернулась назад'],
                    }),
                ],
            }),
        );
        expect(runState.markRun).toHaveBeenCalledWith(DOMAIN, {
            day: '2026-11-18',
            at: NOW.toISOString(),
        });
        expect(runState.extend).toHaveBeenCalledWith(DOMAIN, 'token');
        expect(runState.unlock).toHaveBeenCalledWith(DOMAIN, 'token');
    });

    it('«Посчитать» ничего не сохраняет — итог только в состоянии прогона', async () => {
        const { service, runState, stateStore, snapshots, statuses } = build({
            lastRunAt: '2026-11-16T23:30:00.000Z',
        });

        await service.run(DOMAIN, 'dry-run', 'admin', NOW);

        expect(stateStore.save).not.toHaveBeenCalled();
        expect(snapshots.save).not.toHaveBeenCalled();
        expect(runState.markRun).not.toHaveBeenCalled();
        expect(statuses.at(-1)).toMatchObject({
            mode: 'dry-run',
            phase: 'done',
            snapshotDay: null,
        });
    });

    it('счёт старше трёх суток — базовая линия: прошлое состояние не читается', async () => {
        const { service, stateStore } = build({
            lastRunAt: '2026-11-10T23:30:00.000Z',
            previous: new Map([['1', entry('moving')]]),
        });

        const outcome = await service.run(DOMAIN, 'count', 'nightly', NOW);

        expect(stateStore.load).not.toHaveBeenCalled();
        expect(outcome).toMatchObject({
            kind: 'ran',
            status: { baseline: true, firstSeen: 2, changed: 0 },
        });
    });

    it('портал уже считается — прогон не начат', async () => {
        const { service, runState } = build({ lock: null });

        expect(await service.run(DOMAIN, 'count', 'admin', NOW)).toEqual({
            kind: 'busy',
            domain: DOMAIN,
        });
        expect(runState.saveStatus).not.toHaveBeenCalled();
    });

    it('сбой — итог «не удался», метка счёта не ставится, замок снят', async () => {
        const { service, runState, stateStore, statuses } = build({
            evaluate: jest
                .fn()
                .mockRejectedValue(new Error('Битрикс недоступен')),
        });

        const outcome = await service.run(DOMAIN, 'count', 'nightly', NOW);

        expect(outcome).toEqual({
            kind: 'failed',
            domain: DOMAIN,
            error: 'Битрикс недоступен',
        });
        expect(stateStore.save).not.toHaveBeenCalled();
        expect(runState.markRun).not.toHaveBeenCalled();
        expect(runState.unlock).toHaveBeenCalledWith(DOMAIN, 'token');
        expect(statuses.at(-1)).toMatchObject({
            phase: 'failed',
            finished: true,
            error: 'Битрикс недоступен',
        });
    });
});
