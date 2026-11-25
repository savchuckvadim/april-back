import type { Job } from 'bull';
import { SalesKpiReportQueueProcessor } from '../queue/kpi-report.processor';
import { KPI_REPORT_WS_EVENTS } from '../constants/report-queue.const';
import type {
    CallingStatisticJob,
    ReportKpiJob,
} from '../dto/report-kpi.job.dto';

const mockReportInit = jest.fn();
const mockGenerateKpiReport = jest.fn();
const mockCallingGet = jest.fn();

jest.mock('../use-cases/kpi-report.use-case', () => ({
    ReportKpiUseCase: jest.fn().mockImplementation(() => ({
        init: mockReportInit,
        generateKpiReport: mockGenerateKpiReport,
    })),
}));
jest.mock('../use-cases/kpi-calling-statistic.use-case', () => ({
    CallingStatisticUseCase: jest.fn().mockImplementation(() => ({
        get: mockCallingGet,
    })),
}));

const DOMAIN = 'example.bitrix24.ru';
const SOCKET_ID = 'socket-1';
/** «Сейчас» воркера: 25.11.2026 (часы сервера). */
const FIXED_NOW = new Date(2026, 10, 25, 12, 0);

const createProcessor = () => {
    const ws = { sendToClient: jest.fn() };
    const pbx = {
        init: jest.fn(() => Promise.resolve({ bitrix: { api: {} } })),
    };
    const resultCache = { setError: jest.fn(() => Promise.resolve()) };
    const processor = new SalesKpiReportQueueProcessor(
        ws as never,
        pbx as never,
        resultCache as never,
    );
    return { processor, ws, pbx, resultCache };
};

const reportJob = (
    dateFrom: string,
    dateTo: string,
    withSocket = true,
): Job<ReportKpiJob> =>
    ({
        data: {
            domain: DOMAIN,
            filters: { dateFrom, dateTo, departament: [] },
            socketId: withSocket ? SOCKET_ID : undefined,
            requestKey: `${dateFrom}|${dateTo}|all`,
            resultKey: `v1:result:${dateFrom}_${dateTo}:all`,
        },
        opts: { attempts: 2 },
        attemptsMade: 0,
    }) as unknown as Job<ReportKpiJob>;

const callingJob = (
    dateFrom: string,
    dateTo: string,
): Job<CallingStatisticJob> =>
    ({
        data: {
            domain: DOMAIN,
            filters: { dateFrom, dateTo, departament: [] },
            socketId: SOCKET_ID,
            requestKey: `${dateFrom}|${dateTo}|all`,
            resultKey: `v1:result:${dateFrom}_${dateTo}:all`,
        },
        opts: { attempts: 2 },
        attemptsMade: 0,
    }) as unknown as Job<CallingStatisticJob>;

describe('SalesKpiReportQueueProcessor (WS-события готовности)', () => {
    beforeEach(() => {
        jest.useFakeTimers().setSystemTime(FIXED_NOW);
        mockReportInit.mockReset();
        mockGenerateKpiReport.mockReset();
        mockCallingGet.mockReset();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('kpi-report:done несёт generatedAt и closedPeriod=true для закрытого периода', async () => {
        const { processor, ws } = createProcessor();
        mockGenerateKpiReport.mockResolvedValue([{ id: 1 }]);

        await processor.handleReport(reportJob('2026-10-01', '2026-10-31'));

        expect(ws.sendToClient).toHaveBeenCalledWith(SOCKET_ID, {
            event: KPI_REPORT_WS_EVENTS.REPORT_DONE,
            data: {
                requestKey: '2026-10-01|2026-10-31|all',
                data: [{ id: 1 }],
                generatedAt: FIXED_NOW.toISOString(),
                closedPeriod: true,
            },
        });
    });

    it('kpi-report:done для периода в текущем месяце — closedPeriod=false', async () => {
        const { processor, ws } = createProcessor();
        mockGenerateKpiReport.mockResolvedValue([]);

        await processor.handleReport(reportJob('2026-11-01', '2026-11-25'));

        expect(ws.sendToClient).toHaveBeenCalledWith(
            SOCKET_ID,
            expect.objectContaining({
                event: KPI_REPORT_WS_EVENTS.REPORT_DONE,
                data: expect.objectContaining({
                    closedPeriod: false,
                    generatedAt: FIXED_NOW.toISOString(),
                }) as Record<string, unknown>,
            }) as Record<string, unknown>,
        );
    });

    it('kpi-report:calling-statistic:done несёт generatedAt и closedPeriod', async () => {
        const { processor, ws } = createProcessor();
        mockCallingGet.mockResolvedValue([{ userName: 'И' }]);

        await processor.handleCallingStatistic(
            callingJob('2026-09-01', '2026-09-30'),
        );

        expect(ws.sendToClient).toHaveBeenCalledWith(SOCKET_ID, {
            event: KPI_REPORT_WS_EVENTS.CALLING_DONE,
            data: {
                requestKey: '2026-09-01|2026-09-30|all',
                data: [{ userName: 'И' }],
                generatedAt: FIXED_NOW.toISOString(),
                closedPeriod: true,
            },
        });
    });

    it('без socketId событие не отправляется (поллинг)', async () => {
        const { processor, ws } = createProcessor();
        mockGenerateKpiReport.mockResolvedValue([]);

        await processor.handleReport(
            reportJob('2026-10-01', '2026-10-31', false),
        );

        expect(ws.sendToClient).not.toHaveBeenCalled();
    });

    it('финальная ошибка: error-конверт и kpi-report:error без изменений формата, исключение пробрасывается', async () => {
        const { processor, ws, resultCache } = createProcessor();
        mockGenerateKpiReport.mockRejectedValue(new Error('сбой Битрикса'));
        const job = reportJob('2026-10-01', '2026-10-31');
        Object.assign(job, { attemptsMade: 1 });

        await expect(processor.handleReport(job)).rejects.toThrow(
            'сбой Битрикса',
        );

        expect(resultCache.setError).toHaveBeenCalledWith(
            'kpi-report',
            DOMAIN,
            'v1:result:2026-10-01_2026-10-31:all',
            'сбой Битрикса',
            120,
        );
        expect(ws.sendToClient).toHaveBeenCalledWith(SOCKET_ID, {
            event: KPI_REPORT_WS_EVENTS.REPORT_ERROR,
            data: {
                requestKey: '2026-10-01|2026-10-31|all',
                message: 'сбой Битрикса',
            },
        });
    });
});
