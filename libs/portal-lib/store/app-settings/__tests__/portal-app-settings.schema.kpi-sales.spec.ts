import {
    EnumPortalAppCode,
    getPortalAppDefaults,
    getStoredAppSettingKeys,
    PORTAL_APP_SETTINGS_SCHEMA,
    PortalAppSettingDescriptor,
    PortalAppSettingType,
} from '../portal-app-settings.schema';
import { PortalAppSettingsRecord } from '../portal-app-settings.repository';
import { PortalAppSettingsService } from '../portal-app-settings.service';

/**
 * Ключи AI-аналитики ОП в реестре kpi-sales — контракт Фазы 1a (план
 * ai/tasks/ai-sales-analytics-plan.md, §9). Их читают контроллер витрины,
 * планировщик рассылок и алерты event-sales через
 * PortalAppSettingsService.resolve(domain, kpiSales): разошедшийся код,
 * тип или дефолт молча включил бы рассылки на всех порталах или спрятал
 * вкладку у тех, кто её включил.
 */

const APP = EnumPortalAppCode.kpiSales;
const DOMAIN = 'gsirk.bitrix24.ru';

/** Контракт: ключ схемы → snake_case-код в JSON, тип, дефолт кода. */
const CONTRACT: Record<
    string,
    { code: string; type: PortalAppSettingType; default: boolean | string }
> = {
    aiAnalyticsEnabled: {
        code: 'ai_analytics_enabled',
        type: 'boolean',
        default: false,
    },
    aiAnalyticsAuditEnabled: {
        code: 'ai_analytics_audit_enabled',
        type: 'boolean',
        default: false,
    },
    aiAnalyticsAlertsEnabled: {
        code: 'ai_analytics_alerts_enabled',
        type: 'boolean',
        default: false,
    },
    aiAnalyticsDigestEnabled: {
        code: 'ai_analytics_digest_enabled',
        type: 'boolean',
        default: false,
    },
    aiAnalyticsRopUserIds: {
        code: 'ai_analytics_rop_user_ids',
        type: 'string',
        default: '',
    },
    aiAnalyticsCalendar: {
        code: 'ai_analytics_calendar',
        type: 'string',
        default: '',
    },
    // Решения владельца 07.09.2026 (план §14.5).
    aiAnalyticsSelfViewEnabled: {
        code: 'ai_analytics_self_view_enabled',
        type: 'boolean',
        default: false,
    },
    aiAnalyticsDailyPlanEnabled: {
        code: 'ai_analytics_daily_plan_enabled',
        type: 'boolean',
        default: false,
    },
    aiAnalyticsDigestAllUserIds: {
        code: 'ai_analytics_digest_all_user_ids',
        type: 'string',
        default: '',
    },
    aiAnalyticsPoolOptIn: {
        code: 'ai_analytics_pool_opt_in',
        type: 'boolean',
        default: false,
    },
    aiAnalyticsPoolConsentAt: {
        code: 'ai_analytics_pool_consent_at',
        type: 'string',
        default: '',
    },
    aiAnalyticsExperimentsEnabled: {
        code: 'ai_analytics_experiments_enabled',
        type: 'boolean',
        default: false,
    },
};

const kpiSales: Record<string, PortalAppSettingDescriptor> =
    PORTAL_APP_SETTINGS_SCHEMA[APP];

/** Сервис на in-memory заглушках: без Redis-попаданий, одна строка БД. */
const makeService = (settings: Record<string, unknown> | null) => {
    const record: PortalAppSettingsRecord | null = settings
        ? {
              portalId: 1,
              domain: DOMAIN,
              appCode: APP,
              settings,
              updatedAt: null,
          }
        : null;
    const repository = {
        findByDomain: jest.fn(() => Promise.resolve(record)),
    };
    const client = {
        get: () => Promise.resolve(null),
        set: () => Promise.resolve('OK'),
        del: () => Promise.resolve(1),
    };
    return new PortalAppSettingsService(
        repository as never,
        {} as never,
        { getClient: () => client } as never,
    );
};

