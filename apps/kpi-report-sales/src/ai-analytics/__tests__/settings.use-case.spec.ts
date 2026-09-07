import { CALL_REPORT_CALL_TYPE_CODES } from '@lib/portal-lib/pbx/pbx-aicall-smart';
import { AnalyticsCallLiteRow } from '@lib/call-lib';
import {
    buildReadiness,
    READINESS_REASONS,
    resolveComparableFrom,
} from '../domain/presenter/readiness.util';
import {
    buildCallTypes,
    SettingsUseCase,
} from '../domain/use-cases/settings.use-case';
import { hasCallDate } from '../domain/loaders/lite-row.mapper';
import {
    callsLoaderWith,
    liteRow,
    settingsLoaderWith,
} from './fixtures/lite-row.fixture';

const NOW = new Date('2026-09-05T09:00:00Z');
const DAY = 86_400_000;

function presentations(count: number, daysAgo: number): AnalyticsCallLiteRow[] {
    return Array.from({ length: count }, (_, index) =>
        liteRow({
            transcriptionId: `p${daysAgo}-${index}`,
            callType: 'presentation',
            callStartedAt: new Date(NOW.getTime() - daysAgo * DAY),
            versions: {
                prompt: 'focus-v2.1-2026-09-05',
                rubric: 'sections-7-v1',
            },
        }),
    );
}

describe('SettingsUseCase', () => {
    it('собирает флаги, pipelineEnabled по 30 дням, готовность, типы звонков, РОПов', async () => {
        const rows = [...presentations(30, 10), ...presentations(40, 100)];
        const { loader, loadLite } = callsLoaderWith(rows);
        const useCase = new SettingsUseCase(
            loader,
            settingsLoaderWith({
                enabled: true,
                alertsEnabled: true,
                auditEnabled: true,
                ropUserIds: [447],
                selfViewEnabled: true,
                digestAllUserIds: [447, 512],
                poolOptIn: true,
                poolConsentAt: '2026-09-07',
            }),
        );

        const dto = await useCase.execute('d', { now: NOW });

        expect(dto.selfViewEnabled).toBe(true);
        expect(dto.dailyPlanEnabled).toBe(false);
        expect(dto.digestAllUserIds).toEqual(['447', '512']);
        expect(dto.poolOptIn).toBe(true);
        expect(dto.poolConsentAt).toBe('2026-09-07');
        expect(dto.experimentsEnabled).toBe(false);

        expect(loadLite).toHaveBeenCalledWith(
            expect.objectContaining({
                from: new Date(NOW.getTime() - 120 * DAY).toISOString(),
                to: NOW.toISOString(),
            }),
        );
        expect(dto.enabled).toBe(true);
        expect(dto.alertsEnabled).toBe(true);
        expect(dto.auditEnabled).toBe(true);
        expect(dto.digestEnabled).toBe(false);
        expect(dto.pipelineEnabled).toBe(true);
        expect(dto.ropUserIds).toEqual([447]);
        expect(dto.comparableFrom).toBe('2026-09-05');
        expect(dto.readiness).toEqual({
            mode: 'descriptive',
            historyMonths: 3,
            presentations: 70,
            sales: 0,
            comparableFrom: '2026-09-05',
            reasons: [READINESS_REASONS.salesNotComputed],
        });
        expect(dto.callTypes.map(type => type.code)).toEqual([
            ...CALL_REPORT_CALL_TYPE_CODES,
        ]);
        expect(dto.callTypes[0]).toEqual({
            code: 'cold',
            title: 'Холодный выход на ЛПР',
            tone: 'event-cold',
            bucket: 'contact',
            kpiPrimaryEventTypeCode: 'xo',
        });
    });

    it('нет разборов за 30 дней при включённой аналитике → kpi-only', async () => {
        const useCase = new SettingsUseCase(
            callsLoaderWith(presentations(5, 45)).loader,
            settingsLoaderWith({ enabled: true }),
        );
        const dto = await useCase.execute('d', { now: NOW });
        expect(dto.pipelineEnabled).toBe(false);
        expect(dto.readiness.mode).toBe('kpi-only');
        expect(dto.readiness.reasons[0]).toBe(READINESS_REASONS.kpiOnly);
    });

    it('мало истории или презентаций → calibration с причинами', () => {
        const rows = presentations(10, 20).filter(hasCallDate);
        const readiness = buildReadiness(rows, {
            now: NOW,
            enabled: false,
            pipelineEnabled: true,
        });
        expect(readiness.mode).toBe('calibration');
        expect(readiness.historyMonths).toBe(0);
        expect(readiness.presentations).toBe(10);
        expect(readiness.reasons).toEqual([
            READINESS_REASONS.historyShort,
            READINESS_REASONS.presentationsFew,
            READINESS_REASONS.salesNotComputed,
        ]);
    });

    it('comparableFrom — max по датам версий; без версий — пусто', () => {
        const rows = [
            liteRow({
                transcriptionId: '1',
                versions: { prompt: 'focus-v1-2026-08-01' },
            }),
            liteRow({
                transcriptionId: '2',
                versions: { attribution: '2026-08-24' },
            }),
            liteRow({ transcriptionId: '3', versions: null }),
        ].filter(hasCallDate);
        expect(resolveComparableFrom(rows)).toBe('2026-08-24');
        expect(resolveComparableFrom([])).toBe('');
        expect(buildCallTypes()).toHaveLength(
            CALL_REPORT_CALL_TYPE_CODES.length,
        );
    });
});
