import {
    AiAnalyticsPushScheduler,
    buildPushJobId,
} from '../cron/ai-analytics-push.scheduler';
import { AI_ANALYTICS_PUSH_CRON } from '../constants/ai-analytics.const';
import { AiAnalyticsPortalsLoader } from '../domain/loaders/portals.loader';
import { DEFAULT_WORK_CALENDAR } from '@lib/sales-ai-analytics';

interface PortalFlags {
    enabled?: boolean;
    digestEnabled?: boolean;
    ropUserIds?: number[];
    digestAllUserIds?: number[];
    timeZone?: string;
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
                alertsEnabled: false,
                digestEnabled: flags.digestEnabled ?? false,
                ropUserIds: flags.ropUserIds ?? [447],
                digestAllUserIds: flags.digestAllUserIds ?? [],
                calendar: {
                    ...DEFAULT_WORK_CALENDAR,
                    timeZone: flags.timeZone ?? DEFAULT_WORK_CALENDAR.timeZone,
                },
            });
        }),
    };
    const dispatcher = { dispatch: jest.fn().mockResolvedValue({ id: 'x' }) };
    return {
        scheduler: new AiAnalyticsPushScheduler(
            new AiAnalyticsPortalsLoader(appSettings as never),
            settings as never,
            dispatcher as never,
        ),
        appSettings,
        dispatcher,
    };
}

/** Понедельник 07.09.2026 05:30 UTC = 08:30 МСК. */
const NOW = new Date('2026-09-07T05:30:00Z');

describe('AiAnalyticsPushScheduler', () => {
    it('расписания: пн 08:30 МСК повестка, ежедневно 08:00 МСК дайджест (UTC)', () => {
        expect(AI_ANALYTICS_PUSH_CRON.AGENDA).toBe('30 5 * * 1');
        expect(AI_ANALYTICS_PUSH_CRON.DIGEST).toBe('0 5 * * *');
    });

    it('jobId детерминирован по виду, домену и дню', () => {
        expect(
            buildPushJobId('agenda', 'april.bitrix24.ru', '2026-09-07'),
        ).toBe('ai-analytics:push:agenda:april.bitrix24.ru:2026-09-07');
    });

    it('повестка: только порталы с ai_analytics_enabled и заданными РОПами', async () => {
        const { scheduler, dispatcher } = makeScheduler({
            'on.bitrix24.ru': { enabled: true },
            'off.bitrix24.ru': { enabled: false },
            'norop.bitrix24.ru': { enabled: true, ropUserIds: [] },
        });
        const jobIds = await scheduler.dispatchAll('agenda', NOW);
        expect(jobIds).toEqual([
            'ai-analytics:push:agenda:on.bitrix24.ru:2026-09-07',
        ]);
        expect(dispatcher.dispatch).toHaveBeenCalledTimes(1);
        expect(dispatcher.dispatch).toHaveBeenCalledWith(
            'sales-kpi-report',
            'sales-ai-analytics-push',
            { domain: 'on.bitrix24.ru', kind: 'agenda', date: '2026-09-07' },
            'ai-analytics:push:agenda:on.bitrix24.ru:2026-09-07',
            expect.objectContaining({ attempts: 1 }),
        );
    });

    it('дайджест: нужен и ai_analytics_digest_enabled; дата — в TZ портала', async () => {
        const { scheduler, dispatcher } = makeScheduler({
            'digest.bitrix24.ru': {
                enabled: true,
                digestEnabled: true,
                timeZone: 'Asia/Vladivostok',
            },
            'nodigest.bitrix24.ru': { enabled: true, digestEnabled: false },
        });
        // 07.09 05:30 UTC во Владивостоке (UTC+10) — ещё 07.09, 15:30.
        const jobIds = await scheduler.dispatchAll('digest', NOW);
        expect(jobIds).toEqual([
            'ai-analytics:push:digest:digest.bitrix24.ru:2026-09-07',
        ]);
        expect(dispatcher.dispatch).toHaveBeenCalledTimes(1);
    });

    it('сводный дайджест: только при непустом ai_analytics_digest_all_user_ids, digest_enabled не нужен', async () => {
        const { scheduler, dispatcher } = makeScheduler({
            'all.bitrix24.ru': {
                enabled: true,
                digestEnabled: false,
                digestAllUserIds: [447],
            },
            'noone.bitrix24.ru': { enabled: true, digestEnabled: true },
            'off.bitrix24.ru': { enabled: false, digestAllUserIds: [447] },
        });
        expect(await scheduler.dispatchAll('digest_all', NOW)).toEqual([
            'ai-analytics:push:digest_all:all.bitrix24.ru:2026-09-07',
        ]);
        expect(dispatcher.dispatch).toHaveBeenCalledWith(
            'sales-kpi-report',
            'sales-ai-analytics-push',
            {
                domain: 'all.bitrix24.ru',
                kind: 'digest_all',
                date: '2026-09-07',
            },
            'ai-analytics:push:digest_all:all.bitrix24.ru:2026-09-07',
            expect.objectContaining({ attempts: 1 }),
        );
    });

    it('утренний тик ставит и личный, и сводный дайджест', async () => {
        const { scheduler, dispatcher } = makeScheduler({
            'both.bitrix24.ru': {
                enabled: true,
                digestEnabled: true,
                digestAllUserIds: [447],
            },
        });
        await scheduler.tickDigest();
        const kinds = dispatcher.dispatch.mock.calls.map(
            ([, , data]: [string, string, { kind: string }]) => data.kind,
        );
        expect(kinds).toEqual(['digest', 'digest_all']);
    });

    it('один и тот же день → один и тот же jobId (дедуп повторного тика)', async () => {
        const { scheduler } = makeScheduler({
            'on.bitrix24.ru': { enabled: true },
        });
        const first = await scheduler.dispatchAll('agenda', NOW);
        const second = await scheduler.dispatchAll(
            'agenda',
            new Date(NOW.getTime() + 60_000),
        );
        expect(second).toEqual(first);
    });

    it('ошибка настроек одного портала и ошибка ростера не роняют тик', async () => {
        const {
            scheduler,
            dispatcher,
            appSettings: roster,
        } = makeScheduler({
            'on.bitrix24.ru': { enabled: true },
        });
        // Домен без настроек в моке → load отклоняется.
        roster.listByAppCode.mockResolvedValueOnce([
            { domain: 'broken.bitrix24.ru' },
            { domain: 'on.bitrix24.ru' },
        ]);
        expect(await scheduler.dispatchAll('agenda', NOW)).toEqual([
            'ai-analytics:push:agenda:on.bitrix24.ru:2026-09-07',
        ]);
        expect(dispatcher.dispatch).toHaveBeenCalledTimes(1);

        const { scheduler: failing, appSettings } = makeScheduler({});
        appSettings.listByAppCode.mockRejectedValueOnce(new Error('db down'));
        expect(await failing.dispatchAll('digest', NOW)).toEqual([]);
    });
});
