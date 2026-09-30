/**
 * Логнормальный чек и перевод вилки продаж в деньги (план §4.8: «деньги —
 * логнормальный чек `check_lognormal` (≥ 20 продаж, иначе пул)»; Фаза 4,
 * поток `p4-forecast-model`).
 *
 * Сумма продажи `X ~ LogNormal(m, v)`: `ln X ~ N(m, v)`, `E[X] = exp(m + v/2)`.
 * Оценка портала — среднее и дисперсия `ln(amount)` с усадкой к прайору
 * `w = n/(n + κ)`; до гейта `minN` — дефолт реестра.
 *
 * Чистая математика: без DI, Bitrix, Prisma, `Date.now`/`Math.random`;
 * случайность — только через `mulberry32(seed)`.
 */
import { registryDefault, registryRangeOf } from '../params/registry.access';
import { findParam, type AiAnalyticsParamCode } from '../params/registry.const';
import type { ParamRange } from '../params/registry.types';
import { mulberry32, sampleNormal } from './prng';
import { quantileOf } from './quantile.util';

/** Откуда взялись `m` и `v`. */
export const AI_LOGNORMAL_CHECK_SOURCES = [
    'default',
    'estimated',
    'shrunk',
] as const;

export type LognormalCheckSource = (typeof AI_LOGNORMAL_CHECK_SOURCES)[number];

/** Коды реестра параметров чека. */
export const CHECK_LOGNORMAL_M_CODE =
    'check_lognormal_m' satisfies AiAnalyticsParamCode;
export const CHECK_LOGNORMAL_V_CODE =
    'check_lognormal_v' satisfies AiAnalyticsParamCode;

/**
 * Дефолты оценки чека. Сила усадки `κ = 20` — константа формулы из
 * `estimator` дескриптора `check_lognormal_m` («усадка κ = 20 к пулу
 * линейки»): отдельного кода реестра у неё нет, поэтому она зафиксирована
 * здесь, а не взята из чужого кода (`lag_cdf_kappa` — про лаг).
 */
export const LOGNORMAL_CHECK_DEFAULTS = {
    /** `check_lognormal_m` — прайор `m` (середина шкалы ln[500; 500 000] ₽). */
    priorM: registryDefault(CHECK_LOGNORMAL_M_CODE),
    /** `check_lognormal_v` — прайор `v`. */
    priorV: registryDefault(CHECK_LOGNORMAL_V_CODE),
    /** Гейт оценки — `minN` дескриптора (20 продаж с суммой). */
    minN: findParam(CHECK_LOGNORMAL_M_CODE)?.minN ?? 20,
    /** κ усадки чека — константа `estimator` дескриптора. */
    kappa: 20,
    /** Число розыгрышей Монте-Карло для вилки денег. */
    draws: 2000,
    /** Уровень вилки денег — `forecast_interval_level`. */
    level: registryDefault('forecast_interval_level'),
} as const;

/** Диапазоны `m` и `v` из реестра — оценка клипается в них. */
export const LOGNORMAL_CHECK_M_RANGE: ParamRange = registryRangeOf(
    CHECK_LOGNORMAL_M_CODE,
) ?? [6.2146, 13.1224];
export const LOGNORMAL_CHECK_V_RANGE: ParamRange = registryRangeOf(
    CHECK_LOGNORMAL_V_CODE,
) ?? [0.01, 4];

/**
 * Порог, с которого сумма чеков считается по ЦПТ вместо прямого
 * розыгрыша: при таком числе слагаемых логнормальная сумма уже близка к
 * нормали, а прямая симуляция стоит `draws × N` нормалей.
 */
export const LOGNORMAL_SUM_CLT_FROM = 500;

/** Настройки оценки чека. */
export interface LognormalCheckOptions {
    readonly priorM?: number;
    readonly priorV?: number;
    readonly kappa?: number;
    readonly minN?: number;
}

/** Оценка параметров чека портала. */
export interface LognormalCheck {
    readonly m: number;
    readonly v: number;
    /** Продаж с положительной суммой в оценке. */
    readonly n: number;
    /** Вес собственных данных `w = n/(n + κ)`; 0 до гейта. */
    readonly w: number;
    readonly source: LognormalCheckSource;
}

/** Вилка числа продаж — вход перевода в деньги. */
export interface SalesBandLike {
    readonly low: number;
    readonly p50: number;
    readonly high: number;
}

/** Вход вилки денег. */
export interface MoneyBandInput {
    readonly salesBand: SalesBandLike;
    readonly m: number;
    readonly v: number;
    /** Seed потока Монте-Карло (`seedOf(domain, day, calcVersion)`). */
    readonly seed: number;
    readonly draws?: number;
    /** Уровень квантилей суммы чеков внутри сценариев low/high. */
    readonly level?: number;
}

/** Вилка денег, ₽. */
export interface MoneyBand {
    readonly low: number;
    readonly p50: number;
    readonly high: number;
}

