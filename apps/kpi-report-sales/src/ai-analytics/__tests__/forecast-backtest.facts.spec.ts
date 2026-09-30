import {
    registryDefault,
    type ForecastLogSnapshot,
} from '@lib/sales-ai-analytics';
import {
    backtestMonthsOf,
    backtestParamsOf,
    buildBacktestSnapshot,
} from '../steps/forecast-backtest.facts';
import {
    FIXTURE_META,
    forecastLog,
    logDay,
} from './fixtures/forecast-log.fixture';

/**
 * Чистая сборка бэктеста прогноза отдела (поток B2b): журналы с фактом →
 * месяцы бэктеста, простое среднее с запасными источниками, параметры
 * гейта L4 и снапшот без журналов.
 */
const MONTH = '2026-08';

describe('forecast-backtest.facts', () => {
    it('журналов с фактом нет — insufficient без чисел', () => {
        const snapshot = buildBacktestSnapshot({
            monthKey: MONTH,
            logs: new Map([
                [MONTH, forecastLog(MONTH, [logDay('2026-08-05', 9)])],
            ]),
            params: backtestParamsOf({}),
            seed: 1,
            meta: { ...FIXTURE_META },
        });
        expect(snapshot).toMatchObject({
            status: 'insufficient',
            reasons: ['not-enough-months'],
            shadowMonths: 0,
            backtest: null,
        });
    });

    it('простое среднее: из журнала, иначе факты трёх прошлых журналов, иначе наивный', () => {
        const logs = new Map<string, ForecastLogSnapshot>([
            ['2026-05', forecastLog('2026-05', [], 6)],
            ['2026-06', forecastLog('2026-06', [], 9)],
            [
                '2026-07',
                forecastLog(
                    '2026-07',
                    [logDay('2026-07-05', 9, { mean3: null })],
                    9,
                ),
            ],
            [
                '2026-08',
                forecastLog(
                    '2026-08',
                    [logDay('2026-08-05', 9, { mean3: null, naive: 4 })],
                    10,
                ),
            ],
            [
                '2026-09',
                forecastLog(
                    '2026-09',
                    [logDay('2026-09-05', 9, { mean3: 5 })],
                    10,
                ),
            ],
        ]);
        const months = backtestMonthsOf(logs);
        const byMonth = new Map(months.map(month => [month.monthKey, month]));
        // У июля нет апреля — простое среднее равно наивному прогнозу дня.
        expect(byMonth.get('2026-07')?.days[0].mean3).toBe(10);
        // У августа есть май–июль: (6 + 9 + 9) / 3.
        expect(byMonth.get('2026-08')?.days[0].mean3).toBeCloseTo(8, 9);
        expect(byMonth.get('2026-09')?.days[0].mean3).toBe(5);
        expect(byMonth.get('2026-05')?.days).toEqual([]);
        expect(months.map(month => month.monthKey)).toEqual([
            '2026-05',
            '2026-06',
            '2026-07',
            '2026-08',
            '2026-09',
        ]);
    });

    it('без трёх прошлых журналов простое среднее — наивный прогноз дня', () => {
        const months = backtestMonthsOf(
            new Map([
                [
                    '2026-08',
                    forecastLog(
                        '2026-08',
                        [logDay('2026-08-05', 9, { mean3: null, naive: 4 })],
                        10,
                    ),
                ],
            ]),
        );
        expect(months[0].days[0].mean3).toBe(4);
    });

    it('параметры гейта: переопределение портала побеждает дефолт', () => {
        expect(backtestParamsOf({}).level).toBe(
            registryDefault('forecast_interval_level'),
        );
        expect(
            backtestParamsOf({ portal: { forecast_mase_max: 0.9 } }).maseMax,
        ).toBe(0.9);
    });
});
