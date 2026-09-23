import { DEFAULT_WORK_CALENDAR } from '@lib/sales-ai-analytics';
import { buildOverviewKey } from '../cache/cache-key.util';
import {
    AI_ANALYTICS_LOCAL_HOURS,
    AI_ANALYTICS_PREWARM_CRON,
} from '../constants/ai-cron.const';
import { AI_ANALYTICS_PREWARM_JOB_OPTIONS } from '../constants/ai-overview.const';
import { AiAnalyticsOverviewPrewarmScheduler } from '../cron/ai-analytics-overview-prewarm.scheduler';
import { AiAnalyticsPortalsLoader } from '../domain/loaders/portals.loader';
import { OverviewLookupUseCase } from '../domain/use-cases/overview-lookup.use-case';

interface PortalFlags {
    enabled?: boolean;
    timeZone?: string;
    roster?: number[];
}

function makeScheduler(portals: Record<string, PortalFlags>) {
    const appSettings = {
        listByAppCode: jest
            .fn()
            .mockResolvedValue(
                Object.keys(portals).map(domain => ({ domain, portalId: 1 })),
            ),
    };
    const settings = {
        load: jest.fn((domain: string) => {
            const flags = portals[domain];
            if (!flags) return Promise.reject(new Error('portal not found'));
            return Promise.resolve({
                enabled: flags.enabled ?? false,
                auditEnabled: false,
                alertsEnabled: false,
                digestEnabled: false,
                ropUserIds: [447],
                calendar: {
                    ...DEFAULT_WORK_CALENDAR,
                    timeZone: flags.timeZone ?? DEFAULT_WORK_CALENDAR.timeZone,
                },
            });
        }),
    };
    const managers = {
        resolve: jest.fn((domain: string) =>
            Promise.resolve(portals[domain]?.roster ?? [10, 20]),
        ),
    };
    const dispatcher = {
        dispatch: jest.fn().mockResolvedValue({ id: 'x' }),
        getJob: jest.fn().mockResolvedValue(null),
    };
    const lookup = new OverviewLookupUseCase(
        managers as never,
        { getJson: jest.fn() } as never,
        dispatcher as never,
    );
    return {
        scheduler: new AiAnalyticsOverviewPrewarmScheduler(
            new AiAnalyticsPortalsLoader(appSettings as never),
            settings as never,
            lookup,
        ),
        dispatcher,
        appSettings,
    };
}

/** 07.09.2026 02:30 UTC = 05:30 МСК. */
const NOW = new Date('2026-09-07T02:30:00Z');
/** 06.09.2026 19:30 UTC = 07.09 05:30 во Владивостоке (UTC+10). */
const NOW_VLADIVOSTOK = new Date('2026-09-06T19:30:00Z');
const expectedKey = (domain: string) =>
    buildOverviewKey(domain, '2026-08-10', '2026-09-06', '10_20', false);

describe('AiAnalyticsOverviewPrewarmScheduler', () => {
    it('тик ежечасный на :30, слот — 05:30 локально; приоритет ниже пользовательских', () => {
        expect(AI_ANALYTICS_PREWARM_CRON).toBe('30 * * * *');
        expect(AI_ANALYTICS_LOCAL_HOURS.PREWARM).toEqual({
            hour: 5,
            minute: 30,
        });
        expect(AI_ANALYTICS_PREWARM_JOB_OPTIONS).toMatchObject({
            priority: 10,
            attempts: 1,
            timeout: 120_000,
        });
    });

    it('только порталы с ai_analytics_enabled; период — 4 недели до вчера в TZ портала; jobId = ключ обзора', async () => {
        const { scheduler, dispatcher } = makeScheduler({
            'on.bitrix24.ru': { enabled: true },
            'off.bitrix24.ru': { enabled: false },
        });
        const jobIds = await scheduler.dispatchAll(NOW);
        expect(jobIds).toEqual([expectedKey('on.bitrix24.ru')]);
        expect(dispatcher.dispatch).toHaveBeenCalledTimes(1);
        expect(dispatcher.dispatch).toHaveBeenCalledWith(
            'sales-kpi-report',
            'sales-ai-analytics-overview',
            {
                domain: 'on.bitrix24.ru',
                from: '2026-08-10',
                to: '2026-09-06',
                managerIds: [10, 20],
                confirmedOnly: false,
                forceRefresh: true,
                requestKey: expectedKey('on.bitrix24.ru'),
            },
            expectedKey('on.bitrix24.ru'),
            AI_ANALYTICS_PREWARM_JOB_OPTIONS,
        );
    });

    it('два портала в разных поясах: каждый получает джобу в свои 05:30, т.е. в разные часы UTC', async () => {
        const { scheduler, dispatcher } = makeScheduler({
            'msk.bitrix24.ru': { enabled: true },
            'vl.bitrix24.ru': { enabled: true, timeZone: 'Asia/Vladivostok' },
        });
        // 19:30Z: Владивосток 05:30 (вчера там — 06.09), Москва 22:30 предыдущего дня.
        expect(await scheduler.dispatchAll(NOW_VLADIVOSTOK)).toEqual([
            expectedKey('vl.bitrix24.ru'),
        ]);
        // 02:30Z: Москва 05:30, Владивосток 12:30 — слот прошёл.
        expect(await scheduler.dispatchAll(NOW)).toEqual([
            expectedKey('msk.bitrix24.ru'),
        ]);
        expect(dispatcher.dispatch).toHaveBeenCalledTimes(2);
    });

    it('повторный тик того же часа даёт тот же jobId (дедуп); тик в другой час — 0 джоб', async () => {
        const { scheduler, dispatcher } = makeScheduler({
            'on.bitrix24.ru': { enabled: true },
        });
        const first = await scheduler.dispatchAll(NOW);
        const second = await scheduler.dispatchAll(
            new Date(NOW.getTime() + 60_000),
        );
        expect(second).toEqual(first);
        expect(
            await scheduler.dispatchAll(new Date(NOW.getTime() + 3_600_000)),
        ).toEqual([]);
        expect(dispatcher.dispatch).toHaveBeenCalledTimes(2);
    });

    it('ошибка настроек одного портала и ошибка ростера не роняют тик', async () => {
        const { scheduler, dispatcher, appSettings } = makeScheduler({
            'on.bitrix24.ru': { enabled: true },
        });
        appSettings.listByAppCode.mockResolvedValueOnce([
            { domain: 'broken.bitrix24.ru' },
            { domain: 'on.bitrix24.ru' },
        ]);
        expect(await scheduler.dispatchAll(NOW)).toEqual([
            expectedKey('on.bitrix24.ru'),
        ]);
        expect(dispatcher.dispatch).toHaveBeenCalledTimes(1);

        const { scheduler: failing, appSettings: down } = makeScheduler({});
        down.listByAppCode.mockRejectedValueOnce(new Error('db down'));
        expect(await failing.dispatchAll(NOW)).toEqual([]);
    });
});
