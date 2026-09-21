import { CALL_REPORT_CALL_TYPE_CODES } from '@lib/portal-lib/pbx/pbx-aicall-smart';
import { AnalyticsCallLiteRow } from '@lib/call-lib';
import {
    AI_ANALYTICS_SNAPSHOT_TYPE,
    type SnapshotReadiness,
} from '@lib/sales-ai-analytics';
import type { PortalModelView } from '../domain/assembler/overview-model.types';
import { hasCallDate } from '../domain/loaders/lite-row.mapper';
import type { AiAnalyticsPortalSettings } from '../domain/loaders/settings.loader';
import { buildOverviewReadiness } from '../domain/presenter/overview-phase2.presenter';
import {
    buildReadiness,
    READINESS_REASONS,
    resolveComparableFrom,
} from '../domain/presenter/readiness.util';
import {
    buildCallTypes,
    SettingsUseCase,
} from '../domain/use-cases/settings.use-case';
import type {
    AiAnalyticsSnapshotRecord,
    AiAnalyticsSnapshotStore,
} from '../store/ai-analytics-snapshot.store';
import type { AiManagerLevelRecord } from '../store/ai-analytics-settings.store';
import {
    callsLoaderWith,
    liteRow,
    settingsLoaderWith,
} from './fixtures/lite-row.fixture';
import { portalModel } from './fixtures/norms.fixture';
import { overviewSources } from './fixtures/overview.fixture';

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

/** Запись модели портала в `ais`: окно готовности 12 месяцев. */
function modelRecord(
    readiness: Partial<SnapshotReadiness>,
): AiAnalyticsSnapshotRecord {
    return {
        id: 'ais-model',
        domain: 'd',
        type: AI_ANALYTICS_SNAPSHOT_TYPE.portalModel,
        periodKey: '2026-09',
        managerId: null,
        calcVersion: 'v1',
        paramsVersion: 'pv-1',
        inputsHash: 'h',
        generatedAt: '2026-09-05T01:00:00Z',
        createdAt: new Date('2026-09-05T01:00:00Z'),
        status: 'done',
        payload: portalModel({
            window: Array.from({ length: 12 }, (_, index) => `m-${index}`),
            readiness: {
                mode: 'norms',
                historyMonths: 6,
                presentations: 420,
                sales: 31,
                comparableFrom: '',
                reasons: [],
                ...readiness,
            },
        }),
    };
}

/** Стор снапшотов: модель портала по ключам периодов, остального нет. */
function storeWith(
    model: AiAnalyticsSnapshotRecord | null,
    options: { fail?: boolean } = {},
): AiAnalyticsSnapshotStore {
    const findByKeys = jest.fn((_domain: string, type: string) => {
        if (options.fail) return Promise.reject(new Error('ais недоступна'));
        return Promise.resolve(
            type === AI_ANALYTICS_SNAPSHOT_TYPE.portalModel && model
                ? [model]
                : [],
        );
    });
    const latest = jest.fn().mockResolvedValue(null);
    return { findByKeys, latest } as unknown as AiAnalyticsSnapshotStore;
}

