import { NotFoundException } from '@nestjs/common';
import { RedisService } from 'src/core/redis/redis.service';
import { PBXService } from '@/modules/pbx';
import { EDepartamentGroup } from '@lib/portal-lib/portal/interfaces/portal.interface';
import { IBXUser } from 'src/modules/bitrix/domain/interfaces/bitrix.interface';
import { BxDepartmentStructureService } from '../services/bx-department-structure.service';
import { BxDepartmentService } from '../services/bx-department.service';
import { BxDepartmentHeadsService } from '../services/bx-department-heads.service';
import { PortalAppSettingsService } from '@lib/portal-lib/store/app-settings';
import {
    EBxDepartmentHeadType,
    EBxHeadOfSource,
    EBxVisibilityLevel,
} from '../dto/bx-department-structure.dto';

const DOMAIN = 'example.bitrix24.ru';

// Структура портала (старый API):
// 1 ГАРАНТ СЕРВИС (корень)
// ├─ 37 ОП Ростов на Дону (UF_HEAD 201): users 201, 210
// ├─ 49 Отдел продаж Москва: users нет
// ├─ 47 ОПТ склад (не должен матчиться)
// └─ 53 Глава Воронеж (UF_HEAD 309)
//    └─ 41 ОП Воронеж (UF_HEAD 202): user 202
//       ├─ 45 Группа Звездочки (группа, UF_HEAD 203): users 203, 204
//       └─ 48 Стажеры (подотдел БЕЗ «Группа» — не группа, но user 205 остаётся в ОП)
// 55 Глава Питер └─ 35 ОС Питер (группа service)
const ALL_DEPARTMENTS = [
    { ID: 1, NAME: 'ГАРАНТ СЕРВИС', PARENT: '0', SORT: 1, UF_HEAD: 100 },
    { ID: 37, NAME: 'ОП Ростов на Дону', PARENT: '1', SORT: 2, UF_HEAD: 201 },
    { ID: 49, NAME: 'Отдел продаж Москва', PARENT: '1', SORT: 3 },
    { ID: 47, NAME: 'ОПТ склад', PARENT: '1', SORT: 4 },
    { ID: 53, NAME: 'Глава Воронеж', PARENT: '1', SORT: 5, UF_HEAD: 309 },
    { ID: 41, NAME: 'ОП Воронеж', PARENT: '53', SORT: 6, UF_HEAD: 202 },
    { ID: 45, NAME: 'Группа Звездочки', PARENT: '41', SORT: 7, UF_HEAD: 203 },
    { ID: 48, NAME: 'Стажеры', PARENT: '41', SORT: 10 },
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
    48: [{ ID: 205, NAME: 'Стажёр' }],
};

