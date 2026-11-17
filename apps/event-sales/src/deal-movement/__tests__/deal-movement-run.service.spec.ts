import type { DealMovementStateEntry } from '@lib/sales-ai-analytics';
import { buildRun, DOMAIN, entry, NOW } from './deal-movement-run.fixture';

describe('прогон движения сделок портала', () => {
    it('ночной счёт: смены статуса по прошлому состоянию, состояние и снимок сохранены, notifiedStatus молча', async () => {
        const { service, runState, stateStore, snapshots, notes } = buildRun({
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
            notes: { enabled: false, kind: null, planned: 0 },
        });
        const [, saved] = stateStore.save.mock.calls[0] as unknown as [
            string,
            Map<string, DealMovementStateEntry>,
        ];
        expect(saved.get('1')).toMatchObject({
            status: 'rolled_back',
            notifiedStatus: 'rolled_back',
        });
        // Запись выключена — в ленту не ходим вовсе.
        expect(notes.write).not.toHaveBeenCalled();
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
                        notified: false,
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

    it('прошлое состояние читается ДО оценки и уходит в оценщик', async () => {
        const previous = new Map([['1', entry('moving')]]);
        const { service, evaluator } = buildRun({
            lastRunAt: '2026-11-16T23:30:00.000Z',
            previous,
        });

        await service.run(DOMAIN, 'count', 'nightly', NOW);

        const call = evaluator.evaluate.mock.calls[0] as unknown[];
        expect(call[4]).toBe(previous);
    });

    it('«Посчитать» ничего не сохраняет — итог только в состоянии прогона', async () => {
        const { service, runState, stateStore, snapshots, statuses } = buildRun(
            { lastRunAt: '2026-11-16T23:30:00.000Z' },
        );

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
        const { service, stateStore, evaluator } = buildRun({
            lastRunAt: '2026-11-10T23:30:00.000Z',
            previous: new Map([['1', entry('moving')]]),
        });

        const outcome = await service.run(DOMAIN, 'count', 'nightly', NOW);

        expect(stateStore.load).not.toHaveBeenCalled();
        expect((evaluator.evaluate.mock.calls[0] as unknown[])[4]).toBeNull();
        expect(outcome).toMatchObject({
            kind: 'ran',
            status: { baseline: true, firstSeen: 2, changed: 0 },
        });
    });

    it('портал уже считается — прогон не начат', async () => {
        const { service, runState } = buildRun({ lock: null });

        expect(await service.run(DOMAIN, 'count', 'admin', NOW)).toEqual({
            kind: 'busy',
            domain: DOMAIN,
        });
        expect(runState.saveStatus).not.toHaveBeenCalled();
    });

    it('сбой — итог «не удался», метка счёта не ставится, замок снят', async () => {
        const { service, runState, stateStore, statuses } = buildRun({
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
