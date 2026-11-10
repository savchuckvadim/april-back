import {
    EnumPortalAppCode,
    PortalAppSettingsRecord,
} from '@lib/portal-lib/store/app-settings';
import { PortalAiSettingsWithDomain } from '@lib/portal-lib/store/ai-settings/portal-ai-settings.types';
import {
    buildEventSalesCronRoster,
    EVENT_SALES_DESCRIBED_CRONS,
} from '../event-sales-cron-roster';
import { EventSalesCronRosterService } from '../event-sales-cron-roster.service';

const row = (
    domain: string,
    settings: Record<string, unknown>,
): PortalAppSettingsRecord => ({
    portalId: 1,
    domain,
    appCode: EnumPortalAppCode.eventSales,
    settings,
    updatedAt: null,
});

type AiFlags = Partial<
    Pick<
        PortalAiSettingsWithDomain,
        | 'enabled'
        | 'weeklyReportEnabled'
        | 'revisorEnabled'
        | 'presentationAuditEnabled'
        | 'deepAnalysisEnabled'
    >
>;

const aiPortal = (domain: string, flags: AiFlags): PortalAiSettingsWithDomain =>
    ({
        portalId: 1,
        domain,
        enabled: true,
        weeklyReportEnabled: null,
        revisorEnabled: null,
        presentationAuditEnabled: null,
        deepAnalysisEnabled: null,
        ...flags,
    }) as PortalAiSettingsWithDomain;

const GARANT = 'garant.bitrix24.ru';
const GSR = 'gsr.bitrix24.ru';

/** Все кроны, которые Nest регистрирует в event-sales, включая библиотечные. */
const EVENT_SALES_CRONS = [
    'app-cache-purge',
    'call-report-analytics-snapshot',
    'call-report-catch-up',
    'call-report-facts-catchup-nightly',
    'call-report-scan',
    'call-report-smart-backfill',
    'call-report-weekly',
    'call-revision',
    'event-sales-deal-audit',
    'event-sales-duplicate-report',
    'lead-intake-rescue',
    'lead-request-sla',
    'presentation-audit',
    'reject-revive',
    'tmc-approval-rescue',
    'xo-dispatch-rescue',
];

describe('buildEventSalesCronRoster', () => {
    const rows = [
        row(GSR, {
            xo_rescue_enabled: true,
            xo_rescue_orphan_enabled: true,
            xo_rescue_orphan_dry_run: false,
            tmc_approval_rescue_enabled: true,
            tmc_approval_rescue_dry_run: true,
            duplicate_report_enabled: true,
            duplicate_report_count_only: false,
        }),
        row(GARANT, {
            xo_rescue_enabled: true,
            xo_rescue_orphan_enabled: true,
            deal_audit_enabled: true,
            lead_intake_sla_enabled: false,
        }),
    ];
    const aiPortals = [
        aiPortal(GSR, {}),
        aiPortal(GARANT, {
            weeklyReportEnabled: true,
            presentationAuditEnabled: true,
        }),
    ];
    const roster = buildEventSalesCronRoster(rows, aiPortals);

    it('подстраховка ХО: порталы по флагу, пометка про поиск по дате звонка и его холостой ход', () => {
        expect(roster.get('xo-dispatch-rescue')).toEqual({
            purpose: 'подстраховка ХО: дожим компаний и сделок, где хук упал',
            portals: [
                { domain: GARANT, note: 'по дате звонка — только в лог' },
                { domain: GSR, note: 'и по дате звонка' },
            ],
        });
    });

    it('выключенный и незаданный флаг — портала нет в списке', () => {
        expect(roster.get('lead-request-sla')?.portals).toEqual([]);
        expect(roster.get('lead-intake-rescue')?.portals).toEqual([]);
        expect(roster.get('reject-revive')?.portals).toEqual([]);
    });

    it('холостой ход и «только считать» — пометки по своим флагам с дефолтами кода', () => {
        expect(roster.get('tmc-approval-rescue')?.portals).toEqual([
            { domain: GSR, note: 'холостой ход' },
        ]);
        // deal_audit_dry_run не задан — дефолт кода true
        expect(roster.get('event-sales-deal-audit')?.portals).toEqual([
            { domain: GARANT, note: 'только считать' },
        ]);
        expect(roster.get('event-sales-duplicate-report')?.portals).toEqual([
            { domain: GSR },
        ]);
    });

    it('кроны AI-конвейера: все включённые порталы, свои тумблеры у недельного отчёта и ревизора', () => {
        expect(roster.get('call-report-scan')?.portals).toEqual([
            { domain: GARANT },
            { domain: GSR },
        ]);
        expect(roster.get('call-report-catch-up')?.portals).toHaveLength(2);
        expect(roster.get('call-report-smart-backfill')?.portals).toHaveLength(
            2,
        );
        expect(
            roster.get('call-report-analytics-snapshot')?.portals,
        ).toHaveLength(2);
        expect(roster.get('call-report-weekly')?.portals).toEqual([
            { domain: GARANT },
        ]);
        expect(roster.get('call-revision')?.portals).toEqual([]);
    });

    it('утренняя сверка: пометка, что именно сверяется на портале', () => {
        expect(roster.get('presentation-audit')?.portals).toEqual([
            { domain: GARANT, note: 'презентации, причины отказа' },
            { domain: GSR, note: 'причины отказа' },
        ]);
    });

    it('чистка кэша — крон библиотеки без привязки к порталам', () => {
        expect(roster.get('app-cache-purge')).toEqual({
            purpose: 'чистка протухшего кэша приложения, раз в час',
            portals: null,
        });
    });

    it('портал AI-конвейера с enabled=false в список не попадает', () => {
        const result = buildEventSalesCronRoster(
            [],
            [aiPortal(GSR, { enabled: false })],
        );

        expect(result.get('call-report-scan')?.portals).toEqual([]);
    });

    it('описаны ровно те кроны, что зарегистрированы в event-sales', () => {
        expect([...EVENT_SALES_DESCRIBED_CRONS].sort()).toEqual(
            EVENT_SALES_CRONS,
        );
        expect([...roster.keys()].sort()).toEqual(EVENT_SALES_CRONS);
    });
});

describe('EventSalesCronRosterService', () => {
    it('читает настройки приложения и порталы AI-конвейера и собирает сведения', async () => {
        const listByAppCode = jest
            .fn()
            .mockResolvedValue([row(GSR, { xo_rescue_enabled: true })]);
        const findEnabled = jest.fn().mockResolvedValue([aiPortal(GARANT, {})]);
        const service = new EventSalesCronRosterService(
            { listByAppCode } as never,
            { findEnabled } as never,
        );

        const roster = await service.resolve();

        expect(listByAppCode).toHaveBeenCalledWith(
            EnumPortalAppCode.eventSales,
        );
        expect(roster.get('xo-dispatch-rescue')?.portals).toEqual([
            { domain: GSR },
        ]);
        expect(roster.get('call-report-scan')?.portals).toEqual([
            { domain: GARANT },
        ]);
    });

    it('ошибка чтения не глотается — её покажет общий отчёт', async () => {
        const service = new EventSalesCronRosterService(
            {
                listByAppCode: () => Promise.reject(new Error('нет БД')),
            } as never,
            { findEnabled: () => Promise.resolve([]) } as never,
        );

        await expect(service.resolve()).rejects.toThrow('нет БД');
    });
});
