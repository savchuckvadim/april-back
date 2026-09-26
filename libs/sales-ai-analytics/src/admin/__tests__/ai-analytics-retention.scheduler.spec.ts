import { EnumPortalAppCode } from '@lib/portal-lib/store/app-settings';
import {
    AI_ANALYTICS_CALENDAR_SETTING_KEY,
    AI_ANALYTICS_RETENTION_CRON,
    AI_ANALYTICS_RETENTION_CRON_DRY_RUN,
    AI_ANALYTICS_RETENTION_LOCAL_HOUR,
    AiAnalyticsRetentionScheduler,
    timeZoneOf,
} from '../ai-analytics-retention.scheduler';

/**
 * Крон ретенции по локальному часу портала (Фаза 3, П5 + П10): тик
 * ежечасный, портал обходится, когда у него 04:30, dryRun по умолчанию.
 */
/** 04:30 по Москве = 01:30 UTC. */
const MOSCOW_DUE = new Date('2026-09-22T01:30:00.000Z');

interface PortalRow {
    domain: string;
    timeZone?: string;
}

function makeScheduler(portals: PortalRow[]) {
    const appSettings = {
        listByAppCode: jest.fn().mockResolvedValue(
            portals.map(portal => ({
                domain: portal.domain,
                settings:
                    portal.timeZone === undefined
                        ? {}
                        : {
                              [AI_ANALYTICS_CALENDAR_SETTING_KEY]:
                                  JSON.stringify({ timeZone: portal.timeZone }),
                          },
            })),
        ),
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
    it('тик ежечасный на минуте слота 04:30', () => {
        expect(AI_ANALYTICS_RETENTION_LOCAL_HOUR).toEqual({
            hour: 4,
            minute: 30,
        });
        const [minute, hour, dayOfMonth, month, weekday] =
            AI_ANALYTICS_RETENTION_CRON.split(' ');
        expect(Number(minute)).toBe(30);
        expect([hour, dayOfMonth, month, weekday]).toEqual([
            '*',
            '*',
            '*',
            '*',
        ]);
    });

    it('runDue: обходит только порталы, у которых сейчас 04:30 по их поясу', async () => {
        const { scheduler, retention } = makeScheduler([
            { domain: 'msk.bitrix24.ru', timeZone: 'Europe/Moscow' },
            { domain: 'nsk.bitrix24.ru', timeZone: 'Asia/Novosibirsk' },
            // Без пояса — Москва по умолчанию.
            { domain: 'default.bitrix24.ru' },
        ]);
        const summaries = await scheduler.runDue(MOSCOW_DUE);
        expect(summaries).toEqual([
            'сводка msk.bitrix24.ru',
            'сводка default.bitrix24.ru',
        ]);
        expect(retention.run).toHaveBeenCalledWith({
            domain: 'msk.bitrix24.ru',
            dryRun: AI_ANALYTICS_RETENTION_CRON_DRY_RUN,
            now: MOSCOW_DUE,
        });
        expect(AI_ANALYTICS_RETENTION_CRON_DRY_RUN).toBe(true);
    });

    it('runAll: все порталы со строкой настроек kpiSales, дубль домена схлопывается', async () => {
        const { scheduler, appSettings, retention } = makeScheduler([
            { domain: 'a.bitrix24.ru' },
            { domain: 'b.bitrix24.ru' },
            { domain: 'a.bitrix24.ru' },
        ]);
        const summaries = await scheduler.runAll(MOSCOW_DUE);
        expect(appSettings.listByAppCode).toHaveBeenCalledWith(
            EnumPortalAppCode.kpiSales,
        );
        expect(retention.run).toHaveBeenCalledTimes(2);
        expect(summaries).toEqual([
            'сводка a.bitrix24.ru',
            'сводка b.bitrix24.ru',
        ]);
    });

    it('отказ одного портала не прерывает обход остальных', async () => {
        const { scheduler, retention } = makeScheduler([
            { domain: 'bad.bitrix24.ru' },
            { domain: 'good.bitrix24.ru' },
        ]);
        retention.run.mockRejectedValueOnce(new Error('БД недоступна'));
        const summaries = await scheduler.runAll(MOSCOW_DUE);
        expect(retention.run).toHaveBeenCalledTimes(2);
        expect(summaries).toEqual(['сводка good.bitrix24.ru']);
    });

    it('ростер не прочитался — обход пустой, исключения нет', async () => {
        const { scheduler, appSettings, retention } = makeScheduler([]);
        appSettings.listByAppCode.mockRejectedValueOnce(new Error('нет БД'));
        await expect(scheduler.runAll(MOSCOW_DUE)).resolves.toEqual([]);
        expect(retention.run).not.toHaveBeenCalled();
    });

    it('timeZoneOf: пояс из JSON календаря, битое значение — null', () => {
        expect(
            timeZoneOf(JSON.stringify({ timeZone: 'Asia/Novosibirsk' })),
        ).toBe('Asia/Novosibirsk');
        expect(timeZoneOf('{битый')).toBe('Europe/Moscow');
        expect(timeZoneOf(42)).toBeNull();
        expect(timeZoneOf('')).toBeNull();
    });
});
