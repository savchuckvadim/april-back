import {
    POOL_BETA_DEFAULTS,
    POOL_BETA_MIN_PORTALS,
    cochranQ,
    dersimonianLairdTau2,
    iSquaredOf,
    poolBeta,
    predictiveInterval,
    shrinkPortalBeta,
    withinPredictiveInterval,
} from '../model/pool-beta';
import type { PoolPortalBeta } from '../model/pool.types';
import { mulberry32, sampleNormal, seedOf } from '../model/prng';
import { registryDefault } from '../params/registry.access';

/**
 * β пула порталов (план §4.4 «Пул»): обратно-взвешенная оценка, Q Кокрана,
 * I², τ² ДерСимоняна–Лэрда, гибрид с прайором τ, усадка портала к пулу и
 * предиктивный интервал (§4.10, E2).
 */

/** Пример на бумаге: k = 5, β_i и se_i заданы, веса w_i = 1/se_i². */
const HAND_BETAS = [0.1, 0.15, 0.05, 0.2, 0.12] as const;
const HAND_SES = [0.05, 0.04, 0.06, 0.05, 0.03] as const;
const HAND_PORTALS: PoolPortalBeta[] = HAND_BETAS.map((value, index) => ({
    value,
    se: HAND_SES[index],
    n: 100,
}));

/** Результат обязан быть не null — иначе тест падает здесь, а не на поле. */
const must = <T>(value: T | null): T => {
    if (value === null) {
        throw new Error('ожидался результат, получен null');
    }

    return value;
};

/** Ручной расчёт: w = [400; 625; 2500/9; 400; 10000/9]. */
const HAND_WEIGHTS = [400, 625, 2500 / 9, 400, 10000 / 9] as const;
const HAND_SUM_W = HAND_WEIGHTS.reduce((sum, w) => sum + w, 0);
const HAND_BETA_F =
    HAND_WEIGHTS.reduce((sum, w, i) => sum + w * HAND_BETAS[i], 0) / HAND_SUM_W;
const HAND_Q = HAND_WEIGHTS.reduce(
    (sum, w, i) => sum + w * (HAND_BETAS[i] - HAND_BETA_F) ** 2,
    0,
);

const portalsOf = (
    replicate: number,
    k: number,
    trueBeta: number,
    tau: number,
): PoolPortalBeta[] => {
    const random = mulberry32(seedOf('pool-beta', replicate, k));

    return Array.from({ length: k }, (_, index) => {
        const se = 0.04 + 0.04 * random();
        const value =
            trueBeta + tau * sampleNormal(random) + se * sampleNormal(random);

        return { value, se, n: 50 + index };
    });
};

describe('poolBeta — пример на бумаге (k = 5)', () => {
    const pool = poolBeta({ portals: HAND_PORTALS, minPortalsTau: 5 });

    it('Σw, β_F и Q совпадают с ручным расчётом', () => {
        expect(HAND_SUM_W).toBeCloseTo(2813.8889, 3);
        expect(HAND_BETA_F).toBeCloseTo(0.12828, 5);
        expect(HAND_Q).toBeCloseTo(4.4506, 4);
        expect(cochranQ(HAND_PORTALS, HAND_BETA_F)).toBeCloseTo(HAND_Q, 9);
    });

    it('df = 4, I² = (Q − 4)/Q ≈ 0,1012', () => {
        const result = must(pool);
        expect(result.df).toBe(4);
        expect(result.q).toBeCloseTo(HAND_Q, 9);
        expect(result.iSquared).toBeCloseTo((HAND_Q - 4) / HAND_Q, 9);
        expect(result.iSquared).toBeCloseTo(0.1012, 4);
    });

    it('τ² ДерСимоняна–Лэрда при k ≥ minPortalsTau: (Q − df)/C ≈ 0,000215', () => {
        const result = must(pool);
        const sumSquares = HAND_WEIGHTS.reduce((sum, w) => sum + w * w, 0);
        const c = HAND_SUM_W - sumSquares / HAND_SUM_W;
        expect(result.tau2Source).toBe('estimated');
        expect(result.label).toBe('estimated');
        expect(result.tau2).toBeCloseTo((HAND_Q - 4) / c, 12);
        expect(result.tau2).toBeCloseTo(0.000215, 6);
        expect(dersimonianLairdTau2(HAND_PORTALS, HAND_Q, 4)).toBeCloseTo(
            result.tau2,
            12,
        );
    });

    it('β_R и se_R по весам 1/(se² + τ²), ci90 с z реестра', () => {
        const result = must(pool);
        const weights = HAND_SES.map(se => 1 / (se * se + result.tau2));
        const sumW = weights.reduce((sum, w) => sum + w, 0);
        const betaR =
            weights.reduce((sum, w, i) => sum + w * HAND_BETAS[i], 0) / sumW;
        expect(result.betaPool).toBeCloseTo(betaR, 12);
        expect(result.betaPool).toBeCloseTo(0.128289, 6);
        expect(result.se).toBeCloseTo(Math.sqrt(1 / sumW), 12);
        expect(result.se).toBeCloseTo(0.020217, 6);
        expect(POOL_BETA_DEFAULTS.z90).toBe(registryDefault('z_compare'));
        expect(result.ci90[0]).toBeCloseTo(
            betaR - POOL_BETA_DEFAULTS.z90 * result.se,
            12,
        );
        expect(result.ci90[1]).toBeCloseTo(
            betaR + POOL_BETA_DEFAULTS.z90 * result.se,
            12,
        );
        expect(result.ci90[0]).toBeLessThan(result.ci90[1]);
        expect(result.portals).toBe(5);
    });
});

