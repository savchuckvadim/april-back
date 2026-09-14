import {
    ActivityRateInput,
    ActivityRateResult,
    shrinkActivityRate,
} from './activity-rate';
import { KAPPA_DEFAULTS } from './kappa';
import { DISPERSION_DEFAULTS } from './overdispersion';
import {
    SHRINK_DEFAULTS,
    ShrinkPrior,
    ShrinkRateResult,
    shrinkRate,
} from './shrink';
import { AI_ANALYTICS_THRESHOLDS } from './thresholds.const';
import { wilsonInterval } from './wilson';

export type { ActivitySeriesPoint } from './activity-rate';

/** Дефолты апостериоров рёбер и темпов (план §4.2). */
export const EDGE_RATE_DEFAULTS = {
    /**
     * Сверхдисперсия φ_mk до гейта оценки (`overdispersion_default`
     * реестра через DISPERSION_DEFAULTS); оценка — `quasiPoissonPhi`.
     */
    phi: DISPERSION_DEFAULTS.fallback,
    /** Забывание месяцев forget_lambda. */
    lambda: SHRINK_DEFAULTS.forgetLambda,
    /** κ_a = kappa_activity_days для темпов активностей. */
    kappaActivity: KAPPA_DEFAULTS.activityDays,
} as const;

/**
 * Практические пороги разрыва: 5 п.п. для долей, 1 балл для оценок.
 *
 * ⚠ Единицы: `practicalDelta` в `edgeGap` измеряется в тех же единицах,
 * что и Δ, то есть для долей — в ДОЛЕ (0,05), а не в процентных пунктах.
 * Реестр параметров хранит тот же порог в п.п. (`delta_prac_pct = 5`),
 * поэтому значение из реестра надо делить на PERCENT_POINTS_IN_UNIT;
 * `delta_prac_score = 1` уже в баллах и конверсии не требует.
 */
export const EDGE_GAP_PRACTICAL = {
    prob: 0.05,
    score: 1,
} as const;

/** Процентных пунктов в единице доли — множитель конверсии delta_prac_pct. */
export const PERCENT_POINTS_IN_UNIT = 100;

/** delta_prac_pct (п.п. реестра) → порог разрыва в доле для `edgeGap`. */
export const practicalDeltaFromPct = (pct: number): number =>
    pct / PERCENT_POINTS_IN_UNIT;

/** Выборка для сравнения: переходы/события и знаменатель. */
export interface GapSample {
    successes: number;
    exposure: number;
}

export interface EdgePosteriorInput extends GapSample {
    /** Норма слоя μ и сила усадки κ_k. */
    prior: ShrinkPrior;
    z?: number;
}

/** Вход апостериора темпа — см. ActivityRateInput (φ числом или оценкой). */
export type ActivityPosteriorInput = ActivityRateInput;

/** Результат апостериора темпа — см. ActivityRateResult. */
export type ActivityPosteriorResult = ActivityRateResult;

export type EdgeGapKind = 'prob' | 'rate';

export interface EdgeGapInput {
    kind: EdgeGapKind;
    /** Собственные числа менеджера. */
    manager: GapSample;
    /** LOO-норма слоя теми же единицами. */
    reference: GapSample;
    /** Практический порог |Δ|; по умолчанию 5 п.п. для долей и 0 для темпов. */
    practicalDelta?: number;
    z?: number;
}

export interface EdgeGapResult {
    kind: EdgeGapKind;
    /** Δ = θ_m − μ_LOO в единицах величины. */
    delta: number;
    /** Интервал разности; null — сравнение невозможно (пустой знаменатель). */
    ci90: [number, number] | null;
    /** Интервал отношения θ_m/μ_LOO — только для интенсивностей. */
    ratioCi90: [number, number] | null;
    coversZero: boolean;
    practicalDelta: number;
    /** Разрыв: интервал не накрывает ноль И |Δ| ≥ practicalDelta. */
    significant: boolean;
    direction: 'above' | 'below' | 'none';
}

const positive = (value: number): number => (value > 0 ? value : 0);

/**
 * Апостериор ребра (план §4.2): E[θ] = (s̃ + κ·μ)/(ñ + κ), w = ñ/(ñ + κ),
 * 90 %-интервал — Уилсон на псевдосчётчиках (intervalKind: wilson).
 */
export function edgePosterior(input: EdgePosteriorInput): ShrinkRateResult {
    return shrinkRate({
        successes: input.successes,
        exposure: input.exposure,
        prior: input.prior,
        intervalKind: 'wilson',
        z: input.z,
    });
}

/**
 * Апостериор темпа активностей с забыванием и сверхдисперсией (план §4.2):
 * Ñ = Σ λ^(T−t)N_t, D̃ = Σ λ^(T−t)D_t, затем
 * E[a] = (Ñ/φ + κ_a·μ)/(D̃/φ + κ_a), w = (D̃/φ)/(D̃/φ + κ_a),
 * 90 %-интервал — квантили Gamma(Ñ/φ + κμ, D̃/φ + κ).
 * φ принимается извне числом или оценкой `quasiPoissonPhi`; без неё —
 * дефолт реестра. Пропуски периодов передаются ключами `gaps`
 * (`shrinkActivityRate`), чтобы забывание шло по календарю.
 */
