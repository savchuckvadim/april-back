import { DuplicateReportTaskStore } from '../services/duplicate-report-task.store';

const setup = (stored: string | null) => {
    const redis = {
        get: jest.fn().mockResolvedValue(stored),
        set: jest.fn().mockResolvedValue('OK'),
        sadd: jest.fn().mockResolvedValue(1),
        srem: jest.fn().mockResolvedValue(1),
        smembers: jest.fn().mockResolvedValue(['11', 'x', '12']),
        expire: jest.fn().mockResolvedValue(1),
        del: jest.fn().mockResolvedValue(1),
    };
    const store = new DuplicateReportTaskStore({
        getClient: () => redis,
    } as never);
    return { redis, store };
};

describe('DuplicateReportTaskStore — последняя задача-отчёт получателя', () => {
    it('помнит задачу по порталу и получателю на квартал', async () => {
        const { redis, store } = setup(null);

        await store.remember('a.bitrix24.ru', 11, 765741);

        expect(redis.set).toHaveBeenCalledWith(
            'event-sales:duplicate-report:task:a.bitrix24.ru:11',
            '765741',
            'EX',
            90 * 24 * 60 * 60,
        );
        // И в множество получателей портала — для закрытия устаревших.
        expect(redis.sadd).toHaveBeenCalledWith(
            'event-sales:duplicate-report:recipients:a.bitrix24.ru',
            '11',
        );
    });

    it('получатели портала — числами; забытый удаляется и из множества', async () => {
        const { redis, store } = setup(null);

        expect(await store.recipients('a.bitrix24.ru')).toEqual([11, 12]);
        await store.forget('a.bitrix24.ru', 12);

        expect(redis.del).toHaveBeenCalledWith(
            'event-sales:duplicate-report:task:a.bitrix24.ru:12',
        );
        expect(redis.srem).toHaveBeenCalledWith(
            'event-sales:duplicate-report:recipients:a.bitrix24.ru',
            '12',
        );
    });

    it('отдаёт прошлую задачу числом; пусто и мусор — null', async () => {
        expect(await setup('765741').store.previous('a.bitrix24.ru', 11)).toBe(
            765741,
        );
        expect(
            await setup(null).store.previous('a.bitrix24.ru', 11),
        ).toBeNull();
        expect(
            await setup('abc').store.previous('a.bitrix24.ru', 11),
        ).toBeNull();
    });
});
