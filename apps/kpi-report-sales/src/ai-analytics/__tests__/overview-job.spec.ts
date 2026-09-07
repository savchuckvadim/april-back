import { OverviewJobUseCase } from '../domain/use-cases/overview-job.use-case';
import { AiAnalyticsQueueProcessor } from '../queue/ai-analytics.processor';
import { AiOverviewJobData } from '../dto/ai-overview-request.dto';
import {
    OVERVIEW_DOMAIN,
    OVERVIEW_FROM,
    OVERVIEW_NOW,
    OVERVIEW_TO,
    overviewFixture,
    twoManagersRows,
} from './fixtures/overview.fixture';

const KEY = 'sales-ai-analytics:v1:april.bitrix24.ru:overview:x';
const jobData: AiOverviewJobData = {
    domain: OVERVIEW_DOMAIN,
    from: OVERVIEW_FROM,
    to: OVERVIEW_TO,
    managerIds: [10, 20],
    confirmedOnly: false,
    forceRefresh: false,
    requestKey: KEY,
    socketId: 'sock',
};

function makeJob(overview = overviewFixture(twoManagersRows(), [10, 20])) {
    const useCase = { execute: jest.fn().mockResolvedValue(overview) };
    const cache = { setJson: jest.fn().mockResolvedValue(undefined) };
    const ws = { sendToClient: jest.fn() };
    const job = new OverviewJobUseCase(
        useCase as never,
        cache as never,
        ws as never,
    );
    return { job, useCase, cache, ws, overview };
}

describe('OverviewJobUseCase / AiAnalyticsQueueProcessor.handleOverview', () => {
    it('успех: write-through ready-конверта (период закончился вчера → TTL 1 ч) + WS done c requestKey', async () => {
        const { job, useCase, cache, ws, overview } = makeJob();
        const result = await job.execute(jobData, OVERVIEW_NOW);
        expect(result).toBe(overview);
        expect(useCase.execute).toHaveBeenCalledWith(jobData, {
            now: OVERVIEW_NOW,
        });
        expect(cache.setJson).toHaveBeenCalledWith(
            KEY,
            { status: 'ready', data: overview },
            3600,
        );
        expect(ws.sendToClient).toHaveBeenCalledWith('sock', {
            event: 'ai-analytics:overview:done',
            data: { requestKey: KEY, generatedAt: overview.meta.generatedAt },
        });
    });

    it('TTL: закрытый период — 30 дней, период с сегодняшним днём — 180 с', async () => {
        const closed = makeJob(
            overviewFixture(twoManagersRows(), [10, 20], {
                from: '2026-07-01',
                to: '2026-07-31',
            }),
        );
        await closed.job.execute(
            { ...jobData, from: '2026-07-01', to: '2026-07-31' },
            OVERVIEW_NOW,
        );
        expect(closed.cache.setJson).toHaveBeenLastCalledWith(
            KEY,
            expect.objectContaining({ status: 'ready' }),
            60 * 60 * 24 * 30,
        );

        const live = makeJob();
        await live.job.execute({ ...jobData, to: '2026-09-07' }, OVERVIEW_NOW);
        expect(live.cache.setJson).toHaveBeenLastCalledWith(
            KEY,
            expect.objectContaining({ status: 'ready' }),
            180,
        );
    });

    it('без socketId WS не шлётся; ошибка записи кэша не роняет результат', async () => {
        const { job, cache, ws } = makeJob();
        cache.setJson.mockRejectedValue(new Error('redis down'));
        await expect(
            job.execute({ ...jobData, socketId: undefined }, OVERVIEW_NOW),
        ).resolves.toBeDefined();
        expect(ws.sendToClient).not.toHaveBeenCalled();
    });

    it('ошибка расчёта: error-конверт на 120 с + WS error + rethrow; процессор пробрасывает дальше', async () => {
        const { job, useCase, cache, ws } = makeJob();
        useCase.execute.mockRejectedValue(new Error('bitrix down'));
        await expect(job.execute(jobData, OVERVIEW_NOW)).rejects.toThrow(
            'bitrix down',
        );
        expect(cache.setJson).toHaveBeenCalledWith(
            KEY,
            { status: 'error', message: 'bitrix down' },
            120,
        );
        expect(ws.sendToClient).toHaveBeenCalledWith('sock', {
            event: 'ai-analytics:overview:error',
            data: { requestKey: KEY, message: 'bitrix down' },
        });

        const processor = new AiAnalyticsQueueProcessor(
            { execute: jest.fn() } as never,
            { execute: jest.fn() } as never,
            job,
        );
        await expect(
            processor.handleOverview({ data: jobData } as never),
        ).rejects.toThrow('bitrix down');

        useCase.execute.mockResolvedValue(
            overviewFixture(twoManagersRows(), [10, 20]),
        );
        await expect(
            processor.handleOverview({ data: jobData } as never),
        ).resolves.toBeUndefined();
    });
});
