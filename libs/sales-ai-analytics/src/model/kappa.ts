/**
 * Сила усадки κ (план §4.2): κ_a для темпов активностей, κ_k для рёбер
 * (гибрид «настройка → оценка Клейнмана»), κ слоя как доля типичной
 * экспозиции. Все усреднения и регуляризация к пулу — в log κ.
 */

/** Менеджерская ячейка ребра за окно оценки: переходы s из знаменателя n. */
export interface KappaCell {
    managerId: string;
    s: number;
    n: number;
}

/** Откуда взялась κ ребра. */
export type EdgeKappaSource = 'early' | 'late' | 'kleinman';

/** Пул порталов: κ̄_k пула и K_p — размер собственной выборки портала. */
export interface EdgeKappaPool {
    kappaBar: number;
    portalManagers: number;
    /** Вес прайора пула, по умолчанию 10 (план §4.2). */
    weight?: number;
}

export interface EdgeKappaParams {
    edgeEarly: number;
    edgeLate: number;
    lateFromMonths: number;
    min: number;
    max: number;
    gateMonths: number;
    gateManagers: number;
    poolPriorWeight: number;
}

export interface EdgeKappaInput {
    /** Менеджерские ячейки ребра портала за окно оценки. */
    cells: readonly KappaCell[];
    /** Месяцев сравнимой истории портала. */
    months: number;
    /** Пул порталов; null/undefined — одно-портальный режим. */
    pool?: EdgeKappaPool | null;
    /** Переопределения реестра параметров. */
    params?: Partial<EdgeKappaParams>;
}

export interface EdgeKappaResult {
    kappa: number;
    source: EdgeKappaSource;
    /** Оценка внутриклассовой корреляции; null — не считалась. */
    rho: number | null;
    /** ρ̂ ≤ 0 — менеджеры неразличимы, полная усадка κ_max. */
    homogeneous: boolean;
    /** Гейт «≥ 6 мес. и ≥ 5 менеджеров» открыт. */
    gateOpen: boolean;
    managers: number;
    months: number;
    /** κ̂ до регуляризации к пулу; null — оценка не считалась. */
    kappaHat: number | null;
}

/** Дефолты реестра параметров усадки (план §4.2). */
export const KAPPA_DEFAULTS = {
    /** κ_a = kappa_activity_days для темпов активностей. */
    activityDays: 20,
    edgeEarly: 100,
    edgeLate: 30,
    /** До этого числа месяцев истории действует kappa_edge_early. */
    lateFromMonths: 3,
    min: 5,
    max: 500,
    gateMonths: 6,
    gateManagers: 5,
    poolPriorWeight: 10,
    /** ρ_κ = kappa_layer_ratio: κ слоя = ρ_κ · median(знаменателей). */
    layerRatio: 0.4,
    /** kappa_portal_to_global до появления пула. */
    portalToGlobal: 0,
} as const;

const clip = (x: number, low: number, high: number): number =>
    Math.min(high, Math.max(low, x));

