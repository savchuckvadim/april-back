import { EDepartamentGroup } from '@lib/portal-lib/portal/interfaces/portal.interface';
import { DepartmentBitrixService } from '@/modules/bitrix/domain/department/services/department-bitrxi.service';
import {
    IBXDepartment,
    IBXUser,
} from 'src/modules/bitrix/domain/interfaces/bitrix.interface';
import { DepartmentTreeLoader } from '../services/department-tree.loader';

interface Params {
    ID?: number;
    PARENT?: number;
    FILTER?: { UF_DEPARTMENT?: number };
}

type FailWhen = (method: string, params: Params) => boolean;

const dep = (ID: number, NAME: string, PARENT?: number): IBXDepartment => ({
    ID,
    NAME,
    PARENT: PARENT === undefined ? '' : String(PARENT),
    SORT: ID,
});

const users = (...ids: number[]): IBXUser[] =>
    ids.map(ID => ({ ID, NAME: `u${ID}` }));

// Одиночный режим:
// 1 Компания └─ 5 Филиал └─ 9 Отдел продаж (базовый)
//                           ├─ 10 Группа 1
//                           └─ 11 Стажёры
const SINGLE_TREE = [
    dep(1, 'Компания'),
    dep(5, 'Филиал', 1),
    dep(9, 'Отдел продаж', 5),
    dep(10, 'Группа 1', 9),
    dep(11, 'Стажёры', 9),
];

// Мультирежим (тэг «(ОП)»):
// 1 Компания
// ├─ 79 Глава Воронеж └─ 63 ОП Воронеж (ОП) └─ 67 Группа Звездочки
// ├─ 81 Глава Питер   └─ 37 ОП Питер (ОП)
// └─ 3 Бухгалтерия
const MULTI_TREE = [
    dep(1, 'Компания'),
    dep(79, 'Глава Воронеж', 1),
    dep(63, 'ОП Воронеж (ОП)', 79),
    dep(67, 'Группа Звездочки', 63),
    dep(81, 'Глава Питер', 1),
    dep(37, 'ОП Питер (ОП)', 81),
    dep(3, 'Бухгалтерия', 1),
];

const USERS: Record<number, IBXUser[]> = {
    1: users(1),
    3: users(30),
    5: users(50),
    9: users(90),
    10: users(100, 101),
    11: users(110),
    37: users(370),
    63: users(630),
    67: users(670),
    79: users(790),
    81: users(810),
};

/** Мок bitrix.api.call поверх дерева; fail — какие запросы падают. */
const makeApi = (tree: IBXDepartment[], fail: FailWhen = () => false) =>
    jest.fn((method: string, params: Params): Promise<unknown> => {
        if (fail(method, params)) {
            return Promise.reject(new Error('Битрикс недоступен'));
        }
        if (method === 'department.get') {
            return Promise.resolve({
                result: tree.filter(
                    d =>
                        (params.ID === undefined ||
                            Number(d.ID) === params.ID) &&
                        (params.PARENT === undefined ||
                            Number(d.PARENT) === params.PARENT),
                ),
            });
        }
        const depId = params.FILTER?.UF_DEPARTMENT ?? 0;
        return Promise.resolve({ result: USERS[depId] ?? [] });
    });

const makeLoader = (call: jest.Mock) => {
    const warn = jest.fn();
    const loader = new DepartmentTreeLoader(
        new DepartmentBitrixService({ api: { call } } as never),
        { warn },
    );
    return { loader, warn };
};

/** Запросы к Битриксу в порядке отправки, компактно. */
const trace = (call: jest.Mock): string[] =>
    (call.mock.calls as [string, Params][]).map(([method, params]) =>
        method === 'user.get'
            ? `user.get ${params.FILTER?.UF_DEPARTMENT}`
            : `${method} ${JSON.stringify(params)}`,
    );

const idsOf = (departments: IBXDepartment[]) =>
    departments.map(d => Number(d.ID));

const userIdsOf = (department: IBXDepartment | undefined) =>
    (department?.USERS ?? []).map(u => Number(u.ID));

