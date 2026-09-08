import { STYLE_PROFILE_DEFAULTS } from './style-profile.types';

/**
 * Эмпирический Байес профиля стиля (документ
 * `ai/tasks/ai-analytics-manager-style.md`, раздел 3.1, шаг 4): апостериор τ
 * на фиксированной сетке и смесь усадок по её узлам.
 *
 * Почему не точечная моментная оценка `τ̂² = max(0, ·)`: при K = 8–12
 * коллегах она то и дело обнуляется, усадка скачет от нуля до полной, и ось
 * «мигает» между пересчётами. Интегрирование по τ переносит саму
 * неопределённость τ в ширину интервала — числа получаются устойчивыми,
 * а расчёт остаётся детерминированным (сетка фиксирована, случайности нет).
 */

/** Φ(x) через аппроксимацию Абрамовица–Стиган (точность ~1e-7). */
export function normalCdf(x: number): number {
    if (!Number.isFinite(x)) {
        return x > 0 ? 1 : 0;
    }
    const sign = x < 0 ? -1 : 1;
    const z = Math.abs(x) / Math.SQRT2;
    const t = 1 / (1 + 0.3275911 * z);
    const poly =
        t *
        (0.254829592 +
            t *
                (-0.284496736 +
                    t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
    return 0.5 * (1 + sign * (1 - poly * Math.exp(-z * z)));
}
export interface TauPosterior {
    taus: number[];
    weights: number[];
    mus: number[];
    varMus: number[];
}

/**
 * Апостериор τ на фиксированной сетке [0; 1,5·σ_w] с half-normal прайором:
 * в каждом узле — точностные веса коллег, LOO-норма μ и её дисперсия, затем
 * маргинальное правдоподобие. Точечная моментная оценка τ̂² = max(0, ·) не
 * используется: при малом K она то и дело обнуляется, и ось «мигает» между
 * пересчётами.
 */
export function tauPosterior(
    peerMeans: readonly number[],
    peerVars: readonly number[],
    sigmaW: number,
): TauPosterior {
    const { tauNodes, tauPriorScale, tauMaxScale } = STYLE_PROFILE_DEFAULTS;
    const scale = tauPriorScale * sigmaW;
    const taus: number[] = [];
    const logs: number[] = [];
    const mus: number[] = [];
    const varMus: number[] = [];
    for (let node = 0; node < tauNodes; node += 1) {
        const tau = (tauMaxScale * sigmaW * (node + 0.5)) / tauNodes;
        const weights = peerVars.map(variance => 1 / (tau * tau + variance));
        const total = weights.reduce((acc, weight) => acc + weight, 0);
        const mu =
            weights.reduce(
                (acc, weight, index) => acc + weight * peerMeans[index],
                0,
            ) / total;
        taus.push(tau);
        mus.push(mu);
        varMus.push(1 / total);
        logs.push(
            weights.reduce(
                (acc, weight, index) =>
                    acc +
                    0.5 * Math.log(weight / (2 * Math.PI)) -
                    (weight * (peerMeans[index] - mu) ** 2) / 2,
                0,
            ) -
                (tau * tau) / (2 * scale * scale),
        );
    }
    const top = Math.max(...logs);
    const raw = logs.map(value => Math.exp(value - top));
    const sum = raw.reduce((acc, value) => acc + value, 0);
    return { taus, weights: raw.map(value => value / sum), mus, varMus };
}

export interface AxisPosterior {
    dTilde: number;
    sdPost: number;
    mu: number;
    varMu: number;
    tauUpper80: number;
}

/** Смесь усадок по узлам сетки τ (документ 3.1, шаг 4). */
export function mixPosterior(
    subjectMean: number,
    subjectVar: number,
    posterior: TauPosterior,
): AxisPosterior {
    let dTilde = 0;
    let second = 0;
    let mu = 0;
    let varMu = 0;
    let cumulative = 0;
    let tauUpper80 = posterior.taus[posterior.taus.length - 1];
    let reached = false;
    posterior.weights.forEach((weight, index) => {
        const tau = posterior.taus[index];
        const b = (tau * tau) / (tau * tau + subjectVar);
        const delta = b * (subjectMean - posterior.mus[index]);
        dTilde += weight * delta;
        second +=
            weight *
            (b * subjectVar + b * b * posterior.varMus[index] + delta * delta);
        mu += weight * posterior.mus[index];
        varMu += weight * posterior.varMus[index];
        cumulative += weight;
        if (!reached && cumulative >= 0.8) {
            tauUpper80 = tau;
            reached = true;
        }
    });
    return {
        dTilde,
        sdPost: Math.sqrt(Math.max(0, second - dTilde * dTilde)),
        mu,
        varMu,
        tauUpper80,
    };
}
