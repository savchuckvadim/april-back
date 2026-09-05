import { RedisService } from 'src/core/redis/redis.service';
import { PBXService } from '@/modules/pbx';
import { EDepartamentGroup } from '@lib/portal-lib/portal/interfaces/portal.interface';
import { IBXUser } from 'src/modules/bitrix/domain/interfaces/bitrix.interface';
import { BxDepartmentService } from '../services/bx-department.service';
import { BxDepartmentHeadsService } from '../services/bx-department-heads.service';

const DOMAIN = 'example.bitrix24.ru';
const BASE_ID = 9;

// 1 Компания (UF_HEAD "100")
// └─ 9 Отдел продаж (UF_HEAD "202"): user 202
//    └─ 10 Группа 1 (UF_HEAD нет): user 204
const DEPARTMENTS_BY_ID: Record<number, unknown> = {
    1: { ID: '1', NAME: 'Компания', PARENT: '0', SORT: 1, UF_HEAD: '100' },
    9: { ID: '9', NAME: 'Отдел продаж', PARENT: '1', SORT: 2, UF_HEAD: '202' },
};
const CHILDREN_BY_PARENT: Record<number, unknown[]> = {
    9: [{ ID: '10', NAME: 'Группа 1', PARENT: '9', SORT: 3 }],
};
const USERS_BY_DEPARTMENT: Record<number, IBXUser[]> = {
    9: [{ ID: 202, NAME: 'Руководитель' }],
    10: [{ ID: 204, NAME: 'Сотрудник' }],
};

describe('BxDepartmentService', () => {
    let redisGet: jest.Mock;
    let redisSet: jest.Mock;
    let apiCall: jest.Mock;
    let headsResolve: jest.Mock;
    let service: BxDepartmentService;

    beforeEach(() => {
        redisGet = jest.fn().mockResolvedValue(null);
        redisSet = jest.fn().mockResolvedValue('OK');
        apiCall = jest.fn(
            (
                method: string,
                params: {
                    ID?: number;
                    PARENT?: number;
                    FILTER?: { UF_DEPARTMENT?: number };
                },
            ): Promise<unknown> => {
                if (method === 'department.get') {
                    if (params.ID !== undefined) {
                        const found = DEPARTMENTS_BY_ID[params.ID];
                        return Promise.resolve({
                            result: found ? [found] : [],
                        });
                    }
                    return Promise.resolve({
                        result: CHILDREN_BY_PARENT[params.PARENT ?? 0] ?? [],
                    });
                }
                if (method === 'user.get') {
                    const depId = params.FILTER?.UF_DEPARTMENT ?? 0;
                    return Promise.resolve({
                        result: USERS_BY_DEPARTMENT[depId] ?? [],
                    });
                }
                return Promise.resolve({ result: [] });
            },
        );
        headsResolve = jest.fn().mockResolvedValue(new Map());

        const redisService = {
            getClient: () => ({ get: redisGet, set: redisSet }),
        } as unknown as RedisService;
        const pbx = {
            init: jest.fn().mockResolvedValue({
                bitrix: { api: { call: apiCall } },
                PortalModel: {
                    getDepartamentIdByCode: () => ({ bitrixId: BASE_ID }),
                },
            }),
        } as unknown as PBXService;
        const heads = {
            resolve: headsResolve,
        } as unknown as BxDepartmentHeadsService;

        service = new BxDepartmentService(redisService, pbx, heads);
    });

    it('без v3: HEADS из UF_HEAD, UF_HEAD нормализован к number|null', async () => {
        const { department } = await service.getFullDepartment(
            DOMAIN,
            EDepartamentGroup.sales,
        );

        expect(department.department).toBe(BASE_ID);
        expect(department.generalDepartment[0].HEADS).toEqual([202]);
        expect(department.generalDepartment[0].UF_HEAD).toBe(202);
        expect(department.childrenDepartments[0].HEADS).toEqual([]);
        expect(department.childrenDepartments[0].UF_HEAD).toBeNull();
        expect(department.parentDepartments?.[0].HEADS).toEqual([100]);
        expect(department.allUsers.map(u => Number(u.ID))).toEqual([202, 204]);
    });

    it('руководители v3 просятся одним вызовом по базовому отделу, группам и родителям', async () => {
        headsResolve.mockResolvedValue(
            new Map([
                [9, [202, 777]],
                [10, [204]],
            ]),
        );

        const { department } = await service.getFullDepartment(
            DOMAIN,
            EDepartamentGroup.sales,
        );

        expect(headsResolve).toHaveBeenCalledTimes(1);
        expect(headsResolve).toHaveBeenCalledWith(
            DOMAIN,
            expect.arrayContaining([
                expect.objectContaining({ ID: '9' }),
                expect.objectContaining({ ID: '10' }),
                expect.objectContaining({ ID: '1' }),
            ]),
        );
        expect(department.generalDepartment[0].HEADS).toEqual([202, 777]);
        expect(department.generalDepartment[0].UF_HEAD).toBe(202);
        expect(department.childrenDepartments[0].HEADS).toEqual([204]);
        expect(department.childrenDepartments[0].UF_HEAD).toBe(204);
    });

    it('кэш: ключ с версией формы v3, повторный вызов не ходит в Битрикс', async () => {
        const first = await service.getFullDepartment(
            DOMAIN,
            EDepartamentGroup.sales,
        );
        const [key, json] = redisSet.mock.calls[0] as [string, string];
        expect(key).toMatch(
            new RegExp(`^department_${DOMAIN}_\\d{4}_sales_v3$`),
        );

        redisGet.mockResolvedValue(json);
        apiCall.mockClear();
        headsResolve.mockClear();

        const second = await service.getFullDepartment(
            DOMAIN,
            EDepartamentGroup.sales,
        );

        expect(apiCall).not.toHaveBeenCalled();
        expect(headsResolve).not.toHaveBeenCalled();
        expect(second).toEqual(first);
    });

    it('resetCache: игнорирует кэш и перезаписывает его', async () => {
        redisGet.mockResolvedValue(JSON.stringify({ поломанный: 'кеш' }));

        const { department } = await service.getFullDepartment(
            DOMAIN,
            EDepartamentGroup.sales,
            true,
        );

        expect(redisGet).not.toHaveBeenCalled();
        expect(department.generalDepartment[0].HEADS).toEqual([202]);
        expect(redisSet).toHaveBeenCalledTimes(1);
    });
});
