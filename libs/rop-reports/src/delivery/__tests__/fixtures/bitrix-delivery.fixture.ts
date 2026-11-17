import { BitrixService } from '@lib/bitrix';

/**
 * Битрикс доставки отчётов в объёме, который нужен Диску и задачам:
 * личное хранилище 1357 с папкой отчётов 2468, загрузка в папку — файл
 * 9035, в корень — 9034, новая задача — 765741, прошлая открыта.
 */
export const makeDeliveryBitrix = () => {
    const bitrix = {
        disk: {
            storage: {
                getlist: jest
                    .fn()
                    .mockResolvedValue({ result: [{ ID: '1357' }] }),
                getchildren: jest
                    .fn()
                    .mockResolvedValue({ result: [{ ID: '2468' }] }),
                addfolder: jest
                    .fn()
                    .mockResolvedValue({ result: { ID: '2469' } }),
                uploadfile: jest
                    .fn()
                    .mockResolvedValue({ result: { ID: '9034' } }),
            },
            folder: {
                uploadfile: jest
                    .fn<Promise<unknown>, [Record<string, unknown>]>()
                    .mockResolvedValue({ result: { ID: '9035' } }),
            },
        },
        task: {
            add: jest
                .fn<Promise<unknown>, [Record<string, unknown>]>()
                .mockResolvedValue({ result: { task: { id: '765741' } } }),
            get: jest
                .fn()
                .mockResolvedValue({ result: { task: { status: '2' } } }),
            complete: jest.fn().mockResolvedValue({ result: {} }),
        },
    };
    return { bitrix, service: bitrix as unknown as BitrixService };
};
