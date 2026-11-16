import { BitrixActivityTypeId, BitrixOwnerTypeId } from '@/modules/bitrix';
import { IBXActivity } from '@/modules/bitrix/domain/activity/interfaces/bx-activity.interface';
import { recordedCallsOf } from '../client-calls/client-call-activity.util';

const activity = (patch: Partial<IBXActivity> = {}): IBXActivity => ({
    ID: 501,
    OWNER_TYPE_ID: BitrixOwnerTypeId.DEAL,
    OWNER_ID: 79153,
    TYPE_ID: BitrixActivityTypeId.CALL,
    SUBJECT: 'Исходящий звонок',
    RESPONSIBLE_ID: '107',
    START_TIME: '2026-11-16T12:12:00+03:00',
    END_TIME: '2026-11-16T12:20:00+03:00',
    COMMUNICATIONS: [],
    FILES: [{ id: 9001, url: 'https://portal.example/file' }],
    DIRECTION: '2',
    ...patch,
});

describe('recordedCallsOf', () => {
    it('собирает звонок из дела: время, направление, ответственный, карточка', () => {
        expect(recordedCallsOf([activity()])).toEqual([
            {
                activityId: 501,
                startedAt: '2026-11-16T09:12:00.000Z',
                direction: 'outgoing',
                responsibleId: 107,
                owner: { type: 'deal', id: 79153 },
                subject: 'Исходящий звонок',
            },
        ]);
    });

    it('дело без записи в список не попадает', () => {
        const calls = recordedCallsOf([
            activity({ ID: 1, FILES: [] }),
            activity({ ID: 2, FILES: undefined }),
            activity({ ID: 3 }),
        ]);

        expect(calls.map(call => call.activityId)).toEqual([3]);
    });

    it('одно дело, пришедшее по нескольким связям клиента, остаётся одно', () => {
        const calls = recordedCallsOf([
            activity({ ID: 501 }),
            activity({ ID: '501', OWNER_TYPE_ID: BitrixOwnerTypeId.COMPANY }),
        ]);

        expect(calls).toHaveLength(1);
        expect(calls[0].owner).toEqual({ type: 'deal', id: 79153 });
    });

    it('свежие звонки первыми; без времени — в конце по номеру дела', () => {
        const calls = recordedCallsOf([
            activity({ ID: 10, START_TIME: '2026-11-10T10:00:00+03:00' }),
            activity({ ID: 30, START_TIME: '' }),
            activity({ ID: 20, START_TIME: '2026-11-15T10:00:00+03:00' }),
            activity({ ID: 40, START_TIME: 'не дата' }),
        ]);

        expect(calls.map(call => call.activityId)).toEqual([20, 10, 40, 30]);
        expect(calls[2].startedAt).toBeNull();
    });

    it('незнакомые направление и вид карточки читаются как неизвестные', () => {
        const [call] = recordedCallsOf([
            activity({
                DIRECTION: '7',
                OWNER_TYPE_ID: 99 as unknown as BitrixOwnerTypeId,
                RESPONSIBLE_ID: 'abc',
                SUBJECT: '   ',
            }),
        ]);

        expect(call.direction).toBeNull();
        expect(call.owner).toBeNull();
        expect(call.responsibleId).toBeNull();
        expect(call.subject).toBeNull();
    });

    it('входящий звонок по лиду', () => {
        const [call] = recordedCallsOf([
            activity({
                DIRECTION: 1,
                OWNER_TYPE_ID: BitrixOwnerTypeId.LEAD,
                OWNER_ID: '33467',
            }),
        ]);

        expect(call.direction).toBe('incoming');
        expect(call.owner).toEqual({ type: 'lead', id: 33467 });
    });

    it('дело без номера пропускается', () => {
        expect(recordedCallsOf([activity({ ID: undefined })])).toEqual([]);
    });
});