const clip = (value: number, range: ParamRange): number =>
    Math.min(range[1], Math.max(range[0], value));

/** `E[X] = exp(m + v/2)` — ожидание одного чека. */
export const expectedCheck = (m: number, v: number): number =>
    Math.exp(m + v / 2);

/**
 * Оценка `m`, `v` по суммам продаж с усадкой `w = n/(n + κ)` к прайору.
 * `n < minN` → дефолт (`w = 0`); `κ ≤ 0` → чистая оценка (`w = 1`);
 * иначе — усадка. Дисперсия — несмещённая (`n − 1`).
 */
export function estimateLognormalCheck(
    amounts: readonly number[],
    options: LognormalCheckOptions = {},
): LognormalCheck {
    const priorM = options.priorM ?? LOGNORMAL_CHECK_DEFAULTS.priorM;
    const priorV = options.priorV ?? LOGNORMAL_CHECK_DEFAULTS.priorV;
    const kappa = Math.max(0, options.kappa ?? LOGNORMAL_CHECK_DEFAULTS.kappa);
    const minN = Math.max(2, options.minN ?? LOGNORMAL_CHECK_DEFAULTS.minN);
    const logs = amounts
        .filter(amount => Number.isFinite(amount) && amount > 0)
        .map(amount => Math.log(amount));
    const n = logs.length;
    if (n < minN) {
        return { m: priorM, v: priorV, n, w: 0, source: 'default' };
    }
    const mean = logs.reduce((sum, value) => sum + value, 0) / n;
    const variance =
        logs.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (n - 1);
    const w = kappa > 0 ? n / (n + kappa) : 1;

    return {
        m: clip(w * mean + (1 - w) * priorM, LOGNORMAL_CHECK_M_RANGE),
        v: clip(w * variance + (1 - w) * priorV, LOGNORMAL_CHECK_V_RANGE),
        n,
        w,
        source: w >= 1 ? 'estimated' : 'shrunk',
    };
}

/** Одна сумма `count` логнормальных чеков из потока `random`. */
function sumOfChecks(
    count: number,
    m: number,
    v: number,
    random: () => number,
): number {
    const sigma = Math.sqrt(v);
    if (count >= LOGNORMAL_SUM_CLT_FROM) {
        const mean = expectedCheck(m, v);
        const variance = (Math.exp(v) - 1) * Math.exp(2 * m + v);
        const sum =
            count * mean + Math.sqrt(count * variance) * sampleNormal(random);

        return Math.max(0, sum);
    }
    let sum = 0;
    for (let index = 0; index < count; index += 1) {
        sum += Math.exp(m + sigma * sampleNormal(random));
    }

    return sum;
}

/**
 * Квантиль `q` суммы `count` чеков: детерминированный Монте-Карло на
 * `random` (`draws` сумм, квантиль типа 7). При `count = 0` — 0.
 */
export function sumOfChecksQuantile(
    count: number,
    m: number,
    v: number,
    q: number,
    random: () => number,
    draws: number = LOGNORMAL_CHECK_DEFAULTS.draws,
): number {
    const n = Math.max(0, Math.round(count));
    if (n === 0) {
        return 0;
    }
    const sums: number[] = [];
    for (let draw = 0; draw < Math.max(1, draws); draw += 1) {
        sums.push(sumOfChecks(n, m, v, random));
    }

    return quantileOf(sums, q);
}

/**
 * Вилка денег по вилке продаж. Метод: три сценария числа продаж
 * (`low`, `p50`, `high`). Центр — `p50 · E[X]`, детерминированно и без
 * симуляции. Края — квантили суммы чеков внутри крайних сценариев:
 * `low` — квантиль `(1 − level)/2` суммы `low` чеков, `high` — квантиль
 * `1 − (1 − level)/2` суммы `high` чеков (Монте-Карло на `mulberry32(seed)`,
 * одинаковые входы → побитово одинаковый результат). Так вилка денег
 * учитывает и разброс числа продаж, и разброс чека; она консервативнее
 * точной свёртки и годится для теневого режима до L4.
 */
export function moneyBand(input: MoneyBandInput): MoneyBand {
    const random = mulberry32(input.seed);
    const draws = input.draws ?? LOGNORMAL_CHECK_DEFAULTS.draws;
    const level =
        typeof input.level === 'number' && Number.isFinite(input.level)
            ? Math.min(1, Math.max(0, input.level))
            : LOGNORMAL_CHECK_DEFAULTS.level;
    const tail = (1 - level) / 2;
    const p50 =
        Math.max(0, input.salesBand.p50) * expectedCheck(input.m, input.v);
    const low = sumOfChecksQuantile(
        input.salesBand.low,
        input.m,
        input.v,
        tail,
        random,
        draws,
    );
    const high = sumOfChecksQuantile(
        input.salesBand.high,
        input.m,
        input.v,
        1 - tail,
        random,
        draws,
    );

    return {
        low: Math.min(low, p50),
        p50,
        high: Math.max(high, p50),
    };
}
