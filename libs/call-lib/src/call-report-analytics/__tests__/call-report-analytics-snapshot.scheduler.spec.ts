import { CallReportAnalyticsSnapshotScheduler } from '../call-report-analytics-snapshot.scheduler';

const makeDeps = (env: Record<string, string>, buildError = false) => {
    const analytics = {
        buildReport: buildError
            ? jest.fn().mockRejectedValue(new Error('build down'))
            : jest.fn().mockResolvedValue({
                  meta: { filteredCalls: 10, historyId: '5' },
              }),
    };
    const config = { get: jest.fn((key: string) => env[key]) };
    const scheduler = new CallReportAnalyticsSnapshotScheduler(
        analytics as never,
        config as never,
    );
    return { scheduler, analytics };
};

describe('CallReportAnalyticsSnapshotScheduler', () => {
    afterEach(() => jest.clearAllMocks());

    it('выключен по умолчанию — ничего не строит', async () => {
        const { scheduler, analytics } = makeDeps({
            CALL_REPORT_DOMAINS: 'a.bitrix24.ru',
        });
        await scheduler.tick();
        expect(analytics.buildReport).not.toHaveBeenCalled();
    });

    it('строит все 4 отчёта каждого домена с историей и без кэша', async () => {
        const { scheduler, analytics } = makeDeps({
            CALL_REPORT_ANALYTICS_SNAPSHOT_ENABLED: '1',
            CALL_REPORT_DOMAINS: 'a.bitrix24.ru, b.bitrix24.ru',
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
        const { scheduler, analytics } = makeDeps(
            {
                CALL_REPORT_ANALYTICS_SNAPSHOT_ENABLED: '1',
                CALL_REPORT_DOMAINS: 'a.bitrix24.ru',
            },
            true,
        );
        await expect(scheduler.tick()).resolves.toBeUndefined();
        expect(analytics.buildReport).toHaveBeenCalledTimes(4);
    });
});
