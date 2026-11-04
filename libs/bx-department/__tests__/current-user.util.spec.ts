import {
    applySuperUser,
    buildCurrentUser,
    CurrentUserContext,
} from '../lib/current-user.util';
import { EMPTY_FORCED_VISIBILITY } from '../lib/forced-visibility.util';
import { IStructureData } from '../lib/structure-data.types';
import {
    EBxDepartmentHeadType,
    EBxHeadOfSource,
    EBxVisibilityLevel,
} from '../dto/bx-department-structure.dto';

const users = (...ids: number[]) => ids.map(ID => ({ ID, NAME: `u${ID}` }));

// 53 Глава (HEADS 309)
// └─ 41 ОП Воронеж (HEADS 202): 202
//    └─ 45 Группа Звездочки (HEADS 203): 203, 204
// 37 ОП Ростов (HEADS 201): 201, 210
const group45 = {
    ID: 45,
    NAME: 'Группа Звездочки',
    PARENT: '41',
    SORT: 3,
    HEADS: [203],
    USERS: users(203, 204),
};
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
            groups: [group45],
            allUsers: users(202, 203, 204),
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

const context = (
    overrides: Partial<CurrentUserContext> = {},
): CurrentUserContext => ({
    forced: EMPTY_FORCED_VISIBILITY,
    isSuperUser: false,
    ...overrides,
});

const ids = (list: { ID?: number | string }[]) =>
    list.map(user => Number(user.ID)).sort((a, b) => a - b);

