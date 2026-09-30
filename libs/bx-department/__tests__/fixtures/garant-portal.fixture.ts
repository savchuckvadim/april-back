import { RedisService } from 'src/core/redis/redis.service';
import { PBXService } from '@/modules/pbx';
import { EDepartamentGroup } from '@lib/portal-lib/portal/interfaces/portal.interface';
import { IBXUser } from 'src/modules/bitrix/domain/interfaces/bitrix.interface';
import { BxDepartmentService } from '../../services/bx-department.service';
import { BxDepartmentHeadsService } from '../../services/bx-department-heads.service';

/*
 * Стенд по форме боевого портала garantservisvoronezh (разбор инцидента
 * «Сотрудник N», 30.09.2026): конфиг продаж bitrixId = 1 (корень),
 * is_multiple = 1, multiple_tag «(ОП)». ОП лежат на втором уровне под
 * «главами» филиалов, тэг — в конце названия. ID ОП и их родителей — как
 * на портале; сотрудники и прочие отделы — выдуманные.
 */

export const GARANT_DOMAIN = 'garantservisvoronezh.bitrix24.ru';
export const GARANT_TAG = '(ОП)';

/** Строка department.get: Битрикс отдаёт ID, PARENT и UF_HEAD строками. */
interface RawDepartment {
    ID: string;
    NAME: string;
    PARENT?: string;
    SORT: number;
    UF_HEAD?: string;
}

// 1 Гарант Сервис (корень, UF_HEAD 1): 1, 2, 3
// ├─ 3 Бухгалтерия: 10, 11
// ├─ 5 Отдел сервиса: 12, 13
// ├─ 79 Глава Воронеж (UF_HEAD 100): 100
// │  └─ 63 ОП Воронеж (ОП) (UF_HEAD 101): 101, 102, 103
// │     ├─ 67 Группа Звездочки (UF_HEAD 104): 104, 105, 106
// │     └─ 69 Стажёры (не группа): 107
// ├─ 81 Глава Санкт-Петербург (UF_HEAD 200): 200
// │  └─ 37 ОП САНКТ-ПЕТЕРБУРГ (ОП) (UF_HEAD 201): 201…206
// ├─ 59 Глава Ростов (UF_HEAD 300): 300
// │  └─ 83 Отдел продаж Ростов (ОП) (UF_HEAD 301): 301…305
// └─ 87 Тестовый филиал (без руководителя)
//    └─ 89 ОП Тест (ОП): 401, 402 и 101 (числится в двух ОП)
export const GARANT_DEPARTMENTS: RawDepartment[] = [
    { ID: '1', NAME: 'Гарант Сервис', SORT: 1, UF_HEAD: '1' },
    { ID: '3', NAME: 'Бухгалтерия', PARENT: '1', SORT: 2 },
    { ID: '5', NAME: 'Отдел сервиса', PARENT: '1', SORT: 3 },
    {
        ID: '37',
        NAME: 'ОП САНКТ-ПЕТЕРБУРГ (ОП)',
        PARENT: '81',
        SORT: 4,
        UF_HEAD: '201',
    },
    { ID: '59', NAME: 'Глава Ростов', PARENT: '1', SORT: 5, UF_HEAD: '300' },
    {
        ID: '63',
        NAME: 'ОП Воронеж (ОП)',
        PARENT: '79',
        SORT: 6,
        UF_HEAD: '101',
    },
    {
        ID: '67',
        NAME: 'Группа Звездочки',
        PARENT: '63',
        SORT: 7,
        UF_HEAD: '104',
    },
    { ID: '69', NAME: 'Стажёры', PARENT: '63', SORT: 8 },
    { ID: '79', NAME: 'Глава Воронеж', PARENT: '1', SORT: 9, UF_HEAD: '100' },
    {
        ID: '81',
        NAME: 'Глава Санкт-Петербург',
        PARENT: '1',
        SORT: 10,
        UF_HEAD: '200',
    },
    {
        ID: '83',
        NAME: 'Отдел продаж Ростов (ОП)',
        PARENT: '59',
        SORT: 11,
        UF_HEAD: '301',
    },
    { ID: '87', NAME: 'Тестовый филиал', PARENT: '1', SORT: 12 },
    { ID: '89', NAME: 'ОП Тест (ОП)', PARENT: '87', SORT: 13 },
];

const users = (...ids: number[]): IBXUser[] =>
    ids.map(id => ({ ID: String(id), NAME: `Сотрудник ${id}` }));

export const GARANT_USERS_BY_DEPARTMENT: Record<number, IBXUser[]> = {
    1: users(1, 2, 3),
    3: users(10, 11),
    5: users(12, 13),
    37: users(201, 202, 203, 204, 205, 206),
    59: users(300),
    63: users(101, 102, 103),
    67: users(104, 105, 106),
    69: users(107),
    79: users(100),
    81: users(200),
    83: users(301, 302, 303, 304, 305),
    89: users(401, 402, 101),
};

