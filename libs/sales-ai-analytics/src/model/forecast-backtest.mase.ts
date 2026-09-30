/**
 * Ошибки прогноза по дням, MASE и его блочный бутстрап по месяцам —
 * часть rolling-origin бэктеста (план §10 L4, §4.11; Фаза 4, поток
 * `p4-forecast-model`). Вынесено из `forecast-backtest.ts` ради размера.
 *
 * Чистая математика: без DI, Bitrix, Prisma, `Date.now`/`Math.random`;
 * случайность только из переданного потока `random`.
 */
import type {
    ForecastBacktestDay,
    ForecastBacktestMonth,
} from './forecast-backtest.types';
import { quantileOf } from './quantile.util';

/** День с фактом месяца — единица бэктеста. */
export interface OriginDay extends ForecastBacktestDay {
    readonly actual: number;
}

/** Суммы абсолютных ошибок трёх прогнозов по дням. */
export interface ErrorSums {
    p50: number;
    naive: number;
    mean3: number;
}

/** Эталон MASE. */
export type MaseReference = 'naive' | 'mean3';

/** Квантили CI90 бутстрапа. */
const BOOT_LOW_Q = 0.05;
const BOOT_HIGH_Q = 0.95;

/** Дни месяца с проставленным фактом. */
export const originDaysOf = (month: ForecastBacktestMonth): OriginDay[] =>
    month.days.map(day => ({ ...day, actual: month.actual }));

/** Суммы абсолютных ошибок по дням в фиксированном порядке. */
export function errorSums(days: readonly OriginDay[]): ErrorSums {
    const sums: ErrorSums = { p50: 0, naive: 0, mean3: 0 };
    for (const day of days) {
        sums.p50 += Math.abs(day.p50 - day.actual);
        sums.naive += Math.abs(day.naive - day.actual);
        sums.mean3 += Math.abs(day.mean3 - day.actual);
    }

    return sums;
}

/** `MASE = Σ|p50 − actual| / Σ|эталон − actual|`; null при нулевой ошибке эталона. */
export function maseOf(
    sums: ErrorSums,
    reference: MaseReference,
): number | null {
    const denominator = sums[reference];

    return denominator > 0 ? sums.p50 / denominator : null;
}

/**
 * Блочный бутстрап по месяцам: `ceil(M/block)` блоков подряд идущих
 * месяцев со случайным началом, MASE по объединённым дням. Каждый
 * розыгрыш даёт и naive-, и mean3-MASE из одной выборки блоков.
 */
export function bootstrapMase(
    months: readonly ForecastBacktestMonth[],
    draws: number,
    blockMonths: number,
    random: () => number,
): Record<MaseReference, number[]> {
    const block = Math.max(1, Math.min(months.length, Math.floor(blockMonths)));
    const blocks = Math.ceil(months.length / block);
    const starts = months.length - block + 1;
    const perMonth = months.map(month => errorSums(originDaysOf(month)));
    const naive: number[] = [];
    const mean3: number[] = [];
    for (let draw = 0; draw < draws; draw += 1) {
        const sums: ErrorSums = { p50: 0, naive: 0, mean3: 0 };
        for (let index = 0; index < blocks; index += 1) {
            const start = Math.floor(random() * starts);
            for (let offset = 0; offset < block; offset += 1) {
                const monthSums = perMonth[start + offset];
                sums.p50 += monthSums.p50;
                sums.naive += monthSums.naive;
                sums.mean3 += monthSums.mean3;
            }
        }
        const naiveValue = maseOf(sums, 'naive');
        const mean3Value = maseOf(sums, 'mean3');
        if (naiveValue !== null) naive.push(naiveValue);
        if (mean3Value !== null) mean3.push(mean3Value);
    }

    return { naive, mean3 };
}

/** CI90 бутстрапа: квантили 5 % и 95 % (тип 7); null — розыгрышей нет. */
export const bootInterval = (
    samples: readonly number[],
): readonly [number, number] | null =>
    samples.length === 0
        ? null
        : [quantileOf(samples, BOOT_LOW_Q), quantileOf(samples, BOOT_HIGH_Q)];
