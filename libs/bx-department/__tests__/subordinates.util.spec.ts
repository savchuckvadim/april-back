import { buildCurrentUser } from '../lib/current-user.util';
import { EMPTY_FORCED_VISIBILITY } from '../lib/forced-visibility.util';
import { subordinateIdsOf } from '../lib/subordinates.util';
import { IStructureData } from '../lib/structure-data.types';
import { EBxVisibilityLevel } from '../dto/bx-department-structure.dto';

const users = (...ids: number[]) => ids.map(ID => ({ ID, NAME: `u${ID}` }));

// 53 Глава (HEADS 309)
// └─ 41 ОП Воронеж (HEADS 202): 202
//    ├─ 45 Группа Звездочки (HEADS 203): 203, 204
//    └─ 47 Группа Кометы (HEADS 205): 205, 206
// 37 ОП Ростов (HEADS 201): 201, 210
const STRUCTURE: IStructureData = {
    department: {
        department: 0,
        generalDepartment: [],
        childrenDepartments: [],
        allUsers: [],
    },
    salesDepartments: [
        {
            department: {
                ID: 41,
                NAME: 'ОП Воронеж',
                PARENT: '53',
                SORT: 2,
                HEADS: [202],
                USERS: users(202),
            },
            groups: [
                {
                    ID: 45,
                    NAME: 'Группа Звездочки',
                    PARENT: '41',
                    SORT: 3,
                    HEADS: [203],
                    USERS: users(203, 204),
                },
                {
                    ID: 47,
                    NAME: 'Группа Кометы',
                    PARENT: '41',
                    SORT: 4,
                    HEADS: [205],
                    USERS: users(205, 206),
                },
            ],
            allUsers: users(202, 203, 204, 205, 206),
        },
        {
            department: {
                ID: 37,
                NAME: 'ОП Ростов',
                PARENT: '1',
                SORT: 1,
                HEADS: [201],
                USERS: users(201, 210),
            },
            groups: [],
            allUsers: users(201, 210),
        },
    ],
    cupDepartments: [
        { ID: 53, NAME: 'Глава', PARENT: '1', SORT: 1, HEADS: [309] },
    ],
};

const currentUser = (
    userId: number,
    forced = EMPTY_FORCED_VISIBILITY,
    isSuperUser = false,
) => buildCurrentUser(STRUCTURE, userId, { forced, isSuperUser });

describe('subordinateIdsOf — периметр руководителя', () => {
    it('рядовой сотрудник: подчинённых нет', () => {
        expect(currentUser(204).subordinateIds).toEqual([]);
    });

    it('руководитель группы: только его группа, без него самого', () => {
        expect(currentUser(203).subordinateIds).toEqual([204]);
    });

    it('руководитель отдела: весь отдел со всеми группами', () => {
        expect(currentUser(202).subordinateIds).toEqual([203, 204, 205, 206]);
    });

    it('руководитель отдела не видит сотрудников чужого отдела', () => {
        expect(currentUser(201).subordinateIds).toEqual([210]);
    });

    it('главный руководитель: вся структура', () => {
        expect(currentUser(309).subordinateIds).toEqual([
            201, 202, 203, 204, 205, 206, 210,
        ]);
    });

    it('видимость поднята настройкой портала — периметр расширяется', () => {
        const forced = { group: [], department: [204], all: [] };
        expect(currentUser(204, forced).subordinateIds).toEqual([
            202, 203, 205, 206,
        ]);
    });

    it('суперпользователь вендора: вся структура', () => {
        const user = currentUser(999, EMPTY_FORCED_VISIBILITY, true);
        expect(user.subordinateIds).toEqual([
            201, 202, 203, 204, 205, 206, 210,
        ]);
    });

    it('руководитель двух групп видит обе', () => {
        expect(
            subordinateIdsOf(
                STRUCTURE,
                {
                    visibility: EBxVisibilityLevel.group,
                    headOfDepartmentIds: [45, 47],
                },
                203,
            ),
        ).toEqual([204, 205, 206]);
    });

    it('сотрудник в нескольких подразделениях считается один раз', () => {
        const structure: IStructureData = {
            ...STRUCTURE,
            salesDepartments: [
                {
                    ...STRUCTURE.salesDepartments[0],
                    allUsers: users(202, 204, 204, 203),
                },
            ],
        };
        expect(
            subordinateIdsOf(
                structure,
                {
                    visibility: EBxVisibilityLevel.department,
                    headOfDepartmentIds: [41],
                },
                202,
            ),
        ).toEqual([203, 204]);
    });

    it('мусорные id пользователей отбрасываются', () => {
        const structure: IStructureData = {
            ...STRUCTURE,
            salesDepartments: [
                {
                    ...STRUCTURE.salesDepartments[1],
                    allUsers: [
                        { ID: 210 },
                        { ID: 0 },
                        { ID: 'abc' },
                        {},
                    ] as never,
                },
            ],
        };
        expect(
            subordinateIdsOf(
                structure,
                {
                    visibility: EBxVisibilityLevel.all,
                    headOfDepartmentIds: [],
                },
                201,
            ),
        ).toEqual([210]);
    });
});
