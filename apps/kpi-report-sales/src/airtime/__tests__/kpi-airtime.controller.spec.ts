import { BadRequestException } from '@nestjs/common';
import { KpiAirtimeController } from '../controllers/kpi-airtime.controller';
import type { GetAirtimeStatisticDto } from '../dto/airtime-statistic.dto';

const DOMAIN = 'example.bitrix24.ru';

const createDto = (
    overrides: Partial<GetAirtimeStatisticDto> = {},
): GetAirtimeStatisticDto =>
    ({
        domain: DOMAIN,
        filters: {
            departament: [
                { ID: '2', NAME: 'Пётр', LAST_NAME: 'Петров' },
                { ID: '1', NAME: 'Иван', LAST_NAME: 'Иванов' },
            ],
            dateFrom: '2026-05-01',
            dateTo: '2026-06-30',
        },
        ...overrides,
    }) as GetAirtimeStatisticDto;

const readinessReady = {
    allReady: true,
    hasError: false,
    readyMonths: 2,
    totalMonths: 2,
    units: [],
    months: [
        { month: '2026-05', status: 'ready' as const },
        { month: '2026-06', status: 'ready' as const },
    ],
};

const readinessQueued = {
    ...readinessReady,
    allReady: false,
    readyMonths: 1,
    months: [
        { month: '2026-05', status: 'ready' as const },
        { month: '2026-06', status: 'queued' as const },
    ],
};

const createMocks = () => ({
    pbx: {
        init: jest.fn(() =>
            Promise.resolve({
                bitrix: {
                    api: {
                        call: jest.fn(() => Promise.resolve({ result: [] })),
                    },
                },
            }),
        ),
    },
    airtimeCache: {
        getMonthCells: jest.fn((_d: string, _m: string, ids: number[]) =>
            Promise.resolve(new Map(ids.map(id => [id, null]))),
        ),
        setMonthCells: jest.fn(() => Promise.resolve(undefined)),
        getDayCells: jest.fn((_d: string, dates: string[], ids: number[]) =>
            Promise.resolve(
                new Map(
                    dates.flatMap(date =>
                        ids.map(id => [`${id}|${date}`, null] as const),
                    ),
                ),
            ),
        ),
        setDayCells: jest.fn(() => Promise.resolve(undefined)),
    },
    assembly: {
        checkReadiness: jest.fn(() => Promise.resolve(readinessReady)),
        assemble: jest.fn(() =>
            Promise.resolve({
                users: [],
                rowsFetched: 150,
                truncated: false,
            }),
        ),
    },
    dispatch: { dispatchMissing: jest.fn(() => Promise.resolve(1)) },
});

const createController = (mocks: ReturnType<typeof createMocks>) =>
    new KpiAirtimeController(
        mocks.pbx as never,
        mocks.airtimeCache as never,
        mocks.assembly as never,
        mocks.dispatch as never,
    );

