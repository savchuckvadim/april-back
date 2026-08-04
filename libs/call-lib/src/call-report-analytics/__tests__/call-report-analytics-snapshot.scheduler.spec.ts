import { CallReportAnalyticsSnapshotScheduler } from '../call-report-analytics-snapshot.scheduler';

const makeDeps = (options?: {
    portals?: { domain: string }[];
    buildError?: boolean;
    dbError?: boolean;
}) => {
    const analytics = {
        buildReport: options?.buildError
            ? jest.fn().mockRejectedValue(new Error('build down'))
            : jest.fn().mockResolvedValue({
                  meta: { filteredCalls: 10, historyId: '5' },
              }),
    };
    const portalAiSettings = {
        findEnabled: options?.dbError
            ? jest.fn().mockRejectedValue(new Error('db down'))
            : jest.fn().mockResolvedValue(options?.portals ?? []),
    };
    const scheduler = new CallReportAnalyticsSnapshotScheduler(
        analytics as never,
        portalAiSettings as never,
    );
    return { scheduler, analytics };
};

describe('CallReportAnalyticsSnapshotScheduler (порталы из БД)', () => {
    afterEach(() => jest.clearAllMocks());

    it('нет включённых порталов — ничего не строит', async () => {
        const { scheduler, analytics } = makeDeps();
        await scheduler.tick();
        expect(analytics.buildReport).not.toHaveBeenCalled();
    });

    it('строит все 4 отчёта каждого включённого портала с историей и без кэша', async () => {
        const { scheduler, analytics } = makeDeps({
            portals: [{ domain: 'a.bitrix24.ru' }, { domain: 'b.bitrix24.ru' }],
        });
        await scheduler.tick();
        // 2 домена × 4 вида отчётов.
        expect(analytics.buildReport).toHaveBeenCalledTimes(8);
        expect(analytics.buildReport).toHaveBeenCalledWith(
            'summary',
            expect.objectContaining({
                domain: 'a.bitrix24.ru',
                useCache: false,
                saveToHistory: true,
            }),
        );
        expect(analytics.buildReport).toHaveBeenCalledWith(
            'managers',
            expect.objectContaining({ domain: 'b.bitrix24.ru' }),
        );
    });

    it('ошибка построения не прерывает остальные снапшоты', async () => {
        const { scheduler, analytics } = makeDeps({
            portals: [{ domain: 'a.bitrix24.ru' }],
            buildError: true,
        });
        await expect(scheduler.tick()).resolves.toBeUndefined();
        expect(analytics.buildReport).toHaveBeenCalledTimes(4);
    });

    it('недоступная БД — тик не падает и ничего не строит', async () => {
        const { scheduler, analytics } = makeDeps({ dbError: true });
        await expect(scheduler.tick()).resolves.toBeUndefined();
        expect(analytics.buildReport).not.toHaveBeenCalled();
    });
});
