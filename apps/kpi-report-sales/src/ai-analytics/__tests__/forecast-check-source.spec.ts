import { AI_LOGNORMAL_CHECK_SOURCES } from '@lib/sales-ai-analytics';
import { AI_FORECAST_CHECK_SOURCES } from '../constants/ai-forecast.const';
import { lastForecastLogDay } from '../domain/assembler/forecast-snapshots.reader';
import {
    type ForecastSources,
    presentForecast,
} from '../domain/presenter/forecast.presenter';

/**
 * Источник чека вилки в деньгах доходит до витрины: без него карточка
 * подписывала деньги «по чеку отдела», даже когда своих продаж мало и
 * считали по чеку по умолчанию.
 */

const LOG_DAY = {
    day: '2026-10-04',
    low: 2,
    p50: 3,
    high: 4,
    level: 0.8,
    naive: 3,
    done: 2,
    money: { low: 100, p50: 150, high: 220 },
};

const sources = (over: Partial<ForecastSources> = {}): ForecastSources => ({
    monthKey: '2026-10',
    day: lastForecastLogDay({ days: [LOG_DAY], checkSource: 'default' }),
    backtest: {
        monthKey: '2026-09',
        status: 'pass',
        reasons: [],
        shadowMonths: 10,
        shadowMinMonths: 9,
        numbers: null,
    },
    stageEnabled: true,
    shadowMinMonths: 9,
    readinessMode: 'forecast',
    ...over,
});

describe('forecast: источник чека вилки в деньгах', () => {
    it('источники чека ручки совпадают с библиотекой', () => {
        expect([...AI_FORECAST_CHECK_SOURCES].sort()).toEqual(
            [...AI_LOGNORMAL_CHECK_SOURCES].sort(),
        );
    });

    it('журнал: источник — из поля журнала для любого дня; чужой код или нет поля — null', () => {
        expect(
            lastForecastLogDay({ days: [LOG_DAY], checkSource: 'shrunk' })
                ?.checkSource,
        ).toBe('shrunk');
        expect(
            lastForecastLogDay({ days: [LOG_DAY], checkSource: 'магия' })
                ?.checkSource,
        ).toBeNull();
        expect(lastForecastLogDay({ days: [LOG_DAY] })?.checkSource).toBeNull();
    });

    it('чек по умолчанию уходит наружу вместе с деньгами; журнала нет — null', () => {
        const dto = presentForecast(sources());

        expect(dto.mode).toBe('published');
        expect(dto.money).toEqual({ low: 100, p50: 150, high: 220 });
        expect(dto.checkSource).toBe('default');
        expect(presentForecast(sources({ day: null })).checkSource).toBeNull();
    });
});
