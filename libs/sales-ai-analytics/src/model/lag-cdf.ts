/**
 * Распределение лага «активность → оплата» `F(d)` и средняя зрелость
 * пайплайна (план §4.8; Фаза 2, поток `p2-model-forecast-plan`).
 *
 * **Шкала.** `F(d)` — распределение лага **среди проданных** (cure-форма):
 * `F(0) = 0`, монотонно, `F(∞) = 1`, значения ∈ [0; 1]; доля «не купят»
 * сидит в `θ_j` стадии. Диапазон анкеты Ж [0,03; 0,3] — это **безусловная**
 * CIF продажи `cif_sale_inf`, другой код реестра: `F(28) = 0,5` проходит.
 *
 * Чистая математика без DI, Bitrix, Prisma, `Date.now`/`Math.random`;
 * дефолты и диапазоны — из реестра параметров (`params/`), не литералами.
 */
import {
    isRegistryValue,
    registryDefault,
    registryRangeOf,
} from '../params/registry.access';
import { findParam, type AiAnalyticsParamCode } from '../params/registry.const';
import type { ParamRange } from '../params/registry.types';

/** Форма ожидания от пайплайна (словарь `pipeline_estimand`); смешивать формы запрещено (§4.8). */
export { AI_PIPELINE_ESTIMANDS } from '../params/registry.enums.const';
export type { AiPipelineEstimand } from '../params/registry.enums.const';

/** Как получена таблица `F(d)`. */
export const AI_LAG_CDF_KINDS = [
    'exponential',
    'kaplan-meier',
    'table',
] as const;

/** Источник распределения лага. */
export type LagCdfKind = (typeof AI_LAG_CDF_KINDS)[number];

/** Точка ступенчатой таблицы `F(d)`. */
export interface LagCdfPoint {
    readonly days: number;
    readonly value: number;
}

/** Распределение лага среди проданных эпизодов. */
export interface LagCdf {
    readonly kind: LagCdfKind;
    /** Медиана лага в днях; null — не определена на выборке. */
    readonly medianDays: number | null;
    /** Объём выборки продаж, на которой построена таблица. */
    readonly n: number;
    /** `F(d)` — доля проданных, оплативших не позже дня d. */
    readonly at: (days: number) => number;
}

/** Лаг одной закрытой продажи; за окном атрибуции лаг цензурируется. */
export interface SaleLag {
    readonly days: number;
    readonly censored?: boolean;
}

/** Коды реестра: распределение лага и безусловная CIF — разные величины. */
export const LAG_CDF_PARAM_CODE = 'lag_cdf_F' satisfies AiAnalyticsParamCode;
export const CIF_SALE_INF_PARAM_CODE =
    'cif_sale_inf' satisfies AiAnalyticsParamCode;

/** Дефолты реестра, участвующие в оценке `F(d)`. */
export const LAG_CDF_DEFAULTS = {
    /** `cycle_median_days` — медиана цикла до оценки Каплана–Мейера. */
    medianDays: registryDefault('cycle_median_days'),
    /** `lag_window_sale_days` — окно атрибуции продажи. */
    windowDays: registryDefault('lag_window_sale_days'),
    /** Гейт таблицы Каплана–Мейера: `minN` кода `lag_cdf_F` (30 продаж). */
    minSales: findParam(LAG_CDF_PARAM_CODE)?.minN ?? 30,
    /** `f_min` — нижняя граница зрелости в обратной задаче. */
    fMin: registryDefault('f_min'),
} as const;

/** Диапазоны из реестра: `F(d)` — вся шкала [0; 1], CIF — [0,03; 0,3]. */
export const LAG_CDF_VALUE_RANGE: ParamRange = registryRangeOf(
    LAG_CDF_PARAM_CODE,
) ?? [0, 1];
export const CIF_SALE_INF_RANGE: ParamRange = registryRangeOf(
    CIF_SALE_INF_PARAM_CODE,
) ?? [0.03, 0.3];

/** Максимум дней в расчёте средней зрелости — защита от бесконечных сумм. */
export const LAG_CDF_MAX_DAYS = 3660;

const HALF = 0.5;

/** Значение `F(d)` допустимо в cure-форме: вся шкала [0; 1], включая 0,5. */
export const isValidLagCdfValue = (value: number): boolean =>
    isRegistryValue(LAG_CDF_PARAM_CODE, value);

/** Значение безусловной CIF продажи допустимо: узкий диапазон [0,03; 0,3]. */
export const isValidCifSaleInf = (value: number): boolean =>
    isRegistryValue(CIF_SALE_INF_PARAM_CODE, value);

/**
 * Валидатор значения по коду реестра — диапазон берётся из дескриптора.
 * Разделение кодов — суть исправления: `F(28) = 0,5` проходит как
 * распределение лага и отвергается как CIF. Чужой код — только конечность.
 */
export function validatePipelineParamValue(
    code: string,
    value: number,
): boolean {
    if (code === CIF_SALE_INF_PARAM_CODE || code === LAG_CDF_PARAM_CODE) {
        return isRegistryValue(code, value);
    }

    return Number.isFinite(value);
}

/**
 * Экспоненциальное распределение лага с заданной медианой:
 * `F(d) = 1 − 2^(−d/m)`. Прайор до гейта Каплана–Мейера (§4.8).
 */
export function exponentialLagCdf(
    medianDays: number = LAG_CDF_DEFAULTS.medianDays,
): LagCdf {
    const median =
        Number.isFinite(medianDays) && medianDays > 0
            ? medianDays
            : LAG_CDF_DEFAULTS.medianDays;

    return {
        kind: 'exponential',
        medianDays: median,
        n: 0,
        at: (days: number) => {
            if (!Number.isFinite(days) || days <= 0) {
                return 0;
            }

            return 1 - Math.pow(2, -days / median);
        },
    };
}

