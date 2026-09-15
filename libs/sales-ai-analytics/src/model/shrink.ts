import { registryDefault } from '../params/registry.access';
import { gammaInterval } from './gamma';
import { AI_ANALYTICS_THRESHOLDS } from './thresholds.const';
import { wilsonInterval } from './wilson';

/**
 * Вид интервала (реестр параметров, план §4.1–4.2): доли/вероятности —
 * Уилсон 90 %; интенсивности и темпы — гамма-интервал.
 */
export type ShrinkIntervalKind = 'wilson' | 'gamma';

/** Норма родительского слоя μ и сила усадки κ (псевдонаблюдения). */
export interface ShrinkPrior {
    mu: number;
    kappa: number;
}

export interface ShrinkRateInput {
    /** Переходы s̃ (для интенсивностей могут превышать exposure). */
    successes: number;
    /** Знаменатель ñ: входы ребра или эффективная экспозиция D̃/φ. */
    exposure: number;
    prior: ShrinkPrior;
    /** По умолчанию wilson (доли). */
    intervalKind?: ShrinkIntervalKind;
    /** Квантиль интервала (по умолчанию z90 = 1,645). */
    z?: number;
}

export interface ShrinkRateResult {
    /** E[θ] = (s + κ·μ)/(n + κ). */
    value: number;
    /** Доля собственных данных w = n/(n + κ) ∈ [0, 1]. */
    w: number;
    /** Знаменатель собственных данных (без κ). */
    n: number;
    prior: ShrinkPrior;
    intervalKind: ShrinkIntervalKind;
    /** 90 %-интервал апостериора; null — интервал не определён. */
    ci90: [number, number] | null;
}

/** Точка ряда менеджер-периода: ключ периода, знаменатель и переходы. */
export interface ForgetPoint {
    periodKey: string;
    n: number;
    s: number;
}

export interface ForgetResult {
    /** ñ = Σ λ^(T−t)·n_t. */
    n: number;
    /** s̃ = Σ λ^(T−t)·s_t. */
    s: number;
    periods: number;
    lambda: number;
    /** Ключ последнего периода T (вес 1); null при пустом ряде. */
    latestPeriodKey: string | null;
}

export const SHRINK_DEFAULTS = {
    /** `forget_lambda` — забывание месяцев (план §4.2). */
    forgetLambda: registryDefault('forget_lambda'),
    /**
     * Не параметр реестра: вид интервала — свойство дескриптора ребра
     * (`intervalKind`), у долей Уилсон, у интенсивностей гамма.
     */
    intervalKind: 'wilson',
} as const satisfies { forgetLambda: number; intervalKind: ShrinkIntervalKind };

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

function posteriorInterval(
    kind: ShrinkIntervalKind,
    hits: number,
    denominator: number,
    z: number,
): [number, number] | null {
    if (kind === 'gamma') {
        return gammaInterval(hits, denominator, z);
    }
    // Уилсон на апостериорных псевдосчётчиках Beta(s + κμ, n − s + κ(1 − μ)):
    // центр совпадает с E[θ], ширина — как у доли с n + κ наблюдениями.
    return wilsonInterval(hits, denominator, z);
}

/**
 * Единая усадка к норме слоя (план §4.2): Beta-биномиал для долей и
 * гамма-Пуассон для интенсивностей дают одну формулу
 * E[θ] = (s + κ·μ)/(n + κ), w = n/(n + κ).
 * Иллюстрация плана: μ = 0,092, κ = 30 → 4/15 → 0,150 (w = 0,33),
 * 0/18 → 0,058 (w = 0,38). Без данных и без прайора (n + κ = 0) → μ, w = 0,
 * интервала нет. Инвариант s ≤ n для долей — на стороне вызывающего
 * (иначе confidence mixed-sources, §4.1).
 */
export function shrinkRate(input: ShrinkRateInput): ShrinkRateResult {
    const intervalKind = input.intervalKind ?? SHRINK_DEFAULTS.intervalKind;
    const z = input.z ?? AI_ANALYTICS_THRESHOLDS.z90;
    const n = Math.max(0, input.exposure);
    const kappa = Math.max(0, input.prior.kappa);
    const successes = Math.max(0, input.successes);
    const prior: ShrinkPrior = { mu: input.prior.mu, kappa };
    const denominator = n + kappa;

    if (denominator <= 0) {
        return { value: prior.mu, w: 0, n, prior, intervalKind, ci90: null };
    }
    const hits = successes + kappa * prior.mu;
    return {
        value: hits / denominator,
        w: clamp01(n / denominator),
        n,
        prior,
        intervalKind,
        ci90: posteriorInterval(intervalKind, hits, denominator, z),
    };
}

/**
 * Взвешенные с забыванием суммы ряда: последний период (по ключу) весит 1,
 * каждый предыдущий — λ^(расстояние в позициях). Пропущенные периоды надо
 * подавать нулевыми точками, чтобы расстояние считалось по календарю.
 * Порядок входа не важен — точки сортируются по periodKey; λ обрезается
 * в [0, 1] (λ = 1 — обычные суммы).
 */
export function forgetSeries(
    points: readonly ForgetPoint[],
    lambda: number = SHRINK_DEFAULTS.forgetLambda,
): ForgetResult {
    const factor = clamp01(Number.isFinite(lambda) ? lambda : 1);
    const sorted = [...points].sort((a, b) =>
        a.periodKey.localeCompare(b.periodKey),
    );
    const last = sorted.length - 1;
    let n = 0;
    let s = 0;
    sorted.forEach((point, index) => {
        const weight = Math.pow(factor, last - index);
        n += weight * Math.max(0, point.n);
        s += weight * Math.max(0, point.s);
    });
    return {
        n,
        s,
        periods: sorted.length,
        lambda: factor,
        latestPeriodKey: sorted[last]?.periodKey ?? null,
    };
}
