import { BitrixBaseApi } from '@/modules/bitrix/core/base/bitrix-base-api';
import { BxDiskFolderService } from '../folder/services/bx-disk-folder.service';
import { BxDiskStorageService } from '../storage/services/bx-disk-storage.service';

/** Собирает фейковый BitrixBaseApi, отдающий страницы по очереди. */
function makeApiWithPages(pages: Array<{ result: unknown[]; next?: number }>): {
    api: BitrixBaseApi;
    callType: jest.Mock;
} {
    let call = 0;
    const callType = jest.fn().mockImplementation(() => {
        const page = pages[Math.min(call, pages.length - 1)];
        call += 1;
        return Promise.resolve(page);
    });
    return { api: { callType } as unknown as BitrixBaseApi, callType };
}

describe('BxDiskFolderService.getchildrenAll', () => {
    it('собирает все страницы, крутя start по next', async () => {
        const { api, callType } = makeApiWithPages([
            { result: [{ ID: '1' }, { ID: '2' }], next: 50 },
            { result: [{ ID: '3' }] },
        ]);
        const service = new BxDiskFolderService();
        service.init(api);

        const items = await service.getchildrenAll({ id: 7 });

        expect(items.map(i => i.ID)).toEqual(['1', '2', '3']);
        expect(callType).toHaveBeenCalledTimes(2);
        expect(callType).toHaveBeenNthCalledWith(
            1,
            expect.anything(),
            expect.anything(),
            expect.anything(),
            expect.objectContaining({ id: 7, start: 0 }),
        );
        expect(callType).toHaveBeenNthCalledWith(
            2,
            expect.anything(),
            expect.anything(),
            expect.anything(),
            expect.objectContaining({ id: 7, start: 50 }),
        );
    });

    it('одна страница без next — один вызов', async () => {
        const { api, callType } = makeApiWithPages([{ result: [{ ID: '1' }] }]);
        const service = new BxDiskFolderService();
        service.init(api);

        const items = await service.getchildrenAll({ id: 7 });

        expect(items).toHaveLength(1);
        expect(callType).toHaveBeenCalledTimes(1);
    });

    it('пустой result не ломает сборку', async () => {
        const { api } = makeApiWithPages([
            { result: undefined as unknown as unknown[] },
        ]);
        const service = new BxDiskFolderService();
        service.init(api);

        await expect(service.getchildrenAll({ id: 7 })).resolves.toEqual([]);
    });
});

describe('BxDiskStorageService.getchildrenAll', () => {
    it('собирает все страницы, крутя start по next', async () => {
        const { api, callType } = makeApiWithPages([
            { result: [{ ID: '10' }], next: 50 },
            { result: [{ ID: '11' }], next: 100 },
            { result: [] },
        ]);
        const service = new BxDiskStorageService();
        service.init(api);

        const items = await service.getchildrenAll({ id: 3 });

        expect(items.map(i => i.ID)).toEqual(['10', '11']);
        expect(callType).toHaveBeenCalledTimes(3);
        expect(callType).toHaveBeenNthCalledWith(
            3,
            expect.anything(),
            expect.anything(),
            expect.anything(),
            expect.objectContaining({ id: 3, start: 100 }),
        );
    });
});
