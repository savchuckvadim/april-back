import { findParam } from '@lib/sales-ai-analytics';
import { CALL_REPORT_CALL_TYPE_CODES } from '@lib/portal-lib/pbx/pbx-aicall-smart';
import { AI_MANAGER_LEVELS } from '@lib/sales-ai-analytics/settings/ai-settings.types';
import { AI_ANALYTICS_MANAGER_LEVELS } from '../constants/ai-overview.const';
import { SettingsLoader } from '../domain/loaders/settings.loader';
import { AiAnalyticsSettingsStore } from '../store/ai-analytics-settings.store';

const DOMAIN = 'april.bitrix24.ru';

/** Значения ключей kpiSales: заданные поверх пустых строк и флагов. */
function appSettingsWith(stored: Record<string, string> = {}): {
    resolve: jest.Mock;
} {
    const values = {
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
        ...stored,
    };
    return { resolve: jest.fn().mockResolvedValue(values) };
}

const loaderWith = (stored: Record<string, string> = {}): SettingsLoader =>
    new SettingsLoader(appSettingsWith(stored) as never);

describe('SettingsLoader: десять ключей Фазы 2', () => {
    it('пустые ключи дают дефолты кода, а не пустоту', async () => {
        const settings = await loaderWith().load(DOMAIN);

        expect(settings.levels).toEqual([]);
        expect(settings.absences).toEqual({});
        expect(settings.modelParams).toEqual({});
        expect(settings.managerParams).toEqual({});
        expect(settings.events).toEqual([]);
        expect(settings.scoring).toEqual({ caps: [], stopWords: [] });
        expect(settings.hypothesis).toBeNull();
        expect(settings.rosterConfirmedAt).toBe('');
        expect(settings.targets.byLevel.junior.presentationsMin).toBe(20);
        expect(settings.targets.byLevel.senior.presentationsMin).toBe(0);
        expect(settings.definitions.normStratum).toBe('tenure');
        expect(settings.definitions.hotStageCode).toBe('sales_in_progress');
    });

    it('порог длительности по умолчанию — 300 с на все типы из реестра', async () => {
        const settings = await loaderWith().load(DOMAIN);
        const fromRegistry = findParam(
            'min_duration_sec_by_type',
        )?.defaultValue;

        expect(fromRegistry).toBe(300);
        for (const type of CALL_REPORT_CALL_TYPE_CODES) {
            expect(
                `${type}=${settings.definitions.minDurationSecByType[type]}`,
            ).toBe(`${type}=${String(fromRegistry)}`);
        }
    });

    it('битый JSON любого ключа → дефолт без исключения', async () => {
        const broken = '{не json';
        const settings = await loaderWith({
            aiAnalyticsLevels: broken,
            aiAnalyticsTargets: broken,
            aiAnalyticsAbsences: broken,
            aiAnalyticsModelParams: broken,
            aiAnalyticsManagerParams: broken,
            aiAnalyticsDefinitions: broken,
            aiAnalyticsEvents: broken,
            aiAnalyticsScoring: broken,
            aiAnalyticsHypothesis: broken,
            aiAnalyticsRosterConfirmedAt: 'вчера',
        }).load(DOMAIN);

        expect(settings.levels).toEqual([]);
        expect(settings.targets.byLevel.junior.coldPerDay).toBe(40);
        expect(settings.definitions.productiveCall).toBe('kpi_done');
        expect(settings.scoring.caps).toEqual([]);
        expect(settings.hypothesis).toBeNull();
        expect(settings.rosterConfirmedAt).toBe('');
    });

    it('заданные ключи разбираются в блоки', async () => {
        const settings = await loaderWith({
            aiAnalyticsLevels:
                '[{"managerId":10,"level":"senior","since":"2025-03-01"}]',
            aiAnalyticsAbsences:
                '{"10":[{"from":"2026-07-01","to":"2026-07-14","kind":"vacation"}]}',
            aiAnalyticsModelParams: '{"forget_lambda":0.9,"unknown_code":1}',
            aiAnalyticsRosterConfirmedAt: '2026-09-07',
        }).load(DOMAIN);

        expect(settings.levels).toEqual([
            {
                managerId: 10,
                level: 'senior',
                since: '2025-03-01',
                source: 'manual',
            },
        ]);
        expect(settings.absences['10']).toHaveLength(1);
        expect(settings.modelParams).toEqual({ forget_lambda: 0.9 });
        expect(settings.rosterConfirmedAt).toBe('2026-09-07');
    });

    it('справочник уровней lib совпадает со справочником витрины', () => {
        expect([...AI_MANAGER_LEVELS]).toEqual([
            ...AI_ANALYTICS_MANAGER_LEVELS,
        ]);
    });
});

describe('AiAnalyticsSettingsStore.loadLevels: переезд на ключ схемы', () => {
    const legacy = {
        findByDomainTypeKeys: jest.fn().mockResolvedValue([
            {
                user_result: {
                    key: 'levels',
                    levels: [
                        { managerId: 77, level: 'middle', since: '2024-01-01' },
                    ],
                },
            },
        ]),
    };

    beforeEach(() => legacy.findByDomainTypeKeys.mockClear());

    it('непустой ключ схемы — снапшот ais не читается', async () => {
        const store = new AiAnalyticsSettingsStore(
            legacy as never,
            appSettingsWith({
                aiAnalyticsLevels:
                    '[{"managerId":10,"level":"senior","since":"2025-03-01"}]',
            }) as never,
            {} as never,
        );

        const levels = await store.loadLevels(DOMAIN);

        expect(levels.get(10)).toEqual({
            managerId: 10,
            level: 'senior',
            since: '2025-03-01',
        });
        expect(legacy.findByDomainTypeKeys).not.toHaveBeenCalled();
    });

    it('пустой ключ — одноразовый запасной путь на старый снапшот', async () => {
        const store = new AiAnalyticsSettingsStore(
            legacy as never,
            appSettingsWith() as never,
            {} as never,
        );

        const levels = await store.loadLevels(DOMAIN);

        expect(legacy.findByDomainTypeKeys).toHaveBeenCalledTimes(1);
        expect(levels.get(77)).toEqual({
            managerId: 77,
            level: 'middle',
            since: '2024-01-01',
        });
    });
});