/** Монотонная ступенчатая таблица: сортировка, клип [0; 1], бегущий максимум. */
function normalizePoints(
    points: readonly LagCdfPoint[],
    normalize: boolean,
): LagCdfPoint[] {
    const sorted = [...points]
        .filter(point => Number.isFinite(point.days) && point.days >= 0)
        .sort((a, b) => a.days - b.days);
    let running = 0;
    const monotone = sorted.map(point => {
        const clamped = Math.min(1, Math.max(0, point.value));
        running = Math.max(running, clamped);

        return { days: point.days, value: running };
    });
    if (!normalize || running <= 0) {
        return monotone;
    }

    return monotone.map(point => ({
        days: point.days,
        value: point.value / running,
    }));
}

const valueAt = (points: readonly LagCdfPoint[], days: number): number => {
    if (!Number.isFinite(days) || days <= 0) {
        return 0;
    }
    let value = 0;
    for (const point of points) {
        if (point.days > days) {
            break;
        }
        value = point.value;
    }

    return value;
};

const medianOfPoints = (points: readonly LagCdfPoint[]): number | null =>
    points.find(point => point.value >= HALF)?.days ?? null;

/**
 * Готовая таблица `F(d)` — портальная оценка или фикстура теста. При
 * `normalize` таблица приводится к cure-форме `F(∞) = 1`.
 */
export function lagCdfFromTable(
    points: readonly LagCdfPoint[],
    options: {
        readonly kind?: LagCdfKind;
        readonly normalize?: boolean;
        readonly n?: number;
    } = {},
): LagCdf {
    const table = normalizePoints(points, options.normalize === true);

    return {
        kind: options.kind ?? 'table',
        medianDays: medianOfPoints(table),
        n: options.n ?? table.length,
        at: (days: number) => valueAt(table, days),
    };
}

/**
 * Отбор продаж для оценки `F(d)`: лаг больше окна атрибуции в оценку не
 * входит и помечается цензурой (правило шкалы `F(d)` Фазы 2).
 */
export function selectSaleLags(
    lags: readonly SaleLag[],
    windowDays: number = LAG_CDF_DEFAULTS.windowDays,
): SaleLag[] {
    const window =
        Number.isFinite(windowDays) && windowDays > 0
            ? windowDays
            : LAG_CDF_DEFAULTS.windowDays;

    return lags
        .filter(lag => Number.isFinite(lag.days) && lag.days >= 0)
        .map(lag =>
            lag.days > window
                ? { days: window, censored: true }
                : { days: lag.days, censored: lag.censored === true },
        );
}

/** Ступени Каплана–Мейера по проданным, нормированные к `F(∞) = 1`. */
function kaplanMeierPoints(lags: readonly SaleLag[]): LagCdfPoint[] {
    const times = [
        ...new Set(lags.filter(lag => !lag.censored).map(lag => lag.days)),
    ].sort((a, b) => a - b);
    let survival = 1;
    const points: LagCdfPoint[] = [];
    for (const time of times) {
        const atRisk = lags.filter(lag => lag.days >= time).length;
        const deaths = lags.filter(
            lag => !lag.censored && lag.days === time,
        ).length;
        if (atRisk <= 0) {
            continue;
        }
        survival *= 1 - deaths / atRisk;
        points.push({ days: time, value: 1 - survival });
    }

    return normalizePoints(points, true);
}

/**
 * Таблица `F(d)` по Каплану–Мейеру среди проданных эпизодов. До гейта
 * `minN` закрытых продаж в окне атрибуции — null: вызывающий код обязан
 * откатиться к экспоненте с медианой цикла.
 */
export function kaplanMeierLagCdf(
    lags: readonly SaleLag[],
    minN: number = LAG_CDF_DEFAULTS.minSales,
    windowDays: number = LAG_CDF_DEFAULTS.windowDays,
): LagCdf | null {
    const selected = selectSaleLags(lags, windowDays);
    const events = selected.filter(lag => !lag.censored);
    if (events.length < Math.max(1, minN)) {
        return null;
    }
    const table = kaplanMeierPoints(selected);
    if (table.length === 0) {
        return null;
    }

    return {
        kind: 'kaplan-meier',
        medianDays: medianOfPoints(table),
        n: events.length,
        at: (days: number) => valueAt(table, days),
    };
}

/**
 * Средняя зрелость `F̄(D) = (1/D)·Σ_{i=1..D} F(i)` (§4.8). Новые активности
 * появляются равномерно по остатку месяца, поэтому доля созревших берётся
 * как среднее по дням, а не значение `F(D)` на последний день.
 */
export function meanMaturity(cdf: LagCdf, daysRemaining: number): number {
    if (!Number.isFinite(daysRemaining) || daysRemaining <= 0) {
        return 0;
    }
    const days = Math.min(Math.floor(daysRemaining), LAG_CDF_MAX_DAYS);
    if (days <= 0) {
        return 0;
    }
    let sum = 0;
    for (let day = 1; day <= days; day += 1) {
        sum += cdf.at(day);
    }

    return sum / days;
}

/** Зрелость с нижней границей `f_min` — защита от деления на почти ноль. */
export const maturityFloor = (
    fBar: number,
    fMin: number = LAG_CDF_DEFAULTS.fMin,
): number => Math.max(Number.isFinite(fBar) ? fBar : 0, fMin);
