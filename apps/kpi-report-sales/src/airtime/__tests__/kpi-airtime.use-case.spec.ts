import { AirtimeStatisticUseCase } from '../use-cases/kpi-airtime.use-case';
import { GetAirtimeStatisticDto } from '../dto/airtime-statistic.dto';
import {
    VoximplantAirtimeRow,
    VoximplantStatisticEnvelope,
} from '../types/airtime-statistic.type';

interface BitrixApiMock {
    call: jest.Mock<Promise<VoximplantStatisticEnvelope>>;
}

const createApiMock = (
    responses: VoximplantStatisticEnvelope[],
): BitrixApiMock => {
    const call = jest.fn<Promise<VoximplantStatisticEnvelope>, unknown[]>();
    responses.forEach(response => call.mockResolvedValueOnce(response));
    return { call };
};

const createDto = (
    overrides: Partial<GetAirtimeStatisticDto['filters']> = {},
): GetAirtimeStatisticDto =>
    ({
        domain: 'example.bitrix24.ru',
        filters: {
            departament: [
                { ID: '1', NAME: 'Иван', LAST_NAME: 'Иванов' },
                { ID: '2', NAME: 'Пётр', LAST_NAME: 'Петров' },
            ],
            dateFrom: '2026-07-01T00:00:00+03:00',
            dateTo: '2026-07-31T23:59:59+03:00',
            ...overrides,
        },
    }) as GetAirtimeStatisticDto;

const row = (
    userId: string,
    duration: number,
    callType: number,
    callId = `${userId}-${duration}-${callType}`,
): VoximplantAirtimeRow => ({
    CALL_ID: callId,
    PORTAL_USER_ID: userId,
    CALL_DURATION: String(duration),
    CALL_TYPE: String(callType),
});


/**
 * Мок кэша месячных ячеек: всегда промах (тесты используют текущий месяц —
 * некэшируемый сегмент, кэш не трогается; промах ведёт к живой выборке).
 */
const createCacheMock = () => ({
    getMonthCells: jest.fn(
        async (_domain: string, _month: string, userIds: number[]) =>
            new Map(userIds.map(id => [id, null])),
    ),
    setMonthCells: jest.fn(async () => undefined),
});