describe('PORTAL_APP_SETTINGS_SCHEMA[kpiSales]: ключи AI-аналитики ОП', () => {
    it('все ключи заведены с кодами и типами контракта, лишних нет', () => {
        expect(Object.keys(kpiSales).sort()).toEqual(
            Object.keys(CONTRACT).sort(),
        );
        for (const [key, expected] of Object.entries(CONTRACT)) {
            expect(`${key}:${kpiSales[key]?.code}`).toBe(
                `${key}:${expected.code}`,
            );
            expect(`${key}:${kpiSales[key]?.type}`).toBe(
                `${key}:${expected.type}`,
            );
        }
    });

    it('дефолты выключают всё: флаги false, списки id, календарь и дата согласия пустые', () => {
        const defaults: Record<string, unknown> = getPortalAppDefaults(APP);
        for (const [key, expected] of Object.entries(CONTRACT)) {
            expect(`${key}=${String(defaults[key])}`).toBe(
                `${key}=${String(expected.default)}`,
            );
        }
    });

    it('у каждого ключа русские название и описание; коды уникальны и snake_case', () => {
        const codes = Object.values(kpiSales).map(
            descriptor => descriptor.code,
        );
        expect(new Set(codes).size).toBe(codes.length);
        for (const [key, descriptor] of Object.entries(kpiSales)) {
            expect(`${key}:${descriptor.code}`).toMatch(
                /^[a-zA-Z]+:[a-z][a-z0-9_]*$/,
            );
            expect(`${key}:${descriptor.name.length > 0}`).toBe(`${key}:true`);
            expect(`${key}:${descriptor.description.length > 0}`).toBe(
                `${key}:true`,
            );
        }
    });

    it('resolve отдаёт дефолты, когда на портале ничего не задано', async () => {
        const values = await makeService(null).resolve(DOMAIN, APP);

        expect(values).toEqual(getPortalAppDefaults(APP));
        expect(values.aiAnalyticsEnabled).toBe(false);
        expect(values.aiAnalyticsAuditEnabled).toBe(false);
        expect(values.aiAnalyticsAlertsEnabled).toBe(false);
        expect(values.aiAnalyticsDigestEnabled).toBe(false);
        expect(values.aiAnalyticsRopUserIds).toBe('');
        expect(values.aiAnalyticsCalendar).toBe('');
        expect(values.aiAnalyticsSelfViewEnabled).toBe(false);
        expect(values.aiAnalyticsDailyPlanEnabled).toBe(false);
        expect(values.aiAnalyticsDigestAllUserIds).toBe('');
        expect(values.aiAnalyticsPoolOptIn).toBe(false);
        expect(values.aiAnalyticsPoolConsentAt).toBe('');
        expect(values.aiAnalyticsExperimentsEnabled).toBe(false);
    });

    it('resolve перекрывает дефолт сохранённым и держит остальные ключи дефолтными', async () => {
        const stored = {
            ai_analytics_enabled: true,
            ai_analytics_rop_user_ids: '1, 42',
            ai_analytics_digest_all_user_ids: '7',
            ai_analytics_self_view_enabled: true,
        };

        const values = await makeService(stored).resolve(DOMAIN, APP);

        expect(values.aiAnalyticsEnabled).toBe(true);
        expect(values.aiAnalyticsRopUserIds).toBe('1, 42');
        expect(values.aiAnalyticsAuditEnabled).toBe(false);
        expect(values.aiAnalyticsAlertsEnabled).toBe(false);
        expect(values.aiAnalyticsDigestEnabled).toBe(false);
        expect(values.aiAnalyticsCalendar).toBe('');
        expect(values.aiAnalyticsDigestAllUserIds).toBe('7');
        expect(values.aiAnalyticsSelfViewEnabled).toBe(true);
        expect(values.aiAnalyticsPoolOptIn).toBe(false);
        expect(getStoredAppSettingKeys(APP, stored).sort()).toEqual([
            'aiAnalyticsDigestAllUserIds',
            'aiAnalyticsEnabled',
            'aiAnalyticsRopUserIds',
            'aiAnalyticsSelfViewEnabled',
        ]);
    });
});
