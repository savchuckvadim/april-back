import {
    agendaObject,
    AiAnalyticsPushLogStore,
    digestObject,
} from '../store/ai-analytics-push-log.store';

function makeStore(records: object[] = []) {
    const feedback = {
        listInPeriod: jest.fn().mockResolvedValue(records),
        add: jest.fn().mockResolvedValue('9001'),
    };
    return { store: new AiAnalyticsPushLogStore(feedback as never), feedback };
}

const since = new Date('2026-08-31T00:00:00Z');
const until = new Date('2026-09-07T05:30:00Z');

describe('AiAnalyticsPushLogStore (журнал доставки в ais)', () => {
    it('object: agenda:{weekKey} и digest:{day}', () => {
        expect(agendaObject('2026-W36')).toBe('agenda:2026-W36');
        expect(digestObject('2026-09-04')).toBe('digest:2026-09-04');
    });

    it('wasSent: совпадение по kind + object + managerId в периоде', async () => {
        const { store, feedback } = makeStore([
            { kind: 'agenda_sent', object: 'agenda:2026-W36', managerId: null },
            {
                kind: 'digest_sent',
                object: 'digest:2026-09-04',
                managerId: '10',
            },
            { kind: 'disagree', object: 'agenda:2026-W36', managerId: null },
        ]);
        await expect(
            store.wasSent(
                {
                    domain: 'd',
                    kind: 'agenda_sent',
                    object: 'agenda:2026-W36',
                    managerId: null,
                },
                since,
                until,
            ),
        ).resolves.toBe(true);
        expect(feedback.listInPeriod).toHaveBeenCalledWith('d', since, until);
        await expect(
            store.wasSent(
                {
                    domain: 'd',
                    kind: 'agenda_sent',
                    object: 'agenda:2026-W37',
                    managerId: null,
                },
                since,
                until,
            ),
        ).resolves.toBe(false);
        await expect(
            store.wasSent(
                {
                    domain: 'd',
                    kind: 'digest_sent',
                    object: 'digest:2026-09-04',
                    managerId: '10',
                },
                since,
                until,
            ),
        ).resolves.toBe(true);
        await expect(
            store.wasSent(
                {
                    domain: 'd',
                    kind: 'digest_sent',
                    object: 'digest:2026-09-04',
                    managerId: '20',
                },
                since,
                until,
            ),
        ).resolves.toBe(false);
    });

    it('markSent: запись контракта 4 без звонка и requester, с payload', async () => {
        const { store, feedback } = makeStore();
        const id = await store.markSent({
            domain: 'd',
            kind: 'digest_sent',
            object: 'digest:2026-09-04',
            managerId: '10',
            payload: { transcriptionIds: ['a1'] },
        });
        expect(id).toBe('9001');
        expect(feedback.add).toHaveBeenCalledWith({
            domain: 'd',
            kind: 'digest_sent',
            object: 'digest:2026-09-04',
            managerId: '10',
            transcriptionId: null,
            requesterUserId: null,
            reason: null,
            payload: { transcriptionIds: ['a1'] },
        });
    });
});
