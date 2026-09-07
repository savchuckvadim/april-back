import { AnalyticsCallLiteRow, AnalyticsLiteDataset } from '@lib/call-lib';
import { CallsLoader } from '../../domain/loaders/calls.loader';
import {
    AiAnalyticsPortalSettings,
    SettingsLoader,
} from '../../domain/loaders/settings.loader';
import { DEFAULT_WORK_CALENDAR } from '@lib/sales-ai-analytics';

/** Lite-строка звонка с разбором; переопределяй нужные поля. */
export function liteRow(
    overrides: Partial<AnalyticsCallLiteRow> & { transcriptionId: string },
): AnalyticsCallLiteRow {
    return {
        managerId: '10',
        callStartedAt: new Date('2026-09-02T08:00:00Z'),
        durationSec: 600,
        callType: 'presentation',
        analysisPresent: true,
        score: 70,
        nextStep: { set: true, date: '2026-09-10' },
        riskFlags: [],
        coachingPriority: 'none',
        sections: [],
        objections: [],
        versions: null,
        ...overrides,
    };
}

/** Мок loadLite call-lib (as never) внутри CallsLoader + jest.Mock для проверки окна. */
export function callsLoaderWith(rows: AnalyticsCallLiteRow[]): {
    loader: CallsLoader;
    loadLite: jest.Mock;
} {
    const dataset: AnalyticsLiteDataset = {
        rows,
        totalCalls: rows.length,
        skippedNoManager: 0,
    };
    const loadLite = jest.fn().mockResolvedValue(dataset);
    return { loader: new CallsLoader({ loadLite } as never), loadLite };
}

/** Настройки портала целиком, всё выключено; переопределяй нужные поля. */
export function portalSettings(
    overrides: Partial<AiAnalyticsPortalSettings> = {},
): AiAnalyticsPortalSettings {
    return {
        enabled: true,
        auditEnabled: false,
        alertsEnabled: false,
        digestEnabled: false,
        ropUserIds: [],
        calendar: { ...DEFAULT_WORK_CALENDAR, holidays: [] },
        selfViewEnabled: false,
        dailyPlanEnabled: false,
        digestAllUserIds: [],
        poolOptIn: false,
        poolConsentAt: null,
        experimentsEnabled: false,
        ...overrides,
    };
}

/** Мок SettingsLoader с дефолтным календарём (Europe/Moscow, пн–пт). */
export function settingsLoaderWith(
    overrides: Partial<AiAnalyticsPortalSettings> & {
        holidays?: string[];
    } = {},
): SettingsLoader {
    const { holidays, ...settings } = overrides;
    const load = jest.fn().mockResolvedValue(
        portalSettings({
            ...settings,
            calendar: {
                ...DEFAULT_WORK_CALENDAR,
                ...settings.calendar,
                holidays: holidays ?? settings.calendar?.holidays ?? [],
            },
        }),
    );
    return { load } as never;
}
