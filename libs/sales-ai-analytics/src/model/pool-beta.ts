/**
 * β пула порталов (план §4.4 «Пул»): обратно-взвешенная оценка, Q Кокрана
 * и I², τ² ДерСимоняна–Лэрда при k ≥ `pool_min_portals_beta`, иначе
 * фиксированный half-normal прайор τ (`tau_prior_sd`) с меткой `hybrid`;
 * усадка β портала к пулу силой `kappa_beta` (§4.2, §4.4) и предиктивный
 * интервал пула для условия E2 (§4.10).
 *
 * Чистая математика: без DI, Bitrix, Prisma, времени и случайности;
 * суммы — в порядке входного массива.
 */
import { registryDefault } from '../params/registry.access';
import type {
    PoolBeta,
    PoolPortalBeta,
    PoolTau2Source,
    ShrunkPortalBeta,
} from './pool.types';
import { AI_ANALYTICS_THRESHOLDS } from './thresholds.const';

/** Дефолты β пула — все из реестра. */
export const POOL_BETA_DEFAULTS = {
    /** `pool_min_portals_beta` — с этого k τ² оценивается, а не берётся из прайора. */
    minPortalsTau: registryDefault('pool_min_portals_beta'),
    /** `tau_prior_sd` — СКО half-normal прайора τ до гейта. */
    tauPriorSd: registryDefault('tau_prior_sd'),
    /** `kappa_beta` — сила усадки β портала к пулу. */
    kappaBeta: registryDefault('kappa_beta'),
    /** `z_compare` — квантиль 90 %-интервалов. */
    z90: AI_ANALYTICS_THRESHOLDS.z90,
} as const;

/** Минимум порталов, с которого оценка пула вообще имеет смысл. */
export const POOL_BETA_MIN_PORTALS = 2;

export interface PoolBetaInput {
    readonly portals: readonly PoolPortalBeta[];
    readonly minPortalsTau?: number;
    readonly tauPriorSd?: number;
    readonly z?: number;
}

export interface ShrinkPortalBetaInput {
    readonly betaPortal: number;
    readonly nPortal: number;
    readonly betaPool: number;
    readonly kappaBeta?: number;
}

/** Портал пригоден для мета-оценки: конечный β, положительная SE и n. */
export const isUsablePortalBeta = (portal: PoolPortalBeta): boolean =>
    Number.isFinite(portal.value) &&
    Number.isFinite(portal.se) &&
    portal.se > 0 &&
    portal.n > 0;

interface WeightedMean {
    readonly value: number;
    readonly sumWeights: number;
}

/** Σ w_i β_i / Σ w_i при весах w_i = 1/(se_i² + shift). */
function weightedMean(
    portals: readonly PoolPortalBeta[],
    shift: number,
): WeightedMean {
    let sumWeights = 0;
    let sumWeighted = 0;
    for (const portal of portals) {
        const weight = 1 / (portal.se * portal.se + shift);
        sumWeights += weight;
        sumWeighted += weight * portal.value;
    }

    return { value: sumWeighted / sumWeights, sumWeights };
}

/** Q Кокрана = Σ w_i (β_i − β_F)² при w_i = 1/se_i². */
export function cochranQ(
    portals: readonly PoolPortalBeta[],
    betaFixed: number,
): number {
    let q = 0;
    for (const portal of portals) {
        const delta = portal.value - betaFixed;
        q += (delta * delta) / (portal.se * portal.se);
    }

    return q;
}

/** I² = max(0, (Q − df)/Q); при Q = 0 гетерогенности нет. */
export function iSquaredOf(q: number, df: number): number {
    if (!(q > 0)) {
        return 0;
    }

    return Math.max(0, (q - df) / q);
}

/**
 * τ² ДерСимоняна–Лэрда: max(0, (Q − df)/C), C = Σw − Σw²/Σw. При
 * однородных порталах (Q ≤ df) → 0.
 */
