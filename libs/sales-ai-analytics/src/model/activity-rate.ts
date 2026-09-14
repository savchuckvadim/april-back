import {
    DISPERSION_DEFAULTS,
    OverdispersionEstimate,
    OverdispersionSource,
} from './overdispersion';
import {
    ForgetPoint,
    ForgetResult,
    SHRINK_DEFAULTS,
    ShrinkPrior,
    ShrinkRateResult,
    forgetSeries,
    shrinkRate,
} from './shrink';

/**
 * Апостериор темпа активностей a_mk (план §4.2) с забыванием λ по календарю
 * и сверхдисперсией φ: E[a] = (Ñ/φ + κ_a·μ)/(D̃/φ + κ_a), w = (D̃/φ)/(D̃/φ + κ_a),
 * 90 %-интервал — Gamma(Ñ/φ + κμ, D̃/φ + κ). Сами формулы усадки живут в
 * `shrinkRate`: сюда входы приходят уже поделёнными на φ.
 */

/** Точка ряда темпа: события N_t и дни экспозиции D_t периода. */
export interface ActivitySeriesPoint {
    periodKey: string;
    events: number;
    days: number;
}

/** Источник φ в результате: дефолт, оценка или число, заданное вызывающим. */
export type ActivityPhiSource = OverdispersionSource | 'explicit';

export interface ActivityRateInput {
    series: readonly ActivitySeriesPoint[];
    /** Норма слоя μ_lk и κ_a = kappa_activity_days. */
    prior: ShrinkPrior;
    /**
     * Сверхдисперсия: число (явно) или оценка `quasiPoissonPhi`. Без неё и
     * при некорректном числе — дефолт реестра `overdispersion_default`.
     */
    phi?: number | OverdispersionEstimate;
    /** Забывание месяцев forget_lambda; по умолчанию 0,85. */
    lambda?: number;
    /**
     * Ключи периодов окна без данных (пропуски): подставляются нулями, чтобы
     * расстояние забывания считалось по календарю, а не по позициям.
     */
    gaps?: readonly string[];
    z?: number;
}

export interface ActivityRateResult extends ShrinkRateResult {
    /** Ñ = Σ λ^(T−t)·N_t. */
    forgottenEvents: number;
    /** D̃ = Σ λ^(T−t)·D_t. */
    forgottenDays: number;
    phi: number;
    phiSource: ActivityPhiSource;
    lambda: number;
    /** Периодов с данными. */
    periods: number;
    /** Пропусков, подставленных нулями. */
    gaps: number;
}

export interface ForgetGapsResult extends ForgetResult {
    /** Пропусков, добавленных нулевыми точками (ключи вне ряда). */
    gaps: number;
}

const positive = (value: number): number => (value > 0 ? value : 0);

/**
 * Забывание с учётом пропусков периодов: ключи `gaps`, которых нет в ряде,
 * добавляются нулевыми точками, поэтому пропуск не сжимает историю (соседи
 * пропуска сохраняют календарный вес λ^(T−t)), а пропуск последнего
 * периода окна снижает вес всех данных. Ключи, уже присутствующие в ряде,
 * и повторы игнорируются. `periods` — только точки с данными.
 */
export function forgetWithGaps(
    series: readonly ForgetPoint[],
    lambda: number = SHRINK_DEFAULTS.forgetLambda,
    gaps: readonly string[] = [],
): ForgetGapsResult {
    const present = new Set(series.map(point => point.periodKey));
    const filled = [...new Set(gaps)]
        .filter(key => !present.has(key))
        .map((periodKey): ForgetPoint => ({ periodKey, n: 0, s: 0 }));
    const result = forgetSeries([...series, ...filled], lambda);
    return { ...result, periods: series.length, gaps: filled.length };
}

/** φ и её источник из входа: оценка, явное число или дефолт реестра. */
export function resolveActivityPhi(phi: ActivityRateInput['phi']): {
    phi: number;
    source: ActivityPhiSource;
} {
    const raw = typeof phi === 'object' ? phi.phi : phi;
    if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) {
        return { phi: DISPERSION_DEFAULTS.fallback, source: 'default' };
    }
    return {
        phi: raw,
        source: typeof phi === 'object' ? phi.source : 'explicit',
    };
}

/**
 * Усадка темпа к норме слоя с забыванием по календарю и сверхдисперсией:
 * Ñ и D̃ — `forgetWithGaps`, затем `shrinkRate` на (Ñ/φ, D̃/φ) с гамма-
 * интервалом. При φ = 1 совпадает с `shrinkRate` на сырых суммах.
 */
export function shrinkActivityRate(
    input: ActivityRateInput,
): ActivityRateResult {
    const resolved = resolveActivityPhi(input.phi);
    const forgotten = forgetWithGaps(
        input.series.map(point => ({
            periodKey: point.periodKey,
            n: positive(point.days),
            s: positive(point.events),
        })),
        input.lambda ?? SHRINK_DEFAULTS.forgetLambda,
        input.gaps,
    );
    const posterior = shrinkRate({
        successes: forgotten.s / resolved.phi,
        exposure: forgotten.n / resolved.phi,
        prior: input.prior,
        intervalKind: 'gamma',
        z: input.z,
    });
    return {
        ...posterior,
        forgottenEvents: forgotten.s,
        forgottenDays: forgotten.n,
        phi: resolved.phi,
        phiSource: resolved.source,
        lambda: forgotten.lambda,
        periods: forgotten.periods,
        gaps: forgotten.gaps,
    };
}
