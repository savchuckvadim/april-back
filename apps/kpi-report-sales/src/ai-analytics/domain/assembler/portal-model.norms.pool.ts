/**
 * Пул порталов в нормах портала (план §4.2, Фаза 4): κ̄ ребра регуляризует
 * оценку Клейнмана (`estimateEdgeKappa` с `EdgeKappaPool`), μ₀ — общий
 * прайор слоя с силой `kappa_portal_to_global` (по умолчанию 0 — прайор не
 * подмешивается, как в `leaveOneOutNorm` с `NormGlobalPrior`).
 *
 * Вынесено из `portal-model.norms.ts` по лимиту 300 строк.
 * Чистые функции: без DI, Bitrix и Prisma.
 */
import {
    AI_ANALYTICS_EDGE_VIEW_MAP,
    toNormGlobalPrior,
    type AiEdgeEstimand,
    type NormGlobalPrior,
    type PoolEdgeNorm,
} from '@lib/sales-ai-analytics';

/** Пул порталов для норм; рёбра сопоставляются по коду и трактовке. */
export interface PortalNormsPool {
    readonly edges: readonly PoolEdgeNorm[];
    readonly estimand: AiEdgeEstimand;
    /** `kappa_portal_to_global`; 0 — прайор μ₀ не подмешивается. */
    readonly globalKappa: number;
}

/**
 * Ребро пула соответствует ребру модели портала. Пул хранит коды канона
 * (`e1`…`e5`: писатель пула переводит коды витрины через
 * `AI_ANALYTICS_EDGE_VIEW_MAP`), модель портала — коды витрины
 * (`call_to_presentation`…), поэтому сравнение идёт через ту же таблицу.
 * У «КП → счёт» пары в каноне нет — пул к этому ребру не применяется.
 */
export const isPoolEdgeFor = (poolEdge: PoolEdgeNorm, edge: string): boolean =>
    poolEdge.edge === edge ||
    AI_ANALYTICS_EDGE_VIEW_MAP[poolEdge.edge] === edge;

/** Ребро пула той же трактовки; нет пула или ребра — null. */
export function poolEdgeOf(
    pool: PortalNormsPool | null | undefined,
    edge: string,
): PoolEdgeNorm | null {
    return (
        pool?.edges.find(
            item =>
                isPoolEdgeFor(item, edge) && item.estimand === pool.estimand,
        ) ?? null
    );
}

/** Общий прайор ребра: μ₀ пула с силой > 0; иначе null. */
export function globalPriorOf(
    pool: PortalNormsPool | null | undefined,
    poolEdge: PoolEdgeNorm | null,
): NormGlobalPrior | null {
    if (poolEdge === null || pool === null || pool === undefined) return null;
    const prior = toNormGlobalPrior(poolEdge, pool.globalKappa);

    return prior.kappa > 0 ? prior : null;
}

/**
 * μ и доля данных слоя с общим прайором:
 * μ = (s + κ·μ₀)/(n + κ), w = n/(n + κ) — формула `leaveOneOutNorm`.
 */
export function mixWithPrior(
    s: number,
    n: number,
    prior: NormGlobalPrior,
): { mu: number; w: number } {
    const size = Math.max(0, n);
    const denominator = size + prior.kappa;

    return denominator <= 0
        ? { mu: prior.mu, w: 0 }
        : {
              mu: (Math.max(0, s) + prior.kappa * prior.mu) / denominator,
              w: size / denominator,
          };
}
