import { BxItemRepository } from '../repository/bx-item.repository';
import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import { IBXItem } from '../interface/item.interface';

/**
 * Тесты на `listAll`: автопагинация crm.item.list курсором по id.
 * Без неё для длинных выборок (>50) видна только первая страница — это и есть
 * корень дублей актов на договорах длиннее 50 месяцев.
 */
interface ListRequestArg {
    entityTypeId: string;
    filter: Record<string, unknown>;
    order?: Record<string, string>;
    start?: number;
}

describe('BxItemRepository.listAll', () => {
    let repo: BxItemRepository;
    let callType: jest.Mock;

    function makeItems(fromId: number, count: number): IBXItem[] {
        return Array.from({ length: count }, (_, i) => ({ id: fromId + i }));
    }

    function page(items: IBXItem[]) {
        return { result: { items } };
    }

    beforeEach(() => {
        callType = jest.fn();
        const api = { callType } as unknown as BitrixBaseApi;
        repo = new BxItemRepository(api);
    });

    it('склеивает несколько страниц по 50, пока страница не станет неполной', async () => {
        callType
            .mockResolvedValueOnce(page(makeItems(1, 50)))
            .mockResolvedValueOnce(page(makeItems(51, 30)));

        const result = await repo.listAll('1044', { parentId2: 184039 });

        expect(result).toHaveLength(80);
        expect(callType).toHaveBeenCalledTimes(2);
    });

    it('второй запрос идёт с курсором >id от последнего элемента предыдущей страницы', async () => {
        callType
            .mockResolvedValueOnce(page(makeItems(1, 50)))
            .mockResolvedValueOnce(page(makeItems(51, 10)));

        await repo.listAll('1044', { parentId2: 184039 });

        const requestArgOf = (callIndex: number): ListRequestArg => {
            const call = callType.mock.calls[callIndex] as unknown[];
            return call[3] as ListRequestArg;
        };
        const firstArgs = requestArgOf(0);
        const secondArgs = requestArgOf(1);
        expect(firstArgs.filter).toEqual({ parentId2: 184039 });
        expect(firstArgs.filter['>id']).toBeUndefined();
        expect(secondArgs.filter).toEqual({ parentId2: 184039, '>id': 50 });
        expect(secondArgs.order).toEqual({ id: 'ASC' });
        expect(secondArgs.start).toBe(-1);
    });

    it('одна неполная страница — один запрос без курсора', async () => {
        callType.mockResolvedValueOnce(page(makeItems(1, 12)));

        const result = await repo.listAll('1044', { parentId2: 184039 });

        expect(result).toHaveLength(12);
        expect(callType).toHaveBeenCalledTimes(1);
    });

    it('пустой результат — пустой массив, один запрос', async () => {
        callType.mockResolvedValueOnce(page([]));

        const result = await repo.listAll('1044', { parentId2: 184039 });

        expect(result).toEqual([]);
        expect(callType).toHaveBeenCalledTimes(1);
    });
});