/** Медиана выборки (среднее двух центральных при чётной длине). */
export function medianOf(values: readonly number[]): number {
    const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
    if (sorted.length === 0) {
        return 0;
    }
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 1
        ? sorted[middle]
        : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * κ слоя как доля типичной экспозиции слоя (план §4.2):
 * κ_level,k = ρ_κ · median(ñ_mk). Единица — знаменатель ребра или дни темпа,
 * поэтому сила слоя сопоставима у E1 (≈ 120 звонков) и E4 (≈ 3 счёта).
 */
export function layerKappa(
    denominators: readonly number[],
    ratio: number = KAPPA_DEFAULTS.layerRatio,
): number {
    const positive = denominators.filter(value => value > 0);
    return Math.max(0, ratio) * medianOf(positive);
}

/**
 * Оценка внутриклассовой корреляции ρ по методу моментов (Клейнман):
 * при E[Σ n_i(p̂_i − p̄)²] = p̄(1 − p̄)[(m − 1) + ρ(N − Σn_i²/N)]
 * ρ̂ = (S/(p̄(1 − p̄)) − (m − 1)) / (N − Σn_i²/N).
 * null — оценка невозможна: меньше двух ячеек, вырожденное p̄ (0 или 1)
 * либо нулевой разброс размеров при единственной ячейке.
 */
export function kleinmanRho(cells: readonly KappaCell[]): number | null {
    const usable = cells.filter(cell => cell.n > 0);
    if (usable.length < 2) {
        return null;
    }
    const total = usable.reduce((sum, cell) => sum + cell.n, 0);
    const hits = usable.reduce((sum, cell) => sum + clip(cell.s, 0, cell.n), 0);
    const pBar = hits / total;
    if (pBar <= 0 || pBar >= 1) {
        return null;
    }
    const scatter = usable.reduce(
        (sum, cell) =>
            sum + cell.n * Math.pow(clip(cell.s, 0, cell.n) / cell.n - pBar, 2),
        0,
    );
    const sumSquares = usable.reduce((sum, cell) => sum + cell.n * cell.n, 0);
    const spread = total - sumSquares / total;
    if (spread <= 0) {
        return null;
    }
    return (scatter / (pBar * (1 - pBar)) - (usable.length - 1)) / spread;
}

/**
 * κ̂ из ρ̂: ρ̂ ≤ 0 (разброс ниже биномиального — менеджеры однородны) →
 * κ_max = 500, полная усадка; иначе clip((1 − ρ̂)/ρ̂, 5, 500).
 */
export function kappaFromRho(
    rho: number,
    min: number = KAPPA_DEFAULTS.min,
    max: number = KAPPA_DEFAULTS.max,
): number {
    if (!Number.isFinite(rho) || rho <= 0) {
        return max;
    }
    return clip((1 - rho) / rho, min, max);
}

/**
 * Регуляризация к пулу в логарифмической шкале (план §4.2):
 * log κ_pk = (K_p·log κ̂ + 10·log κ̄_k) / (K_p + 10).
 * Пул без положительной κ̄ или нулевой суммарный вес → κ̂ без изменений.
 */
export function regularizeKappaLog(
    kappaHat: number,
    portalManagers: number,
    kappaBar: number,
    weight: number = KAPPA_DEFAULTS.poolPriorWeight,
): number {
    if (!(kappaHat > 0)) {
        return kappaHat;
    }
    const own = Math.max(0, portalManagers);
    const priorWeight = Math.max(0, weight);
    if (!(kappaBar > 0) || own + priorWeight <= 0) {
        return kappaHat;
    }
    const logKappa =
        (own * Math.log(kappaHat) + priorWeight * Math.log(kappaBar)) /
        (own + priorWeight);
    return Math.exp(logKappa);
}

/** Среднее κ в логарифмической шкале — геометрическое среднее. */
export function meanKappaLog(values: readonly number[]): number {
    const positive = values.filter(value => value > 0);
    if (positive.length === 0) {
        return 0;
    }
    const logs = positive.reduce((sum, value) => sum + Math.log(value), 0);
    return Math.exp(logs / positive.length);
}

function resolveParams(
    overrides: Partial<EdgeKappaParams> | undefined,
): EdgeKappaParams {
    return {
        edgeEarly: overrides?.edgeEarly ?? KAPPA_DEFAULTS.edgeEarly,
        edgeLate: overrides?.edgeLate ?? KAPPA_DEFAULTS.edgeLate,
        lateFromMonths:
            overrides?.lateFromMonths ?? KAPPA_DEFAULTS.lateFromMonths,
        min: overrides?.min ?? KAPPA_DEFAULTS.min,
        max: overrides?.max ?? KAPPA_DEFAULTS.max,
        gateMonths: overrides?.gateMonths ?? KAPPA_DEFAULTS.gateMonths,
        gateManagers: overrides?.gateManagers ?? KAPPA_DEFAULTS.gateManagers,
        poolPriorWeight:
            overrides?.poolPriorWeight ?? KAPPA_DEFAULTS.poolPriorWeight,
    };
}

function beforeGate(
    months: number,
    managers: number,
    params: EdgeKappaParams,
): EdgeKappaResult {
    const early = months < params.lateFromMonths;
    return {
        kappa: early ? params.edgeEarly : params.edgeLate,
        source: early ? 'early' : 'late',
        rho: null,
        homogeneous: false,
        gateOpen: false,
        managers,
        months,
        kappaHat: null,
    };
}

/**
 * κ_k ребра — гибрид (план §4.2). До гейта — настройка: kappa_edge_early
 * (первые lateFromMonths месяцев истории) и далее kappa_edge_late. При
 * ≥ gateMonths месяцев и ≥ gateManagers менеджерах — оценка Клейнмана по
 * методу моментов с регуляризацией к пулу в log κ. Неоцениваемое ρ̂
 * (вырожденное p̄) — возврат к настройке при открытом гейте.
 */
export function estimateEdgeKappa(input: EdgeKappaInput): EdgeKappaResult {
    const params = resolveParams(input.params);
    const cells = input.cells.filter(cell => cell.n > 0);
    const managers = cells.length;
    const months = Math.max(0, input.months);
    const gateOpen =
        months >= params.gateMonths && managers >= params.gateManagers;
    if (!gateOpen) {
        return beforeGate(months, managers, params);
    }
    const rho = kleinmanRho(cells);
    if (rho === null) {
        return { ...beforeGate(months, managers, params), gateOpen: true };
    }
    const kappaHat = kappaFromRho(rho, params.min, params.max);
    const pool = input.pool;
    return {
        kappa: pool
            ? regularizeKappaLog(
                  kappaHat,
                  pool.portalManagers,
                  pool.kappaBar,
                  pool.weight ?? params.poolPriorWeight,
              )
            : kappaHat,
        source: 'kleinman',
        rho,
        homogeneous: rho <= 0,
        gateOpen: true,
        managers,
        months,
        kappaHat,
    };
}