/** ОП garant (по тэгу «(ОП)»), их подотделы и предки. */
export const GARANT_OP_IDS = [37, 63, 83, 89];
export const GARANT_CHILD_IDS = [67, 69];
export const GARANT_PARENT_IDS = [1, 59, 79, 81, 87];

/** Все 20 сотрудников ОП и их подотделов (101 — в двух ОП, один раз). */
export const GARANT_OP_USER_IDS = [
    101, 102, 103, 104, 105, 106, 107, 201, 202, 203, 204, 205, 206, 301, 302,
    303, 304, 305, 401, 402,
];

/** ID отдела department.get отдаёт строкой — в user.get он уходит как есть. */
interface ApiParams {
    ID?: number;
    PARENT?: number;
    FILTER?: { UF_DEPARTMENT?: number | string };
}

/** Сколько раз мок bitrix.api.call вызывал метод (для user.get — по отделу). */
export const callsOf = (
    apiCall: jest.Mock,
    method: string,
    departmentId?: number,
): number =>
    (apiCall.mock.calls as [string, ApiParams][]).filter(
        ([called, params]) =>
            called === method &&
            (departmentId === undefined ||
                Number(params.FILTER?.UF_DEPARTMENT) === departmentId),
    ).length;

/** Мок bitrix.api.call: department.get (все, по ID, по PARENT) и user.get по отделу. */
export const garantApiCall = (): jest.Mock =>
    jest.fn((method: string, params: ApiParams): Promise<unknown> => {
        if (method === 'department.get') {
            const result = GARANT_DEPARTMENTS.filter(
                d =>
                    (params.ID === undefined || Number(d.ID) === params.ID) &&
                    (params.PARENT === undefined ||
                        Number(d.PARENT) === params.PARENT),
            );
            return Promise.resolve({ result });
        }
        if (method === 'user.get') {
            const depId = Number(params.FILTER?.UF_DEPARTMENT ?? 0);
            return Promise.resolve({
                result: GARANT_USERS_BY_DEPARTMENT[depId] ?? [],
            });
        }
        return Promise.resolve({ result: [] });
    });

/** Отдел локальной модели портала (is_multiple — boolean или 1/0, как из JSON). */
interface GarantDepartament {
    group: EDepartamentGroup;
    bitrixId: number;
    is_multiple: boolean | number;
    multiple_tag: string | null;
}

/** Локальная модель портала; `{ departaments: [] }` — как в локальной БД. */
export interface GarantInternalPortal {
    departaments: GarantDepartament[];
}

/** Отдел продаж garant: мультирежим по тэгу «(ОП)». */
export const garantInternalPortal = (
    isMultiple: boolean | number = 1,
    multipleTag: string | null = GARANT_TAG,
): GarantInternalPortal => ({
    departaments: [
        {
            group: EDepartamentGroup.sales,
            bitrixId: 1,
            is_multiple: isMultiple,
            multiple_tag: multipleTag,
        },
    ],
});

/** Redis в памяти: ключи чтения и записи видны тесту. */
export interface MemoryRedis {
    store: Map<string, string>;
    get: jest.Mock;
    set: jest.Mock;
}

export const memoryRedis = (): MemoryRedis => {
    const store = new Map<string, string>();
    return {
        store,
        get: jest.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
        set: jest.fn((key: string, value: string) => {
            store.set(key, value);
            return Promise.resolve('OK');
        }),
    };
};

/** Стенд настоящего BxDepartmentService поверх моков garant. */
export interface GarantStand {
    apiCall: jest.Mock;
    pbxInit: jest.Mock;
    headsResolve: jest.Mock;
    redis: MemoryRedis;
    departments: BxDepartmentService;
}

export function makeGarantStand(
    internalPortal: GarantInternalPortal = garantInternalPortal(),
): GarantStand {
    const apiCall = garantApiCall();
    const redis = memoryRedis();
    const pbxInit = jest.fn().mockResolvedValue({
        bitrix: { api: { call: apiCall } },
        // конфиг продаж внешнего портала garant — корень 1
        PortalModel: { getDepartamentIdByCode: () => ({ bitrixId: 1 }) },
        internalPortal,
    });
    const headsResolve = jest.fn().mockResolvedValue(new Map());
    const departments = new BxDepartmentService(
        { getClient: () => redis } as unknown as RedisService,
        { init: pbxInit } as unknown as PBXService,
        { resolve: headsResolve } as unknown as BxDepartmentHeadsService,
    );
    return { apiCall, pbxInit, headsResolve, redis, departments };
}
