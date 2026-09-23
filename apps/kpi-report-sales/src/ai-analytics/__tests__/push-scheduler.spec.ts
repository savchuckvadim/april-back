import {
    AI_ANALYTICS_PUSH_SLOTS,
    AiAnalyticsPushScheduler,
    buildPushJobId,
} from '../cron/ai-analytics-push.scheduler';
import {
    AI_ANALYTICS_LOCAL_HOURS,
    AI_ANALYTICS_PUSH_CRON,
} from '../constants/ai-cron.const';
import { AiAnalyticsPortalsLoader } from '../domain/loaders/portals.loader';
import { AiPushJobData } from '../dto/ai-push.dto';
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
    /** Аргументы QueueDispatcherService.dispatch: очередь, джоба, payload, jobId, опции. */
    const dispatcher = {
        dispatch: jest.fn<
            Promise<{ id: string }>,
            [string, string, AiPushJobData, string, object]
        >(() => Promise.resolve({ id: 'x' })),
    };
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

/** Понедельник 07.09.2026 05:30 UTC = 08:30 МСК — тик повестки. */
const NOW = new Date('2026-09-07T05:30:00Z');
/** Понедельник 07.09.2026 05:00 UTC = 08:00 МСК — тик дайджеста. */
const MORNING = new Date('2026-09-07T05:00:00Z');

describe('AiAnalyticsPushScheduler', () => {
    it('тики ежечасные на минуте слота: повестка :30 (пн 08:30 локально), дайджест :00 (08:00 локально)', () => {
        expect(AI_ANALYTICS_PUSH_CRON.AGENDA).toBe('30 * * * *');
        expect(AI_ANALYTICS_PUSH_CRON.DIGEST).toBe('0 * * * *');
        expect(AI_ANALYTICS_PUSH_SLOTS).toEqual({
            agenda: { hour: 8, minute: 30, weekday: 1 },
            digest: { hour: 8, minute: 0 },
            digest_all: { hour: 8, minute: 0 },
        });
        expect(AI_ANALYTICS_PUSH_SLOTS.agenda).toBe(
            AI_ANALYTICS_LOCAL_HOURS.AGENDA,
        );
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

    it('повестка идёт только в локальный понедельник 08:30: во вторник и в другой час джоб нет', async () => {
        const { scheduler, dispatcher } = makeScheduler({
            'on.bitrix24.ru': { enabled: true },
        });
        // Вторник 08.09 08:30 МСК.
        expect(
            await scheduler.dispatchAll(
                'agenda',
                new Date('2026-09-08T05:30:00Z'),
            ),
        ).toEqual([]);
        // Понедельник, но 05:30 МСК.
        expect(
            await scheduler.dispatchAll(
                'agenda',
                new Date('2026-09-07T02:30:00Z'),
            ),
        ).toEqual([]);
        expect(dispatcher.dispatch).not.toHaveBeenCalled();
    });

    it('дайджест: нужен и ai_analytics_digest_enabled; два портала в разных поясах получают джобы в разные часы UTC', async () => {
        const { scheduler, dispatcher } = makeScheduler({
            'msk.bitrix24.ru': { enabled: true, digestEnabled: true },
            'vl.bitrix24.ru': {
                enabled: true,
                digestEnabled: true,
                timeZone: 'Asia/Vladivostok',
            },
            'nodigest.bitrix24.ru': { enabled: true, digestEnabled: false },
        });
        // 06.09 22:00 UTC: во Владивостоке (UTC+10) уже 07.09 08:00, в Москве 01:00.
        expect(
            await scheduler.dispatchAll(
                'digest',
                new Date('2026-09-06T22:00:00Z'),
            ),
        ).toEqual(['ai-analytics:push:digest:vl.bitrix24.ru:2026-09-07']);
        // 07.09 05:00 UTC: в Москве 08:00, во Владивостоке уже 15:00.
        expect(await scheduler.dispatchAll('digest', MORNING)).toEqual([
            'ai-analytics:push:digest:msk.bitrix24.ru:2026-09-07',
        ]);
        expect(dispatcher.dispatch).toHaveBeenCalledTimes(2);
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
        expect(await scheduler.dispatchAll('digest_all', MORNING)).toEqual([
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

    it('утренний тик ставит и личный, и сводный дайджест (время тика — часы контейнера)', async () => {
        jest.useFakeTimers({ now: MORNING });
        try {
            const { scheduler, dispatcher } = makeScheduler({
                'both.bitrix24.ru': {
                    enabled: true,
                    digestEnabled: true,
                    digestAllUserIds: [447],
                },
            });
            await scheduler.tickDigest();
            const kinds = dispatcher.dispatch.mock.calls.map(
                ([, , data]) => data.kind,
            );
            expect(kinds).toEqual(['digest', 'digest_all']);
        } finally {
            jest.useRealTimers();
        }
    });

    it('повторный тик того же часа даёт тот же jobId (дедуп Bull), следующий час — 0 новых джоб', async () => {
        const { scheduler, dispatcher } = makeScheduler({
            'on.bitrix24.ru': { enabled: true },
        });
        const first = await scheduler.dispatchAll('agenda', NOW);
        const second = await scheduler.dispatchAll(
            'agenda',
            new Date(NOW.getTime() + 60_000),
        );
        expect(second).toEqual(first);
        expect(dispatcher.dispatch.mock.calls[0][3]).toBe(
            dispatcher.dispatch.mock.calls[1][3],
        );
        // Следующий тик :30 — уже 09:30 МСК, слот прошёл.
        expect(
            await scheduler.dispatchAll(
                'agenda',
                new Date(NOW.getTime() + 3_600_000),
            ),
        ).toEqual([]);
        expect(dispatcher.dispatch).toHaveBeenCalledTimes(2);
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
        expect(await failing.dispatchAll('digest', MORNING)).toEqual([]);
    });
});
