import { BitrixService } from '@/modules/bitrix';
import { ColdStartNotifyV2Service } from './cold-start-notify.service';

/** Push — прямой im.notify.system.add, по одному на адресата, fail-open. */
const makeBitrix = (failFor: number[] = []) => {
    const systemAdd = jest.fn(async (data: { USER_ID: number }) => {
        if (failFor.includes(data.USER_ID)) throw new Error('portal down');
        return 1;
    });
    return {
        bitrix: { imNotify: { systemAdd } } as unknown as BitrixService,
        systemAdd,
    };
};

const pushes = [
    { userId: 448, message: 'у вас забрали', tag: 'xo2_cold_start_h1_448' },
    { userId: 449, message: 'у вас забрали', tag: 'xo2_cold_start_h1_449' },
];

describe('ColdStartNotifyV2Service', () => {
    it('шлёт системное уведомление каждому адресату с тегом', async () => {
        const fake = makeBitrix();
        const delivered = await new ColdStartNotifyV2Service(fake.bitrix).send(pushes);
        expect(delivered).toEqual([448, 449]);
        expect(fake.systemAdd).toHaveBeenCalledWith({
            USER_ID: 448,
            MESSAGE: 'у вас забрали',
            TAG: 'xo2_cold_start_h1_448',
        });
    });

    it('сбой по одному адресату не мешает остальным и не бросает', async () => {
        const fake = makeBitrix([448]);
        const delivered = await new ColdStartNotifyV2Service(fake.bitrix).send(pushes);
        expect(delivered).toEqual([449]);
    });
});
