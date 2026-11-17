/**
 * Что показать в карточке прогноза отдела, когда вилка не опубликована.
 * Правило владельца: аналитику не прячем за «мало данных» — показываем
 * число и пометку, откуда оно и насколько ему верить.
 *
 * - проверка на истории пройдена и показ включён — модель, подтверждена;
 * - проверка пройдена, показ не включён — число модели с пометкой;
 * - презентации на портале не отмечаются (прогноз от них не строится) —
 *   простой расчёт с уточнением `presentations-missing`;
 * - готовность портала ниже «прогноза» — расчёт по темпу;
 * - истории мало (проверки нет или ей не хватило месяцев) — расчёт по
 *   темпу; если месяцы есть, но посчитаны старым методом, — с уточнением
 *   `method-history-short`;
 * - проверка не пройдена и простой расчёт на истории точнее — он;
 * - проверка не пройдена, но модель точнее простых — модель с пометкой
 *   «точность не подтверждена».
 *
 * Уточнение идёт в поле `detail` — фронт до 18.11.2026 его не читает и
 * видит пометку из старого набора. Журнала дня нет — показывать нечего
 * (null). Чистые функции.
 */
import {
    AI_FORECAST_REASONS,
    type AiForecastShownDetail,
    type AiForecastShownNote,
    type AiForecastShownSource,
} from '../../constants/ai-forecast.const';
import type {
    ForecastBacktestNumbers,
    ForecastBacktestView,
    ForecastLogDayView,
} from '../assembler/forecast-snapshots.reader';

export interface ForecastShown {
    source: AiForecastShownSource;
    /** Ожидаемое число продаж отдела за месяц. */
    value: number;
    note: AiForecastShownNote;
    /** Уточнение пометки для нового фронта; нет — пометки хватает. */
    detail?: AiForecastShownDetail;
}

/** Простой расчёт с его значением на день журнала. */
interface SimpleForecast {
    source: Exclude<AiForecastShownSource, 'model'>;
    value: number;
}

/**
 * Простой расчёт, который на истории точнее модели. MASE — ошибка модели,
 * делённая на ошибку простого расчёта: 1 и больше — модель не точнее. Из
 * двух простых берётся тот, кому модель проигрывает сильнее. Модель точнее
 * обоих или сравнить не с чем — null.
 */
export function betterSimpleForecast(
    day: ForecastLogDayView,
    numbers: ForecastBacktestNumbers,
): SimpleForecast | null {
    const candidates: { simple: SimpleForecast; mase: number }[] = [];
    if (numbers.maseNaive !== null && numbers.maseNaive >= 1) {
        candidates.push({
            simple: { source: 'naive', value: day.naive },
            mase: numbers.maseNaive,
        });
    }
    if (
        numbers.maseMean3 !== null &&
        numbers.maseMean3 >= 1 &&
        day.mean3 !== null
    ) {
        candidates.push({
            simple: { source: 'mean3', value: day.mean3 },
            mase: numbers.maseMean3,
        });
    }
    candidates.sort((a, b) => b.mase - a.mase);
    return candidates[0]?.simple ?? null;
}

/**
 * Простой расчёт без проверки: по темпу, если в месяце уже есть продажи,
 * иначе среднее за три месяца (если есть) — в начале месяца ноль продаж
 * дал бы «по темпу» ноль.
 */
function plainSimple(day: ForecastLogDayView): SimpleForecast {
    return day.done <= 0 && day.mean3 !== null
        ? { source: 'mean3', value: day.mean3 }
        : { source: 'naive', value: day.naive };
}

/** Числа проверки, по которым можно сравнивать; истории мало — null. */
function comparableNumbers(
    backtest: ForecastBacktestView | null,
): ForecastBacktestNumbers | null {
    if (backtest === null || backtest.status === 'insufficient') return null;
    return backtest.numbers;
}

/** Истории мало потому, что месяцы посчитаны старым методом. */
const methodHistoryShort = (backtest: ForecastBacktestView | null): boolean =>
    backtest !== null &&
    backtest.status === 'insufficient' &&
    backtest.otherMethodMonths > 0;

/**
 * Показываемый прогноз по журналу дня, проверке и причинам режима shadow
 * (`forecastReasons`): пустые причины — вилка опубликована. Проверка —
 * уже для метода дня (`backtestOfMethod`).
 */
export function chooseShownForecast(
    day: ForecastLogDayView | null,
    backtest: ForecastBacktestView | null,
    reasons: readonly string[],
): ForecastShown | null {
    if (day === null) return null;
    const model = (note: AiForecastShownNote): ForecastShown => ({
        source: 'model',
        value: day.band.p50,
        note,
    });
    const byPace = (note: AiForecastShownNote): ForecastShown => ({
        source: 'naive',
        value: day.naive,
        note,
    });

    if (reasons.length === 0) return model('confirmed');
    if (reasons.includes(AI_FORECAST_REASONS.stageDisabled)) {
        return model('stage-disabled');
    }
    if (day.flowStatus === 'not-applicable') {
        return {
            ...plainSimple(day),
            note: 'no-model',
            detail: 'presentations-missing',
        };
    }
    if (reasons.includes(AI_FORECAST_REASONS.readinessBelow)) {
        return byPace('readiness-below');
    }
    const numbers = comparableNumbers(backtest);
    if (numbers === null) {
        return methodHistoryShort(backtest)
            ? { ...byPace('history-short'), detail: 'method-history-short' }
            : byPace('history-short');
    }
    const simple = betterSimpleForecast(day, numbers);
    return simple === null
        ? model('model-unconfirmed')
        : { ...simple, note: 'simple-better' };
}
