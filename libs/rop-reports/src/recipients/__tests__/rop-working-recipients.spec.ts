import { BitrixService } from '@lib/bitrix';
import { RopStaffPort } from '../../ports/rop-staff.port';
import {
    ROP_RECIPIENT_ROLE,
    RopRecipientBucket,
} from '../rop-recipients.types';
import { keepWorkingRecipients } from '../rop-working-recipients';

const BITRIX = {} as BitrixService;
const DOMAIN = 'gsr.bitrix24.ru';

const bucket = (userId: number): RopRecipientBucket<string> => ({
    userId,
    roles: [ROP_RECIPIENT_ROLE.head],
    items: ['a'],
});

type ActiveUserIds = RopStaffPort['activeUserIds'];

const staff = (
    activeUserIds: ActiveUserIds,
): {
    activeUserIds: jest.Mock<
        ReturnType<ActiveUserIds>,
        Parameters<ActiveUserIds>
    >;
} => ({
    activeUserIds: jest.fn(activeUserIds),
});

describe('получатели отчёта — только работающие', () => {
    it('неработающим задача не ставится, их видно в предупреждении', async () => {
        const port = staff(() => Promise.resolve(new Set([11])));
        const warnings: string[] = [];

        const kept = await keepWorkingRecipients(
            [bucket(11), bucket(413)],
            port,
            DOMAIN,
            BITRIX,
            warnings,
        );

        expect(kept.map(item => item.userId)).toEqual([11]);
        expect(port.activeUserIds).toHaveBeenCalledWith(
            DOMAIN,
            BITRIX,
            [11, 413],
        );
        expect(warnings).toEqual([
            'получатели не работают — задачи им не ставятся: 413',
        ]);
    });

    it('портал не ответил — получатели остаются, сомнение в предупреждении', async () => {
        const port = staff(() => Promise.reject(new Error('timeout')));
        const warnings: string[] = [];

        const kept = await keepWorkingRecipients(
            [bucket(11)],
            port,
            DOMAIN,
            BITRIX,
            warnings,
        );

        expect(kept.map(item => item.userId)).toEqual([11]);
        expect(warnings).toEqual([
            'не проверено, работают ли получатели: timeout',
        ]);
    });

    it('получателей нет — портал не спрашиваем', async () => {
        const port = staff(() => Promise.resolve(new Set<number>()));

        expect(
            await keepWorkingRecipients([], port, DOMAIN, BITRIX, []),
        ).toEqual([]);
        expect(port.activeUserIds).not.toHaveBeenCalled();
    });
});
