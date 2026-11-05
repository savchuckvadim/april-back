/**
 * Калибровка вилки прогноза отдела по истории (решение владельца
 * 05.11.2026). Вилка NegBin учитывает только случайность ещё не случившейся
 * части месяца, но не ошибку самой середины, поэтому на истории она узкая:
 * на april-garant факт попадал в неё в 40–52 % дней вместо 80 %.
 *
 * Метод — split-conformal с масштабом `s = √(μ_rem + 1)`: по дням истории
 * берутся нормированные остатки `(факт − P50) / s`, их квантили уровня вилки
 * дают множители `qLow ≤ 0 ≤ qHigh`; вилка дня — `P50 + q·s`. Единица в
 * масштабе держит ширину и в конце месяца, когда остаток почти исчерпан, а
 * факт ещё может разойтись с серединой. Калибровка только расширяет вилку
 * модели и не опускает низ ниже уже закрытых продаж.
 *
 * Чистая математика: без DI, Bitrix, Prisma, `Date.now`/`Math.random`.
 */
import { originDaysOf, type OriginDay } from './forecast-backtest.mase';
import type { ForecastBacktestMonth } from './forecast-backtest.types';
import { quantileOf } from './quantile.util';

/** Множители калибровки: `low = P50 + qLow·s`, `high = P50 + qHigh·s`. */
export interface ForecastCalibration {
    readonly qLow: number;
    readonly qHigh: number;
    readonly level: number;
    /** Дней истории, по которым подобраны множители. */
    readonly days: number;
    /** Закрытых месяцев истории. */
    readonly months: number;
}

/** День истории для калибровки: середина, закрытое к дню и факт месяца. */
export interface ForecastCalibrationPoint {
    readonly p50: number;
    readonly done: number;
    readonly actual: number;
}

/** Вилка в штуках или деньгах. */
export interface ForecastBandValues {
    readonly low: number;
    readonly p50: number;
    readonly high: number;
}

/**
 * Минимум закрытых месяцев истории для калибровки: по одному-двум месяцам
 * квантили остатков — случайность. Константа процедуры, не реестр.
 */
export const FORECAST_CALIBRATION_MIN_MONTHS = 3;

const finite = (value: number): boolean => Number.isFinite(value);

/** Масштаб остатка дня: `√(max(P50 − Y₀, 0) + 1)`. */
export const forecastCalibrationScale = (p50: number, done: number): number =>
    Math.sqrt(Math.max(0, p50 - done) + 1);

/**
 * Множители по дням истории уровня `level`; дней нет — null. Число месяцев
 * проверяет вызывающий (`FORECAST_CALIBRATION_MIN_MONTHS`).
 */
export function calibrateForecast(
    points: readonly ForecastCalibrationPoint[],
    level: number,
    months: number,
): ForecastCalibration | null {
    const residuals = points
        .filter(point => [point.p50, point.done, point.actual].every(finite))
        .map(
            point =>
                (point.actual - point.p50) /
                forecastCalibrationScale(point.p50, point.done),
        );
    if (residuals.length === 0) return null;
    const bounded = Math.min(1, Math.max(0, level));
    const tail = (1 - bounded) / 2;

    return {
        qLow: Math.min(0, quantileOf(residuals, tail)),
        qHigh: Math.max(0, quantileOf(residuals, 1 - tail)),
        level: bounded,
        days: residuals.length,
        months,
    };
}

/**
 * Вилка в штуках после калибровки: только шире исходной, границы целые
 * (низ вниз, верх вверх), низ не ниже закрытого к дню `done`.
 */
export function calibratedBand(
    band: ForecastBandValues,
    done: number,
    calibration: ForecastCalibration | null,
): ForecastBandValues {
    if (!calibration) return band;
    const scale = forecastCalibrationScale(band.p50, done);
    const low = Math.max(
        Math.max(0, done),
        Math.floor(band.p50 + calibration.qLow * scale),
    );
    const high = Math.ceil(band.p50 + calibration.qHigh * scale);

    return {
        low: Math.min(band.low, low),
        p50: band.p50,
        high: Math.max(band.high, high),
    };
}

/**
 * Вилка в деньгах вслед за штуками: расширение штук × средний чек середины
 * (`money.p50 / band.p50`); середина без продаж — деньги как были.
 */
export function calibratedMoneyBand(
    money: ForecastBandValues,
    band: ForecastBandValues,
    calibrated: ForecastBandValues,
): ForecastBandValues {
    if (!(band.p50 > 0) || !finite(money.p50)) return money;
    const check = money.p50 / band.p50;

    return {
        low: Math.max(
            0,
            Math.min(
                money.low,
                money.p50 - check * (band.p50 - calibrated.low),
            ),
        ),
        p50: money.p50,
        high: Math.max(
            money.high,
            money.p50 + check * (calibrated.high - band.p50),
        ),
    };
}

/** Калибровка бэктеста без подглядывания: месяц — по закрытым месяцам до него. */
export interface RollingCalibration {
    /**
     * Дни месяцев, у которых до них набралось не меньше
     * FORECAST_CALIBRATION_MIN_MONTHS месяцев, — с откалиброванной вилкой.
     */
    readonly days: readonly OriginDay[];
    /** Сколько месяцев вошло в days. */
    readonly months: number;
    /** Калибровка по всем месяцам — для живой вилки; мало месяцев — null. */
    readonly latest: ForecastCalibration | null;
}

/**
 * Rolling-origin калибровка: вилка месяца i подбирается только по месяцам
 * 0..i−1 (как было бы в жизни), поэтому покрытие на этих днях — честная
 * проверка, а не подгонка под ответ. Месяцы — по возрастанию ключей.
 */
export function rollingCalibration(
    months: readonly ForecastBacktestMonth[],
    level: number,
): RollingCalibration {
    const days: OriginDay[] = [];
    let used = 0;
    for (
        let index = FORECAST_CALIBRATION_MIN_MONTHS;
        index < months.length;
        index += 1
    ) {
        const prior = months.slice(0, index);
        const calibration = calibrateForecast(
            prior.flatMap(originDaysOf),
            level,
            prior.length,
        );
        if (!calibration) continue;
        used += 1;
        for (const day of originDaysOf(months[index])) {
            const band = calibratedBand(day, day.done, calibration);
            days.push({ ...day, low: band.low, high: band.high });
        }
    }
    const latest =
        months.length >= FORECAST_CALIBRATION_MIN_MONTHS
            ? calibrateForecast(
                  months.flatMap(originDaysOf),
                  level,
                  months.length,
              )
            : null;

    return { days, months: used, latest };
}
