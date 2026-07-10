import { CallV3ApiService } from '../base/call-v3-api.service';
import { BitrixV3CoreService } from '../base/bitrix-v3-core.service';

function createApi(request: jest.Mock) {
    const transport = {
        request,
        domain: 'example.bitrix24.ru',
    } as unknown as BitrixV3CoreService;
    return new CallV3ApiService(transport);
}

describe('CallV3ApiService', () => {
    it('call проксирует метод и параметры в транспорт', async () => {
        const request = jest
            .fn()
            .mockResolvedValue({ items: [{ id: 57, name: 'ЦУП' }] });
        const api = createApi(request);

        const result = await api.call('humanresources.node.children', {
            id: 1,
        });

        expect(request).toHaveBeenCalledWith('humanresources.node.children', {
            id: 1,
        });
        expect(result.items[0].name).toBe('ЦУП');
    });

    it('callRaw позволяет вызвать неописанный метод', async () => {
        const request = jest.fn().mockResolvedValue({ anything: true });
        const api = createApi(request);

        const result = await api.callRaw<{ anything: boolean }>(
            'tasks.task.get',
            { id: 1 },
        );

        expect(request).toHaveBeenCalledWith('tasks.task.get', { id: 1 });
        expect(result.anything).toBe(true);
    });

    describe('callAll', () => {
        it('выкачивает все страницы до неполной', async () => {
            const pageOf = (from: number, count: number) => ({
                items: Array.from({ length: count }, (_, i) => ({
                    id: from + i,
                })),
            });
            const request = jest
                .fn()
                .mockResolvedValueOnce(pageOf(0, 2))
                .mockResolvedValueOnce(pageOf(2, 2))
                .mockResolvedValueOnce(pageOf(4, 1));
            const api = createApi(request);

            const items = await api.callAll(
                'humanresources.node.list',
                { type: 'TEAM' as never },
                2,
            );

            expect(items).toHaveLength(5);
            expect(request).toHaveBeenCalledTimes(3);
            expect(request).toHaveBeenNthCalledWith(
                2,
                'humanresources.node.list',
                expect.objectContaining({ pagination: { page: 2, limit: 2 } }),
            );
        });

        it('останавливается после первой неполной страницы', async () => {
            const request = jest.fn().mockResolvedValue({ items: [] });
            const api = createApi(request);

            const items = await api.callAll('humanresources.node.list', {
                type: 'TEAM' as never,
            });

            expect(items).toHaveLength(0);
            expect(request).toHaveBeenCalledTimes(1);
        });
    });
});
