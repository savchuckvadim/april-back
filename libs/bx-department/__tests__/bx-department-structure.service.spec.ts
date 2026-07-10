import { NotFoundException } from '@nestjs/common';
import { RedisService } from 'src/core/redis/redis.service';
import { PBXService } from '@/modules/pbx';
import { EDepartamentGroup } from '@lib/portal-lib/portal/interfaces/portal.interface';
import { IBXUser } from 'src/modules/bitrix/domain/interfaces/bitrix.interface';
import { BxDepartmentStructureService } from '../services/bx-department-structure.service';
import { BxDepartmentService } from '../services/bx-department.service';
import { EBxDepartmentHeadType } from '../dto/bx-department-structure.dto';

const DOMAIN = 'example.bitrix24.ru';

// Структура портала (старый API):
// 1 ГАРАНТ СЕРВИС (корень)
// ├─ 37 ОП Ростов на Дону (UF_HEAD 201): users 201, 210
// ├─ 49 Отдел продаж Москва: users нет
// ├─ 47 ОПТ склад (не должен матчиться)
// └─ 53 Глава Воронеж (UF_HEAD 309)
//    └─ 41 ОП Воронеж (UF_HEAD 202): user 202
//       └─ 45 Звездочки (группа, UF_HEAD 203): users 203, 204
// 55 Глава Питер └─ 35 ОС Питер (группа service)
const ALL_DEPARTMENTS = [
    { ID: 1, NAME: 'ГАРАНТ СЕРВИС', PARENT: '0', SORT: 1, UF_HEAD: 100 },
    { ID: 37, NAME: 'ОП Ростов на Дону', PARENT: '1', SORT: 2, UF_HEAD: 201 },
    { ID: 49, NAME: 'Отдел продаж Москва', PARENT: '1', SORT: 3 },
    { ID: 47, NAME: 'ОПТ склад', PARENT: '1', SORT: 4 },
    { ID: 53, NAME: 'Глава Воронеж', PARENT: '1', SORT: 5, UF_HEAD: 309 },
    { ID: 41, NAME: 'ОП Воронеж', PARENT: '53', SORT: 6, UF_HEAD: 202 },
    { ID: 45, NAME: 'Звездочки', PARENT: '41', SORT: 7, UF_HEAD: 203 },
    { ID: 55, NAME: 'Глава Питер', PARENT: '1', SORT: 8 },
    { ID: 35, NAME: 'ОС Питер', PARENT: '55', SORT: 9 },
];

const USERS_BY_DEPARTMENT: Record<number, IBXUser[]> = {
    37: [
        { ID: 201, NAME: 'Иван' },
        { ID: 210, NAME: 'Пётр' },
    ],
    41: [{ ID: 202, NAME: 'Директор Воронеж' }],
    45: [
        { ID: 203, NAME: 'Лидер группы' },
        { ID: 204, NAME: 'Сотрудник группы' },
    ],
};

