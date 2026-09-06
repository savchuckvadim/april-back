import {
    ManagersLoader,
    normalizeManagerIds,
} from '../domain/loaders/managers.loader';
import { buildManagersKey } from '../domain/loaders/loader-cache-key.util';
import { cacheMock } from './fixtures/kpi-loader.fixture';

function structureMock(allUsersByDepartment: string[][]) {
    const getStructure = jest.fn().mockResolvedValue({
        salesDepartments: allUsersByDepartment.map(ids => ({
            allUsers: ids.map(ID => ({ ID, NAME: 'n' })),
        })),
        currentUser: {},
    });
    return { getStructure };
}

describe('ManagersLoader', () => {
    it('normalizeManagerIds: мусор отброшен, дедуп, сортировка', () => {
        expect(normalizeManagerIds(['2', 1, '1', 0, null, 'x', -3])).toEqual([
            1, 2,
        ]);
        expect(normalizeManagerIds([])).toEqual([]);
    });

    it('явные managerIds нормализуются без обращения к структуре', async () => {
        const structure = structureMock([['5']]);
        const cache = cacheMock();
        const loader = new ManagersLoader(structure as never, cache.service);

        await expect(loader.resolve('d', ['3', 1, 3])).resolves.toEqual([1, 3]);
        expect(structure.getStructure).not.toHaveBeenCalled();
        expect(cache.remember).not.toHaveBeenCalled();
    });

    it('без managerIds — ростер всех ОП из структуры (дедуп между отделами), с кэшем', async () => {
        const structure = structureMock([
            ['10', '11'],
            ['11', '12'],
        ]);
        const cache = cacheMock();
        const loader = new ManagersLoader(structure as never, cache.service);

        await expect(loader.resolve('d')).resolves.toEqual([10, 11, 12]);
        expect(structure.getStructure).toHaveBeenCalledWith('d', 'sales', 0);
        expect(cache.remember).toHaveBeenCalledWith(
            buildManagersKey('d'),
            300,
            expect.any(Function),
        );

        // второй вызов — из кэша, структура не дёргается
        await expect(loader.resolve('d', [])).resolves.toEqual([10, 11, 12]);
        expect(structure.getStructure).toHaveBeenCalledTimes(1);
    });
});
