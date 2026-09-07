import { MetricValue } from './metric';

/**
 * Параметры усадки качества Normal-Normal (план §4.3):
 * - mDefault — сила усадки до оценки ANOVA (10 псевдонаблюдений);
 * - mMax — потолок; он же значение при τ̂² ≤ 0 («менеджеры неразличимы»);
 * - mMin — пол, чтобы почти нулевая τ̂² не давала бесконечную усадку;
 * - minGroups / minGroupSize — ценз оценки: ≥ 5 менеджеров с n ≥ 20.
 */
export const SECTION_SHRINK_DEFAULTS = {
    mDefault: 10,
    mMax: 50,
    mMin: 1,
    minGroups: 5,
    minGroupSize: 20,
} as const;

/** Группа оценок одного менеджера (сырые S, шкала 1–10). */
export interface QualityGroup {
    key: string;
    values: readonly number[];
}

/**
 * Источник m_S: estimated — ANOVA по менеджерам портала; default — ценз не
 * пройден, взят дефолт 10; managers-indistinguishable — τ̂² ≤ 0, полная
 * усадка m_max = 50 (пометка в UI «менеджеры неразличимы»).
 */
export type MsSource = 'estimated' | 'default' | 'managers-indistinguishable';

export interface MsEstimate {
    /** m_S = σ²_внутри/τ̂²_между в псевдонаблюдениях. */
    mS: number;
    source: MsSource;
    /** Менеджеров, прошедших ценз n ≥ minGroupSize. */
    groups: number;
    /** σ_внутри = √MSW; null — оценки не было. */
    sigmaWithin: number | null;
    /** τ̂ = √τ̂²; null — оценки не было или τ̂² ≤ 0. */
    tauBetween: number | null;
}

interface GroupStat {
    n: number;
    sum: number;
    sumSq: number;
}

const statOf = (values: readonly number[]): GroupStat =>
    values.reduce<GroupStat>(
        (acc, value) => ({
            n: acc.n + 1,
            sum: acc.sum + value,
            sumSq: acc.sumSq + value * value,
        }),
        { n: 0, sum: 0, sumSq: 0 },
    );

const clampMs = (value: number): number =>
    Math.min(
        SECTION_SHRINK_DEFAULTS.mMax,
        Math.max(SECTION_SHRINK_DEFAULTS.mMin, value),
    );

const notEstimated = (source: MsSource, groups: number): MsEstimate => ({
    mS:
        source === 'default'
            ? SECTION_SHRINK_DEFAULTS.mDefault
            : SECTION_SHRINK_DEFAULTS.mMax,
    source,
    groups,
    sigmaWithin: null,
    tauBetween: null,
});

/**
 * m_S = σ²_внутри/τ²_между однофакторной ANOVA по менеджерам портала
 * (план §4.3). Ценз: ≥ 5 менеджеров с n ≥ 20 (значения с NaN отбрасываются),
 * иначе дефолт 10. τ̂² = (MSB − MSW)/n₀, n₀ = (N − Σnᵢ²/N)/(k − 1);
 * τ̂² ≤ 0 (менеджеры неразличимы) → m_S = m_max = 50 с пометкой.
 */
export function estimateMS(groups: readonly QualityGroup[]): MsEstimate {
    const stats = groups
        .map(group => statOf(group.values.filter(Number.isFinite)))
        .filter(stat => stat.n >= SECTION_SHRINK_DEFAULTS.minGroupSize);
    const k = stats.length;
    if (k < SECTION_SHRINK_DEFAULTS.minGroups) {
        return notEstimated('default', k);
    }
    const total = stats.reduce((acc, stat) => acc + stat.n, 0);
    const grand = stats.reduce((acc, stat) => acc + stat.sum, 0) / total;
    const ssWithin = stats.reduce(
        (acc, stat) => acc + stat.sumSq - stat.sum ** 2 / stat.n,
        0,
    );
    const ssBetween = stats.reduce(
        (acc, stat) => acc + stat.n * (stat.sum / stat.n - grand) ** 2,
        0,
    );
    const msWithin = ssWithin / (total - k);
    const msBetween = ssBetween / (k - 1);
    const nZero =
        (total - stats.reduce((acc, stat) => acc + stat.n ** 2, 0) / total) /
        (k - 1);
    const tauSq = nZero > 0 ? (msBetween - msWithin) / nZero : 0;
    if (!(tauSq > 0)) {
        return {
            ...notEstimated('managers-indistinguishable', k),
            sigmaWithin: Number.isFinite(msWithin)
                ? Math.sqrt(Math.max(0, msWithin))
                : null,
        };
    }
    return {
        mS: clampMs(msWithin / tauSq),
        source: 'estimated',
        groups: k,
        sigmaWithin: Math.sqrt(Math.max(0, msWithin)),
        tauBetween: Math.sqrt(tauSq),
    };
}

export interface SectionShrinkInput {
    /** Собственных оценок n (звонков раздела/корзины). */
    n: number;
    /** Собственное среднее S̄ (шкала 1–10); при n = 0 не используется. */
    mean: number;
    /** Норма полосы μ (LOO-норма слоя). */
    mu: number;
    /** Сила усадки m_S; по умолчанию дефолт 10. */
    mS?: number;
}

export interface SectionShrinkResult {
    /** Ŝ = (n·S̄ + m_S·μ)/(n + m_S). */
    value: number;
    /** Доля собственных данных w = n/(n + m_S) ∈ [0, 1]. */
    w: number;
    n: number;
    mS: number;
    mu: number;
}

/**
 * Усадка оценки к норме полосы (Normal-Normal, план §4.3):
 * Ŝ = (n·S̄ + m_S·μ)/(n + m_S), w = n/(n + m_S). При n = 0 → норма μ и w = 0.
 * Отдельно от shrinkRate: там доли/интенсивности с интервалом Уилсона или
 * гаммы, здесь шкала 1–10 и интервал строится по SE (см. reliability.ts).
 */
export function shrinkSectionScore(
    input: SectionShrinkInput,
): SectionShrinkResult {
    const mS = Math.max(0, input.mS ?? SECTION_SHRINK_DEFAULTS.mDefault);
    const n = Math.max(0, Number.isFinite(input.n) ? input.n : 0);
    const denominator = n + mS;
    if (denominator <= 0) {
        return { value: input.mu, w: 0, n, mS, mu: input.mu };
    }
    const own = n > 0 ? n * input.mean : 0;
    return {
        value: (own + mS * input.mu) / denominator,
        w: Math.min(1, Math.max(0, n / denominator)),
        n,
        mS,
        mu: input.mu,
    };
}

/**
 * Та же усадка поверх MetricValue: value заменяется на Ŝ, добавляется w.
 * Контракт «честного мало данных» сохраняется — при confidence none
 * значение остаётся null (усаженная норма не выдаётся за оценку менеджера).
 */
export function shrinkSectionMetric(
    metric: MetricValue,
    mu: number,
    mS?: number,
): MetricValue {
    const shrunk = shrinkSectionScore({
        n: metric.n,
        mean: metric.value ?? mu,
        mu,
        mS,
    });
    return {
        ...metric,
        value: metric.value === null ? null : shrunk.value,
        w: shrunk.w,
    };
}