describe('BxDepartmentStructureService', () => {
    let redisGet: jest.Mock;
    let redisSet: jest.Mock;
    let apiCall: jest.Mock;
    let getFullDepartment: jest.Mock;
    let pbxInit: jest.Mock;
    let headsResolve: jest.Mock;
    let settingsResolve: jest.Mock;
    let service: BxDepartmentStructureService;

    /** init отдаёт bitrix и локальный портал с флагами мультирежима по группам. */
    const initResult = (
        isMultiple: Record<EDepartamentGroup, boolean>,
        tags: Partial<Record<EDepartamentGroup, string>> = {},
    ) => ({
        bitrix: { api: { call: apiCall } },
        internalPortal: {
            departaments: Object.entries(isMultiple).map(([group, flag]) => ({
                group: group as EDepartamentGroup,
                is_multiple: flag,
                multiple_tag: tags[group as EDepartamentGroup] ?? null,
            })),
        },
    });

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
        // По умолчанию мультирежим включён в БД для sales и service.
        pbxInit = jest.fn().mockResolvedValue(
            initResult({
                [EDepartamentGroup.sales]: true,
                [EDepartamentGroup.service]: true,
                [EDepartamentGroup.tmc]: false,
            }),
        );
        const pbx = {
            init: pbxInit,
        } as unknown as PBXService;
        const departmentService = {
            getFullDepartment,
        } as unknown as BxDepartmentService;
        // По умолчанию структура v3 недоступна — руководители из UF_HEAD.
        headsResolve = jest.fn().mockResolvedValue(new Map());
        const headsService = {
            resolve: headsResolve,
        } as unknown as BxDepartmentHeadsService;
        // По умолчанию списки принудительной видимости не заданы.
        settingsResolve = jest.fn().mockResolvedValue({});
        const appSettings = {
            resolve: settingsResolve,
        } as unknown as PortalAppSettingsService;

        service = new BxDepartmentStructureService(
            redisService,
            pbx,
            departmentService,
            headsService,
            appSettings,
        );
    });

    describe('мультирежим', () => {
        it('находит все ОП по названию и мерджит в прежний формат', async () => {
            const result = await service.getStructure(
                DOMAIN,
                EDepartamentGroup.sales,
                204,
            );

            const generalIds = result.department.generalDepartment.map(
                d => d.ID,
            );
            expect(generalIds).toEqual(expect.arrayContaining([37, 41, 49]));
            // «ОПТ склад» и «ОС Питер» не матчатся
            expect(generalIds).not.toContain(47);
            expect(generalIds).not.toContain(35);
            // все подотделы ОП (включая негрупповые — legacy-формат)
            expect(
                result.department.childrenDepartments.map(d => d.ID),
            ).toEqual([45, 48]);
            // все сотрудники без дублей (205 из негруппового подотдела — тоже)
            expect(
                result.department.allUsers.map(u => Number(u.ID)).sort(),
            ).toEqual([201, 202, 203, 204, 205, 210]);
            // поле department = 0 в мультирежиме
            expect(result.department.department).toBe(0);
        });

        it('строит разбивку по каждому ОП с группами и сотрудниками', async () => {
            const result = await service.getStructure(
                DOMAIN,
                EDepartamentGroup.sales,
                204,
            );

            const voronezh = result.salesDepartments.find(
                s => s.department.ID === 41,
            );
            // группой считается только «Группа…»; «Стажеры» — нет,
            // но их сотрудник остаётся в allUsers отдела
            expect(voronezh?.groups.map(g => g.ID)).toEqual([45]);
            expect(voronezh?.allUsers.map(u => Number(u.ID)).sort()).toEqual([
                202, 203, 204, 205,
            ]);

            const rostov = result.salesDepartments.find(
                s => s.department.ID === 37,
            );
            expect(rostov?.groups).toEqual([]);
            expect(rostov?.allUsers.map(u => Number(u.ID)).sort()).toEqual([
                201, 210,
            ]);
        });

        it('ищет по кастомному тэгу multiple_tag из БД, а не по дефолтным шаблонам', async () => {
            // Тэг «Глава» → отделы 53 и 55; дефолтные ОП-шаблоны игнорируются.
            pbxInit.mockResolvedValue(
                initResult(
                    {
                        [EDepartamentGroup.sales]: true,
                        [EDepartamentGroup.service]: false,
                        [EDepartamentGroup.tmc]: false,
                    },
                    { [EDepartamentGroup.sales]: 'Глава' },
                ),
            );

            const result = await service.getStructure(
                DOMAIN,
                EDepartamentGroup.sales,
                204,
            );

            expect(
                result.department.generalDepartment.map(d => d.ID).sort(),
            ).toEqual([53, 55]);
            // отделы под дефолтный шаблон «ОП …» больше не попадают
            expect(
                result.department.generalDepartment.map(d => d.ID),
            ).not.toContain(37);
        });

        it('скобочный тэг «(ОП)» ищется как подстрока в любом месте названия', async () => {
            pbxInit.mockResolvedValue(
                initResult(
                    {
                        [EDepartamentGroup.sales]: true,
                        [EDepartamentGroup.service]: false,
                        [EDepartamentGroup.tmc]: false,
                    },
                    { [EDepartamentGroup.sales]: '(ОП)' },
                ),
            );
            apiCall.mockImplementation((method: string): Promise<unknown> => {
                if (method === 'department.get') {
                    return Promise.resolve({
                        result: [
                            {
                                ID: 1,
                                NAME: 'ГАРАНТ СЕРВИС',
                                PARENT: '0',
                                SORT: 1,
                            },
                            // тэг в конце названия — должен найтись
                            {
                                ID: 61,
                                NAME: 'Отдел продаж (ОП)',
                                PARENT: '1',
                                SORT: 2,
                            },
                            // тэг в начале — тоже
                            {
                                ID: 62,
                                NAME: '(ОП) Воронеж',
                                PARENT: '1',
                                SORT: 3,
                            },
                            // «ОП» без скобок — не матчится
                            {
                                ID: 63,
                                NAME: 'ОП Ростов',
                                PARENT: '1',
                                SORT: 4,
                            },
                        ],
                    });
                }
                return Promise.resolve({ result: [] });
            });

            const result = await service.getStructure(
                DOMAIN,
                EDepartamentGroup.sales,
                204,
            );

            expect(
                result.department.generalDepartment.map(d => d.ID).sort(),
            ).toEqual([61, 62]);
        });

        it('service: матчит отделы «ОС …»', async () => {
            const result = await service.getStructure(
                DOMAIN,
                EDepartamentGroup.service,
                204,
            );

            expect(result.department.generalDepartment.map(d => d.ID)).toEqual([
                35,
            ]);
        });

        it('бросает NotFoundException, если отделы группы не найдены', async () => {
            apiCall.mockResolvedValue({ result: [] });

            await expect(
                service.getStructure(DOMAIN, EDepartamentGroup.sales, 1),
            ).rejects.toBeInstanceOf(NotFoundException);
        });

        it('берёт структуру из кеша без похода в Битрикс', async () => {
            const first = await service.getStructure(
                DOMAIN,
                EDepartamentGroup.sales,
                204,
            );
            const [, cachedJson] = redisSet.mock.calls[0] as [string, string];
            redisGet.mockResolvedValue(cachedJson);
            apiCall.mockClear();

            const second = await service.getStructure(
                DOMAIN,
                EDepartamentGroup.sales,
                203,
            );

            expect(apiCall).not.toHaveBeenCalled();
            expect(second.department).toEqual(first.department);
            // пользовательская часть пересчитывается поверх кеша
            expect(second.currentUser.userId).toBe(203);
        });

        it('resetCache: игнорирует кеш, идёт в Битрикс и перезаписывает кеш', async () => {
            redisGet.mockResolvedValue(JSON.stringify({ поломанный: 'кеш' }));

            const result = await service.getStructure(
                DOMAIN,
                EDepartamentGroup.sales,
                204,
                true,
            );

            expect(redisGet).not.toHaveBeenCalled();
            expect(apiCall).toHaveBeenCalled();
            expect(result.department.generalDepartment.map(d => d.ID)).toEqual(
                expect.arrayContaining([37, 41, 49]),
            );
            expect(redisSet).toHaveBeenCalledWith(
                expect.stringContaining(`department_structure_v3_${DOMAIN}_`),
                expect.any(String),
                'EX',
                86400,
            );
        });
    });

    describe('текущий пользователь', () => {
        const get = (userId: number) =>
            service.getStructure(DOMAIN, EDepartamentGroup.sales, userId);

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
            ).toEqual([202, 204, 205]);
        });

        it('руководитель ОП: headOf=op', async () => {
            const { currentUser } = await get(202);

            expect(currentUser.headOf).toBe(EBxDepartmentHeadType.op);
            expect(currentUser.headOfDepartmentIds).toEqual([41]);
            // числится в ОП напрямую, не в группе
            expect(currentUser.colleagues.group).toEqual([]);
            expect(
                currentUser.colleagues.department.map(u => Number(u.ID)).sort(),
            ).toEqual([203, 204, 205]);
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
            ).toEqual([202, 203, 205]);
        });

        it('структура v3 недоступна: HEADS собирается из UF_HEAD', async () => {
            const { salesDepartments } = await get(202);

            const voronezh = salesDepartments.find(s => s.department.ID === 41);
            expect(voronezh?.department.HEADS).toEqual([202]);
            expect(voronezh?.department.UF_HEAD).toBe(202);
            expect(voronezh?.groups[0].HEADS).toEqual([203]);
            expect(headsResolve).toHaveBeenCalledWith(
                DOMAIN,
                expect.arrayContaining([
                    expect.objectContaining({ ID: 41 }),
                    expect.objectContaining({ ID: 45 }),
                    // родитель ОП (cup) тоже получает руководителей
                    expect.objectContaining({ ID: 53 }),
                ]),
            );
        });

        it('два руководителя ОП из структуры v3 при пустом UF_HEAD: оба headOf=op', async () => {
            // Новая структура при двух руководителях пишет в UF_HEAD null
            // (инцидент gsirk 05.09.2026); руководители приходят из v3.
            apiCall.mockImplementation(
                (
                    method: string,
                    params: { FILTER?: { UF_DEPARTMENT?: number } },
                ): Promise<unknown> => {
                    if (method === 'department.get') {
                        return Promise.resolve({
                            result: ALL_DEPARTMENTS.map(d =>
                                d.ID === 41 ? { ...d, UF_HEAD: null } : d,
                            ),
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
            // 202 — руководитель, 777 — заместитель (в USERS отдела не числится)
            headsResolve.mockResolvedValue(new Map([[41, [202, 777]]]));

            const first = await get(202);

            const voronezh = first.salesDepartments.find(
                s => s.department.ID === 41,
            );
            expect(voronezh?.department.HEADS).toEqual([202, 777]);
            // UF_HEAD наружу = первый из HEADS — контракт для старых фронтов;
            // в UF_HEAD от Битрикса был null, руководитель восстановлен из v3.
            expect(voronezh?.department.UF_HEAD).toBe(202);
            expect(first.currentUser.headOf).toBe(EBxDepartmentHeadType.op);
            expect(first.currentUser.headOfDepartmentIds).toEqual([41]);

            // Второй руководитель — тоже op, хотя в UF_HEAD его нет.
            const second = await get(777);
            expect(second.currentUser.isHead).toBe(true);
            expect(second.currentUser.headOf).toBe(EBxDepartmentHeadType.op);
            expect(second.currentUser.headOfDepartmentIds).toEqual([41]);
            expect(second.currentUser.visibility).toBe(
                EBxVisibilityLevel.department,
            );
            expect(second.currentUser.headOfSource).toBe(
                EBxHeadOfSource.structure,
            );
            expect(
                second.currentUser.colleagues.department
                    .map(u => Number(u.ID))
                    .sort(),
            ).toEqual([202, 203, 204, 205]);
        });

        it('заместитель из v3 сверх UF_HEAD: headOf=group, без дублей, руководитель первым', async () => {
            headsResolve.mockResolvedValue(new Map([[45, [203, 204]]]));

            const { currentUser, salesDepartments } = await get(204);

            const group = salesDepartments
                .flatMap(s => s.groups)
                .find(g => g.ID === 45);
            expect(group?.HEADS).toEqual([203, 204]);
            expect(group?.UF_HEAD).toBe(203);
            expect(currentUser.isHead).toBe(true);
            expect(currentUser.headOf).toBe(EBxDepartmentHeadType.group);
            expect(currentUser.headOfDepartmentIds).toEqual([45]);
            expect(currentUser.visibility).toBe(EBxVisibilityLevel.group);
        });

        it('visibility по headOf: cup→all, op→department, group→group, null→own', async () => {
            expect((await get(309)).currentUser.visibility).toBe(
                EBxVisibilityLevel.all,
            );
            expect((await get(202)).currentUser.visibility).toBe(
                EBxVisibilityLevel.department,
            );
            expect((await get(203)).currentUser.visibility).toBe(
                EBxVisibilityLevel.group,
            );
            const employee = (await get(204)).currentUser;
            expect(employee.visibility).toBe(EBxVisibilityLevel.own);
            expect(employee.headOfSource).toBe(EBxHeadOfSource.structure);
        });
    });

    describe('принудительная видимость из настроек «Отдел продаж»', () => {
        const get = (userId: number) =>
            service.getStructure(DOMAIN, EDepartamentGroup.sales, userId);

        it('сотрудник в списке department: свой ОП, headOf=op, source=settings', async () => {
            settingsResolve.mockResolvedValue({
                visibilityDepartmentUserIds: '204, 999',
            });

            const { currentUser } = await get(204);

            expect(settingsResolve).toHaveBeenCalledWith(DOMAIN, 'sales');
            expect(currentUser.isHead).toBe(true);
            expect(currentUser.headOf).toBe(EBxDepartmentHeadType.op);
            expect(currentUser.headOfDepartmentIds).toEqual([41]);
            expect(currentUser.visibility).toBe(EBxVisibilityLevel.department);
            expect(currentUser.headOfSource).toBe(EBxHeadOfSource.settings);
            // коллеги — по фактическому месту в структуре
            expect(currentUser.colleagues.group.map(u => Number(u.ID))).toEqual(
                [203],
            );
        });

        it('сотрудник в списке group: своя группа', async () => {
            settingsResolve.mockResolvedValue({
                visibilityGroupUserIds: '204',
            });

            const { currentUser } = await get(204);

            expect(currentUser.headOf).toBe(EBxDepartmentHeadType.group);
            expect(currentUser.headOfDepartmentIds).toEqual([45]);
            expect(currentUser.visibility).toBe(EBxVisibilityLevel.group);
            expect(currentUser.headOfSource).toBe(EBxHeadOfSource.settings);
        });

        it('group без своей группы (подотдел «Стажеры») → department по своему ОП', async () => {
            settingsResolve.mockResolvedValue({
                visibilityGroupUserIds: '205',
            });

            const { currentUser } = await get(205);

            expect(currentUser.headOf).toBe(EBxDepartmentHeadType.op);
            expect(currentUser.headOfDepartmentIds).toEqual([41]);
            expect(currentUser.visibility).toBe(EBxVisibilityLevel.department);
        });

        it('вне структуры продаж → all: headOf=cup, периметр — все ОП', async () => {
            settingsResolve.mockResolvedValue({
                visibilityGroupUserIds: '999',
            });

            const { currentUser } = await get(999);

            expect(currentUser.headOf).toBe(EBxDepartmentHeadType.cup);
            expect([...currentUser.headOfDepartmentIds].sort()).toEqual([
                37, 41, 49,
            ]);
            expect(currentUser.visibility).toBe(EBxVisibilityLevel.all);
            expect(currentUser.headOfSource).toBe(EBxHeadOfSource.settings);
            expect(currentUser.colleagues.group).toEqual([]);
            expect(currentUser.colleagues.department).toEqual([]);
        });

        it('настройка не понижает: руководитель ОП в списке group остаётся op по структуре', async () => {
            settingsResolve.mockResolvedValue({
                visibilityGroupUserIds: '202',
            });

            const { currentUser } = await get(202);

            expect(currentUser.headOf).toBe(EBxDepartmentHeadType.op);
            expect(currentUser.visibility).toBe(EBxVisibilityLevel.department);
            expect(currentUser.headOfSource).toBe(EBxHeadOfSource.structure);
        });

        it('человек в нескольких списках: берётся высший', async () => {
            settingsResolve.mockResolvedValue({
                visibilityGroupUserIds: '204',
                visibilityAllUserIds: '204',
            });

            const { currentUser } = await get(204);

            expect(currentUser.headOf).toBe(EBxDepartmentHeadType.cup);
            expect(currentUser.visibility).toBe(EBxVisibilityLevel.all);
        });

        it('настройки недоступны: роли по структуре, без исключения', async () => {
            settingsResolve.mockRejectedValue(new Error('db down'));

            const { currentUser } = await get(202);

            expect(currentUser.headOf).toBe(EBxDepartmentHeadType.op);
            expect(currentUser.headOfSource).toBe(EBxHeadOfSource.structure);
        });

        it('группа service: настройки «Отдел продаж» не читаются', async () => {
            await service.getStructure(DOMAIN, EDepartamentGroup.service, 204);

            expect(settingsResolve).not.toHaveBeenCalled();
        });
    });

    describe('одиночный режим (как раньше)', () => {
        it('делегирует BxDepartmentService и строит разбивку из ответа', async () => {
            // is_multiple=false в БД → прежний одиночный режим.
            pbxInit.mockResolvedValue(
                initResult({
                    [EDepartamentGroup.sales]: false,
                    [EDepartamentGroup.service]: false,
                    [EDepartamentGroup.tmc]: false,
                }),
            );
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
                202,
            );

            expect(getFullDepartment).toHaveBeenCalledWith(
                DOMAIN,
                EDepartamentGroup.sales,
                false,
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