describe('BxDepartmentStructureService', () => {
    let redisGet: jest.Mock;
    let redisSet: jest.Mock;
    let apiCall: jest.Mock;
    let getFullDepartment: jest.Mock;
    let service: BxDepartmentStructureService;

    beforeEach(() => {
        redisGet = jest.fn().mockResolvedValue(null);
        redisSet = jest.fn().mockResolvedValue('OK');

        apiCall = jest.fn(
            (
                method: string,
                params: { FILTER?: { UF_DEPARTMENT?: number } },
            ): Promise<unknown> => {
                if (method === 'department.get') {
                    return Promise.resolve({ result: ALL_DEPARTMENTS });
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

        getFullDepartment = jest.fn();

        const redisService = {
            getClient: () => ({ get: redisGet, set: redisSet }),
        } as unknown as RedisService;
        const pbx = {
            init: jest
                .fn()
                .mockResolvedValue({ bitrix: { api: { call: apiCall } } }),
        } as unknown as PBXService;
        const departmentService = {
            getFullDepartment,
        } as unknown as BxDepartmentService;

        service = new BxDepartmentStructureService(
            redisService,
            pbx,
            departmentService,
        );
    });

    describe('мультирежим', () => {
        it('находит все ОП по названию и мерджит в прежний формат', async () => {
            const result = await service.getStructure(
                DOMAIN,
                EDepartamentGroup.sales,
                true,
                204,
            );

            const generalIds = result.department.generalDepartment.map(
                d => d.ID,
            );
            expect(generalIds).toEqual(expect.arrayContaining([37, 41, 49]));
            // «ОПТ склад» и «ОС Питер» не матчатся
            expect(generalIds).not.toContain(47);
            expect(generalIds).not.toContain(35);
            // группы всех ОП
            expect(
                result.department.childrenDepartments.map(d => d.ID),
            ).toEqual([45]);
            // все сотрудники без дублей
            expect(
                result.department.allUsers.map(u => Number(u.ID)).sort(),
            ).toEqual([201, 202, 203, 204, 210]);
            // поле department = 0 в мультирежиме
            expect(result.department.department).toBe(0);
        });

        it('строит разбивку по каждому ОП с группами и сотрудниками', async () => {
            const result = await service.getStructure(
                DOMAIN,
                EDepartamentGroup.sales,
                true,
                204,
            );

            const voronezh = result.salesDepartments.find(
                s => s.department.ID === 41,
            );
            expect(voronezh?.groups.map(g => g.ID)).toEqual([45]);
            expect(voronezh?.allUsers.map(u => Number(u.ID)).sort()).toEqual([
                202, 203, 204,
            ]);

            const rostov = result.salesDepartments.find(
                s => s.department.ID === 37,
            );
            expect(rostov?.groups).toEqual([]);
            expect(rostov?.allUsers.map(u => Number(u.ID)).sort()).toEqual([
                201, 210,
            ]);
        });

        it('service: матчит отделы «ОС …»', async () => {
            const result = await service.getStructure(
                DOMAIN,
                EDepartamentGroup.service,
                true,
                204,
            );

            expect(result.department.generalDepartment.map(d => d.ID)).toEqual([
                35,
            ]);
        });

        it('бросает NotFoundException, если отделы группы не найдены', async () => {
            apiCall.mockResolvedValue({ result: [] });

            await expect(
                service.getStructure(DOMAIN, EDepartamentGroup.sales, true, 1),
            ).rejects.toBeInstanceOf(NotFoundException);
        });

        it('берёт структуру из кеша без похода в Битрикс', async () => {
            const first = await service.getStructure(
                DOMAIN,
                EDepartamentGroup.sales,
                true,
                204,
            );
            const [, cachedJson] = redisSet.mock.calls[0] as [string, string];
            redisGet.mockResolvedValue(cachedJson);
            apiCall.mockClear();

            const second = await service.getStructure(
                DOMAIN,
                EDepartamentGroup.sales,
                true,
                203,
            );

            expect(apiCall).not.toHaveBeenCalled();
            expect(second.department).toEqual(first.department);
            // пользовательская часть пересчитывается поверх кеша
            expect(second.currentUser.userId).toBe(203);
        });
    });

    describe('текущий пользователь', () => {
        const get = (userId: number) =>
            service.getStructure(DOMAIN, EDepartamentGroup.sales, true, userId);

        it('руководитель группы: headOf=group, коллеги группы и ОП без него', async () => {
            const { currentUser } = await get(203);

            expect(currentUser.isHead).toBe(true);
            expect(currentUser.headOf).toBe(EBxDepartmentHeadType.group);
            expect(currentUser.headOfDepartmentIds).toEqual([45]);
            expect(currentUser.colleagues.group.map(u => Number(u.ID))).toEqual(
                [204],
            );
            expect(
                currentUser.colleagues.department.map(u => Number(u.ID)).sort(),
            ).toEqual([202, 204]);
        });

        it('руководитель ОП: headOf=op', async () => {
            const { currentUser } = await get(202);

            expect(currentUser.headOf).toBe(EBxDepartmentHeadType.op);
            expect(currentUser.headOfDepartmentIds).toEqual([41]);
            // числится в ОП напрямую, не в группе
            expect(currentUser.colleagues.group).toEqual([]);
            expect(
                currentUser.colleagues.department.map(u => Number(u.ID)).sort(),
            ).toEqual([203, 204]);
        });

        it('руководитель родителя ОП: headOf=cup', async () => {
            const { currentUser } = await get(309);

            expect(currentUser.headOf).toBe(EBxDepartmentHeadType.cup);
            expect(currentUser.headOfDepartmentIds).toEqual([53]);
        });

        it('обычный сотрудник группы: isHead=false, коллеги заполнены', async () => {
            const { currentUser } = await get(204);

            expect(currentUser.isHead).toBe(false);
            expect(currentUser.headOf).toBeNull();
            expect(currentUser.colleagues.group.map(u => Number(u.ID))).toEqual(
                [203],
            );
            expect(
                currentUser.colleagues.department.map(u => Number(u.ID)).sort(),
            ).toEqual([202, 203]);
        });
    });

    describe('одиночный режим (как раньше)', () => {
        it('делегирует BxDepartmentService и строит разбивку из ответа', async () => {
            const general = {
                ID: 9,
                NAME: 'Отдел продаж',
                PARENT: '1',
                SORT: 1,
                UF_HEAD: 202,
                USERS: [{ ID: 202 }],
            };
            const child = {
                ID: 10,
                NAME: 'Группа 1',
                PARENT: '9',
                SORT: 1,
                USERS: [{ ID: 204 }],
            };
            getFullDepartment.mockResolvedValue({
                department: {
                    department: 9,
                    generalDepartment: [general],
                    childrenDepartments: [child],
                    allUsers: [{ ID: 202 }, { ID: 204 }],
                },
            });

            const result = await service.getStructure(
                DOMAIN,
                EDepartamentGroup.sales,
                false,
                202,
            );

            expect(getFullDepartment).toHaveBeenCalledWith(
                DOMAIN,
                EDepartamentGroup.sales,
            );
            expect(result.department.department).toBe(9);
            expect(result.salesDepartments).toHaveLength(1);
            expect(result.salesDepartments[0].groups.map(g => g.ID)).toEqual([
                10,
            ]);
            expect(result.currentUser.headOf).toBe(EBxDepartmentHeadType.op);
        });
    });
});
