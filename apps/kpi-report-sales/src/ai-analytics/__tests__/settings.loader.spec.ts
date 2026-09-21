import { isMinDurationPortalDefined } from '@lib/sales-ai-analytics';
import { SettingsLoader } from '../domain/loaders/settings.loader';

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

// Долг 8 волны C (решение владельца А.1): признак «портал задал порог явно»
// считается по СЫРОМУ JSON — после парсера дефолт реестра неотличим от
// решения портала, и без признака «дефолт парсера» принимался бы за него.
describe('SettingsLoader: признак явного порога длительности', () => {
    it('пустые ключи — порог порталом не задан, хотя карта парсера заполнена', async () => {
        const settings = await loaderWith().load(DOMAIN);

        expect(settings.minDurationDefined).toBe(false);
        // Карта после парсера есть (дефолт реестра на все типы) — именно
        // поэтому по ней решение портала определить нельзя.
        expect(
            Object.keys(settings.definitions.minDurationSecByType).length,
        ).toBeGreaterThan(0);
    });

    it('ключ minDurationSecByType в definitions — задан', async () => {
        const settings = await loaderWith({
            aiAnalyticsDefinitions: JSON.stringify({
                minDurationSecByType: { cold: 60 },
            }),
        }).load(DOMAIN);

        expect(settings.minDurationDefined).toBe(true);
        expect(settings.definitions.minDurationSecByType.cold).toBe(60);
    });

    it('definitions ради другого поля — не задан (дефолт парсера не решение)', async () => {
        const settings = await loaderWith({
            aiAnalyticsDefinitions: JSON.stringify({
                hotClientColors: ['green'],
            }),
        }).load(DOMAIN);

        expect(settings.minDurationDefined).toBe(false);
    });

    it('код min_duration_sec_by_type в model_params — задан', async () => {
        const settings = await loaderWith({
            aiAnalyticsModelParams: JSON.stringify({
                min_duration_sec_by_type: 90,
            }),
        }).load(DOMAIN);

        expect(settings.minDurationDefined).toBe(true);
        expect(settings.modelParams.min_duration_sec_by_type).toBe(90);
    });

    it('битый JSON — не задан, загрузка не падает', async () => {
        const settings = await loaderWith({
            aiAnalyticsDefinitions: '{не json',
            aiAnalyticsModelParams: '{',
        }).load(DOMAIN);

        expect(settings.minDurationDefined).toBe(false);
    });

    it.each([
        ['', ''],
        [JSON.stringify({ minDurationSecByType: { cold: 60 } }), ''],
        ['', JSON.stringify({ min_duration_sec_by_type: 90 })],
        [
            JSON.stringify({ hotClientColors: ['green'] }),
            '{"forget_lambda":0.85}',
        ],
    ])(
        'признак совпадает с isMinDurationPortalDefined по тем же сырым строкам (%s | %s)',
        async (definitions, modelParams) => {
            const settings = await loaderWith({
                aiAnalyticsDefinitions: definitions,
                aiAnalyticsModelParams: modelParams,
            }).load(DOMAIN);

            expect(settings.minDurationDefined).toBe(
                isMinDurationPortalDefined({
                    aiAnalyticsDefinitions: definitions,
                    aiAnalyticsModelParams: modelParams,
                }),
            );
        },
    );
});

// Один порог у всех контуров (решение А.1): загрузчик читает прежний скаляр
// старой админки разбора как запасной источник — иначе портал, где пилот
// 60 с задан только там, считался бы витриной и ночным расчётом по 300.
describe('SettingsLoader: прежний скаляр порога из старой админки', () => {
    const withLegacy = (record: { minDurationSec: number | null } | null) =>
        new SettingsLoader(
            appSettingsWith() as never,
            {
                getByDomain: jest.fn().mockResolvedValue(record),
            } as never,
        );

    it('значение старой админки попадает в настройки', async () => {
        const settings = await withLegacy({ minDurationSec: 60 }).load(DOMAIN);
        expect(settings.legacyMinDurationSec).toBe(60);
    });

    it('записи нет или скаляр пуст — null; сервис не подключён — тоже null', async () => {
        expect(
            (await withLegacy(null).load(DOMAIN)).legacyMinDurationSec,
        ).toBeNull();
        expect(
            (await withLegacy({ minDurationSec: null }).load(DOMAIN))
                .legacyMinDurationSec,
        ).toBeNull();
        expect(
            (await loaderWith().load(DOMAIN)).legacyMinDurationSec,
        ).toBeNull();
    });

    it('ошибка старой админки не роняет настройки (fail-open)', async () => {
        const loader = new SettingsLoader(
            appSettingsWith() as never,
            {
                getByDomain: jest.fn().mockRejectedValue(new Error('db down')),
            } as never,
        );
        const settings = await loader.load(DOMAIN);
        expect(settings.legacyMinDurationSec).toBeNull();
        expect(settings.enabled).toBe(true);
    });
});
