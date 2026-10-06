import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import { BxTaskService } from '../services/task.service';

/**
 * Полный обход задач. На портале с десятками тысяч задач подсчёт общего
 * числа (`start` ≥ 0) в разы дороже самой выборки, поэтому без своего
 * порядка обход идёт курсором по ID с `start: -1`.
 */
interface ListParams {
    filter?: Record<string, unknown>;
    select?: string[];
    order?: Record<string, string>;
    start?: number;
}

const tasksOf = (from: number, count: number) =>
    Array.from({ length: count }, (_, i) => ({ id: String(from + i) }));

const setup = (pages: { id: string }[][]) => {
    const calls: ListParams[] = [];
    const callType = jest.fn(
        (_ns: string, _entity: string, _method: string, params: ListParams) => {
            calls.push(params);
            const page = pages[calls.length - 1] ?? [];
            return Promise.resolve({ result: { tasks: page } });
        },
    );
    const service = new BxTaskService();
    service.init({ callType } as unknown as BitrixBaseApi);
    return { service, calls };
};

describe('BxTaskService.getAll', () => {
    it('без своего порядка — курсор по ID без подсчёта total', async () => {
        const { service, calls } = setup([
            tasksOf(1, 50),
            tasksOf(51, 50),
            tasksOf(101, 7),
        ]);

        const { tasks, total } = await service.getAll({ GROUP_ID: 89 }, [
            'TITLE',
        ]);

        expect(total).toBe(107);
        expect(tasks).toHaveLength(107);
        expect(calls.map(call => call.start)).toEqual([-1, -1, -1]);
        expect(calls.map(call => call.filter?.['>ID'])).toEqual([
            undefined,
            50,
            100,
        ]);
        expect(calls[0].order).toEqual({ id: 'asc' });
        // Курсору нужен ID, даже если его не просили.
        expect(calls[0].select).toEqual(['ID', 'TITLE']);
        expect(calls[0].filter?.GROUP_ID).toBe(89);
    });

    it('неполная первая страница — один запрос', async () => {
        const { service, calls } = setup([tasksOf(1, 3)]);

        const { total } = await service.getAll();

        expect(total).toBe(3);
        expect(calls).toHaveLength(1);
    });

    it('ID не растёт (фильтр курсора не сработал) — без бесконечного круга', async () => {
        const { service, calls } = setup([tasksOf(1, 50), tasksOf(1, 50)]);

        const { total } = await service.getAll();

        expect(calls).toHaveLength(2);
        expect(total).toBe(100);
    });

    it('со своим порядком — сдвиг start до неполной страницы, без лишней пустой', async () => {
        const { service, calls } = setup([tasksOf(1, 50), tasksOf(51, 10)]);

        const { total } = await service.getAll({}, ['ID'], { deadline: 'asc' });

        expect(total).toBe(60);
        expect(calls.map(call => call.start)).toEqual([0, 50]);
        expect(calls[0].order).toEqual({ deadline: 'asc' });
    });
});
