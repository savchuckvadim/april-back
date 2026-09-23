import { EnumPortalAppCode } from '@lib/portal-lib/store/app-settings';
import {
    AI_ANALYTICS_RETENTION_CRON,
    AI_ANALYTICS_RETENTION_CRON_DRY_RUN,
    AiAnalyticsRetentionScheduler,
} from '../ai-analytics-retention.scheduler';

const NOW = new Date('2026-09-22T04:30:00.000Z');

function makeScheduler(domains: string[]) {
    const appSettings = {
        listByAppCode: jest
            .fn()
            .mockResolvedValue(domains.map(domain => ({ domain }))),
    };
    const retention = {
        run: jest
            .fn()
            .mockImplementation(({ domain }: { domain: string }) =>
                Promise.resolve({ summary: `сводка ${domain}` }),
            ),
    };
    return {
        scheduler: new AiAnalyticsRetentionScheduler(
            appSettings as never,
            retention as never,
        ),
        appSettings,
        retention,
    };
}

describe('AiAnalyticsRetentionScheduler', () => {
    it('крон ежедневный по UTC (локальный час портала библиотеке недоступен)', () => {
        // '30 4 * * *' — минута, час, любой день/месяц/день недели.
        const [minute, hour, dayOfMonth, month, weekday] =
            AI_ANALYTICS_RETENTION_CRON.split(' ');
        expect(Number(minute)).toBe(30);
        expect(Number(hour)).toBe(4);
        expect([dayOfMonth, month, weekday]).toEqual(['*', '*', '*']);
    });

    it('обходит порталы со строкой настроек kpiSales и считает в режиме dryRun', async () => {
        const { scheduler, appSettings, retention } = makeScheduler([
            'a.bitrix24.ru',
            'b.bitrix24.ru',
            // Дубль домена схлопывается.
            'a.bitrix24.ru',
        ]);
        const summaries = await scheduler.runAll(NOW);
        expect(appSettings.listByAppCode).toHaveBeenCalledWith(
            EnumPortalAppCode.kpiSales,
        );
        expect(retention.run).toHaveBeenCalledTimes(2);
        expect(retention.run).toHaveBeenCalledWith({
            domain: 'a.bitrix24.ru',
            dryRun: AI_ANALYTICS_RETENTION_CRON_DRY_RUN,
            now: NOW,
        });
        expect(AI_ANALYTICS_RETENTION_CRON_DRY_RUN).toBe(true);
        expect(summaries).toEqual([
            'сводка a.bitrix24.ru',
            'сводка b.bitrix24.ru',
        ]);
    });

    it('отказ одного портала не прерывает обход остальных', async () => {
        const { scheduler, retention } = makeScheduler([
            'bad.bitrix24.ru',
            'good.bitrix24.ru',
        ]);
        retention.run.mockRejectedValueOnce(new Error('БД недоступна'));
        const summaries = await scheduler.runAll(NOW);
        expect(retention.run).toHaveBeenCalledTimes(2);
        expect(summaries).toEqual(['сводка good.bitrix24.ru']);
    });

    it('ростер не прочитался — обход пустой, исключения нет', async () => {
        const { scheduler, appSettings, retention } = makeScheduler([]);
        appSettings.listByAppCode.mockRejectedValueOnce(new Error('нет БД'));
        await expect(scheduler.runAll(NOW)).resolves.toEqual([]);
        expect(retention.run).not.toHaveBeenCalled();
    });
});
