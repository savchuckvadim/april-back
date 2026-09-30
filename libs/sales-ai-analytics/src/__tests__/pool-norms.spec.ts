import {
    estimateEdgeKappa,
    meanKappaLog,
    type KappaCell,
} from '../model/kappa';
import { leaveOneOutNorm } from '../model/norms-hierarchy';
import {
    POOL_NORMS_MIN_PORTALS_TAU,
    linkOfMu,
    poolEdgeNorms,
    sampleSd,
    toEdgeKappaPool,
    toNormGlobalPrior,
} from '../model/pool-norms';
import type { PoolPortalEdge, PoolPortalInput } from '../model/pool.types';
import { logit } from '../model/quality-curve';
import { registryDefault } from '../params/registry.access';

/**
 * Нормы рёбер пула (план §4.2, §4.11): μ_0k — n-взвешенное среднее, κ̄_k —
 * среднее в логарифмах, τ_0k — SD на шкале связи; адаптеры к kappa.ts и
 * norms-hierarchy.ts.
 */

const portalOf = (
    key: string,
    edges: readonly PoolPortalEdge[],
): PoolPortalInput => ({
    portalKey: key,
    consentAt: '2026-01-01',
    historyMonths: 12,
    managers: 5,
    edges,
    beta: null,
    lagCdf: null,
    lognormal: null,
    seasonIndex: null,
});

const e2 = (mu: number, kappa: number, n: number): PoolPortalEdge => ({
    edge: 'e2',
    estimand: 'prob',
    mu,
    kappa,
    n,
});

const THREE = [
    portalOf('p1', [e2(0.1, 10, 100)]),
    portalOf('p2', [e2(0.2, 100, 200)]),
    portalOf('p3', [e2(0.3, 1000, 300)]),
];

describe('poolEdgeNorms', () => {
    it('μ_0 = n-взвешенное среднее μ, κ̄ = среднее в логарифмах', () => {
        const [norm] = poolEdgeNorms(THREE);
        expect(norm.edge).toBe('e2');
        expect(norm.estimand).toBe('prob');
        expect(norm.portals).toBe(3);
        expect(norm.mu0).toBeCloseTo((10 + 40 + 90) / 600, 12);
        expect(norm.kappaBar).toBeCloseTo(meanKappaLog([10, 100, 1000]), 12);
        expect(norm.kappaBar).toBeCloseTo(100, 9);
        // Арифметическое среднее κ было бы 370 — логарифмы тянут к середине.
        expect(norm.kappaBar).toBeLessThan(370);
    });

    it('τ_0 — выборочное SD logit μ по порталам; k < 2 → null', () => {
        const [norm] = poolEdgeNorms(THREE);
        const links = [0.1, 0.2, 0.3].map(logit);
        expect(norm.tau0).not.toBeNull();
        expect(norm.tau0).toBeCloseTo(sampleSd(links) ?? Number.NaN, 12);
        expect(POOL_NORMS_MIN_PORTALS_TAU).toBe(2);
        const [single] = poolEdgeNorms([THREE[0]]);
        expect(single.tau0).toBeNull();
        expect(single.mu0).toBeCloseTo(0.1, 12);
        expect(sampleSd([])).toBeNull();
        expect(sampleSd([1])).toBeNull();
        expect(sampleSd([1, 3])).toBeCloseTo(Math.SQRT2, 12);
    });

    it('интенсивности — на шкале log; вне области определения портал не входит в τ_0', () => {
        expect(linkOfMu(0.5, 'prob')).toBeCloseTo(0, 12);
        expect(linkOfMu(1, 'prob')).toBeNull();
        expect(linkOfMu(0, 'prob')).toBeNull();
        expect(linkOfMu(Math.E, 'rate')).toBeCloseTo(1, 12);
        expect(linkOfMu(0, 'rate')).toBeNull();
        const rates = [
            portalOf('r1', [
                { edge: 'e1', estimand: 'rate', mu: 1, kappa: 5, n: 50 },
            ]),
            portalOf('r2', [
                { edge: 'e1', estimand: 'rate', mu: 4, kappa: 5, n: 50 },
            ]),
            portalOf('r3', [
                { edge: 'e1', estimand: 'rate', mu: 0, kappa: 5, n: 50 },
            ]),
        ];
        const [norm] = poolEdgeNorms(rates);
        expect(norm.estimand).toBe('rate');
        expect(norm.portals).toBe(3);
        expect(norm.tau0).toBeCloseTo(
            sampleSd([0, Math.log(4)]) ?? Number.NaN,
            12,
        );
    });

    it('группировка по ребру и трактовке, порядок отсортирован, дубли и мусор отброшены', () => {
        const portals = [
            portalOf('a', [
                { edge: 'e4', estimand: 'prob', mu: 0.1, kappa: 30, n: 20 },
                e2(0.5, 30, 100),
                e2(0.9, 30, 100),
                { edge: 'e2', estimand: 'rate', mu: 0.5, kappa: 30, n: 100 },
            ]),
            portalOf('b', [
                e2(Number.NaN, 30, 100),
                { edge: 'e4', estimand: 'prob', mu: 0.2, kappa: 0, n: 20 },
                { edge: 'e1', estimand: 'prob', mu: 0.05, kappa: 100, n: 0 },
            ]),
        ];
        const norms = poolEdgeNorms(portals);
        expect(norms.map(norm => `${norm.edge}:${norm.estimand}`)).toEqual([
            'e2:prob',
            'e2:rate',
            'e4:prob',
        ]);
        // Второе e2:prob того же портала не учитывается — один портал один раз.
        expect(norms[0].portals).toBe(1);
        expect(norms[0].mu0).toBeCloseTo(0.5, 12);
        expect(norms[2].portals).toBe(1);
        expect(poolEdgeNorms([])).toEqual([]);
    });

    it('детерминизм: одинаковый вход → toEqual', () => {
        expect(poolEdgeNorms(THREE)).toEqual(poolEdgeNorms(THREE));
    });
});