describe('AirtimeStatisticUseCase', () => {
    it('возвращает пустой результат для пустого отдела и не ходит в Битрикс', async () => {
        const api = createApiMock([]);
        const useCase = new AirtimeStatisticUseCase(
            api as never,
            createCacheMock() as never,
            'example.bitrix24.ru',
        );

        const result = await useCase.get(createDto({ departament: [] }));

        expect(result).toEqual({ users: [], rowsFetched: 0, truncated: false });
        expect(api.call).not.toHaveBeenCalled();
    });

    it('передаёт в фильтр всех сотрудников, период и отсечку нулевой длительности', async () => {
        const api = createApiMock([{ result: [] }]);
        const useCase = new AirtimeStatisticUseCase(
            api as never,
            createCacheMock() as never,
            'example.bitrix24.ru',
        );

        await useCase.get(createDto());

        expect(api.call).toHaveBeenCalledWith('voximplant.statistic.get', {
            FILTER: {
                PORTAL_USER_ID: ['1', '2'],
                '>CALL_START_DATE': '2026-07-01T00:00:00+03:00',
                '<CALL_START_DATE': '2026-07-31T23:59:59+03:00',
                '>CALL_DURATION': 0,
            },
            SORT: 'CALL_START_DATE',
            ORDER: 'ASC',
            start: 0,
        });
    });

    it('суммирует эфирное время и раскладывает звонки по направлениям', async () => {
        const api = createApiMock([
            {
                result: [
                    row('1', 60, 1), // исходящий
                    row('1', 30, 2), // входящий
                    row('1', 10, 4), // callback → исходящий
                    row('2', 120, 3), // входящий с перенаправлением
                ],
            },
        ]);
        const useCase = new AirtimeStatisticUseCase(
            api as never,
            createCacheMock() as never,
            'example.bitrix24.ru',
        );

        const result = await useCase.get(createDto());

        expect(result.rowsFetched).toBe(4);
        expect(result.truncated).toBe(false);

        const [ivan, petr] = result.users;
        expect(ivan.userName).toBe('Иван Иванов');
        expect(ivan.callsCount).toBe(3);
        expect(ivan.airtimeSeconds).toBe(100);
        expect(ivan.outgoing).toEqual({ count: 2, seconds: 70 });
        expect(ivan.incoming).toEqual({ count: 1, seconds: 30 });

        expect(petr.callsCount).toBe(1);
        expect(petr.airtimeSeconds).toBe(120);
        expect(petr.incoming).toEqual({ count: 1, seconds: 120 });
        expect(petr.outgoing).toEqual({ count: 0, seconds: 0 });
    });

    it('сотрудник без звонков получает нулевую статистику', async () => {
        const api = createApiMock([{ result: [row('1', 45, 1)] }]);
        const useCase = new AirtimeStatisticUseCase(
            api as never,
            createCacheMock() as never,
            'example.bitrix24.ru',
        );

        const result = await useCase.get(createDto());

        const petr = result.users.find(user => user.user.ID === '2');
        expect(petr).toBeDefined();
        expect(petr?.callsCount).toBe(0);
        expect(petr?.airtimeSeconds).toBe(0);
    });

    it('игнорирует строки пользователей вне переданного отдела', async () => {
        const api = createApiMock([
            { result: [row('1', 60, 1), row('999', 500, 1)] },
        ]);
        const useCase = new AirtimeStatisticUseCase(
            api as never,
            createCacheMock() as never,
            'example.bitrix24.ru',
        );

        const result = await useCase.get(createDto());

        const ivan = result.users.find(user => user.user.ID === '1');
        expect(ivan?.airtimeSeconds).toBe(60);
        expect(result.users).toHaveLength(2);
    });

    it('проходит по страницам пагинации через next и собирает все строки', async () => {
        const api = createApiMock([
            { result: [row('1', 10, 1, 'a')], next: 50 },
            { result: [row('1', 20, 1, 'b')], next: 100 },
            { result: [row('2', 30, 2, 'c')] },
        ]);
        const useCase = new AirtimeStatisticUseCase(
            api as never,
            createCacheMock() as never,
            'example.bitrix24.ru',
        );

        const result = await useCase.get(createDto());

        expect(api.call).toHaveBeenCalledTimes(3);
        expect(api.call).toHaveBeenNthCalledWith(
            2,
            'voximplant.statistic.get',
            expect.objectContaining({ start: 50 }),
        );
        expect(api.call).toHaveBeenNthCalledWith(
            3,
            'voximplant.statistic.get',
            expect.objectContaining({ start: 100 }),
        );
        expect(result.rowsFetched).toBe(3);
        expect(result.truncated).toBe(false);
    });

    it('останавливает выгрузку по maxRows и помечает результат truncated', async () => {
        const bigPage = Array.from({ length: 50 }, (_, index) =>
            row('1', 10, 1, `call-${index}`),
        );
        const api = createApiMock([{ result: bigPage, next: 50 }]);
        const useCase = new AirtimeStatisticUseCase(
            api as never,
            createCacheMock() as never,
            'example.bitrix24.ru',
        );

        const result = await useCase.get(createDto({ maxRows: 50 }));

        expect(api.call).toHaveBeenCalledTimes(1);
        expect(result.rowsFetched).toBe(50);
        expect(result.truncated).toBe(true);
    });

    it('некорректная длительность считается нулём и не ломает агрегацию', async () => {
        const api = createApiMock([
            {
                result: [
                    { CALL_ID: 'x', PORTAL_USER_ID: '1', CALL_TYPE: '1' },
                    row('1', 15, 1),
                ],
            },
        ]);
        const useCase = new AirtimeStatisticUseCase(
            api as never,
            createCacheMock() as never,
            'example.bitrix24.ru',
        );

        const result = await useCase.get(createDto());

        const ivan = result.users.find(user => user.user.ID === '1');
        expect(ivan?.callsCount).toBe(2);
        expect(ivan?.airtimeSeconds).toBe(15);
    });
});