describe('DepartmentTreeLoader', () => {
    describe('loadSingle', () => {
        it('прежние запросы в прежнем порядке: отдел, подотделы, сотрудники, родители по уровню', async () => {
            const call = makeApi(SINGLE_TREE);
            const { loader } = makeLoader(call);

            await loader.loadSingle(9);

            expect(trace(call)).toEqual([
                'department.get {"ID":9}',
                'department.get {"PARENT":9}',
                'user.get 9',
                'user.get 10',
                'user.get 11',
                'department.get {"ID":5}',
                'user.get 5',
                'department.get {"ID":1}',
                'user.get 1',
            ]);
        });

        it('без базового отдела в конфиге — родители не ищутся, лишних запросов нет', async () => {
            // department.get {ID: undefined} уходит как {} и отдаёт все отделы
            const call = makeApi([...SINGLE_TREE].reverse());
            const { loader, warn } = makeLoader(call);

            const tree = await loader.loadSingle(undefined);

            expect(idsOf(tree.general)).toEqual([11, 10, 9, 5, 1]);
            expect(tree.parents).toEqual([]);
            expect(
                trace(call).filter(line => line.startsWith('department.get')),
            ).toEqual(['department.get {}', 'department.get {}']);
            expect(warn).not.toHaveBeenCalled();
        });

        it('дерево с сотрудниками у каждого отдела, родители снизу вверх', async () => {
            const { loader, warn } = makeLoader(makeApi(SINGLE_TREE));

            const tree = await loader.loadSingle(9);

            expect(idsOf(tree.general)).toEqual([9]);
            expect(userIdsOf(tree.general[0])).toEqual([90]);
            expect(idsOf(tree.children)).toEqual([10, 11]);
            expect(userIdsOf(tree.children[0])).toEqual([100, 101]);
            expect(idsOf(tree.parents)).toEqual([5, 1]);
            expect(userIdsOf(tree.parents[1])).toEqual([1]);
            expect(warn).not.toHaveBeenCalled();
        });

        it('сбой на втором уровне родителей — warn и уже найденные родители', async () => {
            const call = makeApi(
                SINGLE_TREE,
                (method, params) =>
                    method === 'department.get' && params.ID === 1,
            );
            const { loader, warn } = makeLoader(call);

            const tree = await loader.loadSingle(9);

            expect(idsOf(tree.parents)).toEqual([5]);
            expect(userIdsOf(tree.parents[0])).toEqual([50]);
            expect(idsOf(tree.general)).toEqual([9]);
            expect(warn).toHaveBeenCalledWith(
                'parent departments climb failed: Битрикс недоступен',
            );
        });

        it('сбой сотрудников родителя — родитель не попадает, подъём обрывается', async () => {
            const call = makeApi(
                SINGLE_TREE,
                (method, params) =>
                    method === 'user.get' && params.FILTER?.UF_DEPARTMENT === 5,
            );
            const { loader, warn } = makeLoader(call);

            const tree = await loader.loadSingle(9);

            expect(tree.parents).toEqual([]);
            expect(warn).toHaveBeenCalledTimes(1);
            expect(trace(call)).not.toContain('department.get {"ID":1}');
        });

        it('сбой базового отдела или его сотрудников не глотается — как раньше', async () => {
            const failBase = makeLoader(
                makeApi(
                    SINGLE_TREE,
                    (method, params) =>
                        method === 'department.get' && params.ID === 9,
                ),
            );
            await expect(failBase.loader.loadSingle(9)).rejects.toThrow(
                'Битрикс недоступен',
            );

            const failUsers = makeLoader(
                makeApi(
                    SINGLE_TREE,
                    (method, params) =>
                        method === 'user.get' &&
                        params.FILTER?.UF_DEPARTMENT === 10,
                ),
            );
            await expect(failUsers.loader.loadSingle(9)).rejects.toThrow(
                'Битрикс недоступен',
            );
        });
    });

    describe('loadMultiple', () => {
        it('один department.get на всю структуру, сотрудники ОП, подотделов и предков', async () => {
            const call = makeApi(MULTI_TREE);
            const { loader } = makeLoader(call);

            await loader.loadMultiple(EDepartamentGroup.sales, '(ОП)');

            expect(trace(call)).toEqual([
                'department.get {}',
                'user.get 63',
                'user.get 37',
                'user.get 67',
                'user.get 1',
                'user.get 79',
                'user.get 81',
            ]);
        });

        it('ОП по тэгу, их подотделы и предки каждого ОП без дублей — с сотрудниками', async () => {
            const { loader, warn } = makeLoader(makeApi(MULTI_TREE));

            const tree = await loader.loadMultiple(
                EDepartamentGroup.sales,
                '(ОП)',
            );

            expect(idsOf(tree.general)).toEqual([63, 37]);
            expect(userIdsOf(tree.general[0])).toEqual([630]);
            expect(idsOf(tree.children)).toEqual([67]);
            expect(userIdsOf(tree.children[0])).toEqual([670]);
            // предки в порядке department.get, корень — один раз
            expect(idsOf(tree.parents)).toEqual([1, 79, 81]);
            expect(tree.parents.map(userIdsOf)).toEqual([[1], [790], [810]]);
            expect(warn).not.toHaveBeenCalled();
        });

        it('без тэга — шаблоны группы («ОП …», «Отдел продаж»)', async () => {
            const { loader } = makeLoader(
                makeApi([
                    dep(1, 'Компания'),
                    dep(2, 'ОП Москва', 1),
                    dep(3, 'Отдел продаж Тверь', 1),
                    dep(4, 'ОПТ склад', 1),
                ]),
            );

            const tree = await loader.loadMultiple(
                EDepartamentGroup.sales,
                null,
            );

            expect(idsOf(tree.general)).toEqual([2, 3]);
        });

        it('сбой сотрудников предков — warn и предки без сотрудников, ОП не страдают', async () => {
            const call = makeApi(
                MULTI_TREE,
                (method, params) =>
                    method === 'user.get' && params.FILTER?.UF_DEPARTMENT === 1,
            );
            const { loader, warn } = makeLoader(call);

            const tree = await loader.loadMultiple(
                EDepartamentGroup.sales,
                '(ОП)',
            );

            expect(idsOf(tree.parents)).toEqual([1, 79, 81]);
            expect(tree.parents.every(d => d.USERS === undefined)).toBe(true);
            expect(userIdsOf(tree.general[0])).toEqual([630]);
            expect(warn).toHaveBeenCalledWith(
                'parent departments users failed: Битрикс недоступен',
            );
        });

        it('ничего не нашлось — пустое дерево без исключения и без user.get', async () => {
            const call = makeApi(MULTI_TREE);
            const { loader, warn } = makeLoader(call);

            const tree = await loader.loadMultiple(
                EDepartamentGroup.sales,
                '(ОС)',
            );

            expect(tree).toEqual({ general: [], children: [], parents: [] });
            expect(trace(call)).toEqual(['department.get {}']);
            expect(warn).not.toHaveBeenCalled();
        });

        it('сбой сотрудников ОП не глотается', async () => {
            const { loader } = makeLoader(
                makeApi(
                    MULTI_TREE,
                    (method, params) =>
                        method === 'user.get' &&
                        params.FILTER?.UF_DEPARTMENT === 63,
                ),
            );

            await expect(
                loader.loadMultiple(EDepartamentGroup.sales, '(ОП)'),
            ).rejects.toThrow('Битрикс недоступен');
        });
    });
});
