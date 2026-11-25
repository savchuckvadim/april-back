import { BadRequestException } from '@nestjs/common';
import { KpiReportController } from '../controllers/kpi-report.controller';
import type { GetCallingStatisticDto } from '../dto/calling-statistic.dto';
import type { ReportGetRequestDto } from '../dto/kpi-report-request.dto';
import { QueueNames } from '@/modules/queue/constants/queue-names.enum';
import { JobNames } from '@/modules/queue/constants/job-names.enum';

const DOMAIN = 'example.bitrix24.ru';

/** Сужение union-ответа контроллера: в queue-режиме всегда конверт. */
const asEnvelope = <T>(result: T | unknown[]): T => {
    if (Array.isArray(result)) {
        throw new Error('ожидался конверт, пришёл легаси-массив');
    }
    return result;
};

const createMocks = () => ({
    pbx: { init: jest.fn() },
    queue: { dispatch: jest.fn(() => Promise.resolve(undefined)) },
    resultCache: {
        getEnvelope: jest.fn(() => Promise.resolve(null)),
        drop: jest.fn(() => Promise.resolve(undefined)),
        setReady: jest.fn(),
        setError: jest.fn(),
    },
});

/** Порядок вызовов моков: удаление конверта должно идти до постановки задачи. */
const callOrder = (mock: jest.Mock): number =>
    mock.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY;

const createController = (mocks: ReturnType<typeof createMocks>) =>
    new KpiReportController(
        mocks.pbx as never,
        mocks.queue as never,
        mocks.resultCache as never,
    );

const callingDto = (
    overrides: Partial<GetCallingStatisticDto> = {},
): GetCallingStatisticDto =>
    ({
        domain: DOMAIN,
        filters: {
            departament: [
                { ID: '2', NAME: 'П', LAST_NAME: 'П' },
                { ID: '1', NAME: 'И', LAST_NAME: 'И' },
            ],
            dateFrom: '2026-07-01',
            dateTo: '2026-07-30',
        },
        mode: 'queue',
        ...overrides,
    }) as GetCallingStatisticDto;

const reportDto = (
    overrides: Partial<ReportGetRequestDto> = {},
): ReportGetRequestDto =>
    ({
        domain: DOMAIN,
        filters: {
            dateFrom: '2026-07-01',
            dateTo: '2026-07-30',
            userIds: [],
            departament: [{ ID: '1', NAME: 'И', LAST_NAME: 'И' }],
            userFieldId: '',
            dateFieldId: '',
            actionFieldId: '',
            currentActions: {},
        },
        mode: 'queue',
        ...overrides,
    }) as ReportGetRequestDto;

/** «Сейчас» для границы закрытого периода: 25.11.2026 (часы сервера). */
const FIXED_NOW = new Date(2026, 10, 25, 12, 0);
const GENERATED_AT = '2026-11-12T07:40:12.000Z';

