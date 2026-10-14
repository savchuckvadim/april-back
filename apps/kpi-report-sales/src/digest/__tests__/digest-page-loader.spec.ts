import {
    DigestPageDroppedError,
    LISTS_ELEMENT_GET_METHOD,
    loadListElements,
} from '../lib/digest-page-loader';
import { IncompleteBatchError } from '../../shared/lib/batch-completeness.util';

const row = (id: number) => ({ ID: String(id), NAME: `e${id}` });
const page = (from: number, count: number) =>
    Array.from({ length: count }, (_, i) => row(from + i));

const createApi = (
    first: unknown,
    batchResult: Record<string, unknown> = {},
) => ({
    call: jest.fn(() => Promise.resolve(first)),
    addCmdBatch: jest.fn<void, [string, string, Record<string, unknown>]>(),
    callBatchWithConcurrency: jest.fn(() =>
        Promise.resolve([
            {
                result: batchResult,
                result_total: {},
                result_error: [],
                result_next: [],
            },
        ]),
    ),
});

const query = {
    listId: '55',
    filter: { '>PROPERTY_103': '14.10.2026' },
    select: ['ID', 'NAME'],
    cap: 20_000,
    context: 'тест',
};

describe('loadListElements', () => {
    it('одна страница — батч не нужен', async () => {
        const api = createApi({ result: page(1, 20), total: 20 });

        const result = await loadListElements(api as never, query);

        expect(result.rows).toHaveLength(20);
        expect(result.total).toBe(20);
        expect(result.truncated).toBe(false);
        expect(api.call).toHaveBeenCalledWith(
            LISTS_ELEMENT_GET_METHOD,
            expect.objectContaining({
                IBLOCK_TYPE_ID: 'lists',
                IBLOCK_ID: '55',
                filter: query.filter,
                select: query.select,
                start: 0,
            }),
        );
        expect(api.addCmdBatch).not.toHaveBeenCalled();
        expect(api.callBatchWithConcurrency).not.toHaveBeenCalled();
    });

    it('total 120 → страницы 50 и 100 одним strict-батчем, строки слиты по порядку', async () => {
        const api = createApi(
            { result: page(1, 50), total: 120, next: 50 },
            { page_50: page(51, 50), page_100: page(101, 20) },
        );

        const result = await loadListElements(api as never, query);

        expect(result.rows).toHaveLength(120);
        expect(result.rows[0].ID).toBe('1');
        expect(result.rows[119].ID).toBe('120');
        expect(api.addCmdBatch.mock.calls.map(call => call[0])).toEqual([
            'page_50',
            'page_100',
        ]);
        expect(api.addCmdBatch.mock.calls[1][2]).toEqual(
            expect.objectContaining({ start: 100 }),
        );
        expect(api.callBatchWithConcurrency).toHaveBeenCalledWith(1, {
            strict: true,
        });
    });

    it('первая страница без result — громкая ошибка дропа', async () => {
        const api = createApi({ time: {} });
        await expect(loadListElements(api as never, query)).rejects.toThrow(
            DigestPageDroppedError,
        );
    });

    it('пропавшая команда батча — IncompleteBatchError, а не неполные данные', async () => {
        const api = createApi(
            { result: page(1, 50), total: 120 },
            { page_50: page(51, 50) },
        );
        await expect(loadListElements(api as never, query)).rejects.toThrow(
            IncompleteBatchError,
        );
    });

    it('cap ограничивает страницы и помечает truncated', async () => {
        const api = createApi(
            { result: page(1, 50), total: 1000 },
            { page_50: page(51, 50) },
        );

        const result = await loadListElements(api as never, {
            ...query,
            cap: 100,
        });

        expect(result.truncated).toBe(true);
        expect(result.rows).toHaveLength(100);
        expect(api.addCmdBatch).toHaveBeenCalledTimes(1);
    });
});
