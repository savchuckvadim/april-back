/**
 * Усадка портальной таблицы лага `F(d)` к общей и гибрид медианы цикла
 * (план §4.8: «≥ 100 — портальная таблица с усадкой к глобальной; гибрид:
 * прайор 28 → медиана портала, `w = n/(n + 20)`»; Фаза 4, поток
 * `p4-forecast-model`).
 *
 * `lag-cdf.ts` не правится: усадка — отдельный слой над `LagCdf`.
 * `F_shrunk(d) = w·F_portal(d) + (1 − w)·F_global(d)` — выпуклая
 * комбинация двух cure-форм, поэтому инварианты сохраняются сами:
 * `F(0) = 0`, монотонность, значения ∈ [0; 1], `F(∞) = 1`.
 *
 * Чистая математика: без DI, Bitrix, Prisma, `Date.now`/`Math.random`.
 */
import { registryDefault } from '../params/registry.access';
import type { LagCdf, LagCdfPoint } from './lag-cdf';

/** Откуда взялась итоговая таблица. */
export const AI_LAG_CDF_SHRINK_SOURCES = ['portal', 'shrunk'] as const;

export type LagCdfShrinkSource = (typeof AI_LAG_CDF_SHRINK_SOURCES)[number];

/** Дефолты усадки лага из реестра. */
export const LAG_CDF_SHRINK_DEFAULTS = {
    /** `lag_cdf_kappa` — вес прайора: `w = n/(n + κ)`. */
    kappa: registryDefault('lag_cdf_kappa'),
    /** `lag_cdf_portal_min_n` — гейт портальной таблицы с усадкой. */
    portalMinN: registryDefault('lag_cdf_portal_min_n'),
    /** `cycle_median_days` — прайор медианы цикла. */
    priorMedianDays: registryDefault('cycle_median_days'),
    /** `lag_window_sale_days` — длина общей сетки точек по умолчанию. */
    gridDays: registryDefault('lag_window_sale_days'),
} as const;

/** Таблица после усадки: `LagCdf` плюс вес и точки на общей сетке. */
export interface ShrunkLagCdf extends LagCdf {
    readonly kind: 'table';
    /** Вес портала `w = n/(n + κ)`; 1 — усадки не было. */
    readonly w: number;
    /** Точки `F(d)` на сетке `1..gridDays` — для снапшота. */
    readonly points: readonly LagCdfPoint[];
    readonly source: LagCdfShrinkSource;
}

/** Настройки усадки таблицы. */
export interface ShrinkLagCdfOptions {
    readonly kappa?: number;
    /** Сетка точек `1..gridDays`; по умолчанию окно атрибуции. */
    readonly gridDays?: number;
}

/** Вход гибрида медианы цикла. */
export interface HybridCycleMedianInput {
    /** Прайор; по умолчанию `cycle_median_days`. */
    readonly prior?: number;
    /** Медиана лага портала; null — не определена. */
    readonly portalMedian: number | null;
    /** Закрытых продаж в оценке портала. */
    readonly n: number;
    readonly kappa?: number;
}

/** Гибридная медиана и вес портала. */
export interface HybridCycleMedian {
    readonly median: number;
    readonly w: number;
}

const HALF = 0.5;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

const positiveOr = (value: number | undefined, fallback: number): number =>
    typeof value === 'number' && Number.isFinite(value) && value > 0
        ? value
        : fallback;

/** `w = n/(n + κ)`; при `κ ≤ 0` — 1, при `n ≤ 0` — 0. */
export function shrinkWeight(n: number, kappa: number): number {
    const size = Math.max(0, Number.isFinite(n) ? n : 0);
    const prior = Math.max(0, Number.isFinite(kappa) ? kappa : 0);
    if (size <= 0) {
        return 0;
    }
    if (prior <= 0) {
        return 1;
    }

    return size / (size + prior);
}

/** Гейт «портальная таблица с усадкой»: `n ≥ lag_cdf_portal_min_n`. */
export function portalTableGate(
    n: number,
    minN: number = LAG_CDF_SHRINK_DEFAULTS.portalMinN,
): boolean {
    return Number.isFinite(n) && n >= Math.max(1, minN);
}

/** Точки `F(d)` на сетке `1..gridDays` по функции `at`. */
function gridPoints(
    at: (days: number) => number,
    gridDays: number,
): LagCdfPoint[] {
    const days = Math.max(1, Math.floor(gridDays));
    const points: LagCdfPoint[] = [];
    let running = 0;
    for (let day = 1; day <= days; day += 1) {
        running = Math.max(running, clamp01(at(day)));
        points.push({ days: day, value: running });
    }

    return points;
}

const medianOfPoints = (points: readonly LagCdfPoint[]): number | null =>
    points.find(point => point.value >= HALF)?.days ?? null;

/**
 * Усадка портальной таблицы к общей: `F = w·F_portal + (1 − w)·F_global`,
 * `w = n/(n + κ)`. Без общей таблицы (`null`) портал берётся как есть
 * (`w = 1`, `source: 'portal'`). `at` считается точно на любом `d`,
 * точки сетки — снимок для снапшота; медиана — по сетке.
 */
export function shrinkLagCdf(
    portal: LagCdf,
    global: LagCdf | null,
    n: number,
    options: ShrinkLagCdfOptions = {},
): ShrunkLagCdf {
    const kappa = options.kappa ?? LAG_CDF_SHRINK_DEFAULTS.kappa;
    const gridDays = positiveOr(
        options.gridDays,
        LAG_CDF_SHRINK_DEFAULTS.gridDays,
    );
    const w = global === null ? 1 : shrinkWeight(n, kappa);
    const at = (days: number): number => {
        if (!Number.isFinite(days) || days <= 0) {
            return 0;
        }
        const own = clamp01(portal.at(days));
        if (global === null || w >= 1) {
            return own;
        }

        return w * own + (1 - w) * clamp01(global.at(days));
    };
    const points = gridPoints(at, gridDays);

    return {
        kind: 'table',
        medianDays: medianOfPoints(points),
        n: Math.max(0, Number.isFinite(n) ? n : 0),
        at,
        w,
        points,
        source: global === null || w >= 1 ? 'portal' : 'shrunk',
    };
}

/**
 * Гибрид медианы цикла «прайор → медиана портала»:
 * `median = w·portalMedian + (1 − w)·prior`, `w = n/(n + κ)`.
 * Без медианы портала — прайор с `w = 0`.
 */
export function hybridCycleMedian(
    input: HybridCycleMedianInput,
): HybridCycleMedian {
    const prior = positiveOr(
        input.prior,
        LAG_CDF_SHRINK_DEFAULTS.priorMedianDays,
    );
    const kappa = input.kappa ?? LAG_CDF_SHRINK_DEFAULTS.kappa;
    if (
        input.portalMedian === null ||
        !Number.isFinite(input.portalMedian) ||
        input.portalMedian <= 0
    ) {
        return { median: prior, w: 0 };
    }
    const w = shrinkWeight(input.n, kappa);

    return { median: w * input.portalMedian + (1 - w) * prior, w };
}