describe('KpiReportController (режим queue)', () => {
    beforeEach(() => {
        jest.useFakeTimers().setSystemTime(FIXED_NOW);
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('кэш-хит ready → мгновенный ответ с данными, датой расчёта и closedPeriod, без dispatch', async () => {
        const mocks = createMocks();
        mocks.resultCache.getEnvelope.mockResolvedValueOnce({
            status: 'ready',
            data: [{ id: 1 }],
            generatedAt: GENERATED_AT,
        } as never);
        const controller = createController(mocks);

        const result = await controller.getCallingStatistic(callingDto());

        expect(result).toEqual({
            status: 'ready',
            data: [{ id: 1 }],
            requestKey: '2026-07-01|2026-07-30|1_2',
            generatedAt: GENERATED_AT,
            closedPeriod: true,
        });
        expect(mocks.queue.dispatch).not.toHaveBeenCalled();
        expect(mocks.pbx.init).not.toHaveBeenCalled();
    });

    it('кэш-хит открытого периода (задевает текущий месяц) → closedPeriod false', async () => {
        const mocks = createMocks();
        mocks.resultCache.getEnvelope.mockResolvedValueOnce({
            status: 'ready',
            data: [],
            generatedAt: GENERATED_AT,
        } as never);
        const controller = createController(mocks);

        const result = asEnvelope(
            await controller.getCallingStatistic(
                callingDto({
                    filters: {
                        departament: [{ ID: '1', NAME: 'И', LAST_NAME: 'И' }],
                        dateFrom: '2026-11-01',
                        dateTo: '2026-11-25',
                    } as never,
                }),
            ),
        );

        expect(result.status).toBe('ready');
        expect(result.closedPeriod).toBe(false);
        expect(result.generatedAt).toBe(GENERATED_AT);
    });

    it('error-конверт → status error с message, без авто-редиспатча', async () => {
        const mocks = createMocks();
        mocks.resultCache.getEnvelope.mockResolvedValueOnce({
            status: 'error',
            message: 'Битрикс не вернул команды',
            generatedAt: 'x',
        } as never);
        const controller = createController(mocks);

        const result = asEnvelope(
            await controller.getCallingStatistic(callingDto()),
        );

        expect(result.status).toBe('error');
        expect(result.message).toBe('Битрикс не вернул команды');
        expect(mocks.queue.dispatch).not.toHaveBeenCalled();
    });

    it('промах → dispatch c jobId-дедупом, нормализованными датами и опциями ретраев', async () => {
        const mocks = createMocks();
        const controller = createController(mocks);

        const result = asEnvelope(
            await controller.getCallingStatistic(callingDto()),
        );

        expect(result.status).toBe('queued');
        expect(mocks.queue.dispatch).toHaveBeenCalledWith(
            QueueNames.SALES_KPI_REPORT,
            JobNames.SALES_CALLING_STATISTIC,
            expect.objectContaining({
                domain: DOMAIN,
                requestKey: '2026-07-01|2026-07-30|1_2',
                resultKey: 'v1:result:2026-07-01_2026-07-30:1_2',
                filters: expect.objectContaining({
                    dateFrom: '2026-07-01',
                    dateTo: '2026-07-30',
                }) as Record<string, unknown>,
            }) as Record<string, unknown>,
            'calling-stat:v1:example.bitrix24.ru:2026-07-01_2026-07-30:1_2',
            {
                attempts: 2,
                backoff: { type: 'fixed', delay: 30_000 },
                removeOnComplete: true,
                removeOnFail: true,
            },
        );
    });

    it('легаси-даты нормализуются в тот же jobId, что и канон', async () => {
        const mocks = createMocks();
        const controller = createController(mocks);

        await controller.getCallingStatistic(
            callingDto({
                filters: {
                    departament: [
                        { ID: '2', NAME: 'П', LAST_NAME: 'П' },
                        { ID: '1', NAME: 'И', LAST_NAME: 'И' },
                    ],
                    dateFrom: '01.07.2026',
                    dateTo: '31.07.2026',
                } as never,
            }),
        );

        expect(mocks.queue.dispatch).toHaveBeenCalledWith(
            expect.anything(),
            expect.anything(),
            expect.anything(),
            'calling-stat:v1:example.bitrix24.ru:2026-07-01_2026-07-30:1_2',
            expect.anything(),
        );
    });

    it('forceRefresh обходит чтение конверта и сразу диспатчит', async () => {
        const mocks = createMocks();
        const controller = createController(mocks);

        const result = asEnvelope(
            await controller.getCallingStatistic(
                callingDto({ forceRefresh: true }),
            ),
        );

        expect(mocks.resultCache.getEnvelope).not.toHaveBeenCalled();
        expect(mocks.queue.dispatch).toHaveBeenCalled();
        expect(result.status).toBe('queued');
    });

    it('forceRefresh удаляет прежний конверт до постановки задачи — поллинг не получит старый результат', async () => {
        const mocks = createMocks();
        const controller = createController(mocks);

        await controller.getCallingStatistic(
            callingDto({ forceRefresh: true }),
        );

        expect(mocks.resultCache.drop).toHaveBeenCalledWith(
            'calling-stat',
            DOMAIN,
            'v1:result:2026-07-01_2026-07-30:1_2',
        );
        expect(callOrder(mocks.resultCache.drop)).toBeLessThan(
            callOrder(mocks.queue.dispatch),
        );
    });

    it('без forceRefresh конверт не удаляется', async () => {
        const mocks = createMocks();
        const controller = createController(mocks);

        await controller.getCallingStatistic(callingDto());
        await controller.getReport(reportDto());

        expect(mocks.resultCache.drop).not.toHaveBeenCalled();
    });

    it('невалидные даты → 400 BadRequest с русским сообщением', async () => {
        const mocks = createMocks();
        const controller = createController(mocks);

        await expect(
            controller.getCallingStatistic(
                callingDto({
                    filters: {
                        departament: [{ ID: '1', NAME: 'И', LAST_NAME: 'И' }],
                        dateFrom: 'июль',
                        dateTo: '2026-07-30',
                    } as never,
                }),
            ),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(mocks.queue.dispatch).not.toHaveBeenCalled();
    });

    it('kpi-report/get: промах → queued + dispatch job SALES_KPI_REPORT_GENERATE', async () => {
        const mocks = createMocks();
        const controller = createController(mocks);

        const result = await controller.getReport(reportDto());

        expect(result).toEqual({
            status: 'queued',
            requestKey: '2026-07-01|2026-07-30|1',
        });
        expect(mocks.queue.dispatch).toHaveBeenCalledWith(
            QueueNames.SALES_KPI_REPORT,
            JobNames.SALES_KPI_REPORT_GENERATE,
            expect.objectContaining({
                resultKey: 'v1:result:2026-07-01_2026-07-30:1',
            }) as Record<string, unknown>,
            'kpi-report:v1:example.bitrix24.ru:2026-07-01_2026-07-30:1',
            expect.objectContaining({ removeOnComplete: true }) as Record<
                string,
                unknown
            >,
        );
    });

    it('kpi-report/get: кэш-хит ready отдаёт данные, дату расчёта и closedPeriod без dispatch', async () => {
        const mocks = createMocks();
        mocks.resultCache.getEnvelope.mockResolvedValueOnce({
            status: 'ready',
            data: [{ id: 1 }],
            generatedAt: GENERATED_AT,
        } as never);
        const controller = createController(mocks);

        const result = await controller.getReport(reportDto());

        expect(result).toEqual({
            status: 'ready',
            data: [{ id: 1 }],
            requestKey: '2026-07-01|2026-07-30|1',
            generatedAt: GENERATED_AT,
            closedPeriod: true,
        });
        expect(mocks.queue.dispatch).not.toHaveBeenCalled();
    });

    it('kpi-report/get: кэш-хит периода, кончающегося первым днём текущего месяца → closedPeriod false', async () => {
        const mocks = createMocks();
        mocks.resultCache.getEnvelope.mockResolvedValueOnce({
            status: 'ready',
            data: [],
            generatedAt: GENERATED_AT,
        } as never);
        const controller = createController(mocks);

        const result = await controller.getReport(
            reportDto({
                filters: {
                    ...reportDto().filters,
                    dateFrom: '2026-10-15',
                    dateTo: '2026-11-01',
                },
            }),
        );

        expect(result).toMatchObject({
            status: 'ready',
            closedPeriod: false,
            generatedAt: GENERATED_AT,
        });
    });

    it('kpi-report/get: кэш-хит периода, кончающегося последним днём прошлого месяца → closedPeriod true', async () => {
        const mocks = createMocks();
        mocks.resultCache.getEnvelope.mockResolvedValueOnce({
            status: 'ready',
            data: [],
            generatedAt: GENERATED_AT,
        } as never);
        const controller = createController(mocks);

        const result = await controller.getReport(
            reportDto({
                filters: {
                    ...reportDto().filters,
                    dateFrom: '2026-10-01',
                    dateTo: '2026-10-31',
                },
            }),
        );

        expect(result).toMatchObject({ status: 'ready', closedPeriod: true });
    });

    it('kpi-report/get: error-конверт → status error с message, без авто-редиспатча', async () => {
        const mocks = createMocks();
        mocks.resultCache.getEnvelope.mockResolvedValueOnce({
            status: 'error',
            message: 'Битрикс не вернул команды',
            generatedAt: GENERATED_AT,
        } as never);
        const controller = createController(mocks);

        const result = await controller.getReport(reportDto());

        expect(result).toEqual({
            status: 'error',
            message: 'Битрикс не вернул команды',
            requestKey: '2026-07-01|2026-07-30|1',
        });
        expect(mocks.queue.dispatch).not.toHaveBeenCalled();
    });

    it('kpi-report/get: forceRefresh не читает кэш даже для закрытого периода и ставит задачу', async () => {
        const mocks = createMocks();
        const controller = createController(mocks);

        const result = await controller.getReport(
            reportDto({ forceRefresh: true }),
        );

        expect(mocks.resultCache.getEnvelope).not.toHaveBeenCalled();
        expect(mocks.resultCache.drop).toHaveBeenCalledWith(
            'kpi-report',
            DOMAIN,
            'v1:result:2026-07-01_2026-07-30:1',
        );
        expect(callOrder(mocks.resultCache.drop)).toBeLessThan(
            callOrder(mocks.queue.dispatch),
        );
        expect(mocks.queue.dispatch).toHaveBeenCalledWith(
            QueueNames.SALES_KPI_REPORT,
            JobNames.SALES_KPI_REPORT_GENERATE,
            expect.objectContaining({
                resultKey: 'v1:result:2026-07-01_2026-07-30:1',
            }) as Record<string, unknown>,
            'kpi-report:v1:example.bitrix24.ru:2026-07-01_2026-07-30:1',
            expect.anything(),
        );
        expect(result).toEqual({
            status: 'queued',
            requestKey: '2026-07-01|2026-07-30|1',
        });
    });
});
