/**
 * Кривая `p̂(S)` по pooled-модели и связь «качество → исход» в режиме
 * `data` (план `ai-sales-analytics`, §4.4 «шкала применения», §4.8).
 *
 * Опорные ковариаты: `u = 0`, свободные члены страт — взвешенно по долям
 * страт в выборке, `calls` — медиана, оффсет — средний. Кривая
 * табличная (S от 1 до 10, шаг 1 или 0,5) — прикладные величины
 * (множитель, изо-линия, `S_req`) считаются на шкале вероятности через
 * `buildQualityLink`, а не экспонентой: ближний исход не редкий, поэтому
 * `rareOutcomeOnly = false`.
 */
import type {
    QualityLink,
    QualityPoint,
} from '../contracts/quality-link.types';
import { BETA_COLUMN } from './beta-fit';
import type { BetaFit, BetaModelFit } from './beta-fit.types';
import { expitOf } from './beta-irls';
import { AI_BETA_LEAD_KINDS } from './beta-sample.types';
import { buildQualityLink, QAV_DEFAULTS } from './qav';

/** Допустимые шаги шкалы кривой. */
export const AI_BETA_CURVE_STEPS = [1, 0.5] as const;

export type AiBetaCurveStep = (typeof AI_BETA_CURVE_STEPS)[number];

/** Точность узлов шкалы: защита от шума float при шаге 0,5. */
const SCORE_PRECISION = 1e6;

const roundScore = (value: number): number =>
    Math.round(value * SCORE_PRECISION) / SCORE_PRECISION;

/** Взвешенный по долям страт свободный член pooled-модели. */
function weightedIntercept(fit: BetaFit, model: BetaModelFit): number {
    const shares = fit.reference.strataShares;
    let sum = 0;
    let weight = 0;
    AI_BETA_LEAD_KINDS.forEach(stratum => {
        const alpha = model.strataIntercepts[stratum];
        const share = shares[stratum] ?? 0;
        if (typeof alpha === 'number' && share > 0) {
            sum += alpha * share;
            weight += share;
        }
    });
    if (weight > 0) {
        return sum / weight;
    }
    const single = model.coefficients[BETA_COLUMN.alpha];

    return typeof single === 'number' ? single : 0;
}

/**
 * `p̂(S)` pooled-модели при опорных ковариатах; null — модели нет
 * (`insufficient`), подгонка не сошлась или вырождена (тогда `fit.pooled`
 * null — плоская кривая из нулевых коэффициентов наружу не выходит).
 */
export function betaProbabilityAt(fit: BetaFit, score: number): number | null {
    const model = fit.models.pooled;
    if (
        model.form === 'insufficient' ||
        !model.converged ||
        fit.pooled === null
    ) {
        return null;
    }
    const beta = fit.pooled.value;
    if (!Number.isFinite(score)) {
        return null;
    }
    const gamma = model.coefficients[BETA_COLUMN.gamma] ?? 0;
    const eta =
        weightedIntercept(fit, model) +
        beta * (score - fit.reference.sBarPortal) +
        gamma * Math.log(1 + Math.max(0, fit.reference.medianCalls)) +
        fit.reference.meanOffset;

    return expitOf(eta);
}

/** Табличная кривая `p̂(S)` для S = 1..10 с шагом 1 или 0,5. */
export function betaCurve(
    fit: BetaFit,
    step: AiBetaCurveStep = 1,
): QualityPoint[] {
    const points: QualityPoint[] = [];
    for (let s = QAV_DEFAULTS.sMin; s <= QAV_DEFAULTS.sMax + 1e-9; s += step) {
        const score = roundScore(s);
        const p = betaProbabilityAt(fit, score);
        if (p === null) {
            return [];
        }
        points.push({ s: score, p });
    }

    return points;
}

/**
 * Связь «качество → исход» режима `data` по оценке: кривая из
 * pooled-модели, β — для подписи, `rareOutcomeOnly = false`. Инварианты
 * кривой (≥ 2 точек, S возрастает, p ∈ (0; 1)) проверяет `buildQualityLink`.
 */
export function buildQualityLinkFromFit(
    fit: BetaFit,
    sRef: number,
    step: AiBetaCurveStep = 1,
): QualityLink {
    return buildQualityLink({
        betaSource: 'data',
        sRef,
        curve: betaCurve(fit, step),
        beta: fit.pooled?.value ?? null,
        rareOutcome: false,
    });
}
