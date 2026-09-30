import type { PortalModelPayload } from '../domain/assembler/portal-model.types';
import {
    registryDefault,
    AI_ANALYTICS_SNAPSHOT_TYPE,
} from '@lib/sales-ai-analytics';
import {
    buildForecastLogDay,
    managerPointOf,
    mergeForecastLog,
    withActual,
} from '../domain/assembler/department-forecast.assembler';
import {
    forecastLogOf,
    forecastLogsOf,
    mean3MonthKeys,
    mean3Of,
    modelFactsOf,
    rosterMonthSales,
} from '../steps/department-forecast.facts';
import {
    FIXTURE_META,
    forecastLog,
    forecastPayload,
    logDay,
    managerMonth,
    snapshotRecord,
} from './fixtures/forecast-log.fixture';

/**
 * Чистая сборка журнала прогноза отдела и факты шага (поток B2b):
 * слагаемые отдела, правило «один день — одна запись», окно простого
 * среднего и структурное чтение журнала и модели.
 */
describe('department-forecast — сборка дня и журнала', () => {
    const check = {
        m: registryDefault('check_lognormal_m'),
        v: registryDefault('check_lognormal_v'),
    };
    const points = [
        managerPointOf(
            '12',
            forecastPayload({ p50: 4, doneSales: 1, naive: 3 }),
        ),
        managerPointOf('11', forecastPayload()),
    ];

    it('прогноз менеджера → слагаемое: без λ_pipe — pipelineKnown false', () => {
        expect(
            managerPointOf('11', forecastPayload({ pipelineExpected: null })),
        ).toEqual({
            managerId: '11',
            p50: 6,
            doneSales: 2,
            naive: 5,
            descriptive: 4,
            pipelineKnown: false,
        });
    });

    it('день журнала: суммы, вилка вокруг P50, деньги детерминированы по seed', () => {
        const input = {
            day: '2026-09-08',
            managers: points,
            phi: 2.5,
            phiSource: 'estimated' as const,
            level: 0.8,
            check,
            seed: 42,
            mean3: 7,
            modelSnapshotId: 'ais-model-3',
        };
        const day = buildForecastLogDay(input);
        expect(day).toMatchObject({
            day: '2026-09-08',
            p50: 10,
            done: 3,
            naive: 8,
            managers: 2,
            mean3: 7,
            level: 0.8,
            phi: 2.5,
            phiSource: 'estimated',
        });
        expect(day.low).toBeLessThanOrEqual(10);
        expect(day.high).toBeGreaterThanOrEqual(10);
        expect(day.money).not.toBeNull();
        expect(buildForecastLogDay(input)).toEqual(day);
        // Порядок менеджеров на входе сумм не меняет.
        expect(
            buildForecastLogDay({ ...input, managers: [...points].reverse() }),
        ).toEqual(day);
    });

    it('слияние: тот же день заменяется, дни по возрастанию, факт переносится', () => {
        const previous = forecastLog(
            '2026-09',
            [logDay('2026-09-09', 9), logDay('2026-09-07', 7)],
            12,
        );
        const merged = mergeForecastLog({
            monthKey: '2026-09',
            previous,
            day: logDay('2026-09-09', 11),
            checkSource: 'estimated',
            meta: { ...FIXTURE_META },
        });
        expect(merged.days.map(day => [day.day, day.p50])).toEqual([
            ['2026-09-07', 7],
            ['2026-09-09', 11],
        ]);
        expect(merged.actual).toBe(12);
        expect(merged.checkSource).toBe('estimated');
    });

    it('первый день месяца: журнала нет — факт null', () => {
        const merged = mergeForecastLog({
            monthKey: '2026-09',
            previous: null,
            day: logDay('2026-09-01', 5),
            checkSource: null,
            meta: { ...FIXTURE_META },
        });
        expect(merged.days).toHaveLength(1);
        expect(merged.actual).toBeNull();
    });

    it('факт закрытого месяца ставится без потери дней', () => {
        const log = forecastLog('2026-08', [logDay('2026-08-10', 9)]);
        const closed = withActual(log, 11, { ...FIXTURE_META });
        expect(closed.actual).toBe(11);
        expect(closed.days).toEqual(log.days);
    });
});

