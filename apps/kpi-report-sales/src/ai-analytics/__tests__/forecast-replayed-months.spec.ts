import 'reflect-metadata';
import { aboutForecastAccuracyOf } from '../about/ai-analytics-about.phase4.builder';
import { readForecastBacktest } from '../domain/assembler/forecast-snapshots.reader';
import { presentForecast } from '../domain/presenter/forecast.presenter';
import { backtestSnapshot } from './fixtures/phase4-snapshots.fixture';

/**
 * «Из них восстановлено по истории: K» — необязательное поле
 * `replayedMonths` проходит из снапшота бэктеста в витрину прогноза и
 * «Как считаем»; у записей до воспроизведения поля нет.
 */
const BACKTEST_PAYLOAD = {
    monthKey: '2026-09',
    status: 'insufficient',
    reasons: ['not-enough-months'],
    shadowMonths: 5,
    shadowMinMonths: 9,
    backtest: null,
};

describe('replayedMonths — чтение снапшота проверки', () => {
    it('поле читается, когда записано; старая запись — без поля', () => {
        expect(
            readForecastBacktest('2026-09', {
                ...BACKTEST_PAYLOAD,
                replayedMonths: 4,
            })?.replayedMonths,
        ).toBe(4);
        const old = readForecastBacktest('2026-09', BACKTEST_PAYLOAD);
        expect(old).not.toBeNull();
        expect(old && 'replayedMonths' in old).toBe(false);
    });

    it('витрина прогноза: shadow.replayedMonths только при записанном поле', () => {
        const sources = (replayed?: number) => ({
            monthKey: '2026-10',
            day: null,
            backtest: readForecastBacktest('2026-09', {
                ...BACKTEST_PAYLOAD,
                ...(replayed === undefined ? {} : { replayedMonths: replayed }),
            }),
            stageEnabled: false,
            shadowMinMonths: 9,
            readinessMode: null,
        });
        expect(presentForecast(sources(4)).shadow).toMatchObject({
            monthsLogged: 5,
            minMonths: 9,
            replayedMonths: 4,
        });
        expect('replayedMonths' in presentForecast(sources()).shadow).toBe(
            false,
        );
    });

    it('«Как считаем»: секция точности несёт replayedMonths при записанном поле', () => {
        expect(
            aboutForecastAccuracyOf(backtestSnapshot({ replayedMonths: 7 })),
        ).toMatchObject({ shadowMonths: 10, replayedMonths: 7 });
        const old = aboutForecastAccuracyOf(backtestSnapshot());
        expect(old && 'replayedMonths' in old).toBe(false);
    });
});
