import { AI_ANALYTICS_SNAPSHOT_TYPE } from '@lib/sales-ai-analytics';
import {
    EMPTY_PORTAL_AI_SETTINGS,
    type PortalAiSettingsRecord,
} from '@lib/portal-lib/store/ai-settings/portal-ai-settings.types';
import {
    SettingsLoader,
    toCallReportStatus,
    type AiCallReportStatus,
} from '../domain/loaders/settings.loader';
import { buildOverviewReadiness } from '../domain/presenter/overview-phase2.presenter';
import {
    SettingsUseCase,
    toCallReportDto,
} from '../domain/use-cases/settings.use-case';
import type {
    AiAnalyticsSnapshotRecord,
    AiAnalyticsSnapshotStore,
} from '../store/ai-analytics-snapshot.store';
import {
    callsLoaderWith,
    liteRow,
    settingsLoaderWith,
} from './fixtures/lite-row.fixture';
import { overviewSources } from './fixtures/overview.fixture';
import { hasCallDate } from '../domain/loaders/lite-row.mapper';

/**
 * settings/get объясняет вкладку «что настроить, а что ждать»: статус
 * конвейера разбора (пилот на одном сотруднике — не поломка) и источник
 * σ_llm в готовности — той же функцией, что у обзора.
 */
const DOMAIN = 'april.bitrix24.ru';
const NOW = new Date('2026-09-26T09:00:00Z');

const record = (
    overrides: Partial<PortalAiSettingsRecord> = {},
): PortalAiSettingsRecord => ({ ...EMPTY_PORTAL_AI_SETTINGS, ...overrides });

/** kpiSales-настройки: всё пусто, аналитика включена. */
const appSettings = {
    resolve: jest.fn().mockResolvedValue({
        aiAnalyticsEnabled: true,
        aiAnalyticsAuditEnabled: false,
        aiAnalyticsAlertsEnabled: false,
        aiAnalyticsDigestEnabled: false,
        aiAnalyticsRopUserIds: '',
        aiAnalyticsCalendar: '',
        aiAnalyticsSelfViewEnabled: false,
        aiAnalyticsDailyPlanEnabled: false,
        aiAnalyticsDigestAllUserIds: '',
        aiAnalyticsPoolOptIn: false,
        aiAnalyticsPoolConsentAt: '',
        aiAnalyticsExperimentsEnabled: false,
        aiAnalyticsLevels: '',
        aiAnalyticsTargets: '',
        aiAnalyticsAbsences: '',
        aiAnalyticsModelParams: '',
        aiAnalyticsManagerParams: '',
        aiAnalyticsDefinitions: '',
        aiAnalyticsEvents: '',
        aiAnalyticsScoring: '',
        aiAnalyticsHypothesis: '',
        aiAnalyticsRosterConfirmedAt: '',
    }),
};

const loaderWith = (getByDomain: jest.Mock): SettingsLoader =>
    new SettingsLoader(appSettings as never, { getByDomain } as never);

describe('toCallReportStatus', () => {
    it('пилотный список — как есть; флаги и порог из записи', () => {
        expect(
            toCallReportStatus(
                record({
                    enabled: true,
                    allowedUserIds: [512],
                    salesOnly: false,
                    minDurationSec: 60,
                }),
            ),
        ).toEqual({
            enabled: true,
            pilotUserIds: [512],
            salesOnly: false,
            minDurationSec: 60,
        });
    });

    it('пустой список пилота — ограничения нет (null), как у конвейера', () => {
        const status = toCallReportStatus(
            record({ enabled: true, allowedUserIds: [] }),
        );

        expect(status.pilotUserIds).toBeNull();
    });

    it('записи нет — портал не включали: enabled false, остальное null', () => {
        expect(toCallReportStatus(null)).toEqual({
            enabled: false,
            pilotUserIds: null,
            salesOnly: null,
            minDurationSec: null,
        });
        expect(toCallReportStatus(record()).enabled).toBe(false);
    });
});

