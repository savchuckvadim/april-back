import { AnalyticsCallLiteRow, AnalyticsLiteDataset } from '@lib/call-lib';
import { CallsLoader } from '../../domain/loaders/calls.loader';
import { SettingsLoader } from '../../domain/loaders/settings.loader';
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

/** Мок SettingsLoader с дефолтным календарём (Europe/Moscow, пн–пт). */
export function settingsLoaderWith(
    overrides: Partial<{
        enabled: boolean;
        auditEnabled: boolean;
        alertsEnabled: boolean;
        digestEnabled: boolean;
        ropUserIds: number[];
        holidays: string[];
    }> = {},
): SettingsLoader {
    const load = jest.fn().mockResolvedValue({
        enabled: overrides.enabled ?? true,
        auditEnabled: overrides.auditEnabled ?? false,
        alertsEnabled: overrides.alertsEnabled ?? false,
        digestEnabled: overrides.digestEnabled ?? false,
        ropUserIds: overrides.ropUserIds ?? [],
        calendar: {
            ...DEFAULT_WORK_CALENDAR,
            holidays: overrides.holidays ?? [],
        },
    });
    return { load } as never;
}
