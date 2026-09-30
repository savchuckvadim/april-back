import { DepartmentBitrixService } from '../services/department-bitrxi.service';

interface Params {
    FILTER?: { UF_DEPARTMENT?: number };
    SELECT?: string[];
    start?: number;
    START?: number;
}

interface Row {
    ID: string;
    NAME: string;
}

const rows = (from: number, count: number): Row[] =>
    Array.from({ length: count }, (_, i) => ({
        ID: String(from + i),
        NAME: `row ${from + i}`,
    }));

/**
 * Списочный метод как на живом портале: страницы по 50, смещение —
 * только `start` в нижнем регистре, `next` — пока есть что читать.
 */
const pagedApi = (all: Row[], pageSize = 50) =>
    jest.fn((_method: string, params: Params): Promise<unknown> => {
        const start = params.start ?? 0;
        const next = start + pageSize;
        return Promise.resolve({
            result: all.slice(start, next),
            total: all.length,
            ...(next < all.length ? { next } : {}),
        });
    });

const serviceWith = (call: jest.Mock) =>
    new DepartmentBitrixService({ api: { call } } as never);

const paramsOf = (call: jest.Mock): Params[] =>
    (call.mock.calls as [string, Params][]).map(([, params]) => params);

describe('DepartmentBitrixService: постраничное чтение', () => {
    it('user.get: 54 сотрудника — две страницы, смещение start = next', async () => {
        const call = pagedApi(rows(1, 54));

        const { result } = await serviceWith(call).getUsersByDepartment(63);

        expect(result).toHaveLength(54);
        expect(call).toHaveBeenCalledTimes(2);
        const [first, second] = paramsOf(call);
        // первая страница — с прежними параметрами, без смещения
        expect(first.start).toBeUndefined();
        expect(first.FILTER).toEqual({ UF_DEPARTMENT: 63, ACTIVE: true });
        // вторая — тот же фильтр и select, смещение в нижнем регистре
        expect(second.start).toBe(50);
        expect(second.START).toBeUndefined();
        expect(second.FILTER).toEqual(first.FILTER);
        expect(second.SELECT).toEqual(first.SELECT);
    });

    it('смещение проигнорировано (снова первая страница) — обход останавливается без дублей', async () => {
        const firstPage = rows(1, 50);
        const call = jest.fn(() =>
            Promise.resolve({ result: firstPage, total: 54, next: 50 }),
        );

        const { result } = await serviceWith(call).getUsersByDepartment(63);

        expect(result).toHaveLength(50);
        expect(call).toHaveBeenCalledTimes(2);
    });

    it('next строкой («50») — тоже смещение следующей страницы', async () => {
        const call = jest
            .fn()
            .mockResolvedValueOnce({ result: rows(1, 50), next: '50' })
            .mockResolvedValueOnce({ result: rows(51, 4) });

        const { result } = await serviceWith(call).getUsersByDepartment(63);

        expect(result).toHaveLength(54);
        expect(paramsOf(call)[1].start).toBe(50);
    });

    it('страница добавляет только новые ID', async () => {
        const call = jest
            .fn()
            .mockResolvedValueOnce({ result: rows(1, 50), next: 50 })
            .mockResolvedValueOnce({ result: rows(48, 5) });

        const { result } = await serviceWith(call).getUsersByDepartment(63);

        expect(result.map(user => Number(user.ID))).toEqual(
            Array.from({ length: 52 }, (_, i) => i + 1),
        );
    });

    it('department.get: все отделы одним запросом, если next нет', async () => {
        const call = pagedApi(rows(1, 17));

        const departments = await serviceWith(call).getDepartmentsAll();

        expect(departments).toHaveLength(17);
        expect(call).toHaveBeenCalledTimes(1);
        expect(call).toHaveBeenCalledWith('department.get', {});
    });

    it('department.get: больше 50 отделов — все страницы', async () => {
        const call = pagedApi(rows(1, 120));

        const departments = await serviceWith(call).getDepartmentsAll();

        expect(departments).toHaveLength(120);
        expect(paramsOf(call).map(params => params.start)).toEqual([
            undefined,
            50,
            100,
        ]);
    });

    it('пустой или битый ответ — пустой список', async () => {
        const empty = jest.fn().mockResolvedValue({ result: [] });
        const broken = jest.fn().mockResolvedValue(undefined);

        expect(await serviceWith(empty).getDepartmentsAll()).toEqual([]);
        expect(await serviceWith(broken).getUsersByDepartment(1)).toEqual({
            result: [],
        });
    });

    it('enrichWithUsers: у каждого отдела все его сотрудники со всех страниц', async () => {
        const users: Record<number, Row[]> = { 63: rows(1, 54), 67: [] };
        const call = jest.fn((_method: string, params: Params) => {
            const all = users[params.FILTER?.UF_DEPARTMENT ?? 0] ?? [];
            const start = params.start ?? 0;
            return Promise.resolve({
                result: all.slice(start, start + 50),
                ...(start + 50 < all.length ? { next: start + 50 } : {}),
            });
        });

        const enriched = await serviceWith(call).enrichWithUsers([
            { ID: 63, NAME: 'ОП', PARENT: '79', SORT: 1 },
            { ID: 67, NAME: 'Группа', PARENT: '63', SORT: 2 },
        ]);

        expect(enriched.map(d => d.USERS?.length)).toEqual([54, 0]);
    });

    it('ошибка запроса страницы не глотается', async () => {
        const call = jest
            .fn()
            .mockResolvedValueOnce({ result: rows(1, 50), next: 50 })
            .mockRejectedValueOnce(new Error('QUERY_LIMIT_EXCEEDED'));

        await expect(
            serviceWith(call).getUsersByDepartment(63),
        ).rejects.toThrow('QUERY_LIMIT_EXCEEDED');
    });
});
