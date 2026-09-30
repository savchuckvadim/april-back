/**
 * Отрицательно-биномиальное распределение числа продаж (план §4.8:
 * «дисперсия дельта-методом → NegBin с φ»; Фаза 4, поток `p4-forecast-model`).
 *
 * Параметризация — через среднее `μ` и квазипуассоновскую сверхдисперсию
 * `φ` (та же, что в `overdispersion.ts`): `Var = φ·μ`. Отсюда размер
 * `r = μ/(φ − 1)` и вероятность «успеха» `p = 1/φ`; при `φ ≤ 1` —
 * распределение Пуассона. pmf считается устойчивой рекурсией в
 * логарифмах (`P(0)` при большом `μ` в линейной шкале обнуляется), cdf —
 * накоплением, квантиль — перебором cdf с защитой по числу шагов.
 *
 * Чистая математика: без DI, Bitrix, Prisma, `Date.now`/`Math.random`;
 * дефолты — из реестра параметров.
 */
import { registryDefault } from '../params/registry.access';

/** Центральный интервал распределения: квантили `(1 − level)/2` и `1 − (1 − level)/2`. */
export interface NegBinInterval {
    readonly low: number;
    readonly high: number;
}

/** Дефолты реестра: сверхдисперсия и уровень вилки прогноза. */
export const NEGBIN_DEFAULTS = {
    /** `overdispersion_default` — φ до оценки по данным. */
    phi: registryDefault('overdispersion_default'),
    /** `forecast_interval_level` — уровень центрального интервала (0,8 → P10/P90). */
    level: registryDefault('forecast_interval_level'),
} as const;

/**
 * Потолок числа шагов перебора cdf: страховка от бесконечного цикла при
 * `prob → 1` и тяжёлом хвосте. `μ + 12·√(φ·μ) + 64` покрывает квантили
 * до 0,9999 при любых допустимых φ, но не больше абсолютного лимита.
 */
export const NEGBIN_MAX_STEPS = 200_000;

const MAX_STEPS_SIGMAS = 12;
const MAX_STEPS_FLOOR = 64;

const finiteOrZero = (value: number): number =>
    Number.isFinite(value) ? value : 0;

/** Нормализованные параметры: μ ≥ 0, φ ≥ 1 (φ ≤ 1 — Пуассон). */
function normalizeParams(
    mean: number,
    phi: number,
): { readonly mu: number; readonly phi: number } {
    return {
        mu: Math.max(0, finiteOrZero(mean)),
        phi: Math.max(1, finiteOrZero(phi)),
    };
}

/** Число шагов перебора для данных μ и φ. */
function stepLimit(mu: number, phi: number): number {
    const sigma = Math.sqrt(phi * mu);

    return Math.min(
        NEGBIN_MAX_STEPS,
        Math.ceil(mu + MAX_STEPS_SIGMAS * sigma + MAX_STEPS_FLOOR),
    );
}

/**
 * Итератор логарифмов pmf по `k = 0, 1, 2, …`: Пуассон
 * `ln P(k+1) = ln P(k) + ln μ − ln(k+1)`, NegBin
 * `ln P(k+1) = ln P(k) + ln(r + k) − ln(k + 1) + ln(1 − p)`.
 */
function logPmfStepper(mu: number, phi: number): (k: number) => number {
    if (mu <= 0) {
        return (k: number) => (k === 0 ? 0 : Number.NEGATIVE_INFINITY);
    }
    const poisson = phi <= 1;
    const r = poisson ? 0 : mu / (phi - 1);
    const logQ = poisson ? 0 : Math.log(1 - 1 / phi);
    let current = poisson ? -mu : -r * Math.log(phi);
    let index = 0;

    return (k: number) => {
        // Итератор строго последовательный: k совпадает с внутренним счётчиком.
        while (index < k) {
            current += poisson
                ? Math.log(mu) - Math.log(index + 1)
                : Math.log(r + index) - Math.log(index + 1) + logQ;
            index += 1;
        }

        return current;
    };
}

/** `P(X = k)` для NegBin(μ, φ); вне носителя — 0. */
export function negBinPmf(k: number, mean: number, phi: number): number {
    const params = normalizeParams(mean, phi);
    if (!Number.isInteger(k) || k < 0) {
        return 0;
    }
    const logPmf = logPmfStepper(params.mu, params.phi);

    return Math.exp(logPmf(k));
}

/** `P(X ≤ k)` для NegBin(μ, φ) накоплением pmf; при `k < 0` — 0. */
export function negBinCdf(k: number, mean: number, phi: number): number {
    const params = normalizeParams(mean, phi);
    if (!Number.isFinite(k) || k < 0) {
        return 0;
    }
    const upper = Math.floor(k);
    const logPmf = logPmfStepper(params.mu, params.phi);
    let cdf = 0;
    for (let index = 0; index <= upper; index += 1) {
        cdf += Math.exp(logPmf(index));
    }

    return Math.min(1, cdf);
}

/**
 * Квантиль NegBin(μ, φ): наименьшее `k` с `P(X ≤ k) ≥ prob`. Перебор cdf
 * ограничен `stepLimit`; при упоре в лимит возвращается лимит — это
 * защита, а не оценка хвоста.
 */
export function negBinQuantile(
    mean: number,
    phi: number,
    prob: number,
): number {
    const params = normalizeParams(mean, phi);
    const p = Number.isFinite(prob) ? Math.min(1, Math.max(0, prob)) : 0;
    if (params.mu <= 0 || p <= 0) {
        return 0;
    }
    const limit = stepLimit(params.mu, params.phi);
    const logPmf = logPmfStepper(params.mu, params.phi);
    let cdf = 0;
    for (let k = 0; k < limit; k += 1) {
        cdf += Math.exp(logPmf(k));
        // Допуск на накопленную ошибку суммирования при prob = 1.
        if (cdf >= p - 1e-12) {
            return k;
        }
    }

    return limit;
}

/**
 * Центральный интервал уровня `level`: `[q_(1−level)/2; q_1−(1−level)/2]`.
 * При `level = 0,8` — P10 и P90 (план §4.8).
 */
export function negBinInterval(
    mean: number,
    phi: number = NEGBIN_DEFAULTS.phi,
    level: number = NEGBIN_DEFAULTS.level,
): NegBinInterval {
    const lvl = Number.isFinite(level) ? Math.min(1, Math.max(0, level)) : 0;
    const tail = (1 - lvl) / 2;
    const low = negBinQuantile(mean, phi, tail);
    const high = negBinQuantile(mean, phi, 1 - tail);

    return { low, high: Math.max(low, high) };
}

/**
 * Выборка из NegBin(μ, φ) обратной функцией распределения на потоке
 * `random` (mulberry32): один вызов `random()` на значение, поэтому
 * последовательность воспроизводима по seed. Нужна симуляционным
 * проверкам покрытия (план §4.11 «проверки»).
 */
export function sampleNegBin(
    mean: number,
    phi: number,
    random: () => number,
): number {
    return negBinQuantile(mean, phi, random());
}