describe('poolBeta — гибрид и однородность', () => {
    it('k < pool_min_portals_beta (8): τ² = tau_prior_sd², метка hybrid', () => {
        expect(POOL_BETA_DEFAULTS.minPortalsTau).toBe(
            registryDefault('pool_min_portals_beta'),
        );
        expect(POOL_BETA_DEFAULTS.tauPriorSd).toBe(
            registryDefault('tau_prior_sd'),
        );
        const result = must(poolBeta({ portals: HAND_PORTALS }));
        expect(result.tau2Source).toBe('prior');
        expect(result.label).toBe('hybrid');
        expect(result.tau2).toBeCloseTo(0.1 * 0.1, 12);
        // При τ² = 0,01 веса почти выравниваются: β_R ≈ 0,12544, se_R ≈ 0,0493.
        expect(result.betaPool).toBeCloseTo(0.125442, 6);
        expect(result.se).toBeCloseTo(0.049298, 6);
        // Q и I² не зависят от источника τ².
        expect(result.q).toBeCloseTo(HAND_Q, 9);
    });

    it('однородные порталы: Q = 0, I² = 0, τ² = 0', () => {
        const portals = Array.from({ length: 9 }, (_, index) => ({
            value: 0.2,
            se: 0.03 + 0.005 * index,
            n: 40,
        }));
        const result = must(poolBeta({ portals }));
        expect(result.q).toBeCloseTo(0, 12);
        expect(result.iSquared).toBe(0);
        expect(result.tau2).toBe(0);
        expect(result.tau2Source).toBe('estimated');
        expect(result.betaPool).toBeCloseTo(0.2, 12);
    });

    it('τ² DL ≥ 0 на случайных наборах, равен 0 при Q ≤ df', () => {
        for (let replicate = 0; replicate < 50; replicate += 1) {
            const portals = portalsOf(replicate, 8, 0.3, 0.05);
            const result = must(poolBeta({ portals }));
            expect(result.tau2).toBeGreaterThanOrEqual(0);
            if (result.q <= result.df) {
                expect(result.tau2).toBe(0);
                expect(result.iSquared).toBe(0);
            }
            expect(result.iSquared).toBeGreaterThanOrEqual(0);
            expect(result.iSquared).toBeLessThanOrEqual(1);
        }
        expect(iSquaredOf(0, 4)).toBe(0);
        expect(iSquaredOf(2, 4)).toBe(0);
        expect(iSquaredOf(8, 4)).toBeCloseTo(0.5, 12);
    });

    it('меньше двух пригодных порталов → null; непригодные отбрасываются', () => {
        expect(POOL_BETA_MIN_PORTALS).toBe(2);
        expect(poolBeta({ portals: [] })).toBeNull();
        expect(poolBeta({ portals: [HAND_PORTALS[0]] })).toBeNull();
        const broken: PoolPortalBeta[] = [
            { value: Number.NaN, se: 0.1, n: 10 },
            { value: 0.1, se: 0, n: 10 },
            { value: 0.1, se: 0.1, n: 0 },
        ];
        expect(poolBeta({ portals: [...broken, HAND_PORTALS[0]] })).toBeNull();
        const result = must(
            poolBeta({ portals: [...broken, ...HAND_PORTALS] }),
        );
        expect(result.portals).toBe(5);
    });
});

