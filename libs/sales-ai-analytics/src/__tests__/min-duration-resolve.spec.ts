import { CALL_REPORT_CALL_TYPE_CODES } from '@lib/portal-lib/pbx/pbx-aicall-smart/type/pbx-aicall-smart.type';
import { MIN_DURATION_DEFAULT_TYPE, minDurationSecOf } from '../model/pulse';
import {
    minDurationByTypeOfSettings,
    minDurationFloorSec,
    registryMinDurationSec,
    resolveMinDurationByType,
} from '../settings/min-duration.resolve';

/** JSON ключа `ai_analytics_definitions` с порогами по типам. */
const definitionsJson = (byType: Record<string, number>): string =>
    JSON.stringify({ minDurationSecByType: byType });

describe('min-duration.resolve — единый порог разбора портала (А.1)', () => {
    it('дефолт реестра min_duration_sec_by_type — 300 с', () => {
        expect(registryMinDurationSec()).toBe(300);
    });

    it('настроек нет — только ключ «все прочие типы» с дефолтом реестра', () => {
        const byType = resolveMinDurationByType();

        expect(byType).toEqual({ [MIN_DURATION_DEFAULT_TYPE]: 300 });
        expect(minDurationFloorSec(byType)).toBe(300);
    });

    it('настроек нет, но есть прежний скаляр конвейера — работает он', () => {
        const byType = minDurationByTypeOfSettings(
            { aiAnalyticsDefinitions: '', aiAnalyticsModelParams: '' },
            60,
        );

        expect(byType).toEqual({ [MIN_DURATION_DEFAULT_TYPE]: 60 });
        expect(minDurationSecOf('presentation', byType)).toBe(60);
    });

    it('настройки заведены, но порог в них не задан — держится прежний скаляр', () => {
        // Регрессия, найденная приёмкой волны A: портал завёл
        // ai_analytics_definitions ради другого поля, а в разборе у него
        // стоит minDurationSec = 60. Дефолт реестра (300) не должен
        // вытеснять это значение — иначе разбор молча перестанет брать
        // звонки от минуты до пяти.
        const byType = minDurationByTypeOfSettings(
            {
                aiAnalyticsDefinitions: JSON.stringify({
                    hotClientColors: ['green'],
                }),
                aiAnalyticsModelParams: '',
            },
            60,
        );

        expect(byType).toEqual({ [MIN_DURATION_DEFAULT_TYPE]: 60 });
        expect(minDurationFloorSec(byType)).toBe(60);
    });

    it('порог задан в model_params — он старше прежнего скаляра', () => {
        const byType = minDurationByTypeOfSettings(
            {
                aiAnalyticsDefinitions: JSON.stringify({
                    hotClientColors: ['green'],
                }),
                aiAnalyticsModelParams: JSON.stringify({
                    min_duration_sec_by_type: 90,
                }),
            },
            60,
        );

        expect(byType).toEqual({ [MIN_DURATION_DEFAULT_TYPE]: 90 });
    });

    it('карта в definitions старше прежнего скаляра', () => {
        const byType = minDurationByTypeOfSettings(
            { aiAnalyticsDefinitions: definitionsJson({ cold: 45 }) },
            600,
        );

        expect(minDurationSecOf('cold', byType)).toBe(45);
    });

    it('карта по типам: свой порог у типа, дефолт реестра у остальных', () => {
        const byType = minDurationByTypeOfSettings(
            { aiAnalyticsDefinitions: definitionsJson({ cold: 60 }) },
            // Скаляр конвейера при заведённых настройках не участвует.
            300,
        );

        expect(minDurationSecOf('cold', byType)).toBe(60);
        expect(minDurationSecOf('presentation', byType)).toBe(300);
        // Тип, которого в карте нет вовсе (звонок без типа) — ключ default.
        expect(minDurationSecOf(null, byType)).toBe(300);
        expect(minDurationFloorSec(byType)).toBe(60);
    });

    it('одинаковый порог у всех типов — одно решение, а не карта', () => {
        const uniform = Object.fromEntries(
            CALL_REPORT_CALL_TYPE_CODES.map(code => [code, 120]),
        );

        const byType = minDurationByTypeOfSettings({
            aiAnalyticsDefinitions: definitionsJson(uniform),
        });

        expect(byType).toEqual({ [MIN_DURATION_DEFAULT_TYPE]: 120 });
        expect(minDurationFloorSec(byType)).toBe(120);
    });

    it('код реестра из ai_analytics_model_params поднимает порог всех типов', () => {
        const byType = minDurationByTypeOfSettings({
            aiAnalyticsModelParams: JSON.stringify({
                min_duration_sec_by_type: 90,
            }),
        });

        expect(byType).toEqual({ [MIN_DURATION_DEFAULT_TYPE]: 90 });
    });

    it('битый JSON настроек не роняет резолв — дефолты кода', () => {
        const byType = minDurationByTypeOfSettings({
            aiAnalyticsDefinitions: '{не json',
            aiAnalyticsModelParams: '{',
        });

        expect(minDurationFloorSec(byType)).toBe(300);
    });

    it('пустая карта не даёт Infinity: минимум падает на дефолт реестра', () => {
        expect(minDurationFloorSec({})).toBe(300);
    });
});
