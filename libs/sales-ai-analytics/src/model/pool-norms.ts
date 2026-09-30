/**
 * Нормы рёбер пула (план §4.2, §4.11 «Ежеквартально»): μ_0k — n-взвешенное
 * среднее μ порталов, κ̄_k — среднее κ в логарифмах (`meanKappaLog`), τ_0k —
 * межпортальный разброс μ на шкале связи (logit для вероятностей, log для
 * интенсивностей). Адаптеры отдают формы `EdgeKappaPool` (kappa.ts) и
 * `NormGlobalPrior` (norms-hierarchy.ts).
 *
 * Чистая математика: без DI, Bitrix, Prisma; порядок рёбер фиксирован
 * сортировкой по коду ребра и трактовке, порядок сумм — порядок порталов.
 */
import type { ParamEdgeEstimand } from '../params/registry.types';
import { KAPPA_DEFAULTS, meanKappaLog, type EdgeKappaPool } from './kappa';
import type { NormGlobalPrior } from './norms-hierarchy';
import type {
    PoolEdgeNorm,
    PoolPortalEdge,
    PoolPortalInput,
} from './pool.types';
import { logit } from './quality-curve';

/** Минимум порталов для оценки межпортального разброса τ_0. */
export const POOL_NORMS_MIN_PORTALS_TAU = 2;

/** Ячейка ребра пригодна: конечные μ, κ > 0 и знаменатель n > 0. */
export const isUsablePoolEdge = (edge: PoolPortalEdge): boolean =>
    Number.isFinite(edge.mu) &&
    Number.isFinite(edge.kappa) &&
    edge.kappa > 0 &&
    edge.n > 0;

/**
 * μ на шкале связи: logit для вероятностей (μ ∈ (0; 1)), log для
 * интенсивностей (μ > 0); вне области — null, портал в τ_0 не входит.
 */
export function linkOfMu(
    mu: number,
    estimand: ParamEdgeEstimand,
): number | null {
    if (estimand === 'prob') {
        return mu > 0 && mu < 1 ? logit(mu) : null;
    }

    return mu > 0 ? Math.log(mu) : null;
}

/** Выборочное SD (k − 1); меньше двух значений → null. */
export function sampleSd(values: readonly number[]): number | null {
    if (values.length < POOL_NORMS_MIN_PORTALS_TAU) {
        return null;
    }
    let sum = 0;
    for (const value of values) {
        sum += value;
    }
    const mean = sum / values.length;
    let squares = 0;
    for (const value of values) {
        squares += (value - mean) * (value - mean);
    }

    return Math.sqrt(squares / (values.length - 1));
}

const groupKey = (edge: PoolPortalEdge): string =>
    `${edge.edge}:${edge.estimand}`;

const compareKeys = (a: string, b: string): number =>
    a < b ? -1 : a > b ? 1 : 0;

function poolOneEdge(cells: readonly PoolPortalEdge[]): PoolEdgeNorm {
    let sumN = 0;
    let sumMu = 0;
    for (const cell of cells) {
        sumN += cell.n;
        sumMu += cell.n * cell.mu;
    }
    const links: number[] = [];
    for (const cell of cells) {
        const link = linkOfMu(cell.mu, cell.estimand);
        if (link !== null) {
            links.push(link);
        }
    }

    return {
        edge: cells[0].edge,
        estimand: cells[0].estimand,
        mu0: sumMu / sumN,
        kappaBar: meanKappaLog(cells.map(cell => cell.kappa)),
        tau0: sampleSd(links),
        portals: cells.length,
    };
}

/**
 * Нормы рёбер пула по порталам: группировка по коду ребра и трактовке,
 * внутри группы — один портал не больше одного раза (берётся первая
 * пригодная ячейка). Рёбра — в отсортированном порядке ключа.
 */
export function poolEdgeNorms(
    portals: readonly PoolPortalInput[],
): PoolEdgeNorm[] {
    const groups = new Map<string, PoolPortalEdge[]>();
    for (const portal of portals) {
        const seen = new Set<string>();
        for (const edge of portal.edges) {
            const key = groupKey(edge);
            if (!isUsablePoolEdge(edge) || seen.has(key)) {
                continue;
            }
            seen.add(key);
            const cells = groups.get(key) ?? [];
            cells.push(edge);
            groups.set(key, cells);
        }
    }

    return [...groups.keys()]
        .sort(compareKeys)
        .map(key => poolOneEdge(groups.get(key) ?? []));
}

/**
 * Прайор κ для `estimateEdgeKappa` (kappa.ts): κ̄_k пула и K_p — число
 * менеджеров самого портала (свойство портала, не пула).
 */
export function toEdgeKappaPool(
    norm: PoolEdgeNorm,
    portalManagers: number,
    weight: number = KAPPA_DEFAULTS.poolPriorWeight,
): EdgeKappaPool {
    return {
        kappaBar: norm.kappaBar,
        portalManagers: Math.max(0, portalManagers),
        weight,
    };
}

/**
 * Глобальный слой для `leaveOneOutNorm` (norms-hierarchy.ts): μ_0k пула и
 * сила `kappa_portal_to_global` (по умолчанию из реестра — 0 до решения
 * владельца о подмешивании пула).
 */
export function toNormGlobalPrior(
    norm: PoolEdgeNorm,
    kappa: number = KAPPA_DEFAULTS.portalToGlobal,
): NormGlobalPrior {
    return { mu: norm.mu0, kappa: Math.max(0, kappa) };
}