describe('poolBeta — восстановление и покрытие на синтетике', () => {
    const TRUE_BETA = 0.3;
    const TAU = 0.1;
    const REPLICATES = 300;

    it('β_R восстанавливает β при τ = 0,1, k = 10; ci90 накрывает β ≈ 90 %', () => {
        let covered = 0;
        let sum = 0;
        for (let replicate = 0; replicate < REPLICATES; replicate += 1) {
            const portals = portalsOf(replicate, 10, TRUE_BETA, TAU);
            const result = must(poolBeta({ portals }));
            sum += result.betaPool;
            if (result.ci90[0] <= TRUE_BETA && TRUE_BETA <= result.ci90[1]) {
                covered += 1;
            }
        }
        expect(sum / REPLICATES).toBeCloseTo(TRUE_BETA, 2);
        const coverage = covered / REPLICATES;
        expect(coverage).toBeGreaterThanOrEqual(0.78);
        expect(coverage).toBeLessThanOrEqual(0.97);
    });

    it('новый портал из той же популяции попадает в предиктивный интервал ≈ 90 %', () => {
        let inside = 0;
        for (let replicate = 0; replicate < REPLICATES; replicate += 1) {
            const portals = portalsOf(replicate, 11, TRUE_BETA, TAU);
            const held = portals[10];
            const pool = must(poolBeta({ portals: portals.slice(0, 10) }));
            if (withinPredictiveInterval(held.value, pool)) {
                inside += 1;
            }
        }
        // τ² ДерСимоняна–Лэрда при k = 10 занижен, интервал нормальный, а не
        // t — покрытие предиктивного интервала чуть ниже номинала (≈ 0,8).
        const share = inside / REPLICATES;
        expect(share).toBeGreaterThanOrEqual(0.75);
        expect(share).toBeLessThanOrEqual(0.98);
    });

    it('детерминизм: два вызова на одном входе равны', () => {
        const portals = portalsOf(7, 9, TRUE_BETA, TAU);
        expect(poolBeta({ portals })).toEqual(poolBeta({ portals }));
        expect(portalsOf(7, 9, TRUE_BETA, TAU)).toEqual(portals);
    });
});

describe('shrinkPortalBeta', () => {
    it('w = n/(n + κ_β), κ_β = kappa_beta = 20', () => {
        expect(POOL_BETA_DEFAULTS.kappaBeta).toBe(
            registryDefault('kappa_beta'),
        );
        expect(POOL_BETA_DEFAULTS.kappaBeta).toBe(20);
        const half = shrinkPortalBeta({
            betaPortal: 0.4,
            nPortal: 20,
            betaPool: 0.2,
        });
        expect(half.w).toBeCloseTo(0.5, 12);
        expect(half.beta).toBeCloseTo(0.3, 12);
        const heavy = shrinkPortalBeta({
            betaPortal: 0.4,
            nPortal: 180,
            betaPool: 0.2,
        });
        expect(heavy.w).toBeCloseTo(0.9, 12);
        expect(heavy.beta).toBeCloseTo(0.38, 12);
    });

    it('без собственных исходов — β пула с w = 0; w ∈ [0; 1]', () => {
        const none = shrinkPortalBeta({
            betaPortal: 0.4,
            nPortal: 0,
            betaPool: 0.2,
        });
        expect(none).toEqual({ beta: 0.2, w: 0 });
        for (let n = 0; n <= 500; n += 25) {
            const { w } = shrinkPortalBeta({
                betaPortal: 0.4,
                nPortal: n,
                betaPool: 0.2,
                kappaBeta: 7,
            });
            expect(w).toBeGreaterThanOrEqual(0);
            expect(w).toBeLessThanOrEqual(1);
        }
    });
});

describe('predictiveInterval / withinPredictiveInterval', () => {
    const pool = must(poolBeta({ portals: HAND_PORTALS }));

    it('предиктивный интервал шире доверительного на τ²', () => {
        const [low, high] = predictiveInterval(pool);
        const halfWidth =
            POOL_BETA_DEFAULTS.z90 * Math.sqrt(pool.se ** 2 + pool.tau2);
        expect(low).toBeCloseTo(pool.betaPool - halfWidth, 12);
        expect(high).toBeCloseTo(pool.betaPool + halfWidth, 12);
        expect(low).toBeLessThan(pool.ci90[0]);
        expect(high).toBeGreaterThan(pool.ci90[1]);
    });

    it('портал внутри и снаружи интервала; NaN — снаружи', () => {
        const [low, high] = predictiveInterval(pool);
        expect(withinPredictiveInterval(pool.betaPool, pool)).toBe(true);
        expect(withinPredictiveInterval(low, pool)).toBe(true);
        expect(withinPredictiveInterval(high + 1e-9, pool)).toBe(false);
        expect(withinPredictiveInterval(low - 1e-9, pool)).toBe(false);
        expect(withinPredictiveInterval(Number.NaN, pool)).toBe(false);
    });
});
