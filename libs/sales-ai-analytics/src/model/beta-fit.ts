/**
 * Оценка β «качество → ближний исход» по выборке звонков-триггеров
 * (план `ai-sales-analytics`, §4.4 «модель по умолчанию»).
 *
 * `logit p_i = α_страта(i) + β_w·(S_i − S̄_m) + β_b·(S̄_m − S̄_p)
 *   + γ·log(1 + calls_i) + u_m + offset_i`, `u_m ~ N(0, σ_u²)` —
 * случайный эффект менеджера как ridge-штраф `1/σ_u²`
 * (`beta_manager_effect_sd`). Вторая спецификация `pooled` — без
 * разложения Мундлака: `β_pooled` при `S_i − S̄_p`.
 *
 * Правило EPV (`beta_min_epv`): фиксированных параметров ≤ events/EPV,
 * где события — меньшая из групп исходов (`epvEventsOf`), иначе модель
 * вырождается по цепочке `full → no-gamma → single-intercept → slope-only
 * → insufficient` (`beta-fit.design`).
 *
 * SE — из обратной пенализованной матрицы Гессе, делённые на `√d_eff`:
 * в формуле мощности плана `d_eff ≈ 0,8` уменьшает информацию на
 * наблюдение, так что остаточная кластеризация по менеджерам (та, что не
 * впитал `u_m`) расширяет интервал консервативно. 90 %-интервалы — через
 * `z_compare`. Поправка на надёжность предиктора — `correctForReliability`:
 * для `S_i` (β_w, β_pooled) — `icc_form`, для среднего `S̄_m` (β_b) —
 * Спирмен–Браун при среднем числе строк на менеджера (план §4.4 «ошибка
 * измерения»); null → без поправки с флагом, сырые оценки сохраняются.
 */
import { registryDefault } from '../params/registry.access';
import {
    BETA_COLUMN,
    BETA_MIN_EPV_DEFAULT,
    buildBetaDesign,
    epvEventsOf,
    selectBetaForm,
} from './beta-fit.design';
import type {
    AiBetaFitSpec,
    BetaCurveReference,
    BetaEstimate,
    BetaFit,
    BetaFitOptions,
    BetaModelFit,
    BetaReliability,
} from './beta-fit.types';
import { expitOf, fitLogisticRidge } from './beta-irls';
import { BETA_POWER_DEFAULTS } from './beta-power';
import type { AiBetaLeadKind, BetaSample } from './beta-sample.types';
import { quantileOf } from './quantile.util';
import { spearmanBrown } from './reliability';
import { correctForReliability } from './reliability-correction';
import { AI_ANALYTICS_THRESHOLDS } from './thresholds.const';

export * from './beta-fit.types';
export { BETA_COLUMN, epvEventsOf, selectBetaForm } from './beta-fit.design';

/** Дефолты оценки — из реестра и ориентиров мощности. */
export const BETA_FIT_DEFAULTS = {
    /** `beta_manager_effect_sd` — σ_u случайного эффекта менеджера. */
    managerEffectSd: registryDefault('beta_manager_effect_sd'),
    /** `beta_min_epv` — событий на параметр. */
    minEpv: BETA_MIN_EPV_DEFAULT,
    /** `d_eff` — ориентир формулы мощности (не параметр реестра). */
    designEffect: BETA_POWER_DEFAULTS.designEffect,
    /** `z_compare` — квантиль 90 %-интервала. */
    z90: AI_ANALYTICS_THRESHOLDS.z90,
    /** `n_min_none` — ниже ни одного числа наружу. */
    minN: registryDefault('n_min_none'),
} as const;

function insufficientModel(
    sample: BetaSample,
    spec: AiBetaFitSpec,
): BetaModelFit {
    const eta = sample.rows.map(row => row.offset);

    return {
        spec,
        form: 'insufficient',
        n: sample.n,
        events: sample.events,
        fixedParams: 0,
        epv: null,
        converged: false,
        iterations: 0,
        logLikelihood: 0,
        coefficients: {},
        standardErrors: {},
        strataIntercepts: {},
        managerEffects: {},
        eta,
        predicted: eta.map(expitOf),
    };
}

/** Подгонка одной спецификации с выбором формы по EPV. */
export function fitBetaModel(
    sample: BetaSample,
    spec: AiBetaFitSpec,
    options: BetaFitOptions = {},
): BetaModelFit {
    const design = selectBetaForm({
        events: epvEventsOf(sample.events, sample.n),
        strataCount: sample.strata.length,
        spec,
        minEpv: options.minEpv,
        gammaInformative: sample.rows.some(
            row => row.logCalls !== sample.rows[0].logCalls,
        ),
        betweenInformative: sample.rows.some(
            row => row.sBetween !== sample.rows[0].sBetween,
        ),
    });
    if (sample.n < BETA_FIT_DEFAULTS.minN || design.form === 'insufficient') {
        return insufficientModel(sample, spec);
    }
    const sigmaU = options.managerEffectSd ?? BETA_FIT_DEFAULTS.managerEffectSd;
    const dEff = options.designEffect ?? BETA_FIT_DEFAULTS.designEffect;
    const logistic = buildBetaDesign(sample, spec, design, sigmaU);
    const fit = fitLogisticRidge(logistic, {
        maxIterations: options.maxIterations,
        tolerance: options.tolerance,
    });
    const coefficients: Record<string, number> = {};
    const standardErrors: Record<string, number> = {};
    const strataIntercepts: Partial<Record<AiBetaLeadKind, number>> = {};
    const managerEffects: Record<string, number> = {};
    logistic.names.forEach((name, index) => {
        coefficients[name] = fit.coefficients[index];
        standardErrors[name] = fit.standardErrors[index] / Math.sqrt(dEff);
        if (name.startsWith(BETA_COLUMN.managerPrefix)) {
            managerEffects[name.slice(BETA_COLUMN.managerPrefix.length)] =
                fit.coefficients[index];
        }
    });
    sample.strata.forEach(stratum => {
        strataIntercepts[stratum] = design.strata
            ? coefficients[`${BETA_COLUMN.alphaPrefix}${stratum}`]
            : coefficients[BETA_COLUMN.alpha];
    });

    return {
        spec,
        form: design.form,
        n: sample.n,
        events: sample.events,
        fixedParams: design.fixedParams,
        epv:
            design.fixedParams > 0
                ? epvEventsOf(sample.events, sample.n) / design.fixedParams
                : null,
        converged: fit.converged && !fit.singular,
        iterations: fit.iterations,
        logLikelihood: fit.logLikelihood,
        coefficients,
        standardErrors,
        strataIntercepts,
        managerEffects,
        eta: fit.eta,
        predicted: fit.predicted,
    };
}

