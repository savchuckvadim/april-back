/**
 * Пенализованная логистическая регрессия IRLS (Ньютон–Рафсон) и своя
 * маленькая линейная алгебра для оценки β «качество → исход»
 * (план `ai-sales-analytics`, §4.4). Библиотек нет: решение СЛАУ —
 * разложение Холецкого с проверкой вырожденности.
 *
 * Модель: `logit p_i = offset_i + Σ_j x_ij·θ_j`, штраф ridge
 * `½·Σ_j λ_j·θ_j²` (λ_j = 1/σ_j²; 0 — коэффициент свободный). Случайный
 * эффект менеджера `u_m ~ N(0, σ_u²)` входит именно так — как столбцы
 * индикаторов с λ = 1/σ_u² (мода апостериора при известной σ_u).
 *
 * Детерминизм: фиксированный максимум итераций, порог сходимости,
 * шаг делится пополам, пока пенализованное правдоподобие не растёт;
 * суммы — в порядке строк.
 */

/** Дизайн логистической регрессии по столбцам. */
export interface LogisticDesign {
    readonly y: readonly (0 | 1)[];
    /** Столбцы матрицы дизайна: `columns[j][i]`. */
    readonly columns: readonly (readonly number[])[];
    readonly names: readonly string[];
    /** Штраф ridge на коэффициент `1/σ_j²`; 0 — без штрафа. */
    readonly penalties: readonly number[];
    readonly offset?: readonly number[];
}

export interface LogisticFitOptions {
    readonly maxIterations?: number;
    readonly tolerance?: number;
}

/** Результат подгонки. */
export interface LogisticFit {
    readonly coefficients: readonly number[];
    /** SE из обратной пенализованной матрицы Гессе. */
    readonly standardErrors: readonly number[];
    readonly converged: boolean;
    readonly iterations: number;
    /** Логарифм правдоподобия без штрафа. */
    readonly logLikelihood: number;
    /** Линейный предиктор и вероятность по строкам. */
    readonly eta: readonly number[];
    readonly predicted: readonly number[];
    /** Матрица Гессе вырождена — оценок нет. */
    readonly singular: boolean;
}

/**
 * Настройки Ньютона. Не параметры реестра: численные константы метода
 * (план §4.11 требует лишь детерминизма и воспроизводимости).
 */
export const IRLS_DEFAULTS = {
    maxIterations: 50,
    tolerance: 1e-9,
    /** Зажим вероятности от 0 и 1 в правдоподобии. */
    probabilityEps: 1e-12,
    /** Делений шага пополам за итерацию. */
    maxHalvings: 20,
} as const;

export const expitOf = (x: number): number => 1 / (1 + Math.exp(-x));

/**
 * Разложение Холецкого `A = L·Lᵀ` симметричной матрицы; null — матрица
 * не положительно определена (вырожденный дизайн).
 */
export function cholesky(
    matrix: readonly (readonly number[])[],
): number[][] | null {
    const size = matrix.length;
    const lower = matrix.map(() => new Array<number>(size).fill(0));
    for (let i = 0; i < size; i += 1) {
        for (let j = 0; j <= i; j += 1) {
            let sum = matrix[i][j];
            for (let k = 0; k < j; k += 1) {
                sum -= lower[i][k] * lower[j][k];
            }
            if (i === j) {
                if (!(sum > 0) || !Number.isFinite(sum)) {
                    return null;
                }
                lower[i][i] = Math.sqrt(sum);
            } else {
                lower[i][j] = sum / lower[j][j];
            }
        }
    }

    return lower;
}

/** Решение `L·Lᵀ·x = b` прямой и обратной подстановкой. */
export function choleskySolve(
    lower: readonly (readonly number[])[],
    rhs: readonly number[],
): number[] {
    const size = lower.length;
    const forward = new Array<number>(size).fill(0);
    for (let i = 0; i < size; i += 1) {
        let sum = rhs[i];
        for (let k = 0; k < i; k += 1) {
            sum -= lower[i][k] * forward[k];
        }
        forward[i] = sum / lower[i][i];
    }
    const solution = new Array<number>(size).fill(0);
    for (let i = size - 1; i >= 0; i -= 1) {
        let sum = forward[i];
        for (let k = i + 1; k < size; k += 1) {
            sum -= lower[k][i] * solution[k];
        }
        solution[i] = sum / lower[i][i];
    }

    return solution;
}

/** Диагональ обратной матрицы `(L·Lᵀ)⁻¹` — дисперсии коэффициентов. */
export function choleskyInverseDiagonal(
    lower: readonly (readonly number[])[],
): number[] {
    return lower.map((_, j) => {
        const unit = lower.map((__, i) => (i === j ? 1 : 0));

        return choleskySolve(lower, unit)[j];
    });
}

