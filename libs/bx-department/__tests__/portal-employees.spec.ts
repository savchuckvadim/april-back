import type {
    IBXDepartment,
    IBXUser,
} from '@lib/bitrix/domain/interfaces/bitrix.interface';
import { toPortalEmployees } from '../lib/portal-employees.util';
import {
    portalEmployeesCacheKey,
    PORTAL_EMPLOYEES_TTL_SECONDS,
    PortalEmployeesService,
} from '../services/portal-employees.service';

const departments = [
    { ID: 1, NAME: 'Компания' },
    { ID: 7, NAME: 'Отдел продаж' },
    { ID: 9, NAME: 'Сервис' },
] as unknown as IBXDepartment[];

const users = [
    {
        ID: '447',
        NAME: 'Вадим',
        LAST_NAME: 'Савчук',
        WORK_POSITION: 'Руководитель',
        UF_DEPARTMENT: [7, 9],
        USER_TYPE: 'employee',
    },
    { ID: '12', NAME: 'Анна', LAST_NAME: 'Абрамова', UF_DEPARTMENT: [7] },
    { ID: '30', NAME: 'Гость', USER_TYPE: 'extranet' },
    { ID: '31', NAME: 'Почта', USER_TYPE: 'email' },
    { ID: '55', NAME: '', LAST_NAME: '', UF_DEPARTMENT: [404] },
] as unknown as IBXUser[];

describe('toPortalEmployees — сотрудники портала для выбора в админке', () => {
    it('только сотрудники, имя «Фамилия Имя», отделы названиями, по алфавиту', () => {
        expect(toPortalEmployees(users, departments)).toEqual([
            {
                id: 12,
                name: 'Абрамова Анна',
                position: null,
                departments: ['Отдел продаж'],
            },
            {
                id: 447,
                name: 'Савчук Вадим',
                position: 'Руководитель',
                departments: ['Отдел продаж', 'Сервис'],
            },
            // Без имени — подпись по id; неизвестный отдел пропущен.
            { id: 55, name: 'Сотрудник 55', position: null, departments: [] },
        ]);
    });
});

describe('PortalEmployeesService', () => {
    const DOMAIN = 'gsr.bitrix24.ru';

    function makeService(cached: string | null = null) {
        const redis = {
            get: jest.fn().mockResolvedValue(cached),
            set: jest.fn().mockResolvedValue('OK'),
        };
        const call = jest.fn((method: string) =>
            Promise.resolve({
                result: method === 'department.get' ? departments : users,
            }),
        );
        const pbx = {
            init: jest.fn().mockResolvedValue({ bitrix: { api: { call } } }),
        };
        const portals = {
            findById: jest
                .fn()
                .mockResolvedValue({ domain: ' GSR.bitrix24.ru ' }),
        };
        const service = new PortalEmployeesService(
            portals as never,
            pbx as never,
            { getClient: () => redis } as never,
        );
        return { service, redis, call, pbx, portals };
    }

    it('id портала → домен → Битрикс, результат в кэш на 10 минут', async () => {
        const { service, redis, call, pbx } = makeService();
        const list = await service.listByPortalId(3);
        expect(pbx.init).toHaveBeenCalledWith(DOMAIN);
        expect(call).toHaveBeenCalledWith('department.get', {});
        expect(list.map(item => item.id)).toEqual([12, 447, 55]);
        expect(redis.set).toHaveBeenCalledWith(
            portalEmployeesCacheKey(DOMAIN),
            JSON.stringify(list),
            'EX',
            PORTAL_EMPLOYEES_TTL_SECONDS,
        );
    });

    it('кэш отвечает — Битрикс не трогается; refresh — мимо кэша', async () => {
        const cached = [
            { id: 1, name: 'Из кэша', position: null, departments: [] },
        ];
        const { service, pbx } = makeService(JSON.stringify(cached));
        expect(await service.list(DOMAIN)).toEqual(cached);
        expect(pbx.init).not.toHaveBeenCalled();
        await service.list(DOMAIN, true);
        expect(pbx.init).toHaveBeenCalledTimes(1);
    });

    it('портала нет — 404', async () => {
        const { service, portals } = makeService();
        portals.findById.mockResolvedValue(null);
        await expect(service.listByPortalId(99)).rejects.toThrow(
            'Портал 99 не найден',
        );
    });
});
