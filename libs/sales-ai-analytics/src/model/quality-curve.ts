import type { QualityPoint } from '../contracts/quality-link.types';

/**
 * Табличная кривая `p̂(S)` связи «качество → исход» (план §4.4) и её
 * обращение. Вынесено из `model/qav.ts`, чтобы каждый файл модели
 * оставался в пределах 300 строк.
 *
 * Интерполяция — кусочно-линейная **на шкале логита** между узлами;
 * вне области определения кривая продолжается константой: экстраполяции
 * по наклону нет, иначе появились бы числа там, где данных не было.
 */
export const logit = (p: number): number => Math.log(p / (1 - p));

export const expit = (x: number): number => 1 / (1 + Math.exp(-x));

const isProbability = (p: number): boolean =>
    Number.isFinite(p) && p > 0 && p < 1;

/**
 * Кривая пригодна: не менее 2 точек, S строго возрастает, p из (0; 1).
 * Непригодная кривая даёт пустой массив — режим `data` не применяется.
 */
export function normalizeCurve(
    curve: readonly QualityPoint[] | undefined,
): readonly QualityPoint[] {
    if (!curve || curve.length < 2) {
        return [];
    }
    const sorted = [...curve].sort((a, b) => a.s - b.s);
    for (let index = 0; index < sorted.length; index += 1) {
        const point = sorted[index];
        if (!Number.isFinite(point.s) || !isProbability(point.p)) {
            return [];
        }
        if (index > 0 && sorted[index - 1].s >= point.s) {
            return [];
        }
    }

    return sorted;
}

/** `p̂(S)` по кривой; null — кривой нет либо S не число. */
export function probabilityOnCurve(
    curve: readonly QualityPoint[],
    score: number,
): number | null {
    if (curve.length === 0 || !Number.isFinite(score)) {
        return null;
    }
    if (score <= curve[0].s) {
        return curve[0].p;
    }
    const last = curve[curve.length - 1];
    if (score >= last.s) {
        return last.p;
    }
    for (let index = 1; index < curve.length; index += 1) {
        const right = curve[index];
        if (score > right.s) {
            continue;
        }
        const left = curve[index - 1];
        const weight = (score - left.s) / (right.s - left.s);

        return expit(logit(left.p) + weight * (logit(right.p) - logit(left.p)));
    }

    return last.p;
}

/** Наименьшее S с `p̂(S) ≥ p`; null — вероятность кривой недостижима. */
export function scoreForProbability(
    curve: readonly QualityPoint[],
    p: number,
): number | null {
    if (curve.length === 0) {
        return null;
    }
    if (p <= curve[0].p) {
        return curve[0].s;
    }
    for (let index = 1; index < curve.length; index += 1) {
        const right = curve[index];
        if (p > right.p) {
            continue;
        }
        const left = curve[index - 1];
        const span = logit(right.p) - logit(left.p);
        if (span <= 0) {
            return right.s;
        }
        const weight = (logit(p) - logit(left.p)) / span;

        return left.s + weight * (right.s - left.s);
    }

    return null;
}
