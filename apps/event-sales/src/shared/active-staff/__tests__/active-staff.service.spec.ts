import { ActiveStaffService } from '../active-staff.service';

type Row = Record<string, unknown>;

/** Портал garantservisvoronezh: 91 «Не работающие сотрудники», 67 — группа ОП. */
const DEPARTMENTS: Row[] = [
    { ID: '1', NAME: 'ГАРАНТ СЕРВИС' },
    { ID: '67', NAME: 'Группа Звездочки', PARENT: '63' },
    { ID: '91', NAME: 'Не работающие сотрудники', PARENT: '79' },
];

/** user.get с ACTIVE:true — уволенные с выключенным аккаунтом уже отсеяны. */
const USERS: Row[] = [
    { ID: '171', UF_DEPARTMENT: [91] },
    { ID: '323', UF_DEPARTMENT: [67] },
    { ID: '325', UF_DEPARTMENT: [67, 87] },
];

/** Портал отдаёт только запрошенные ID — как настоящий user.get с FILTER. */
const makeBitrix = (users = USERS, departments = DEPARTMENTS) => {
    const call = jest.fn(
        (method: string, params: { FILTER?: { ID?: number[] } }) =>
            Promise.resolve({
                result:
                    method === 'user.get'
                        ? users.filter(user =>
                              (params.FILTER?.ID ?? []).includes(
                                  Number(user.ID),
                              ),
                          )
                        : departments,
            }),
    );
    return { bitrix: { api: { call } }, call };
};

const makeService = (settings = '', cached: number[] | null = null) => {
    const appCache = {
        get: jest.fn().mockResolvedValue(cached),
        set: jest.fn().mockResolvedValue({}),
    };
    const appSettings = {
        resolve: jest
            .fn()
            .mockResolvedValue({ leadIntakeInactiveDepartmentIds: settings }),
    };
    return {
        service: new ActiveStaffService(
            appCache as never,
            appSettings as never,
        ),
        appCache,
        appSettings,
    };
};

describe('ActiveStaffService', () => {
    /*
     * Сделка 84879 (22.09.2026): Лариса Острова — аккаунт активен, но
     * числится в «Не работающих сотрудниках». По ACTIVE её не отсеять.
     */
    it('исключает сотрудников отдела неработающих, найденного по названию', async () => {
        const { service, appCache } = makeService();
        const { bitrix, call } = makeBitrix();

        const active = await service.activeUserIds(
            'd.b24.ru',
            bitrix as never,
            [171, 323, 325],
        );
        expect([...active].sort()).toEqual([323, 325]);
        // ACTIVE фильтрует сам портал — проверяем, что просим именно это.
        expect(call).toHaveBeenCalledWith('user.get', {
            FILTER: { ID: [171, 323, 325], ACTIVE: true },
            SELECT: ['ID', 'UF_DEPARTMENT'],
            start: 0,
        });
        // Отделы неработающих легли в кеш на час.
        expect(appCache.set).toHaveBeenCalledWith(
            expect.objectContaining({ data: [91], ttlSeconds: 3600 }),
        );
    });

    it('отделы из настройки дополняют найденные по названию', async () => {
        const { service } = makeService('67; 999');
        const { bitrix } = makeBitrix();
        const active = await service.activeUserIds(
            'd.b24.ru',
            bitrix as never,
            [171, 323, 325],
        );
        expect([...active]).toEqual([]);
    });

    it('кеш отделов есть — department.get не вызывается', async () => {
        const { service } = makeService('', [91]);
        const { bitrix, call } = makeBitrix();
        const active = await service.activeUserIds(
            'd.b24.ru',
            bitrix as never,
            [171, 323],
        );
        expect([...active]).toEqual([323]);
        expect(
            call.mock.calls.filter(([method]) => method === 'department.get'),
        ).toHaveLength(0);
    });

    it('отделы не прочитались — работает только ACTIVE и настройка', async () => {
        const { service } = makeService();
        const { bitrix, call } = makeBitrix();
        call.mockImplementation((method: string) =>
            method === 'department.get'
                ? Promise.reject(new Error('portal down'))
                : Promise.resolve({ result: USERS.slice(0, 2) }),
        );
        const active = await service.activeUserIds(
            'd.b24.ru',
            bitrix as never,
            [171, 323],
        );
        expect([...active].sort()).toEqual([171, 323]);
    });

    it('пустой список — ни одного вызова', async () => {
        const { service } = makeService();
        const { bitrix, call } = makeBitrix();
        expect(
            await service.activeUserIds('d.b24.ru', bitrix as never, []),
        ).toEqual(new Set());
        expect(call).not.toHaveBeenCalled();
    });
});
