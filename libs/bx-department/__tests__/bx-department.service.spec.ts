import { Logger } from '@nestjs/common';
import { RedisService } from 'src/core/redis/redis.service';
import { PBXService } from '@/modules/pbx';
import { EDepartamentGroup } from '@lib/portal-lib/portal/interfaces/portal.interface';
import { IBXUser } from 'src/modules/bitrix/domain/interfaces/bitrix.interface';
import { BxDepartmentService } from '../services/bx-department.service';
import { BxDepartmentHeadsService } from '../services/bx-department-heads.service';
import {
    callsOf,
    GARANT_CHILD_IDS,
    GARANT_DOMAIN,
    GARANT_OP_IDS,
    GARANT_OP_USER_IDS,
    GARANT_PARENT_IDS,
    garantInternalPortal,
    type GarantStand,
    makeGarantStand,
} from './fixtures/garant-portal.fixture';

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
/** Свежая копия на каждый тест — тест может переселить сотрудников. */
const defaultUsers = (): Record<number, IBXUser[]> => ({
    9: [{ ID: 202, NAME: 'Руководитель' }],
    10: [{ ID: 204, NAME: 'Сотрудник' }],
});

/** ID отделов/сотрудников списком по возрастанию. */
const ids = (list: { ID?: number | string }[] | null | undefined): number[] =>
    (list ?? []).map(item => Number(item.ID)).sort((a, b) => a - b);

