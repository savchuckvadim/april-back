import { Job } from 'bull';
import { PBXService } from '@lib/pbx';
import { RedisService } from '@lib/core/redis/redis.service';
import { DealSendProcessor } from '../processor/deal-send.processor';
import { DealSendJobDto } from '../dto/deal-send-job.dto';

const OPERATION_ID = '6f2c1d4e-8a7b-4c3d-9e1f-0a1b2c3d4e5f';
const LATEST_KEY = 'konstructor:deal-send:latest:gsr.bitrix24.ru:deal:217301';

const makeProcessor = (latest: Promise<string | null>) => {
    const bitrix = {
        deal: { update: jest.fn().mockResolvedValue({ result: true }) },
        productRow: { set: jest.fn().mockResolvedValue({ result: true }) },
    };
    const pbx = { init: jest.fn().mockResolvedValue({ bitrix }) };
    const redis = { get: jest.fn().mockReturnValue(latest) };
    const processor = new DealSendProcessor(
        pbx as unknown as PBXService,
        { getClient: () => redis } as unknown as RedisService,
    );
    return { processor, bitrix, redis };
};

const job = (): Job<DealSendJobDto> =>
    ({
        id: OPERATION_ID,
        attemptsMade: 0,
        opts: { attempts: 3 },
        data: {
            domain: 'gsr.bitrix24.ru',
            dealId: 217301,
            fields: { UF_CRM_1: 'Гарант-Офис' },
            productRows: [{ productName: 'Гарант-Офис', price: 7000 }],
        },
    }) as unknown as Job<DealSendJobDto>;

describe('DealSendProcessor: последнее сохранение сделки', () => {
    it('задание — последнее сохранение: пишем', async () => {
        const { processor, bitrix, redis } = makeProcessor(
            Promise.resolve(OPERATION_ID),
        );

        await expect(processor.handle(job())).resolves.toEqual({
            fields: 1,
            rows: 1,
        });
        expect(redis.get).toHaveBeenCalledWith(LATEST_KEY);
        expect(bitrix.deal.update).toHaveBeenCalled();
    });

    // повтор старого сохранения после паузы не должен перетереть новое
    it('есть более позднее сохранение — ничего не пишем', async () => {
        const { processor, bitrix } = makeProcessor(
            Promise.resolve('другое-более-позднее-сохранение'),
        );

        await expect(processor.handle(job())).resolves.toEqual({
            fields: 0,
            rows: null,
            superseded: true,
        });
        expect(bitrix.deal.update).not.toHaveBeenCalled();
        expect(bitrix.productRow.set).not.toHaveBeenCalled();
    });

    it('отметки нет (задание из старой очереди) — пишем', async () => {
        const { processor, bitrix } = makeProcessor(Promise.resolve(null));

        await processor.handle(job());

        expect(bitrix.productRow.set).toHaveBeenCalled();
    });

    it('Redis недоступен — пишем: запись важнее порядка', async () => {
        const { processor, bitrix } = makeProcessor(
            Promise.reject(new Error('Redis down')),
        );

        await processor.handle(job());

        expect(bitrix.deal.update).toHaveBeenCalled();
    });
});
