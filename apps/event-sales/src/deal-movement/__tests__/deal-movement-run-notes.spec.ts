import { DEAL_MOVEMENT_NOTES } from '../constants/deal-movement.const';
import {
    buildRun,
    DOMAIN,
    entry,
    NOTES_ON,
    NOW,
} from './deal-movement-run.fixture';

/** Прошлой ночью обе сделки «двигались»; сегодня 1 откатилась. */
const lastNight = () => ({
    lastRunAt: '2026-11-16T23:30:00.000Z',
    previous: new Map([
        ['1', entry('moving')],
        ['2', entry('moving')],
    ]),
});

describe('прогон движения сделок: запись в ленту', () => {
    it('запись включена: состояние целиком → записи → снимок → метка; пометка «записано» в снимке', async () => {
        const { service, notes, snapshots, order, statuses } = buildRun({
            ...lastNight(),
            notes: NOTES_ON,
            remaining: 100,
            written: ['1'],
        });

        const outcome = await service.run(DOMAIN, 'count', 'nightly', NOW);

        expect(order).toEqual(['state', 'notes', 'snapshot', 'mark']);
        expect(notes.remaining).toHaveBeenCalledWith(
            DOMAIN,
            '2026-11-18',
            NOTES_ON,
        );
        expect(notes.write).toHaveBeenCalledWith(
            expect.objectContaining({
                domain: DOMAIN,
                day: '2026-11-18',
                options: NOTES_ON,
                pauseMs: DEAL_MOVEMENT_NOTES.pauseMs,
                plan: expect.objectContaining({ toNotify: ['1'] }) as unknown,
            }),
        );
        // Ход записи виден в админке: фаза «пишет в ленту».
        expect(statuses.some(status => status.phase === 'notes')).toBe(true);
        expect(outcome).toMatchObject({
            kind: 'ran',
            status: {
                notes: {
                    enabled: true,
                    kind: 'comment',
                    planned: 1,
                    written: 1,
                    deferredLimit: 0,
                    deferredQuiet: 0,
                },
            },
        });
        const status = outcome.kind === 'ran' ? outcome.status : null;
        expect(status?.warnings).toContain(
            'не удалось записать в ленту сделки 7: тест',
        );
        expect(snapshots.save).toHaveBeenCalledWith(
            DOMAIN,
            expect.objectContaining({
                notes: expect.objectContaining({ written: 1 }) as unknown,
                changes: [
                    expect.objectContaining({ dealId: '1', notified: true }),
                ],
            }),
        );
    });

    it('лимит ночи исчерпан — расхождение отложено, в ленту не ходим', async () => {
        const { service, notes } = buildRun({
            ...lastNight(),
            notes: NOTES_ON,
            remaining: 0,
        });

        const outcome = await service.run(DOMAIN, 'count', 'nightly', NOW);

        expect(notes.write).not.toHaveBeenCalled();
        expect(outcome).toMatchObject({
            status: { notes: { planned: 0, deferredLimit: 1 } },
        });
    });

    it('«Посчитать» с включённой записью — сколько записали бы, без записи', async () => {
        const { service, notes, stateStore } = buildRun({
            ...lastNight(),
            notes: NOTES_ON,
            remaining: 100,
        });

        const outcome = await service.run(DOMAIN, 'dry-run', 'admin', NOW);

        expect(notes.write).not.toHaveBeenCalled();
        expect(stateStore.save).not.toHaveBeenCalled();
        expect(outcome).toMatchObject({
            status: { notes: { enabled: true, planned: 1, written: 0 } },
        });
    });

    it('базовая линия ничего не пишет', async () => {
        const { service, notes } = buildRun({
            notes: NOTES_ON,
            remaining: 100,
        });

        const outcome = await service.run(DOMAIN, 'count', 'nightly', NOW);

        expect(notes.write).not.toHaveBeenCalled();
        expect(outcome).toMatchObject({
            status: { baseline: true, notes: { planned: 0 } },
        });
    });
});