describe('адаптеры toEdgeKappaPool / toNormGlobalPrior', () => {
    const [norm] = poolEdgeNorms(THREE);

    it('EdgeKappaPool: κ̄ пула, K_p — менеджеры портала, вес прайора 10', () => {
        expect(toEdgeKappaPool(norm, 6)).toEqual({
            kappaBar: norm.kappaBar,
            portalManagers: 6,
            weight: 10,
        });
        expect(toEdgeKappaPool(norm, -3).portalManagers).toBe(0);
    });

    it('estimateEdgeKappa с пулом регуляризует κ̂ к κ̄ в log-шкале', () => {
        const cells: KappaCell[] = [2, 5, 9, 15, 25, 35].map((s, index) => ({
            managerId: `m${index}`,
            s,
            n: 100,
        }));
        const alone = estimateEdgeKappa({ cells, months: 12 });
        const pooled = estimateEdgeKappa({
            cells,
            months: 12,
            pool: toEdgeKappaPool(norm, cells.length),
        });
        expect(alone.source).toBe('kleinman');
        expect(pooled.kappaHat).toBeCloseTo(alone.kappa, 12);
        const expected = Math.exp(
            (6 * Math.log(alone.kappa) + 10 * Math.log(norm.kappaBar)) / 16,
        );
        expect(pooled.kappa).toBeCloseTo(expected, 9);
        expect(pooled.kappa).toBeGreaterThan(alone.kappa);
    });

    it('NormGlobalPrior: μ_0 пула и kappa_portal_to_global (0 по умолчанию)', () => {
        expect(toNormGlobalPrior(norm)).toEqual({
            mu: norm.mu0,
            kappa: registryDefault('kappa_portal_to_global'),
        });
        expect(toNormGlobalPrior(norm).kappa).toBe(0);
        expect(toNormGlobalPrior(norm, 50).kappa).toBe(50);
        expect(toNormGlobalPrior(norm, -1).kappa).toBe(0);
    });

    it('leaveOneOutNorm с глобальным слоем пула подмешивает μ_0 силой κ', () => {
        const cells = [
            { managerId: 'a', s: 10, n: 100 },
            { managerId: 'b', s: 20, n: 100 },
            { managerId: 'c', s: 30, n: 100 },
        ];
        const without = leaveOneOutNorm({ cells, managerId: 'c' });
        const withPool = leaveOneOutNorm({
            cells,
            managerId: 'c',
            global: toNormGlobalPrior(norm, 100),
        });
        expect(without.value).toBeCloseTo(0.15, 12);
        expect(without.w).toBe(1);
        expect(withPool.value).toBeCloseTo((30 + 100 * norm.mu0) / 300, 12);
        expect(withPool.w).toBeCloseTo(200 / 300, 12);
        expect(withPool.globalKappa).toBe(100);
    });
});
