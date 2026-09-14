import { findParam } from '../params/registry.const';

/**
 * Сверхдисперсия темпов активностей φ (план §4.2, код реестра
 * `overdispersion_default`): во сколько раз дисперсия числа активностей
 * выше пуассоновской. Делит экспозицию в апостериоре темпа (Ñ/φ, D̃/φ) и
 * нормирует остатки для CUSUM. Оценка — квази-Пуассон по остаткам Пирсона
 * менеджер × тип активности; до гейта по объёму данных действует дефолт.
 */

/** Точка ряда: события y за период при экспозиции e (рабочие дни). */
export interface OverdispersionPoint {
    count: number;
    exposure: number;
    /**
     * Ячейка «менеджер × тип активности»: средняя μ_i = a_c·e_i считается
     * внутри ячейки. Без ключа все точки — одна ячейка.
     */
    cellKey?: string;
}

/** Откуда взялась φ: дефолт реестра до гейта или оценка по данным. */
export type OverdispersionSource = 'default' | 'estimated';

/** Гейт и границы оценки; дефолты — из дескриптора реестра. */
export interface OverdispersionOptions {
    /** φ до гейта (прайор гибрида `overdispersion_default`). */
    fallback: number;
    /** Минимум недель (точек ряда) для оценки — `minN` дескриптора. */
    minWeeks: number;
    /** Нижняя граница клипа — `range[0]` дескриптора. */
    min: number;
    /** Верхняя граница клипа — `range[1]` дескриптора. */
    max: number;
}

/** Совместимый с апостериором темпа минимум оценки: φ и её источник. */
export interface OverdispersionEstimate {
    phi: number;
    source: OverdispersionSource;
}

export interface OverdispersionResult extends OverdispersionEstimate {
    /** Недель (точек с положительной экспозицией) в информативных ячейках. */
    weeks: number;
    /** Информативных ячеек (с хотя бы одним событием). */
    cells: number;
    /** Оценка Пирсона до клипа; null — оценки не было (гейт). */
    phiHat: number | null;
}

/** Код дескриптора реестра, откуда берутся дефолт, гейт и границы. */
export const OVERDISPERSION_PARAM_CODE = 'overdispersion_default';

const PHI_DESCRIPTOR = findParam(OVERDISPERSION_PARAM_CODE);

/**
 * Дефолты сверхдисперсии из реестра (`overdispersion_default`:
 * прайор 2,5, гейт ≥ 12 недель, диапазон [1; 6]). Числа в правой части —
 * страховка на случай смены дескриптора, а не второй источник правды.
 */
export const DISPERSION_DEFAULTS: Readonly<OverdispersionOptions> = {
    fallback:
        typeof PHI_DESCRIPTOR?.defaultValue === 'number'
            ? PHI_DESCRIPTOR.defaultValue
            : 2.5,
    minWeeks: PHI_DESCRIPTOR?.minN ?? 12,
    min: PHI_DESCRIPTOR?.range?.[0] ?? 1,
    max: PHI_DESCRIPTOR?.range?.[1] ?? 6,
};

const DEFAULT_CELL_KEY = '';

interface CellAccumulator {
    points: OverdispersionPoint[];
    events: number;
    exposure: number;
}

const isUsable = (point: OverdispersionPoint): boolean =>
    Number.isFinite(point.count) &&
    Number.isFinite(point.exposure) &&
    point.exposure > 0;

/** Точки по ячейкам с суммами событий и экспозиции. */
function groupCells(
    series: readonly OverdispersionPoint[],
): Map<string, CellAccumulator> {
    const cells = new Map<string, CellAccumulator>();
    series.filter(isUsable).forEach(point => {
        const key = point.cellKey ?? DEFAULT_CELL_KEY;
        const cell = cells.get(key) ?? { points: [], events: 0, exposure: 0 };
        cell.points.push(point);
        cell.events += Math.max(0, point.count);
        cell.exposure += point.exposure;
        cells.set(key, cell);
    });
    return cells;
}

const clip = (value: number, low: number, high: number): number =>
    Math.min(high, Math.max(low, value));

/**
 * Квази-пуассоновская дисперсия Пирсона:
 * φ̂ = Σ (y_i − μ_i)²/μ_i / (n − k), μ_i = a_c·e_i, a_c = Σy/Σe ячейки,
 * n — недель, k — ячеек (по одному подобранному темпу на ячейку; при одной
 * ячейке знаменатель n − 1). Ячейки без событий информации о дисперсии не
 * несут и в n, k не входят. Гейт: n < minWeeks или n − k < 1 → дефолт
 * (`source: 'default'`), иначе оценка клипается в [min; max].
 */
export function quasiPoissonPhi(
    series: readonly OverdispersionPoint[],
    options: Partial<OverdispersionOptions> = {},
): OverdispersionResult {
    const opts: OverdispersionOptions = { ...DISPERSION_DEFAULTS, ...options };
    const informative = [...groupCells(series).values()].filter(
        cell => cell.events > 0,
    );
    const weeks = informative.reduce(
        (acc, cell) => acc + cell.points.length,
        0,
    );
    const cells = informative.length;
    const dof = weeks - cells;
    const fallback = clip(opts.fallback, opts.min, opts.max);
    if (weeks < Math.max(1, opts.minWeeks) || dof < 1) {
        return { phi: fallback, source: 'default', weeks, cells, phiHat: null };
    }
    const pearson = informative.reduce((acc, cell) => {
        const rate = cell.events / cell.exposure;
        return (
            acc +
            cell.points.reduce((sum, point) => {
                const mean = rate * point.exposure;
                return sum + (Math.max(0, point.count) - mean) ** 2 / mean;
            }, 0)
        );
    }, 0);
    const phiHat = pearson / dof;
    return {
        phi: clip(phiHat, opts.min, opts.max),
        source: 'estimated',
        weeks,
        cells,
        phiHat,
    };
}
