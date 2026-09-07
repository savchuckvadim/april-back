import { KAPPA_DEFAULTS } from './kappa';
import { ShrinkPrior } from './shrink';

/**
 * Слой, с которого взята норма μ (план §4.2): полоса стажа, портал или
 * глобальный дефолт из дампа. До появления пула kappa_portal_to_global = 0,
 * поэтому верхний слой одно-портального режима — сам портал (LOO).
 */
export type NormLayer = 'tenure' | 'portal' | 'global';

/** Менеджер-ячейка нормы: переходы s из знаменателя n за окно оценки. */
export interface NormCell {
    managerId: string;
    /** Полоса стажа tenure_bands (0–6 / 6–18 / 18+ мес.), не уровень РОПа. */
    tenureBand?: string | null;
    s: number;
    n: number;
    /** Экспозиция помечена excludeFromNorms (proxy или D < 8 дней). */
    excludeFromNorms?: boolean;
}

/** Глобальный дефолт μ_0k и его сила κ (0 — до появления пула). */
export interface NormGlobalPrior {
    mu: number;
    kappa: number;
}

export interface NormHierarchyInput {
    /** Все менеджер-ячейки портала за окно оценки. */
    cells: readonly NormCell[];
    /** Менеджер, для которого считается норма: исключается из пула. */
    managerId: string;
    /** Полоса стажа этого менеджера; null/undefined — сразу слой портала. */
    tenureBand?: string | null;
    /** Минимум менеджеров полосы для собственного слоя, по умолчанию 3. */
    minBandManagers?: number;
    /** Глобальный слой; null — kappa_portal_to_global = 0. */
    global?: NormGlobalPrior | null;
}

export interface NormResult {
    /** μ слоя без менеджера m. */
    value: number;
    layer: NormLayer;
    /** Знаменатель слоя (без глобального прайора). */
    n: number;
    /** Доля данных слоя: n/(n + κ_global); при κ_global = 0 → 1. */
    w: number;
    /** Менеджер, исключённый из пула (leave-one-out). */
    excludedManagerId: string;
}

/** Дефолты иерархии норм (план §4.2). */
export const NORM_HIERARCHY_DEFAULTS = {
    minBandManagers: 3,
    /** kappa_portal_to_global: до пула 0 — глобальный слой не подмешивается. */
    portalToGlobal: KAPPA_DEFAULTS.portalToGlobal,
} as const;

interface NormPool {
    s: number;
    n: number;
    managers: number;
}

const emptyPool = (): NormPool => ({ s: 0, n: 0, managers: 0 });

function poolOf(cells: readonly NormCell[]): NormPool {
    return cells.reduce<NormPool>(
        (acc, cell) => ({
            s: acc.s + Math.max(0, cell.s),
            n: acc.n + Math.max(0, cell.n),
            managers: acc.managers + 1,
        }),
        emptyPool(),
    );
}

/**
 * Норма слоя leave-one-out (план §4.2): μ_lk — полоса стажа без менеджера m
 * при ≥ minBandManagers менеджерах полосы, иначе μ_pk — портал без m.
 * Из пула выбрасываются менеджер m и все менеджер-месяцы с
 * excludeFromNorms (daysSource proxy или D < min_workdays_month).
 * Глобальный слой подмешивается только при κ_global > 0 (после пула);
 * при пустом пуле портала норма — глобальный дефолт μ_0k с w = 0.
 */
export function leaveOneOutNorm(input: NormHierarchyInput): NormResult {
    const minBand =
        input.minBandManagers ?? NORM_HIERARCHY_DEFAULTS.minBandManagers;
    const usable = input.cells.filter(
        cell =>
            cell.managerId !== input.managerId &&
            cell.excludeFromNorms !== true &&
            cell.n > 0,
    );
    const band = input.tenureBand
        ? usable.filter(cell => cell.tenureBand === input.tenureBand)
        : [];
    const useBand = band.length >= minBand;
    const pool = poolOf(useBand ? band : usable);
    const globalKappa = Math.max(
        0,
        input.global?.kappa ?? NORM_HIERARCHY_DEFAULTS.portalToGlobal,
    );
    const globalMu = input.global?.mu ?? 0;
    const denominator = pool.n + globalKappa;
    if (denominator <= 0) {
        return {
            value: globalMu,
            layer: 'global',
            n: 0,
            w: 0,
            excludedManagerId: input.managerId,
        };
    }
    return {
        value: (pool.s + globalKappa * globalMu) / denominator,
        layer: pool.n <= 0 ? 'global' : useBand ? 'tenure' : 'portal',
        n: pool.n,
        w: pool.n / denominator,
        excludedManagerId: input.managerId,
    };
}

/**
 * Норма слоя как прайор усадки: μ из иерархии, κ — сила слоя
 * (layerKappa(...) из kappa.ts либо κ_a для темпов).
 */
export function toShrinkPrior(norm: NormResult, kappa: number): ShrinkPrior {
    return { mu: norm.value, kappa: Math.max(0, kappa) };
}
