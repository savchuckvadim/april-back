import {
    AiAnalyticsAuditScheduler,
    buildSnapshotJobId,
} from '../cron/ai-analytics-audit.scheduler';
import {
    AI_ANALYTICS_AUDIT_CRON,
    AI_ANALYTICS_LOCAL_HOURS,
} from '../constants/ai-cron.const';
import { AiAnalyticsPortalsLoader } from '../domain/loaders/portals.loader';
import { DEFAULT_WORK_CALENDAR } from '@lib/sales-ai-analytics';

interface PortalFlags {
    enabled?: boolean;
    auditEnabled?: boolean;
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
                auditEnabled: flags.auditEnabled ?? false,
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
    const dispatcher = { dispatch: jest.fn().mockResolvedValue({ id: 'x' }) };
    return {
        scheduler: new AiAnalyticsAuditScheduler(
            new AiAnalyticsPortalsLoader(appSettings as never),
            settings as never,
            dispatcher as never,
        ),
        dispatcher,
    };
}

/** 1 сентября 2026 01:10 UTC = 04:10 МСК. */
const NOW = new Date('2026-09-01T01:10:00Z');

describe('AiAnalyticsAuditScheduler — месячный снапшот аудита', () => {
    it('тик ежечасный на :10, слот — 1-го числа 04:10 локально', () => {
        expect(AI_ANALYTICS_AUDIT_CRON).toBe('10 * * * *');
        expect(AI_ANALYTICS_LOCAL_HOURS.AUDIT).toEqual({
            hour: 4,
            minute: 10,
            dayOfMonth: 1,
        });
    });

    it('ставит джобу только порталам с признаком ai_analytics_audit_enabled', async () => {
        const { scheduler, dispatcher } = makeScheduler({
            'audit.bitrix24.ru': { enabled: true, auditEnabled: true },
            'noaudit.bitrix24.ru': { enabled: true, auditEnabled: false },
            'onlyaudit.bitrix24.ru': { enabled: false, auditEnabled: true },
        });
        const jobIds = await scheduler.dispatchAll(NOW);
        expect(jobIds).toEqual([
            'ai-analytics:snapshot:audit:audit.bitrix24.ru:2026-09',
            'ai-analytics:snapshot:audit:onlyaudit.bitrix24.ru:2026-09',
        ]);
        expect(dispatcher.dispatch).toHaveBeenCalledTimes(2);
        expect(dispatcher.dispatch).toHaveBeenCalledWith(
            'sales-kpi-report',
            'sales-ai-analytics-snapshot',
            { domain: 'audit.bitrix24.ru', kind: 'audit', monthKey: '2026-09' },
            'ai-analytics:snapshot:audit:audit.bitrix24.ru:2026-09',
            expect.objectContaining({ attempts: 1 }),
        );
    });

    it('jobId детерминирован по домену и месяцу в TZ портала', () => {
        expect(buildSnapshotJobId('audit', 'd.bitrix24.ru', '2026-09')).toBe(
            'ai-analytics:snapshot:audit:d.bitrix24.ru:2026-09',
        );
    });

    it('два портала в разных поясах: аудит 1-го 04:10 по своим часам, месяц — по дате портала', async () => {
        const { scheduler, dispatcher } = makeScheduler({
            'msk.bitrix24.ru': { auditEnabled: true },
            'nsk.bitrix24.ru': {
                auditEnabled: true,
                timeZone: 'Asia/Novosibirsk',
            },
        });
        // 31.08 21:10Z: в Новосибирске (UTC+7) 01.09 04:10, в Москве 01.09 00:10.
        expect(
            await scheduler.dispatchAll(new Date('2026-08-31T21:10:00Z')),
        ).toEqual(['ai-analytics:snapshot:audit:nsk.bitrix24.ru:2026-09']);
        // 01.09 01:10Z: в Москве 04:10, в Новосибирске 08:10 — слот прошёл.
        expect(await scheduler.dispatchAll(NOW)).toEqual([
            'ai-analytics:snapshot:audit:msk.bitrix24.ru:2026-09',
        ]);
        // 2-е число в тот же час — не аудит.
        expect(
            await scheduler.dispatchAll(new Date('2026-09-02T01:10:00Z')),
        ).toEqual([]);
        expect(dispatcher.dispatch).toHaveBeenCalledTimes(2);
    });

    it('ошибка настроек одного портала не прерывает обход', async () => {
        const { scheduler, dispatcher } = makeScheduler({
            'ok.bitrix24.ru': { auditEnabled: true },
        });
        // второй домен приходит из списка, но настроек нет → reject
        (
            scheduler as unknown as {
                portals: { listDomains: () => Promise<string[]> };
            }
        ).portals.listDomains = () =>
            Promise.resolve(['broken.bitrix24.ru', 'ok.bitrix24.ru']);
        const jobIds = await scheduler.dispatchAll(NOW);
        expect(jobIds).toEqual([
            'ai-analytics:snapshot:audit:ok.bitrix24.ru:2026-09',
        ]);
        expect(dispatcher.dispatch).toHaveBeenCalledTimes(1);
    });
});