const LEVELS: AiAnalyticsPortalSettings['levels'] = [
    { managerId: 10, level: 'middle', since: null, source: 'manual' },
    { managerId: 20, level: 'senior', since: null, source: 'manual' },
];

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
            storeWith(null),
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
        // Фаза 2: заглушки «продажи не считаются» больше нет; режим норм
        // требует ≥ 100 презентаций, подтверждённого состава и — кап §5.4
        // — снапшота модели портала (календарь дефолтный, без праздников).
        expect(dto.readiness).toEqual({
            mode: 'descriptive',
            historyMonths: 3,
            presentations: 70,
            sales: 0,
            comparableFrom: '2026-09-05',
            reasons: [
                READINESS_REASONS.normsPresentationsFew,
                READINESS_REASONS.calendarMissing,
                READINESS_REASONS.rosterNotConfirmed,
                READINESS_REASONS.modelMissing,
            ],
            betaSource: 'none',
            betaCountdown: null,
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
            storeWith(null),
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

/**
 * Долг 11 волны C: `/settings` и обзор считают готовность одним адаптером
 * с одной и той же моделью портала — на общей фикстуре режим и причины
 * совпадают, а без модели оба капятся на descriptive (§5.4).
 */
describe('SettingsUseCase: готовность совпадает с обзором', () => {
    const rows = presentations(30, 10);
    const calendar = {
        timeZone: 'Europe/Moscow',
        holidays: ['2026-01-01'],
        workweek: [1, 2, 3, 4, 5],
    };
    const settingsLoader = () =>
        settingsLoaderWith({
            enabled: true,
            calendar,
            levels: LEVELS,
            rosterConfirmedAt: '2026-09-01',
        });
    const overviewOf = (model: AiAnalyticsSnapshotRecord | null) =>
        buildOverviewReadiness(
            overviewSources(rows.filter(hasCallDate), [10, 20], {
                calendar,
                levels: new Map<number, AiManagerLevelRecord>(
                    LEVELS.map(level => [
                        level.managerId,
                        {
                            managerId: level.managerId,
                            level: level.level,
                            since: level.since,
                        },
                    ]),
                ),
                rosterConfirmedAt: '2026-09-01',
                snapshots: model
                    ? { model: model.payload as PortalModelView }
                    : {},
            }),
            NOW,
        );

    it('модель портала посчитана → у обоих norms по окну модели', async () => {
        const model = modelRecord({});
        const useCase = new SettingsUseCase(
            callsLoaderWith(rows).loader,
            settingsLoader(),
            storeWith(model),
        );

        const dto = await useCase.execute('d', { now: NOW });
        const overview = overviewOf(model);

        expect(dto.readiness.mode).toBe('norms');
        expect(dto.readiness.mode).toBe(overview.mode);
        expect(dto.readiness.reasons).toEqual(overview.reasons);
        expect(dto.readiness.historyMonths).toBe(6);
        expect(dto.readiness.presentations).toBe(420);
        // Продажи — окна модели (финансов у /settings нет).
        expect(dto.readiness.sales).toBe(31);
    });

    it('модели нет, период в калибровке → у обоих один режим и одни причины', async () => {
        const useCase = new SettingsUseCase(
            callsLoaderWith(rows).loader,
            settingsLoader(),
            storeWith(null),
        );

        const dto = await useCase.execute('d', { now: NOW });
        const overview = overviewOf(null);

        // Период сам по себе (месяц, 30 презентаций) — ещё калибровка:
        // кап ниже descriptive не виден, режимы и причины совпадают.
        expect(dto.readiness.mode).toBe(overview.mode);
        expect(dto.readiness.reasons).toEqual(overview.reasons);
        expect(dto.readiness.mode).toBe('calibration');
    });

    it('период прошёл гейты, модели нет → descriptive с no-portal-model', async () => {
        const ready = [...presentations(30, 10), ...presentations(80, 100)];
        const useCase = new SettingsUseCase(
            callsLoaderWith(ready).loader,
            settingsLoader(),
            storeWith(null),
        );

        const dto = await useCase.execute('d', { now: NOW });

        expect(dto.readiness.mode).toBe('descriptive');
        expect(dto.readiness.reasons).toEqual([READINESS_REASONS.modelMissing]);
    });

    it('ais недоступна — настройки не гаснут, готовность без модели', async () => {
        const useCase = new SettingsUseCase(
            callsLoaderWith(rows).loader,
            settingsLoader(),
            storeWith(null, { fail: true }),
        );

        const dto = await useCase.execute('d', { now: NOW });

        expect(dto.enabled).toBe(true);
        expect(dto.readiness.mode).toBe('calibration');
    });
});