function linearPredictor(
    design: LogisticDesign,
    theta: readonly number[],
): number[] {
    const n = design.y.length;
    const eta = new Array<number>(n).fill(0);
    for (let i = 0; i < n; i += 1) {
        let value = design.offset?.[i] ?? 0;
        for (let j = 0; j < theta.length; j += 1) {
            value += design.columns[j][i] * theta[j];
        }
        eta[i] = value;
    }

    return eta;
}

function logLikelihoodOf(
    y: readonly (0 | 1)[],
    eta: readonly number[],
): number {
    const eps = IRLS_DEFAULTS.probabilityEps;
    let sum = 0;
    for (let i = 0; i < y.length; i += 1) {
        const p = Math.min(1 - eps, Math.max(eps, expitOf(eta[i])));
        sum += y[i] === 1 ? Math.log(p) : Math.log(1 - p);
    }

    return sum;
}

function penalizedObjective(
    design: LogisticDesign,
    theta: readonly number[],
    eta: readonly number[],
): number {
    let penalty = 0;
    for (let j = 0; j < theta.length; j += 1) {
        penalty += design.penalties[j] * theta[j] * theta[j];
    }

    return logLikelihoodOf(design.y, eta) - penalty / 2;
}

/** Пенализованная матрица Гессе `XᵀWX + Λ` и градиент `Xᵀ(y − p) − Λθ`. */
function newtonSystem(
    design: LogisticDesign,
    theta: readonly number[],
    eta: readonly number[],
): { hessian: number[][]; gradient: number[] } {
    const k = theta.length;
    const n = design.y.length;
    const hessian = Array.from({ length: k }, () =>
        new Array<number>(k).fill(0),
    );
    const gradient = new Array<number>(k).fill(0);
    for (let i = 0; i < n; i += 1) {
        const p = expitOf(eta[i]);
        const weight = p * (1 - p);
        const residual = design.y[i] - p;
        for (let a = 0; a < k; a += 1) {
            const xa = design.columns[a][i];
            if (xa === 0) {
                continue;
            }
            gradient[a] += xa * residual;
            for (let b = 0; b <= a; b += 1) {
                hessian[a][b] += weight * xa * design.columns[b][i];
            }
        }
    }
    for (let a = 0; a < k; a += 1) {
        hessian[a][a] += design.penalties[a];
        gradient[a] -= design.penalties[a] * theta[a];
        for (let b = 0; b < a; b += 1) {
            hessian[b][a] = hessian[a][b];
        }
    }

    return { hessian, gradient };
}

const singularFit = (design: LogisticDesign, k: number): LogisticFit => ({
    coefficients: new Array<number>(k).fill(0),
    standardErrors: new Array<number>(k).fill(Number.POSITIVE_INFINITY),
    converged: false,
    iterations: 0,
    logLikelihood: logLikelihoodOf(design.y, linearPredictor(design, [])),
    eta: linearPredictor(design, []),
    predicted: linearPredictor(design, []).map(expitOf),
    singular: true,
});

/**
 * Подгонка Ньютоном с делением шага. Сходимость — `max|Δθ| < tolerance`
 * либо исчерпание `maxIterations` (тогда `converged: false`).
 */
export function fitLogisticRidge(
    design: LogisticDesign,
    options: LogisticFitOptions = {},
): LogisticFit {
    const k = design.columns.length;
    const maxIterations = options.maxIterations ?? IRLS_DEFAULTS.maxIterations;
    const tolerance = options.tolerance ?? IRLS_DEFAULTS.tolerance;
    let theta = new Array<number>(k).fill(0);
    let eta = linearPredictor(design, theta);
    let objective = penalizedObjective(design, theta, eta);
    let converged = false;
    let iterations = 0;
    let lower: number[][] | null = null;
    while (iterations < maxIterations && !converged) {
        iterations += 1;
        const { hessian, gradient } = newtonSystem(design, theta, eta);
        lower = cholesky(hessian);
        if (lower === null) {
            return singularFit(design, k);
        }
        const direction = choleskySolve(lower, gradient);
        let scale = 1;
        for (let half = 0; half <= IRLS_DEFAULTS.maxHalvings; half += 1) {
            const candidate = theta.map(
                (value, j) => value + scale * direction[j],
            );
            const candidateEta = linearPredictor(design, candidate);
            const candidateObjective = penalizedObjective(
                design,
                candidate,
                candidateEta,
            );
            if (candidateObjective >= objective - 1e-12) {
                const shift = Math.max(
                    ...direction.map(value => Math.abs(scale * value)),
                );
                theta = candidate;
                eta = candidateEta;
                objective = candidateObjective;
                converged = shift < tolerance;
                break;
            }
            scale /= 2;
        }
    }
    const final = cholesky(newtonSystem(design, theta, eta).hessian);
    if (final === null) {
        return singularFit(design, k);
    }
    const variances = choleskyInverseDiagonal(final);

    return {
        coefficients: theta,
        standardErrors: variances.map(value => Math.sqrt(Math.max(0, value))),
        converged,
        iterations,
        logLikelihood: logLikelihoodOf(design.y, eta),
        eta,
        predicted: eta.map(expitOf),
        singular: false,
    };
}