export function activityPosterior(
    input: ActivityPosteriorInput,
): ActivityPosteriorResult {
    return shrinkActivityRate({
        ...input,
        lambda: input.lambda ?? EDGE_RATE_DEFAULTS.lambda,
    });
}

/**
 * Интервал разности двух долей по Ньюкомбу (гибридный метод счёта, №10):
 * из интервалов Уилсона [l₁; u₁] и [l₂; u₂] и разности D = p₁ − p₂
 * L = D − √((p₁ − l₁)² + (u₂ − p₂)²), U = D + √((u₁ − p₁)² + (p₂ − l₂)²).
 * Двухвыборочный: учитывает дисперсию нормы, поэтому шире одновыборочного
 * Уилсона примерно на 15 % (иллюстрация плана §4.2).
 */
export function newcombeDifference(
    first: GapSample,
    second: GapSample,
    z: number = AI_ANALYTICS_THRESHOLDS.z90,
): [number, number] | null {
    if (first.exposure <= 0 || second.exposure <= 0) {
        return null;
    }
    const p1 = Math.min(1, positive(first.successes) / first.exposure);
    const p2 = Math.min(1, positive(second.successes) / second.exposure);
    const [low1, high1] = wilsonInterval(first.successes, first.exposure, z);
    const [low2, high2] = wilsonInterval(second.successes, second.exposure, z);
    const delta = p1 - p2;
    const lower = Math.sqrt(Math.pow(p1 - low1, 2) + Math.pow(high2 - p2, 2));
    const upper = Math.sqrt(Math.pow(high1 - p1, 2) + Math.pow(p2 - low2, 2));
    return [delta - lower, delta + upper];
}

/**
 * Интервал отношения двух интенсивностей по апостериорам Gamma(α, β):
 * Var(log X) ≈ 1/α (тригамма), откуда
 * r · exp(±z·√(1/α₁ + 1/α₂)), r = (α₁/β₁)/(α₂/β₂).
 * Нулевая или отрицательная форма/скорость — интервала нет.
 */
export function gammaRatioInterval(
    first: GapSample,
    second: GapSample,
    z: number = AI_ANALYTICS_THRESHOLDS.z90,
): [number, number] | null {
    const shape1 = positive(first.successes);
    const shape2 = positive(second.successes);
    if (shape1 <= 0 || shape2 <= 0) {
        return null;
    }
    if (first.exposure <= 0 || second.exposure <= 0) {
        return null;
    }
    const ratio = shape1 / first.exposure / (shape2 / second.exposure);
    const spread = z * Math.sqrt(1 / shape1 + 1 / shape2);
    return [ratio * Math.exp(-spread), ratio * Math.exp(spread)];
}

function rateGap(
    input: EdgeGapInput,
    z: number,
): {
    delta: number;
    ci90: [number, number] | null;
    ratio: [number, number] | null;
} {
    const reference =
        input.reference.exposure > 0
            ? positive(input.reference.successes) / input.reference.exposure
            : 0;
    const own =
        input.manager.exposure > 0
            ? positive(input.manager.successes) / input.manager.exposure
            : 0;
    const ratio = gammaRatioInterval(input.manager, input.reference, z);
    return {
        delta: own - reference,
        ci90: ratio
            ? [(ratio[0] - 1) * reference, (ratio[1] - 1) * reference]
            : null,
        ratio,
    };
}

function probGap(
    input: EdgeGapInput,
    z: number,
): { delta: number; ci90: [number, number] | null } {
    const ci90 = newcombeDifference(input.manager, input.reference, z);
    const own =
        input.manager.exposure > 0
            ? positive(input.manager.successes) / input.manager.exposure
            : 0;
    const reference =
        input.reference.exposure > 0
            ? positive(input.reference.successes) / input.reference.exposure
            : 0;
    return { delta: own - reference, ci90 };
}

/**
 * Двухвыборочный тест разрыва θ_m − μ_LOO (план §4.2): Ньюкомб для долей,
 * отношение двух гамм для интенсивностей. Разрыв показывается, только если
 * интервал не накрывает ноль И |Δ| ≥ практического порога (5 п.п. для долей,
 * 1 балл для оценок — EDGE_GAP_PRACTICAL).
 */
export function edgeGap(input: EdgeGapInput): EdgeGapResult {
    const z = input.z ?? AI_ANALYTICS_THRESHOLDS.z90;
    const practicalDelta =
        input.practicalDelta ??
        (input.kind === 'prob' ? EDGE_GAP_PRACTICAL.prob : 0);
    const gap =
        input.kind === 'prob'
            ? { ...probGap(input, z), ratio: null }
            : rateGap(input, z);
    const coversZero =
        gap.ci90 === null || (gap.ci90[0] <= 0 && gap.ci90[1] >= 0);
    const significant =
        !coversZero && Math.abs(gap.delta) >= Math.max(0, practicalDelta);
    return {
        kind: input.kind,
        delta: gap.delta,
        ci90: gap.ci90,
        ratioCi90: gap.ratio,
        coversZero,
        practicalDelta,
        significant,
        direction: significant ? (gap.delta > 0 ? 'above' : 'below') : 'none',
    };
}
