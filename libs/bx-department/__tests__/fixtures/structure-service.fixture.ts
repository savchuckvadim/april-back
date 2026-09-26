import { RedisService } from 'src/core/redis/redis.service';
import { PBXService } from '@/modules/pbx';
import { EDepartamentGroup } from '@lib/portal-lib/portal/interfaces/portal.interface';
import { IBXUser } from 'src/modules/bitrix/domain/interfaces/bitrix.interface';
import { PortalAppSettingsService } from '@lib/portal-lib/store/app-settings';
import { BxDepartmentStructureService } from '../../services/bx-department-structure.service';
import { BxDepartmentService } from '../../services/bx-department.service';
import { BxDepartmentHeadsService } from '../../services/bx-department-heads.service';
import { BxSuperUserService } from '../../services/bx-super-user.service';

/*
 * Общий стенд спеков BxDepartmentStructureService: структура портала
 * старого API, пользователи отделов и фабрика сервиса с моками Redis,
 * PBX, руководителей, настроек портала и суперпользователей вендора.
 */

export const DOMAIN = 'example.bitrix24.ru';

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
export const ALL_DEPARTMENTS = [
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

export const USERS_BY_DEPARTMENT: Record<number, IBXUser[]> = {
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

type MultipleFlags = Record<EDepartamentGroup, boolean>;
type MultipleTags = Partial<Record<EDepartamentGroup, string>>;

/** Результат pbx.init: bitrix и локальный портал с флагами мультирежима. */
export interface StructureInitResult {
    bitrix: { api: { call: jest.Mock } };
    internalPortal: {
        departaments: {
            group: EDepartamentGroup;
            is_multiple: boolean;
            multiple_tag: string | null;
        }[];
    };
}

/** Стенд сервиса структуры: моки зависимостей и сам сервис. */
export interface StructureStand {
    redisGet: jest.Mock;
    redisSet: jest.Mock;
    apiCall: jest.Mock;
    getFullDepartment: jest.Mock;
    pbxInit: jest.Mock;
    headsResolve: jest.Mock;
    settingsResolve: jest.Mock;
    isSuperUser: jest.Mock;
    service: BxDepartmentStructureService;
    /** init отдаёт bitrix и локальный портал с флагами мультирежима по группам. */
    initResult: (
        isMultiple: MultipleFlags,
        tags?: MultipleTags,
    ) => StructureInitResult;
}

/**
 * Свежий стенд на каждый тест. По умолчанию: мультирежим включён для sales
 * и service, структура v3 недоступна (руководители из UF_HEAD), списки
 * принудительной видимости не заданы, суперпользователей вендора нет.
 */
export function makeStructureStand(): StructureStand {
    const redisGet = jest.fn().mockResolvedValue(null);
    const redisSet = jest.fn().mockResolvedValue('OK');
    const apiCall = jest.fn(
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
    const initResult = (
        isMultiple: MultipleFlags,
        tags: MultipleTags = {},
    ): StructureInitResult => ({
        bitrix: { api: { call: apiCall } },
        internalPortal: {
            departaments: Object.entries(isMultiple).map(([group, flag]) => ({
                group: group as EDepartamentGroup,
                is_multiple: flag,
                multiple_tag: tags[group as EDepartamentGroup] ?? null,
            })),
        },
    });
    const getFullDepartment = jest.fn();
    const pbxInit = jest.fn().mockResolvedValue(
        initResult({
            [EDepartamentGroup.sales]: true,
            [EDepartamentGroup.service]: true,
            [EDepartamentGroup.tmc]: false,
        }),
    );
    const headsResolve = jest.fn().mockResolvedValue(new Map());
    const settingsResolve = jest.fn().mockResolvedValue({});
    const isSuperUser = jest.fn().mockReturnValue(false);

    const service = new BxDepartmentStructureService(
        {
            getClient: () => ({ get: redisGet, set: redisSet }),
        } as unknown as RedisService,
        { init: pbxInit } as unknown as PBXService,
        { getFullDepartment } as unknown as BxDepartmentService,
        { resolve: headsResolve } as unknown as BxDepartmentHeadsService,
        { resolve: settingsResolve } as unknown as PortalAppSettingsService,
        { isSuperUser } as unknown as BxSuperUserService,
    );

    return {
        redisGet,
        redisSet,
        apiCall,
        getFullDepartment,
        pbxInit,
        headsResolve,
        settingsResolve,
        isSuperUser,
        service,
        initResult,
    };
}
