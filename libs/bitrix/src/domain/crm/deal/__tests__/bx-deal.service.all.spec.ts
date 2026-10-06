import { IBXDeal } from '../interface/bx-deal.interface';
import { BxDealService } from '../services/bx-deal.service';

/**
 * `deal.all` — все страницы `crm.deal.list` курсором по ID (`>ID` +
 * сортировка по ID), а не первые 50. На нём стоит еженедельный отчёт по
 * дублям: сломанный курсор молча отрезал бы бо́льшую часть сделок.
 *
 * С 05.10.2026 обход идёт с `start: -1` (Битрикс не считает общее число
 * записей на каждой странице) и останавливается на неполной странице —
 * без лишнего запроса за пустой.
 */
describe('BxDealService.all', () => {
    const page = (from: number, count: number): Partial<IBXDeal>[] =>
        Array.from({ length: count }, (_, index) => ({
            ID: from + index,
        }));

    const setup = (pages: Partial<IBXDeal>[][]) => {
        const getList = jest.fn();
        for (const rows of pages)
            getList.mockResolvedValueOnce({ result: rows });
        const service = new BxDealService();
        (service as unknown as { repo: { getList: jest.Mock } }).repo = {
            getList,
        };
        return { service, getList };
    };

    it('читает страницы до неполной и склеивает их', async () => {
        const { service, getList } = setup([page(1, 50), page(51, 3)]);
        const filter = {
            CATEGORY_ID: '31',
            CLOSED: 'N',
        } as unknown as Partial<IBXDeal>;
        const select = ['ID', 'TITLE'];

        const deals = await service.all(filter, select);

        expect(deals).toHaveLength(53);
        // Неполная страница — последняя: запроса за пустой нет.
        expect(getList).toHaveBeenCalledTimes(2);
        expect(getList).toHaveBeenNthCalledWith(
            1,
            { CATEGORY_ID: '31', CLOSED: 'N', '>ID': 0 },
            select,
            { ID: 'ASC' },
            -1,
        );
        // Вторая страница — с ID после последнего на первой; фильтр и select те же.
        expect(getList).toHaveBeenNthCalledWith(
            2,
            { CATEGORY_ID: '31', CLOSED: 'N', '>ID': 50 },
            select,
            { ID: 'ASC' },
            -1,
        );
    });

    it('страницы ровно по 50 — обход идёт до пустой', async () => {
        const { service, getList } = setup([page(1, 50), page(51, 50), []]);

        const deals = await service.all({}, ['ID']);

        expect(deals).toHaveLength(100);
        expect(getList).toHaveBeenCalledTimes(3);
    });

    it('каждая страница запрашивается без подсчёта общего числа записей', async () => {
        const { service, getList } = setup([page(1, 50), page(51, 50), []]);

        await service.all({}, ['ID']);

        for (const call of getList.mock.calls as unknown[][]) {
            expect(call[3]).toBe(-1);
        }
    });

    it('пустая воронка — один запрос и пустой список', async () => {
        const { service, getList } = setup([[]]);

        expect(await service.all({}, ['ID'])).toEqual([]);
        expect(getList).toHaveBeenCalledTimes(1);
    });
});
