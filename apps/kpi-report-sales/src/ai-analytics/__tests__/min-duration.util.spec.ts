import {
    minDurationByTypeOfSettings,
    minDurationFloorSec,
    parseAiDefinitions,
    parseAiModelParams,
    registryMinDurationSec,
} from '@lib/sales-ai-analytics';
import { portalMinDurationByType } from '../domain/loaders/min-duration.util';
import { SettingsLoader } from '../domain/loaders/settings.loader';
import { portalSettings } from './fixtures/lite-row.fixture';

const DOMAIN = 'april.bitrix24.ru';

/** Загрузчик с сырыми строками ключей definitions / model_params. */
function loaderWith(definitions: string, modelParams: string): SettingsLoader {
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
        aiAnalyticsModelParams: modelParams,
        aiAnalyticsManagerParams: '',
        aiAnalyticsDefinitions: definitions,
        aiAnalyticsEvents: '',
        aiAnalyticsScoring: '',
        aiAnalyticsHypothesis: '',
        aiAnalyticsRosterConfirmedAt: '',
    };
    return new SettingsLoader({
        resolve: jest.fn().mockResolvedValue(values),
    } as never);
}

// Долг 8 волны C: тело portalMinDurationByType сведено к
// resolveMinDurationByType библиотеки — одна формула порога у пульса,
// конвейера kpi-report-sales, event-sales и аудита (решение владельца А.1).
describe('portalMinDurationByType: единый порог контура kpi-report-sales', () => {
    it('портал ничего не решал — один ключ default с дефолтом реестра', () => {
        expect(portalMinDurationByType(portalSettings())).toEqual({
            default: registryMinDurationSec(),
        });
    });

    it('дефолт парсера с признаком false — не решение портала (та же карта, что у сырых настроек)', () => {
        const json = JSON.stringify({ hotClientColors: ['green'] });
        const byType = portalMinDurationByType(
            portalSettings({
                definitions: parseAiDefinitions(json),
                minDurationDefined: false,
            }),
        );

        expect(byType).toEqual(
            minDurationByTypeOfSettings({ aiAnalyticsDefinitions: json }),
        );
        expect(byType).toEqual({ default: registryMinDurationSec() });
    });

    it('карта {cold: 60}: свой порог у холодных, дефолт у остальных, минимум 60', () => {
        const json = JSON.stringify({ minDurationSecByType: { cold: 60 } });
        const byType = portalMinDurationByType(
            portalSettings({
                definitions: parseAiDefinitions(json),
                minDurationDefined: true,
            }),
        );

        expect(byType).toMatchObject({
            cold: 60,
            presentation: registryMinDurationSec(),
            default: registryMinDurationSec(),
        });
        expect(minDurationFloorSec(byType)).toBe(60);
        expect(byType).toEqual(
            minDurationByTypeOfSettings({ aiAnalyticsDefinitions: json }),
        );
    });

    it('скаляр min_duration_sec из model_params — порог всех типов', () => {
        const byType = portalMinDurationByType(
            portalSettings({
                modelParams: parseAiModelParams('{"min_duration_sec":90}'),
                minDurationDefined: false,
            }),
        );

        expect(byType).toEqual({ default: 90 });
    });

    it.each([
        ['', ''],
        [JSON.stringify({ hotClientColors: ['green'] }), ''],
        [JSON.stringify({ minDurationSecByType: { cold: 60 } }), ''],
        ['', JSON.stringify({ min_duration_sec_by_type: 120 })],
        ['', JSON.stringify({ min_duration_sec: 90 })],
        [
            JSON.stringify({ minDurationSecByType: { cold: 45 } }),
            JSON.stringify({ min_duration_sec: 90 }),
        ],
    ])(
        'через SettingsLoader карта совпадает с minDurationByTypeOfSettings тех же сырых строк (%s | %s)',
        async (definitions, modelParams) => {
            const settings = await loaderWith(definitions, modelParams).load(
                DOMAIN,
            );

            expect(portalMinDurationByType(settings)).toEqual(
                minDurationByTypeOfSettings({
                    aiAnalyticsDefinitions: definitions,
                    aiAnalyticsModelParams: modelParams,
                }),
            );
        },
    );
});

describe('portalMinDurationByType: прежний скаляр старой админки', () => {
    it('настройки AI-аналитики порог не задали — работает скаляр старой админки', () => {
        const byType = portalMinDurationByType(
            portalSettings({
                minDurationDefined: false,
                legacyMinDurationSec: 60,
            }),
        );
        expect(minDurationFloorSec(byType)).toBe(60);
    });

    it('явный порог в настройках AI-аналитики старше старой админки', () => {
        const byType = portalMinDurationByType(
            portalSettings({
                minDurationDefined: true,
                modelParams: { min_duration_sec_by_type: 90 },
                legacyMinDurationSec: 60,
            }),
        );
        expect(minDurationFloorSec(byType)).toBe(90);
    });

    it('скаляра нет — дефолт реестра, как раньше', () => {
        const byType = portalMinDurationByType(
            portalSettings({
                minDurationDefined: false,
                legacyMinDurationSec: null,
            }),
        );
        expect(minDurationFloorSec(byType)).toBe(registryMinDurationSec());
    });
});
