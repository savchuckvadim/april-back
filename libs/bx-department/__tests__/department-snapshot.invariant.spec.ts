import { Logger } from '@nestjs/common';
import { EDepartamentGroup } from '@lib/portal-lib/portal/interfaces/portal.interface';
import { EBxVisibilityLevel } from '../dto/bx-department-structure.dto';
import { BxDepartmentStructureService } from '../services/bx-department-structure.service';
import {
    callsOf,
    GARANT_DEPARTMENTS,
    GARANT_DOMAIN,
    GARANT_OP_USER_IDS,
    GARANT_USERS_BY_DEPARTMENT,
    type GarantStand,
    makeGarantStand,
} from './fixtures/garant-portal.fixture';

/*
 * Инвариант единого снимка отдела (решение b): подчинённые любого
 * пользователя из bx/department/structure — всегда сотрудники из allUsers
 * bitrix/department/sales, то есть у фронта есть их имена («Сотрудник N»
 * больше не бывает), и оба эндпоинта читают один и тот же ключ Redis.
 */

/** Все, кто есть на портале garant: сотрудники любых отделов и руководители. */
const EVERYONE = [
    ...new Set([
        ...Object.values(GARANT_USERS_BY_DEPARTMENT)
            .flat()
            .map(user => Number(user.ID)),
        ...GARANT_DEPARTMENTS.map(d => Number(d.UF_HEAD ?? 0)).filter(
            id => id > 0,
        ),
    ]),
];

describe('Единый снимок отдела: структура ⊆ getFullDepartment', () => {
    let stand: GarantStand;
    let settingsResolve: jest.Mock;
    let isSuperUser: jest.Mock;
    let structure: BxDepartmentStructureService;

    const rebuild = (next: GarantStand) => {
        stand = next;
        structure = new BxDepartmentStructureService(
            stand.departments,
            { resolve: settingsResolve } as never,
            { isSuperUser } as never,
        );
    };

    const snapshotUserIds = async (): Promise<Set<number>> => {
        const { department } = await stand.departments.getFullDepartment(
            GARANT_DOMAIN,
            EDepartamentGroup.sales,
        );
        return new Set(department.allUsers.map(user => Number(user.ID)));
    };

    const subordinatesOf = async (userId: number): Promise<number[]> => {
        const { currentUser } = await structure.getStructure(
            GARANT_DOMAIN,
            EDepartamentGroup.sales,
            userId,
        );
        return currentUser.subordinateIds.map(Number);
    };

    /** Для каждого пользователя портала: подчинённые вне allUsers снимка. */
    const outsideSnapshot = async () => {
        const allowed = await snapshotUserIds();
        const violations: { userId: number; outside: number[] }[] = [];
        for (const userId of EVERYONE) {
            const outside = (await subordinatesOf(userId)).filter(
                id => !allowed.has(id),
            );
            if (outside.length > 0) violations.push({ userId, outside });
        }
        return violations;
    };

    beforeEach(() => {
        jest.spyOn(Logger.prototype, 'warn').mockImplementation(
            () => undefined,
        );
        settingsResolve = jest.fn().mockResolvedValue({});
        isSuperUser = jest.fn().mockResolvedValue(false);
        rebuild(makeGarantStand());
    });

    afterEach(() => jest.restoreAllMocks());

    it('мультирежим: подчинённые каждого пользователя ⊆ allUsers снимка', async () => {
        expect(await outsideSnapshot()).toEqual([]);
    });

    it('мультирежим: глава филиала (cup) видит всех 20 сотрудников ОП — все они в снимке', async () => {
        const { currentUser } = await structure.getStructure(
            GARANT_DOMAIN,
            EDepartamentGroup.sales,
            100,
        );

        expect(currentUser.visibility).toBe(EBxVisibilityLevel.all);
        expect(currentUser.subordinateIds).toEqual(GARANT_OP_USER_IDS);
        const allowed = await snapshotUserIds();
        expect(GARANT_OP_USER_IDS.every(id => allowed.has(id))).toBe(true);
    });

    it('принудительная видимость и суперпользователь не выводят за снимок', async () => {
        settingsResolve.mockResolvedValue({
            visibilityGroupUserIds: '105',
            visibilityDepartmentUserIds: '107, 10',
            visibilityAllUserIds: '1',
        });
        isSuperUser.mockImplementation((_domain: string, id: number) =>
            Promise.resolve(id === 12),
        );

        expect(await outsideSnapshot()).toEqual([]);
        expect(await subordinatesOf(12)).toEqual(GARANT_OP_USER_IDS);
    });

    it('одиночный режим (departaments пуст): тот же инвариант', async () => {
        rebuild(makeGarantStand({ departaments: [] }));

        expect(await outsideSnapshot()).toEqual([]);
        // руководитель базового отдела (корень) видит сотрудников отдела
        expect((await subordinatesOf(1)).length).toBeGreaterThan(0);
    });

    it('оба эндпоинта читают ровно один ключ Redis — снимок строится один раз', async () => {
        await stand.departments.getFullDepartment(
            GARANT_DOMAIN,
            EDepartamentGroup.sales,
        );
        await subordinatesOf(100);
        await subordinatesOf(204);
        await stand.departments.getFullDepartment(
            GARANT_DOMAIN,
            EDepartamentGroup.sales,
        );

        const keysOf = (mock: jest.Mock) =>
            new Set((mock.mock.calls as [string][]).map(([key]) => key));
        const read = keysOf(stand.redis.get);
        expect(read.size).toBe(1);
        expect([...keysOf(stand.redis.set)]).toEqual([...read]);
        expect(stand.redis.set).toHaveBeenCalledTimes(1);
        expect(callsOf(stand.apiCall, 'department.get')).toBe(1);
    });
});
