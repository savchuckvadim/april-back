import { LiveLeadsReader } from '../services/task/live-leads.reader';

const makeBitrix = (alive: number[], fail = false) => {
    const pages: number[][] = [];
    return {
        pages,
        bitrix: {
            lead: {
                getList: (filter: { ID: number[] }) => {
                    pages.push(filter.ID);
                    if (fail) return Promise.reject(new Error('HTTP 500'));
                    return Promise.resolve({
                        result: filter.ID.filter(id => alive.includes(id)).map(
                            id => ({ ID: String(id) }),
                        ),
                    });
                },
            },
        },
    };
};

describe('LiveLeadsReader', () => {
    it('возвращает только отсутствующие на портале id', async () => {
        const { bitrix } = makeBitrix([1, 3]);
        const missing = await new LiveLeadsReader(bitrix as never).findMissing([
            1, 2, 3, 4,
        ]);
        expect([...missing].sort()).toEqual([2, 4]);
    });

    it('повторы и мусорные id не уходят в запрос', async () => {
        const { bitrix, pages } = makeBitrix([5]);
        await new LiveLeadsReader(bitrix as never).findMissing([5, 5, 0, -1]);
        expect(pages).toEqual([[5]]);
    });

    it('пустой список — без запроса', async () => {
        const { bitrix, pages } = makeBitrix([]);
        const missing = await new LiveLeadsReader(bitrix as never).findMissing(
            [],
        );
        expect(missing.size).toBe(0);
        expect(pages).toHaveLength(0);
    });

    it('больше страницы — запрашивает частями по 50', async () => {
        const ids = Array.from({ length: 120 }, (_, i) => i + 1);
        const { bitrix, pages } = makeBitrix(ids);
        const missing = await new LiveLeadsReader(bitrix as never).findMissing(
            ids,
        );
        expect(pages.map(page => page.length)).toEqual([50, 50, 20]);
        expect(missing.size).toBe(0);
    });

    it('ошибка чтения — пустой набор: ничего не выкидываем вслепую', async () => {
        const { bitrix } = makeBitrix([], true);
        const missing = await new LiveLeadsReader(bitrix as never).findMissing([
            7,
        ]);
        expect(missing.size).toBe(0);
    });
});