describe('BxDepartmentService', () => {
    let redisGet: jest.Mock;
    let redisSet: jest.Mock;
    let apiCall: jest.Mock;
    let headsResolve: jest.Mock;
    let usersByDepartment: Record<number, IBXUser[]>;
    let service: BxDepartmentService;

    beforeEach(() => {
        usersByDepartment = defaultUsers();
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
                        result: usersByDepartment[depId] ?? [],
                    });
                }
                return Promise.resolve({ result: [] });
            },
        );
        headsResolve = jest.fn().mockResolvedValue(new Map());

        const redisService = {
            getClient: () => ({ get: redisGet, set: redisSet }),
        } as unknown as RedisService;
        // Без internalPortal — одиночный режим (как на локальной БД).
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
        expect(department.isMultiple).toBe(false);
        expect(department.multipleTag).toBeNull();
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

    it('кэш: ключ с режимом и версией формы v4, повторный вызов не ходит в Битрикс', async () => {
        const first = await service.getFullDepartment(
            DOMAIN,
            EDepartamentGroup.sales,
        );
        const [key, json, , ttl] = redisSet.mock.calls[0] as [
            string,
            string,
            string,
            number,
        ];
        expect(key).toMatch(
            new RegExp(`^department_${DOMAIN}_\\d{4}_sales_single_v4$`),
        );
        expect(ttl).toBe(86400);

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

    it('сотрудник и в отделе, и в группе попадает в allUsers один раз', async () => {
        // user.get отдаёт ID то числом, то строкой — дубль всё равно ловится
        usersByDepartment[10] = [
            { ID: 204, NAME: 'Сотрудник' },
            { ID: '202', NAME: 'Руководитель' },
        ];

        const { department } = await service.getFullDepartment(
            DOMAIN,
            EDepartamentGroup.sales,
        );

        expect(department.allUsers.map(u => Number(u.ID))).toEqual([202, 204]);
    });

    describe('мультирежим (garant: конфиг bitrixId 1, is_multiple = 1, тэг «(ОП)»)', () => {
        let stand: GarantStand;
        let warn: jest.SpyInstance;

        const load = () =>
            stand.departments.getFullDepartment(
                GARANT_DOMAIN,
                EDepartamentGroup.sales,
            );
        const savedKey = (): [string, string, string, number] =>
            stand.redis.set.mock.calls[0] as [string, string, string, number];

        beforeEach(() => {
            stand = makeGarantStand();
            warn = jest
                .spyOn(Logger.prototype, 'warn')
                .mockImplementation(() => undefined);
        });

        afterEach(() => warn.mockRestore());

        it('режим из internalPortal: все ОП по тэгу со всей структуры, department = 0', async () => {
            const { department } = await load();

            expect(ids(department.generalDepartment)).toEqual(GARANT_OP_IDS);
            expect(department.department).toBe(0);
            expect(department.isMultiple).toBe(true);
            expect(department.multipleTag).toBe('(ОП)');
            // один department.get без фильтра; корень из конфига (1) базой не служит
            expect(stand.apiCall).toHaveBeenCalledWith('department.get', {});
            expect(stand.apiCall).not.toHaveBeenCalledWith('department.get', {
                ID: 1,
            });
        });

        it('подотделы всех ОП — и группы, и прочие', async () => {
            const { department } = await load();

            expect(ids(department.childrenDepartments)).toEqual(
                GARANT_CHILD_IDS,
            );
        });

        it('предки каждого ОП до корня: без дублей, с сотрудниками и руководителями', async () => {
            const { department } = await load();

            const parents = department.parentDepartments ?? [];
            expect(ids(parents)).toEqual(GARANT_PARENT_IDS);
            const byId = new Map(parents.map(d => [Number(d.ID), d]));
            expect(ids(byId.get(79)?.USERS)).toEqual([100]);
            expect(ids(byId.get(1)?.USERS)).toEqual([1, 2, 3]);
            expect(byId.get(81)?.HEADS).toEqual([200]);
            expect(byId.get(87)?.HEADS).toEqual([]);
            // корень — предок всех четырёх ОП, но запрошен один раз
            expect(callsOf(stand.apiCall, 'user.get', 1)).toBe(1);
        });

        it('allUsers — 20 сотрудников ОП и подотделов без дублей, без сотрудников предков', async () => {
            const { department } = await load();

            expect(department.allUsers).toHaveLength(GARANT_OP_USER_IDS.length);
            expect(ids(department.allUsers)).toEqual(GARANT_OP_USER_IDS);
        });

        it('руководители — одним вызовом по ОП, подотделам и предкам', async () => {
            await load();

            expect(stand.headsResolve).toHaveBeenCalledTimes(1);
            const [, departments] = stand.headsResolve.mock.calls[0] as [
                string,
                { ID: string }[],
            ];
            expect(ids(departments)).toEqual(
                [
                    ...GARANT_OP_IDS,
                    ...GARANT_CHILD_IDS,
                    ...GARANT_PARENT_IDS,
                ].sort((a, b) => a - b),
            );
        });

        it('ключ кэша с режимом и тэгом: …_sales_multi_(оп)_v4 на сутки', async () => {
            await load();

            const [key, , , ttl] = savedKey();
            expect(key).toMatch(
                new RegExp(
                    `^department_${GARANT_DOMAIN}_\\d{4}_sales_multi_\\(оп\\)_v4$`,
                ),
            );
            expect(ttl).toBe(86400);
        });

        it('is_multiple = true (boolean из Prisma) — тот же мультирежим', async () => {
            stand = makeGarantStand(garantInternalPortal(true));

            const { department } = await load();

            expect(department.isMultiple).toBe(true);
            expect(ids(department.generalDepartment)).toEqual(GARANT_OP_IDS);
        });

        it('ни одного ОП: warn, пустой снимок в кэше на 300 с, без исключения и без одиночного режима', async () => {
            stand = makeGarantStand(garantInternalPortal(1, '(ОС)'));

            const { department } = await load();

            expect(department.generalDepartment).toEqual([]);
            expect(department.childrenDepartments).toEqual([]);
            expect(department.parentDepartments).toEqual([]);
            expect(department.allUsers).toEqual([]);
            expect(department.isMultiple).toBe(true);
            expect(warn).toHaveBeenCalledWith(
                expect.stringContaining('не найдено отделов'),
            );
            const [key, , , ttl] = savedKey();
            expect(key).toContain('_sales_multi_(ос)_v4');
            expect(ttl).toBe(300);
            // к базовому отделу из конфига не откатывается
            expect(stand.apiCall).not.toHaveBeenCalledWith('department.get', {
                ID: 1,
            });
            expect(callsOf(stand.apiCall, 'user.get')).toBe(0);
        });

        it('departaments пуст (как в локальной БД) — одиночный режим как раньше: корень и прямые подотделы', async () => {
            stand = makeGarantStand({ departaments: [] });

            const { department } = await load();

            expect(department.department).toBe(1);
            expect(department.isMultiple).toBe(false);
            expect(department.multipleTag).toBeNull();
            expect(ids(department.generalDepartment)).toEqual([1]);
            expect(ids(department.childrenDepartments)).toEqual([
                3, 5, 59, 79, 81, 87,
            ]);
            // та самая ошибка прода: ни одного сотрудника ОП в одиночном режиме
            expect(
                ids(department.allUsers).filter(id =>
                    GARANT_OP_USER_IDS.includes(id),
                ),
            ).toEqual([]);
            expect(savedKey()[0]).toMatch(/_sales_single_v4$/);
        });
    });
});