describe('department-forecast — факты шага', () => {
    it('окно простого среднего: до 3-го числа прошлый месяц не заморожен', () => {
        expect(mean3MonthKeys('2026-09-08')).toEqual([
            '2026-06',
            '2026-07',
            '2026-08',
        ]);
        expect(mean3MonthKeys('2026-09-02')).toEqual([
            '2026-05',
            '2026-06',
            '2026-07',
        ]);
        expect(mean3MonthKeys('2026-01-10')).toEqual([
            '2025-10',
            '2025-11',
            '2025-12',
        ]);
    });

    it('продажи отдела: только ростер, одна запись на менеджер-месяц', () => {
        const sums = rosterMonthSales(
            [
                managerMonth('11', '2026-08', 2),
                managerMonth('11', '2026-08', 5),
                managerMonth('12', '2026-08', 3),
                managerMonth('99', '2026-08', 50),
            ],
            ['11', '12'],
        );
        expect(sums.get('2026-08')).toBe(8);
        expect(sums.has('2026-07')).toBe(false);
    });

    it('среднее трёх месяцев: пропуск месяца — null, а не ноль', () => {
        const sums = new Map([
            ['2026-06', 6],
            ['2026-07', 9],
            ['2026-08', 9],
        ]);
        expect(mean3Of(sums, ['2026-06', '2026-07', '2026-08'])).toBe(8);
        expect(mean3Of(sums, ['2026-05', '2026-06', '2026-07'])).toBeNull();
        expect(mean3Of(sums, [])).toBeNull();
    });

    it('модель: φ и источник из оценки, битая форма → дефолты', () => {
        expect(
            modelFactsOf(
                { overdispersion: { value: 3, source: 'estimated' } },
                {},
            ),
        ).toMatchObject({ phi: 3, phiSource: 'estimated' });
        const fallback = modelFactsOf(null, {});
        expect(fallback.phi).toBeUndefined();
        expect(fallback.phiSource).toBe('default');
        expect(fallback.check).toEqual({
            m: registryDefault('check_lognormal_m'),
            v: registryDefault('check_lognormal_v'),
            source: 'default',
        });
    });

    it('чек: переопределение портала реестра без поля модели', () => {
        const facts = modelFactsOf(null, {
            portal: { check_lognormal_m: 11 },
        });
        expect(facts.check.m).toBe(11);
    });

    it('чек: модель без своей оценки и без пула — живое переопределение портала', () => {
        const model = {
            checkLognormal: {
                m: 9.6686,
                v: 1,
                n: 5,
                w: 0,
                source: 'default',
                priorFromPool: false,
            },
        } as Partial<PortalModelPayload>;
        const facts = modelFactsOf(model, {
            portal: { check_lognormal_m: 12.6 },
        });
        expect(facts.check.m).toBe(12.6);
        expect(facts.check.source).toBe('default');
    });

    it('чек: модель с оценкой или прайором пула — значения модели', () => {
        const model = {
            checkLognormal: {
                m: 10.1,
                v: 0.7,
                n: 5,
                w: 0,
                source: 'default',
                priorFromPool: true,
            },
        } as Partial<PortalModelPayload>;
        expect(
            modelFactsOf(model, { portal: { check_lognormal_m: 12.6 } }).check
                .m,
        ).toBe(10.1);
    });

    it('журнал: чужая форма → null, битые дни отброшены', () => {
        expect(forecastLogOf({ monthKey: '2026-09' })).toBeNull();
        expect(forecastLogOf(null)).toBeNull();
        const log = forecastLogOf({
            ...forecastLog('2026-09', [logDay('2026-09-01', 5)]),
            days: [logDay('2026-09-01', 5), { day: '2026-09-02' }],
        });
        expect(log?.days).toHaveLength(1);
    });

    it('журналы по месяцам: записи менеджеров и чужие ключи пропускаются', () => {
        const logs = forecastLogsOf([
            snapshotRecord(
                AI_ANALYTICS_SNAPSHOT_TYPE.forecastLog,
                '2026-08',
                null,
                forecastLog('2026-08', [logDay('2026-08-03', 5)], 9),
            ),
            snapshotRecord(
                AI_ANALYTICS_SNAPSHOT_TYPE.forecastLog,
                '2026-07',
                null,
                forecastLog('2026-06', []),
            ),
            snapshotRecord(
                AI_ANALYTICS_SNAPSHOT_TYPE.forecastLog,
                '2026-09',
                '11',
                forecastLog('2026-09', []),
            ),
        ]);
        expect([...logs.keys()]).toEqual(['2026-08']);
        expect(logs.get('2026-08')?.actual).toBe(9);
    });
});
