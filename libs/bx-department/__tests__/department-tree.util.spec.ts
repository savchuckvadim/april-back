import { EDepartamentGroup } from '@lib/portal-lib/portal/interfaces/portal.interface';
import { IBXDepartment } from 'src/modules/bitrix/domain/interfaces/bitrix.interface';
import { resolvePatterns } from '../lib/department-match.util';
import {
    climbParents,
    PARENT_CLIMB_LIMIT,
    selectMultipleTree,
    uniqueById,
} from '../lib/department-tree.util';

const dep = (ID: number, NAME: string, PARENT?: number): IBXDepartment => ({
    ID,
    NAME,
    PARENT: PARENT === undefined ? '' : String(PARENT),
    SORT: ID,
});

/** Поиск в памяти с учётом запрошенных ID. */
const lookup = (departments: IBXDepartment[]) => {
    const byId = new Map(departments.map(d => [Number(d.ID), d]));
    const requested: number[] = [];
    const findById = (id: number) => {
        requested.push(id);
        return Promise.resolve(byId.get(id));
    };
    return { findById, requested };
};

const idsOf = (departments: IBXDepartment[]) =>
    departments.map(d => Number(d.ID));

describe('department-tree.util', () => {
    describe('selectMultipleTree', () => {
        // 1 Корень
        // ├─ 79 Глава Воронеж └─ 63 ОП Воронеж (ОП)
        // │                      ├─ 67 Группа Звездочки
        // │                      ├─ 69 Стажёры (не группа)
        // │                      └─ 70 ОП Воронеж-2 (ОП) (ОП внутри ОП)
        // │                         └─ 71 Группа Кометы
        // └─ 3 Бухгалтерия
        const ALL = [
            dep(1, 'Корень'),
            dep(79, 'Глава Воронеж', 1),
            dep(63, 'ОП Воронеж (ОП)', 79),
            dep(67, 'Группа Звездочки', 63),
            dep(69, 'Стажёры', 63),
            dep(70, 'ОП Воронеж-2 (ОП)', 63),
            dep(71, 'Группа Кометы', 70),
            dep(3, 'Бухгалтерия', 1),
        ];
        const patterns = resolvePatterns(EDepartamentGroup.sales, '(ОП)');

        it('ОП — все отделы по тэгу, в том числе вложенный в другой ОП', () => {
            const { general } = selectMultipleTree(ALL, patterns);

            expect(idsOf(general)).toEqual([63, 70]);
        });

        it('подотделы — все, чей родитель ОП: группы, прочие и вложенный ОП', () => {
            const { children } = selectMultipleTree(ALL, patterns);

            expect(idsOf(children)).toEqual([67, 69, 70, 71]);
        });

        it('ID строкой («63», как отдаёт Битрикс) сравнивается с PARENT по числу', () => {
            const { children } = selectMultipleTree(
                [
                    { ...dep(63, 'ОП (ОП)'), ID: '63' as never },
                    dep(67, 'Группа', 63),
                ],
                patterns,
            );

            expect(idsOf(children)).toEqual([67]);
        });

        it('ничего не подошло — пустые списки', () => {
            expect(
                selectMultipleTree(
                    ALL,
                    resolvePatterns(EDepartamentGroup.sales, '(ОС)'),
                ),
            ).toEqual({ general: [], children: [] });
        });
    });

    describe('climbParents', () => {
        it('предки каждого стартового отдела, общий корень — один раз', async () => {
            // 1 ← 79 ← 63; 1 ← 81 ← 37; 1 ← 59 ← 83
            const tree = [
                dep(1, 'Корень'),
                dep(79, 'Глава Воронеж', 1),
                dep(81, 'Глава Питер', 1),
                dep(59, 'Глава Ростов', 1),
            ];
            const { findById } = lookup(tree);

            const parents = await climbParents(
                [dep(63, 'ОП', 79), dep(37, 'ОП', 81), dep(83, 'ОП', 59)],
                findById,
            );

            expect(idsOf(parents)).toEqual([79, 1, 81, 59]);
        });

        it(`не выше ${PARENT_CLIMB_LIMIT} уровней от каждого отдела`, async () => {
            // 5 ← 4 ← 3 ← 2 ← 1 (старт)
            const tree = [
                dep(2, 'd2', 3),
                dep(3, 'd3', 4),
                dep(4, 'd4', 5),
                dep(5, 'd5'),
            ];
            const { findById, requested } = lookup(tree);

            const parents = await climbParents([dep(1, 'd1', 2)], findById);

            expect(idsOf(parents)).toEqual([2, 3, 4]);
            expect(requested).toEqual([2, 3, 4]);
        });

        it('лимит — параметр', async () => {
            const { findById } = lookup([dep(2, 'd2', 3), dep(3, 'd3')]);

            const parents = await climbParents([dep(1, 'd1', 2)], findById, 1);

            expect(idsOf(parents)).toEqual([2]);
        });

        it('через общего предка подъём продолжается: у каждой ветки свой лимит', async () => {
            // 20 (корень) ← 13 ← 12 ← 11 ← 10 (старт A)
            //                    12 ← 30 (старт B)
            const tree = [
                dep(11, 'd11', 12),
                dep(12, 'd12', 13),
                dep(13, 'd13', 20),
                dep(20, 'd20'),
            ];
            const { findById } = lookup(tree);

            const parents = await climbParents(
                [dep(10, 'A', 11), dep(30, 'B', 12)],
                findById,
            );

            // A доходит до 13 (3 уровня), B через общий 12 и 13 — до 20
            expect(idsOf(parents)).toEqual([11, 12, 13, 20]);
        });

        it('стартовые отделы в предки не попадают (ОП внутри ОП)', async () => {
            // 1 ← 63 (старт) ← 70 (старт)
            const tree = [dep(1, 'Корень'), dep(63, 'ОП', 1)];
            const { findById } = lookup(tree);

            const parents = await climbParents(
                [dep(63, 'ОП', 1), dep(70, 'ОП-2', 63)],
                findById,
            );

            expect(idsOf(parents)).toEqual([1]);
        });

        it('стартовые и уже найденные отделы повторно не запрашиваются', async () => {
            // 1 ← 5 ← 63 (старт) ← 70 (старт), 1 ← 5 ← 64 (старт)
            const tree = [dep(1, 'Корень'), dep(5, 'Глава', 1)];
            const { findById, requested } = lookup(tree);

            const parents = await climbParents(
                [dep(63, 'ОП', 5), dep(70, 'ОП-2', 63), dep(64, 'ОП-3', 5)],
                findById,
            );

            expect(idsOf(parents)).toEqual([5, 1]);
            // 63 — стартовый (берётся из памяти), 5 и 1 — по разу
            expect(requested).toEqual([5, 1]);
        });

        it('цикл PARENT не зацикливает подъём', async () => {
            // 2 ← 3 ← 2 … (цикл), старт 1 → 2
            const { findById, requested } = lookup([
                dep(2, 'd2', 3),
                dep(3, 'd3', 2),
            ]);

            const parents = await climbParents([dep(1, 'd1', 2)], findById, 10);

            expect(idsOf(parents)).toEqual([2, 3]);
            expect(requested).toEqual([2, 3]);
        });

        it('отдел ссылается сам на себя — предков нет', async () => {
            const { findById, requested } = lookup([]);

            const parents = await climbParents([dep(7, 'd7', 7)], findById);

            expect(parents).toEqual([]);
            expect(requested).toEqual([]);
        });

        it('корень (PARENT пуст или 0) и ненайденный родитель обрывают ветку', async () => {
            const { findById, requested } = lookup([]);

            const parents = await climbParents(
                [
                    dep(1, 'Корень'),
                    { ...dep(2, 'd2'), PARENT: '0' },
                    dep(3, 'd3', 99),
                ],
                findById,
            );

            expect(parents).toEqual([]);
            expect(requested).toEqual([99]);
        });

        it('пустой старт — пусто, без запросов', async () => {
            const { findById, requested } = lookup([dep(1, 'Корень')]);

            expect(await climbParents([], findById)).toEqual([]);
            expect(requested).toEqual([]);
        });
    });

    describe('uniqueById', () => {
        it('убирает дубли по ID (число и строка), порядок первого появления', () => {
            const list = uniqueById([
                dep(2, 'a'),
                dep(1, 'b'),
                { ...dep(2, 'c'), ID: '2' as never },
            ]);

            expect(list.map(d => d.NAME)).toEqual(['a', 'b']);
        });
    });
});
