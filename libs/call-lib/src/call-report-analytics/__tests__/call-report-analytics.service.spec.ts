import { CallReportAnalyticsService } from '../call-report-analytics.service';
import { CallReportAnalyticsQueryDto } from '../dto/call-report-analytics-query.dto';

const QUERY: CallReportAnalyticsQueryDto = {
    domain: 'test.bitrix24.ru',
    from: '2026-07-01T00:00:00.000Z',
    to: '2026-07-23T00:00:00.000Z',
};

const makeDeps = (overrides?: { cached?: unknown }) => {
    const dataService = {
        load: jest.fn().mockResolvedValue({
            rows: [
                {
                    transcriptionId: '1',
                    callStartedAt: new Date(),
                    durationSec: 600,
                    managerId: '7',
                    callType: 'cold',
                    analysis: { weightedScore: 70 },
                    classification: null,
                },
            ],
            totalCalls: 5,
            skippedNoManager: 0,
        }),
    };
    const aggregator = {
        buildSummary: jest.fn().mockReturnValue({ avgWeightedScore: 70 }),
        buildSpeech: jest.fn().mockReturnValue({ sections: [] }),
        buildObjections: jest.fn().mockReturnValue({ competitors: {} }),
        buildManagers: jest.fn().mockReturnValue({ managers: [] }),
    };
    const cache = {
        buildKey: jest.fn().mockReturnValue('cache-key'),
        get: jest.fn().mockResolvedValue(overrides?.cached ?? null),
        set: jest.fn().mockResolvedValue(undefined),
        reset: jest.fn().mockResolvedValue({ removedKeys: 2, pattern: 'p:*' }),
    };
    const history = { save: jest.fn().mockResolvedValue('99') };
    const service = new CallReportAnalyticsService(
        dataService as never,
        aggregator as never,
        cache as never,
        history as never,
    );
    return { service, dataService, aggregator, cache, history };
};

describe('CallReportAnalyticsService', () => {
    afterEach(() => jest.clearAllMocks());

    it('строит отчёт, пишет кэш, meta заполнена', async () => {
        const { service, cache, history, dataService } = makeDeps();
        const report = await service.buildReport('summary', QUERY);

        expect(dataService.load).toHaveBeenCalledWith(QUERY);
        expect(cache.set).toHaveBeenCalledWith(
            'cache-key',
            expect.objectContaining({ avgWeightedScore: 70 }),
        );
        expect(history.save).not.toHaveBeenCalled();
        expect(report.meta).toEqual(
            expect.objectContaining({
                report: 'summary',
                domain: QUERY.domain,
                totalCalls: 5,
                filteredCalls: 1,
                analyzedCalls: 1,
                fromCache: false,
                historyId: null,
            }),
        );
    });

    it('useCache по умолчанию: отдаёт кэшированный отчёт с fromCache=true', async () => {
        const cached = {
            meta: { report: 'summary', fromCache: false },
            avgWeightedScore: 55,
        };
        const { service, dataService } = makeDeps({ cached });
        const report = await service.buildReport('summary', QUERY);
        expect(dataService.load).not.toHaveBeenCalled();
        expect(report.meta.fromCache).toBe(true);
        expect(report.avgWeightedScore).toBe(55);
    });

    it('useCache=false: пересчитывает, кэш не читается, но обновляется', async () => {
        const cached = { meta: {}, avgWeightedScore: 55 };
        const { service, cache, dataService } = makeDeps({ cached });
        const report = await service.buildReport('summary', {
            ...QUERY,
            useCache: false,
        });
        expect(cache.get).not.toHaveBeenCalled();
        expect(dataService.load).toHaveBeenCalled();
        expect(cache.set).toHaveBeenCalled();
        expect(report.meta.fromCache).toBe(false);
    });

    it('saveToHistory=true: снапшот в историю, id в meta', async () => {
        const { service, history } = makeDeps();
        const report = await service.buildReport('speech', {
            ...QUERY,
            saveToHistory: true,
        });
        expect(history.save).toHaveBeenCalledWith(
            'speech',
            expect.objectContaining({ saveToHistory: true }),
            expect.objectContaining({ sections: [] }),
        );
        expect(report.meta.historyId).toBe('99');
    });

    it('каждый вид отчёта зовёт свой агрегатор', async () => {
        const { service, aggregator } = makeDeps();
        await service.buildReport('objections', QUERY);
        await service.buildReport('managers', QUERY);
        expect(aggregator.buildObjections).toHaveBeenCalled();
        expect(aggregator.buildManagers).toHaveBeenCalled();
    });

    it('resetCache делегирует кэш-сервису', async () => {
        const { service, cache } = makeDeps();
        const result = await service.resetCache({
            report: 'summary',
            domain: 'test.bitrix24.ru',
        });
        expect(cache.reset).toHaveBeenCalledWith({
            report: 'summary',
            domain: 'test.bitrix24.ru',
        });
        expect(result.removedKeys).toBe(2);
    });
});