describe('current-user.util', () => {
    it('обычный сотрудник: own по структуре, isSuperUser=false', () => {
        const user = buildCurrentUser(STRUCTURE, 204, context());

        expect(user).toMatchObject({
            userId: 204,
            isHead: false,
            headOf: null,
            headOfDepartmentIds: [],
            visibility: EBxVisibilityLevel.own,
            headOfSource: EBxHeadOfSource.structure,
            isSuperUser: false,
        });
        expect(ids(user.colleagues.group)).toEqual([203]);
        expect(ids(user.colleagues.department)).toEqual([202, 203]);
    });

    it('суперпользователь-сотрудник: all/cup/все ОП/superuser, isHead и коллеги как по структуре', () => {
        const plain = buildCurrentUser(STRUCTURE, 204, context());
        const user = buildCurrentUser(
            STRUCTURE,
            204,
            context({ isSuperUser: true }),
        );

        expect(user).toMatchObject({
            userId: 204,
            isHead: false,
            headOf: EBxDepartmentHeadType.cup,
            headOfDepartmentIds: [41, 37],
            visibility: EBxVisibilityLevel.all,
            headOfSource: EBxHeadOfSource.superuser,
            isSuperUser: true,
        });
        expect(user.colleagues).toEqual(plain.colleagues);
    });

    it('суперпользователь-руководитель ОП: isHead остаётся true, уровень поднят до cup', () => {
        const user = buildCurrentUser(
            STRUCTURE,
            202,
            context({ isSuperUser: true }),
        );

        expect(user.isHead).toBe(true);
        expect(user.headOf).toBe(EBxDepartmentHeadType.cup);
        expect(user.headOfSource).toBe(EBxHeadOfSource.superuser);
    });

    it('суперпользователь перекрывает принудительную видимость настроек', () => {
        const forced = { group: [], department: [204], all: [] };

        const onlySettings = buildCurrentUser(
            STRUCTURE,
            204,
            context({ forced }),
        );
        const withVendor = buildCurrentUser(
            STRUCTURE,
            204,
            context({ forced, isSuperUser: true }),
        );

        expect(onlySettings.headOfSource).toBe(EBxHeadOfSource.settings);
        expect(onlySettings.isSuperUser).toBe(false);
        expect(withVendor.headOfSource).toBe(EBxHeadOfSource.superuser);
        expect(withVendor.visibility).toBe(EBxVisibilityLevel.all);
    });

    it('суперпользователь вне структуры продаж: all, коллег нет', () => {
        const user = buildCurrentUser(
            STRUCTURE,
            999,
            context({ isSuperUser: true }),
        );

        expect(user.isHead).toBe(false);
        expect(user.visibility).toBe(EBxVisibilityLevel.all);
        expect(user.colleagues).toEqual({ group: [], department: [] });
    });

    it('userId 0 никогда не суперпользователь, даже если контекст говорит иначе', () => {
        const user = buildCurrentUser(
            STRUCTURE,
            0,
            context({ isSuperUser: true }),
        );

        expect(user.isSuperUser).toBe(false);
        expect(user.visibility).toBe(EBxVisibilityLevel.own);
        expect(user.headOfSource).toBe(EBxHeadOfSource.structure);
    });

    describe('портальный уровень для рядовых (employeeDefault)', () => {
        it('рядовой + group: менеджер с периметром группы, подчинённые — коллеги группы', () => {
            const user = buildCurrentUser(
                STRUCTURE,
                204,
                context({ employeeDefault: EBxVisibilityLevel.group }),
            );

            expect(user).toMatchObject({
                isHead: false,
                headOf: null,
                headOfDepartmentIds: [45],
                visibility: EBxVisibilityLevel.group,
                headOfSource: EBxHeadOfSource.portalDefault,
                isSuperUser: false,
                subordinateIds: [203],
            });
            // коллеги — по месту в структуре, как и раньше
            expect(ids(user.colleagues.group)).toEqual([203]);
        });

        it('рядовой в ОП без групп + group → свой ОП (department)', () => {
            const user = buildCurrentUser(
                STRUCTURE,
                210,
                context({ employeeDefault: EBxVisibilityLevel.group }),
            );

            expect(user.headOf).toBeNull();
            expect(user.visibility).toBe(EBxVisibilityLevel.department);
            expect(user.headOfDepartmentIds).toEqual([37]);
            expect(user.subordinateIds).toEqual([201]);
        });

        it('вне структуры продаж дефолт не действует', () => {
            const user = buildCurrentUser(
                STRUCTURE,
                999,
                context({ employeeDefault: EBxVisibilityLevel.all }),
            );

            expect(user.visibility).toBe(EBxVisibilityLevel.own);
            expect(user.headOfSource).toBe(EBxHeadOfSource.structure);
            expect(user.subordinateIds).toEqual([]);
        });

        it('руководителя не понижает, список выше дефолта — список, суперпользователь — поверх всего', () => {
            const opHead = buildCurrentUser(
                STRUCTURE,
                202,
                context({ employeeDefault: EBxVisibilityLevel.group }),
            );
            expect(opHead.headOf).toBe(EBxDepartmentHeadType.op);
            expect(opHead.headOfSource).toBe(EBxHeadOfSource.structure);

            const fromList = buildCurrentUser(
                STRUCTURE,
                204,
                context({
                    forced: { group: [], department: [204], all: [] },
                    employeeDefault: EBxVisibilityLevel.group,
                }),
            );
            expect(fromList.headOf).toBe(EBxDepartmentHeadType.op);
            expect(fromList.headOfSource).toBe(EBxHeadOfSource.settings);

            const vendor = buildCurrentUser(
                STRUCTURE,
                204,
                context({
                    employeeDefault: EBxVisibilityLevel.group,
                    isSuperUser: true,
                }),
            );
            expect(vendor.visibility).toBe(EBxVisibilityLevel.all);
            expect(vendor.headOfSource).toBe(EBxHeadOfSource.superuser);
        });
    });

    it('applySuperUser не мутирует исходного пользователя и список ОП', () => {
        const plain = buildCurrentUser(STRUCTURE, 204, context());
        const allOpIds = [41, 37];

        const vendor = applySuperUser(plain, allOpIds);
        vendor.headOfDepartmentIds.push(1);

        expect(plain.isSuperUser).toBe(false);
        expect(plain.headOf).toBeNull();
        expect(allOpIds).toEqual([41, 37]);
    });
});