describe('KpiAirtimeController', () => {
    it('без mode — легаси-путь: pbx.init в HTTP-потоке, очередь не трогается', async () => {
        const mocks = createMocks();
        const controller = createController(mocks);

        const result = await controller.getAirtimeStatistic(
            createDto({
                filters: {
                    departament: [{ ID: '1', NAME: 'И', LAST_NAME: 'И' }],
                    dateFrom: '2026-07-01',
                    dateTo: '2026-07-30',
                } as never,
            }),
        );

        expect(mocks.pbx.init).toHaveBeenCalledWith(DOMAIN);
        expect(mocks.assembly.checkReadiness).not.toHaveBeenCalled();
        expect(mocks.dispatch.dispatchMissing).not.toHaveBeenCalled();
        expect(result.status).toBeUndefined();
    });

    it('queue: всё готово → ready-ответ из кэша, dispatch и Bitrix не вызываются', async () => {
        const mocks = createMocks();
        const controller = createController(mocks);

        const result = await controller.getAirtimeStatistic(
            createDto({ mode: 'queue' }),
        );

        expect(result.status).toBe('ready');
        expect(result.requestKey).toBe('2026-05-01|2026-06-30|1_2');
        expect(result.rowsFetched).toBe(150);
        expect(mocks.pbx.init).not.toHaveBeenCalled();
        expect(mocks.dispatch.dispatchMissing).not.toHaveBeenCalled();
    });

    it("queue: промах → queued с прогрессом + постановка недостающих job'ов", async () => {
        const mocks = createMocks();
        mocks.assembly.checkReadiness.mockResolvedValueOnce(
            readinessQueued as never,
        );
        const controller = createController(mocks);

        const result = await controller.getAirtimeStatistic(
            createDto({ mode: 'queue', socketId: 'socket-9' }),
        );

        expect(result.status).toBe('queued');
        expect(result.users).toEqual([]);
        expect(result.progress).toEqual({
            totalMonths: 2,
            readyMonths: 1,
            months: [
                { month: '2026-05', status: 'ready' },
                { month: '2026-06', status: 'queued' },
            ],
        });
        expect(mocks.dispatch.dispatchMissing).toHaveBeenCalledWith(
            DOMAIN,
            readinessQueued,
            expect.objectContaining({
                socketId: 'socket-9',
                requestKey: '2026-05-01|2026-06-30|1_2',
                forceRefresh: false,
            }),
        );
    });

    it('queue: error-юнит → status error с сообщением, но остальные месяцы ставятся', async () => {
        const mocks = createMocks();
        mocks.assembly.checkReadiness.mockResolvedValueOnce({
            ...readinessQueued,
            hasError: true,
            errorMessage: 'Битрикс упал',
        } as never);
        const controller = createController(mocks);

        const result = await controller.getAirtimeStatistic(
            createDto({ mode: 'queue' }),
        );

        expect(result.status).toBe('error');
        expect(result.message).toBe('Битрикс упал');
        expect(mocks.dispatch.dispatchMissing).toHaveBeenCalled();
    });

    it('queue: forceRefresh пробрасывается в readiness и dispatch', async () => {
        const mocks = createMocks();
        mocks.assembly.checkReadiness.mockResolvedValueOnce(
            readinessQueued as never,
        );
        const controller = createController(mocks);

        await controller.getAirtimeStatistic(
            createDto({ mode: 'queue', forceRefresh: true }),
        );

        expect(mocks.assembly.checkReadiness).toHaveBeenCalledWith(
            DOMAIN,
            '2026-05-01',
            '2026-06-30',
            true,
        );
        expect(mocks.dispatch.dispatchMissing).toHaveBeenCalledWith(
            DOMAIN,
            readinessQueued,
            expect.objectContaining({ forceRefresh: true }),
        );
    });

    it('queue: границы с временем срезаются до целых дней', async () => {
        const mocks = createMocks();
        const controller = createController(mocks);

        await controller.getAirtimeStatistic(
            createDto({
                mode: 'queue',
                filters: {
                    departament: [{ ID: '1', NAME: 'И', LAST_NAME: 'И' }],
                    dateFrom: '2026-05-01T00:00:00+03:00',
                    dateTo: '2026-06-30T23:59:59+03:00',
                } as never,
            }),
        );

        expect(mocks.assembly.checkReadiness).toHaveBeenCalledWith(
            DOMAIN,
            '2026-05-01',
            '2026-06-30',
            false,
        );
    });

    it('queue: период больше 36 месяцев → BadRequest с русским сообщением', async () => {
        const mocks = createMocks();
        const controller = createController(mocks);

        await expect(
            controller.getAirtimeStatistic(
                createDto({
                    mode: 'queue',
                    filters: {
                        departament: [{ ID: '1', NAME: 'И', LAST_NAME: 'И' }],
                        dateFrom: '2016-01-01',
                        dateTo: '2026-07-30',
                    } as never,
                }),
            ),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(mocks.dispatch.dispatchMissing).not.toHaveBeenCalled();
    });
});