export function dersimonianLairdTau2(
    portals: readonly PoolPortalBeta[],
    q: number,
    df: number,
): number {
    let sumWeights = 0;
    let sumSquares = 0;
    for (const portal of portals) {
        const weight = 1 / (portal.se * portal.se);
        sumWeights += weight;
        sumSquares += weight * weight;
    }
    const c = sumWeights - sumSquares / sumWeights;
    if (!(c > 0)) {
        return 0;
    }

    return Math.max(0, (q - df) / c);
}

/**
 * Иерархическая β пула. Меньше двух пригодных порталов → null: пул из
 * одного портала — не пул. При k < `pool_min_portals_beta` τ² = tau_prior_sd²
 * (прайор), метка `hybrid`; иначе τ² по ДерСимоняну–Лэрду, метка `estimated`.
 */
export function poolBeta(input: PoolBetaInput): PoolBeta | null {
    const portals = input.portals.filter(isUsablePortalBeta);
    const k = portals.length;
    if (k < POOL_BETA_MIN_PORTALS) {
        return null;
    }
    const minPortalsTau =
        input.minPortalsTau ?? POOL_BETA_DEFAULTS.minPortalsTau;
    const tauPriorSd = input.tauPriorSd ?? POOL_BETA_DEFAULTS.tauPriorSd;
    const z = input.z ?? POOL_BETA_DEFAULTS.z90;

    const fixed = weightedMean(portals, 0);
    const q = cochranQ(portals, fixed.value);
    const df = k - 1;
    const iSquared = iSquaredOf(q, df);
    const tau2Source: PoolTau2Source =
        k >= minPortalsTau ? 'estimated' : 'prior';
    const tau2 =
        tau2Source === 'estimated'
            ? dersimonianLairdTau2(portals, q, df)
            : tauPriorSd * tauPriorSd;

    const random = weightedMean(portals, tau2);
    const se = Math.sqrt(1 / random.sumWeights);

    return {
        betaPool: random.value,
        se,
        ci90: [random.value - z * se, random.value + z * se],
        q,
        df,
        iSquared,
        tau2,
        tau2Source,
        label: tau2Source === 'estimated' ? 'estimated' : 'hybrid',
        portals: k,
    };
}

/**
 * Усадка β портала к пулу (план §4.4): β_p = (n·β̂_p + κ_β·β_pool)/(n + κ_β),
 * w = n/(n + κ_β). Без собственных исходов — β пула с w = 0.
 */
export function shrinkPortalBeta(
    input: ShrinkPortalBetaInput,
): ShrunkPortalBeta {
    const n = Math.max(0, Number.isFinite(input.nPortal) ? input.nPortal : 0);
    const kappa = Math.max(0, input.kappaBeta ?? POOL_BETA_DEFAULTS.kappaBeta);
    const denominator = n + kappa;
    if (denominator <= 0) {
        return { beta: input.betaPool, w: 0 };
    }
    const w = n / denominator;

    return {
        beta: (n * input.betaPortal + kappa * input.betaPool) / denominator,
        w,
    };
}

/**
 * Предиктивный интервал пула для нового портала:
 * β_R ± z·sqrt(se_R² + τ²) — шире доверительного на межпортальный разброс.
 */
export function predictiveInterval(
    pool: PoolBeta,
    z: number = POOL_BETA_DEFAULTS.z90,
): readonly [number, number] {
    const halfWidth = z * Math.sqrt(pool.se * pool.se + pool.tau2);

    return [pool.betaPool - halfWidth, pool.betaPool + halfWidth];
}

/** Условие E2 (план §4.10): портал внутри предиктивного интервала пула. */
export function withinPredictiveInterval(
    betaPortal: number,
    pool: PoolBeta,
    z: number = POOL_BETA_DEFAULTS.z90,
): boolean {
    if (!Number.isFinite(betaPortal)) {
        return false;
    }
    const [low, high] = predictiveInterval(pool, z);

    return betaPortal >= low && betaPortal <= high;
}