/** Оценка коэффициента модели с 90 %-интервалом; null — его нет в форме. */
export function betaEstimateOf(
    model: BetaModelFit,
    name: string,
    z: number = BETA_FIT_DEFAULTS.z90,
): BetaEstimate | null {
    const value = model.coefficients[name];
    const se = model.standardErrors[name];
    if (
        model.form === 'insufficient' ||
        typeof value !== 'number' ||
        typeof se !== 'number' ||
        !Number.isFinite(value) ||
        !Number.isFinite(se)
    ) {
        return null;
    }

    return { value, se, ci90: [value - z * se, value + z * se] };
}

/** Опорные ковариаты кривой `p̂(S)` по выборке. */
export function curveReferenceOf(sample: BetaSample): BetaCurveReference {
    const strataShares: Partial<Record<AiBetaLeadKind, number>> = {};
    sample.strata.forEach(stratum => {
        strataShares[stratum] =
            sample.n > 0
                ? sample.rows.filter(row => row.stratum === stratum).length /
                  sample.n
                : 0;
    });
    const offsets = sample.rows.map(row => row.offset);

    return {
        sBarPortal: sample.sBarPortal,
        strataShares,
        medianCalls: quantileOf(
            sample.rows.map(row => row.callsInEpisode),
            0.5,
        ),
        meanOffset:
            offsets.length > 0
                ? offsets.reduce((acc, value) => acc + value, 0) /
                  offsets.length
                : 0,
    };
}

/**
 * Поправки на надёжность: `S_i` — `r`; `S̄_m` — Спирмен–Браун при среднем
 * числе строк на менеджера (`rowsPerManager`), иначе β_b перекорректирован.
 */
function reliabilityOf(
    sample: BetaSample,
    estimates: {
        readonly within: BetaEstimate | null;
        readonly between: BetaEstimate | null;
        readonly pooled: BetaEstimate | null;
    },
    r: number | null,
): BetaReliability {
    const rowsPerManager = sample.managers > 0 ? sample.n / sample.managers : 0;
    const rBetween =
        r !== null && r > 0 && rowsPerManager > 0
            ? spearmanBrown(r, rowsPerManager)
            : r;
    const correct = (
        estimate: BetaEstimate | null,
        reliability: number | null,
    ) =>
        estimate === null
            ? null
            : correctForReliability(estimate.value, reliability);

    return {
        r,
        rBetween,
        rowsPerManager,
        within: correct(estimates.within, r),
        between: correct(estimates.between, rBetween),
        pooled: correct(estimates.pooled, r),
    };
}

/**
 * Сводная оценка: β_w и β_b — из спецификации Мундлака, β_pooled — из
 * pooled; γ — из Мундлака, а если там его нет — из pooled.
 */
export function fitBeta(
    sample: BetaSample,
    options: BetaFitOptions = {},
): BetaFit {
    const z = options.z ?? BETA_FIT_DEFAULTS.z90;
    const mundlak = fitBetaModel(sample, 'mundlak', options);
    const pooled = fitBetaModel(sample, 'pooled', options);
    const within = betaEstimateOf(mundlak, BETA_COLUMN.within, z);
    const between = betaEstimateOf(mundlak, BETA_COLUMN.between, z);
    const pooledBeta = betaEstimateOf(pooled, BETA_COLUMN.pooled, z);
    const r =
        typeof options.reliability === 'number' &&
        Number.isFinite(options.reliability)
            ? options.reliability
            : null;

    return {
        within,
        between,
        pooled: pooledBeta,
        gamma:
            betaEstimateOf(mundlak, BETA_COLUMN.gamma, z) ??
            betaEstimateOf(pooled, BETA_COLUMN.gamma, z),
        strataIntercepts: pooled.strataIntercepts,
        managerEffects: pooled.managerEffects,
        n: sample.n,
        events: sample.events,
        epv: pooled.epv,
        form: { mundlak: mundlak.form, pooled: pooled.form },
        converged: mundlak.converged && pooled.converged,
        iterations: Math.max(mundlak.iterations, pooled.iterations),
        logLikelihood: {
            mundlak: mundlak.logLikelihood,
            pooled: pooled.logLikelihood,
        },
        models: { mundlak, pooled },
        reliability: reliabilityOf(
            sample,
            { within, between, pooled: pooledBeta },
            r,
        ),
        designEffect: options.designEffect ?? BETA_FIT_DEFAULTS.designEffect,
        managerEffectSd:
            options.managerEffectSd ?? BETA_FIT_DEFAULTS.managerEffectSd,
        reference: curveReferenceOf(sample),
    };
}
