import { AirtimeQueueProcessor } from '../queue/airtime-queue.processor';
import type { AirtimeMonthJobData } from '../queue/airtime-job.dto';

const DOMAIN = 'example.bitrix24.ru';

const jobData: AirtimeMonthJobData = {
    domain: DOMAIN,
    month: '2026-06',
    requestKey: '2026-06-01|2026-06-30|1_2',
    socketId: 'socket-1',
    dateFrom: '2026-06-01',
    dateTo: '2026-06-30',
};

interface JobMock {
    data: AirtimeMonthJobData;
    opts: { attempts?: number };
    attemptsMade: number;
}

const createMocks = (apiResponses: unknown[]) => {
    const call = jest.fn<Promise<unknown>, unknown[]>();
    apiResponses.forEach(r => call.mockResolvedValueOnce(r));
    return {
        ws: { sendToClient: jest.fn() },
        pbx: {
            init: jest.fn(() => Promise.resolve({ bitrix: { api: { call } } })),
        },
        cellCache: { setMonthCells: jest.fn(() => Promise.resolve(undefined)) },
        markerCache: {
            setMonthMarker: jest.fn(() => Promise.resolve(undefined)),
            clearErrorMarker: jest.fn(() => Promise.resolve(undefined)),
            setErrorMarker: jest.fn(() => Promise.resolve(undefined)),
            recordDuration: jest.fn(() => Promise.resolve(undefined)),
        },
        assembly: {
            checkReadiness: jest.fn(() =>
                Promise.resolve({
                    allReady: true,
                    readyMonths: 1,
                    totalMonths: 1,
                    hasError: false,
                    units: [],
                    months: [{ month: '2026-06', status: 'ready' as const }],
                }),
            ),
        },
    };
};

const createProcessor = (mocks: ReturnType<typeof createMocks>) =>
    new AirtimeQueueProcessor(
        mocks.ws as never,
        mocks.pbx as never,
        mocks.cellCache as never,
        mocks.markerCache as never,
        mocks.assembly as never,
    );

describe('AirtimeQueueProcessor', () => {
    it('успех месяца → bitrix per-job через pbx.init, прогресс и done на socketId', async () => {
        const mocks = createMocks([{ result: [] }]);
        const processor = createProcessor(mocks);
        const job: JobMock = {
            data: jobData,
            opts: { attempts: 3 },
            attemptsMade: 0,
        };

        await processor.handleMonthPartition(job as never);

        expect(mocks.pbx.init).toHaveBeenCalledWith(DOMAIN);
        expect(mocks.ws.sendToClient).toHaveBeenCalledWith('socket-1', {
            event: 'airtime:progress',
            data: expect.objectContaining({
                requestKey: jobData.requestKey,
                month: '2026-06',
                readyMonths: 1,
                totalMonths: 1,
            }) as Record<string, unknown>,
        });
        expect(mocks.ws.sendToClient).toHaveBeenCalledWith('socket-1', {
            event: 'airtime:done',
            data: { requestKey: jobData.requestKey },
        });
    });

    it('период готов не весь → только прогресс, без done', async () => {
        const mocks = createMocks([{ result: [] }]);
        mocks.assembly.checkReadiness.mockResolvedValueOnce({
            allReady: false,
            readyMonths: 1,
            totalMonths: 3,
            hasError: false,
            units: [],
            months: [],
        } as never);
        const processor = createProcessor(mocks);
        const job: JobMock = {
            data: jobData,
            opts: { attempts: 3 },
            attemptsMade: 0,
        };

        await processor.handleMonthPartition(job as never);

        const events = mocks.ws.sendToClient.mock.calls.map(
            ([, payload]) => (payload as { event: string }).event,
        );
        expect(events).toEqual(['airtime:progress']);
    });

    it('без socketId — WS не трогается, но сбор выполняется', async () => {
        const mocks = createMocks([{ result: [] }]);
        const processor = createProcessor(mocks);
        const job: JobMock = {
            data: { ...jobData, socketId: undefined },
            opts: { attempts: 3 },
            attemptsMade: 0,
        };

        await processor.handleMonthPartition(job as never);

        expect(mocks.markerCache.setMonthMarker).toHaveBeenCalled();
        expect(mocks.ws.sendToClient).not.toHaveBeenCalled();
    });

    it('финальная попытка упала → error-маркер + airtime:error + rethrow', async () => {
        const mocks = createMocks([{}]); // дроп страницы → исключение
        const processor = createProcessor(mocks);
        const job: JobMock = {
            data: jobData,
            opts: { attempts: 3 },
            attemptsMade: 2,
        };

        await expect(
            processor.handleMonthPartition(job as never),
        ).rejects.toThrow();

        expect(mocks.markerCache.setErrorMarker).toHaveBeenCalledWith(
            DOMAIN,
            '2026-06',
            expect.objectContaining({
                message: expect.any(String) as string,
            }) as Record<string, unknown>,
        );
        expect(mocks.ws.sendToClient).toHaveBeenCalledWith('socket-1', {
            event: 'airtime:error',
            data: expect.objectContaining({
                requestKey: jobData.requestKey,
                month: '2026-06',
            }) as Record<string, unknown>,
        });
    });

    it('НЕ финальная попытка → rethrow без error-маркера (Bull ретраит)', async () => {
        const mocks = createMocks([{}]);
        const processor = createProcessor(mocks);
        const job: JobMock = {
            data: jobData,
            opts: { attempts: 3 },
            attemptsMade: 0,
        };

        await expect(
            processor.handleMonthPartition(job as never),
        ).rejects.toThrow();

        expect(mocks.markerCache.setErrorMarker).not.toHaveBeenCalled();
        expect(mocks.ws.sendToClient).not.toHaveBeenCalled();
    });
});