describe('SettingsLoader: статус конвейера разбора', () => {
    it('одна запись portal_ai_settings даёт и порог, и callReport', async () => {
        const getByDomain = jest.fn().mockResolvedValue(
            record({
                enabled: true,
                allowedUserIds: [7],
                minDurationSec: 45,
            }),
        );

        const settings = await loaderWith(getByDomain).load(DOMAIN);

        expect(getByDomain).toHaveBeenCalledTimes(1);
        expect(settings.legacyMinDurationSec).toBe(45);
        expect(settings.callReport).toEqual({
            enabled: true,
            pilotUserIds: [7],
            salesOnly: null,
            minDurationSec: 45,
        });
    });

    it('записи нет — callReport «выключено», а не пусто', async () => {
        const settings = await loaderWith(
            jest.fn().mockResolvedValue(null),
        ).load(DOMAIN);

        expect(settings.callReport?.enabled).toBe(false);
    });

    it('чтение упало или сервиса нет — статус неизвестен (поля нет)', async () => {
        const failed = await loaderWith(
            jest.fn().mockRejectedValue(new Error('db down')),
        ).load(DOMAIN);
        const detached = await new SettingsLoader(appSettings as never).load(
            DOMAIN,
        );

        expect(failed.callReport).toBeUndefined();
        expect(failed.legacyMinDurationSec).toBeNull();
        expect(detached.callReport).toBeUndefined();
    });
});

/** Отчёт согласия (П7) в `ais`: источник σ_llm для готовности. */
function goldenRecord(source: string): AiAnalyticsSnapshotRecord {
    return {
        id: 'ais-golden',
        domain: DOMAIN,
        type: AI_ANALYTICS_SNAPSHOT_TYPE.goldenReport,
        periodKey: '2026-09',
        managerId: null,
        calcVersion: 'v1',
        paramsVersion: 'pv-1',
        inputsHash: 'h',
        generatedAt: '2026-09-20T01:00:00Z',
        createdAt: new Date('2026-09-20T01:00:00Z'),
        status: 'done',
        payload: { sigmaLlm: { value: 0.9, source, measured: 0.9, n: 300 } },
    };
}

function storeWith(golden: AiAnalyticsSnapshotRecord | null) {
    return {
        findByKeys: jest.fn().mockResolvedValue([]),
        latest: jest.fn((_domain: string, type: string) =>
            Promise.resolve(
                type === AI_ANALYTICS_SNAPSHOT_TYPE.goldenReport
                    ? golden
                    : null,
            ),
        ),
    } as unknown as AiAnalyticsSnapshotStore;
}

const rows = [
    liteRow({
        transcriptionId: 'p1',
        callStartedAt: new Date('2026-09-20T08:00:00Z'),
    }),
];

describe('SettingsUseCase: callReport и σ_llm', () => {
    const pilot: AiCallReportStatus = {
        enabled: true,
        pilotUserIds: [512],
        salesOnly: true,
        minDurationSec: null,
    };

    it('callReport уходит в DTO, id пилота строками', async () => {
        const dto = await new SettingsUseCase(
            callsLoaderWith(rows).loader,
            settingsLoaderWith({ callReport: pilot }),
            storeWith(null),
        ).execute(DOMAIN, { now: NOW });

        expect(dto.callReport).toEqual({
            enabled: true,
            pilotUserIds: ['512'],
            salesOnly: true,
            minDurationSec: null,
        });
        expect(
            toCallReportDto({ ...pilot, pilotUserIds: null }).pilotUserIds,
        ).toBeNull();
    });

    it('статус не прочитан — поля callReport нет', async () => {
        const dto = await new SettingsUseCase(
            callsLoaderWith(rows).loader,
            settingsLoaderWith(),
            storeWith(null),
        ).execute(DOMAIN, { now: NOW });

        expect(dto).not.toHaveProperty('callReport');
    });

    it('отчёт согласия есть — готовность получает sigmaLlmSource, как обзор', async () => {
        const golden = goldenRecord('measured');
        const dto = await new SettingsUseCase(
            callsLoaderWith(rows).loader,
            settingsLoaderWith(),
            storeWith(golden),
        ).execute(DOMAIN, { now: NOW });
        const overview = buildOverviewReadiness(
            overviewSources(rows.filter(hasCallDate), [10], {
                snapshots: {
                    goldenReport: golden.payload as { sigmaLlm: unknown },
                },
            }),
            NOW,
        );

        expect(dto.readiness.sigmaLlmSource).toBe('measured');
        expect(dto.readiness.sigmaLlmSource).toBe(overview.sigmaLlmSource);
    });

    it('отчёта нет или форма чужая — поля sigmaLlmSource нет', async () => {
        const none = await new SettingsUseCase(
            callsLoaderWith(rows).loader,
            settingsLoaderWith(),
            storeWith(null),
        ).execute(DOMAIN, { now: NOW });
        const alien = await new SettingsUseCase(
            callsLoaderWith(rows).loader,
            settingsLoaderWith(),
            storeWith(goldenRecord('guess')),
        ).execute(DOMAIN, { now: NOW });

        expect(none.readiness).not.toHaveProperty('sigmaLlmSource');
        expect(alien.readiness).not.toHaveProperty('sigmaLlmSource');
    });
});
