/**
 * Внутриклассовые корреляции по двухфакторной ANOVA «объекты × прогоны»
 * (Shrout, Fleiss, 1979; McGraw, Wong, 1996): ICC(2,1) — прогоны как
 * случайный фактор, абсолютное согласие, единичная оценка — и ICC(3,1) —
 * согласованность, где постоянный сдвиг между прогонами не штрафуется.
 * Нужна полная матрица n × k (n ≥ 2 объектов, k ≥ 2 прогонов); порядок
 * строк и столбцов на результат не влияет.
 * Чистые функции: без DI, Bitrix и Prisma.
 */
import { IccAnovaResult, ScalePair } from './agreement.types';

const meanOf = (values: readonly number[]): number =>
    values.reduce((acc, value) => acc + value, 0) / values.length;

const sumSquares = (values: readonly number[], center: number): number =>
    values.reduce((acc, value) => acc + (value - center) ** 2, 0);

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

/** (MSR − MSE)/знаменатель, обрезанное к [0, 1]; знаменатель ≤ 0 → null. */
const ratio = (numerator: number, denominator: number): number | null =>
    denominator > 0 ? clamp01(numerator / denominator) : null;

/** Полная матрица: ≥ 2 строк, ≥ 2 столбцов одной длины, все числа конечны. */
export function isBalancedMatrix(
    matrix: readonly (readonly number[])[],
): boolean {
    const k = matrix[0]?.length ?? 0;
    return (
        matrix.length >= 2 &&
        k >= 2 &&
        matrix.every(
            row =>
                row.length === k && row.every(value => Number.isFinite(value)),
        )
    );
}

/**
 * Двухфакторная ANOVA и ICC:
 * ICC(2,1) = (MSR − MSE)/(MSR + (k − 1)·MSE + k·(MSC − MSE)/n),
 * ICC(3,1) = (MSR − MSE)/(MSR + (k − 1)·MSE).
 * Отрицательная оценка (между объектами сигнала нет) обрезается до 0;
 * нулевой знаменатель (все значения одинаковы) → null у коэффициента.
 * Неполная матрица → null целиком.
 */
export function iccTwoWay(
    matrix: readonly (readonly number[])[],
): IccAnovaResult | null {
    if (!isBalancedMatrix(matrix)) {
        return null;
    }
    const n = matrix.length;
    const k = matrix[0].length;
    const grand = meanOf(matrix.flatMap(row => [...row]));
    const rowMeans = matrix.map(meanOf);
    const colMeans = Array.from({ length: k }, (_, j) =>
        meanOf(matrix.map(row => row[j])),
    );
    const ssRows = k * sumSquares(rowMeans, grand);
    const ssCols = n * sumSquares(colMeans, grand);
    const ssTotal = matrix.reduce(
        (acc, row) => acc + sumSquares(row, grand),
        0,
    );
    const msRows = ssRows / (n - 1);
    const msCols = ssCols / (k - 1);
    // max(0, ·): у одинаковых прогонов остаток отличается от нуля лишь
    // ошибкой округления и не должен уходить в минус.
    const msError =
        Math.max(0, ssTotal - ssRows - ssCols) / ((n - 1) * (k - 1));
    return {
        n,
        k,
        msRows,
        msCols,
        msError,
        icc21: ratio(
            msRows - msError,
            msRows + (k - 1) * msError + (k * (msCols - msError)) / n,
        ),
        icc31: ratio(msRows - msError, msRows + (k - 1) * msError),
    };
}

/** ICC по парам «первый − второй прогон» одной шкалы (k = 2). */
export function iccOfPairs(pairs: readonly ScalePair[]): IccAnovaResult | null {
    return iccTwoWay(pairs.map(pair => [pair.first, pair.second]));
}
