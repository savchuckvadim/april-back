import { EDGE_GAP_PRACTICAL } from './edge-rate';
import type {
    FunnelEdgeInput,
    FunnelGapInput,
    FunnelGapResult,
    FunnelLeak,
    FunnelLeakReason,
} from './funnel-gap.types';
import { mulberry32, sampleBeta } from './prng';
import { probabilityOnCurve } from './quality-curve';
import { AI_ANALYTICS_THRESHOLDS } from './thresholds.const';

export * from './funnel-gap.types';

/**
 * Разложение разрыва по рёбрам воронки (план §4.5).
 *
 * `ΔS_k = (μ_k − E[θ_mk])·N_k·Π_{ниже} θ` — вклад ребра в недобор продаж;
 * вклады суммируются в `E[ΔS]` из апостериоров (2000 сэмплов,
 * `mulberry32(seed)`, `seed = fnv1a(domain|managerId|date|calcVersion)`).
 * Компонента «качество» `N_k·(p̂(S_ref) − p̂(Ŝ_m))·Π θ` добавляется
 * **только при `betaSource: data`** — в режимах `none` и `hypothesis`
 * её в разложении нет.
 *
 * Ниже порога честности (`n < n_min_none`) вклад ребра не показывается;
 * утечка по первому ребру не ставится «закрывателю» — менеджеру, у
 * которого исходы пути не ниже нормы.
 */
export const FUNNEL_GAP_DEFAULTS = {
    /** Сэмплов апостериора на ребро. */
    samples: 2000,
    /** Перемешиваний перестановочного теста. */
    iterations: 200,
    /** Сэмплов на одно перемешивание (скорость против точности). */
    permutationSamples: 500,
    /** `n_min_none` — ниже знаменателя чисел наружу нет. */
    minN: AI_ANALYTICS_THRESHOLDS.scoreNone,
    /** Практический порог разрыва доли `delta_prac_pct` (в доле). */
    practicalDelta: EDGE_GAP_PRACTICAL.prob,
    /** Квантили 90 %-интервала вклада. */
    lowQuantile: 0.05,
    highQuantile: 0.95,
} as const;

interface LeakSeries {
    readonly pathCode: string;
    readonly edgeCode: string;
    readonly component: 'edge' | 'quality';
    readonly values: number[];
    readonly n: number;
    readonly delta: number;
    readonly first: boolean;
}

interface PlanRow {
    readonly series: LeakSeries;
    readonly position: number;
    readonly volume: number;
}

interface PathPlan {
    readonly share: number;
    readonly codes: readonly string[];
    readonly rows: readonly PlanRow[];
}

const mean = (values: readonly number[]): number =>
    values.length === 0
        ? 0
        : values.reduce((sum, value) => sum + value, 0) / values.length;

function quantile(sorted: readonly number[], q: number): number {
    if (sorted.length === 0) {
        return 0;
    }
    const position = Math.min(
        sorted.length - 1,
        Math.max(0, Math.round(q * (sorted.length - 1))),
    );

    return sorted[position];
}

/** Апостериор ребра Beta(s + κμ, (n − s) + κ(1 − μ)) одним сэмплом. */
function sampleEdgeTheta(edge: FunnelEdgeInput, random: () => number): number {
    const mu = Math.min(1, Math.max(0, edge.prior.mu));
    const kappa = Math.max(0, edge.prior.kappa);
    const alpha = Math.max(0, edge.successes) + kappa * mu;
    const beta = Math.max(0, edge.exposure - edge.successes) + kappa * (1 - mu);
    if (alpha <= 0 || beta <= 0) {
        return mu;
    }

    return sampleBeta(alpha, beta, random);
}

/** Апостериорное среднее ребра `E[θ_mk]` — точечная оценка разрыва. */
function posteriorMean(edge: FunnelEdgeInput): number {
    const mu = Math.min(1, Math.max(0, edge.prior.mu));
    const kappa = Math.max(0, edge.prior.kappa);
    const denominator = Math.max(0, edge.exposure) + kappa;

    return denominator > 0
        ? (Math.max(0, edge.successes) + kappa * mu) / denominator
        : mu;
}

/** Разница вероятностей `p̂(S_ref) − p̂(Ŝ_m)` компоненты «качество». */
function qualityGap(input: FunnelGapInput): number | null {
    const link = input.qualityLink;
    if (
        !link ||
        link.betaSource !== 'data' ||
        !link.applied ||
        link.curve.length === 0 ||
        !input.quality
    ) {
        return null;
    }
    const own = probabilityOnCurve(link.curve, input.quality.score);

    return own === null || link.pRef === null ? null : link.pRef - own;
}

/** Ряды вкладов и план обхода путей (порядок рёбер задаёт Π_{ниже}). */
function buildPlans(
    input: FunnelGapInput,
    byCode: ReadonlyMap<string, FunnelEdgeInput>,
    withQuality: boolean,
): { plans: PathPlan[]; series: LeakSeries[] } {
    const series: LeakSeries[] = [];
    const plans: PathPlan[] = [];
    for (const path of input.paths) {
        const codes = path.edges.filter(code => byCode.has(code));
        const rows: PlanRow[] = [];
        codes.forEach((code, position) => {
            const edge = byCode.get(code) as FunnelEdgeInput;
            const row: LeakSeries = {
                pathCode: path.code,
                edgeCode: code,
                component: 'edge',
                values: [],
                n: edge.exposure,
                delta: edge.prior.mu - posteriorMean(edge),
                first: position === 0,
            };
            series.push(row);
            rows.push({ series: row, position, volume: edge.volume });
            if (!withQuality || input.quality?.edgeCode !== code) {
                return;
            }
            const qualityRow: LeakSeries = {
                ...row,
                component: 'quality',
                values: [],
                delta: 0,
                first: false,
            };
            series.push(qualityRow);
            rows.push({ series: qualityRow, position, volume: edge.volume });
        });
        plans.push({ share: path.share ?? 1, codes, rows });
    }

    return { plans, series };
}

/** Один сэмпл: θ по всем рёбрам, затем вклады рёбер каждого пути. */
function accumulateSample(
    input: FunnelGapInput,
    byCode: ReadonlyMap<string, FunnelEdgeInput>,
    plans: readonly PathPlan[],
    random: () => number,
    qGap: number,
): void {
    const thetas = new Map<string, number>();
    for (const edge of input.edges) {
        thetas.set(edge.code, sampleEdgeTheta(edge, random));
    }
    for (const plan of plans) {
        const values = plan.codes.map(code => thetas.get(code) ?? 0);
        const downstream = values.map(() => 1);
        for (let index = values.length - 2; index >= 0; index -= 1) {
            downstream[index] = downstream[index + 1] * values[index + 1];
        }
        for (const row of plan.rows) {
            const edge = byCode.get(row.series.edgeCode) as FunnelEdgeInput;
            const gap =
                row.series.component === 'quality'
                    ? qGap
                    : edge.prior.mu - values[row.position];
            row.series.values.push(
                gap * row.volume * downstream[row.position] * plan.share,
            );
        }
    }
}

function leakReason(
    hidden: boolean,
    closerShape: boolean,
    belowPractical: boolean,
): FunnelLeakReason | null {
    if (hidden) {
        return 'low-n';
    }
    if (closerShape) {
        return 'outcomes-at-norm';
    }

    return belowPractical ? 'below-practical' : null;
}

function toLeak(
    row: LeakSeries,
    expected: number,
    sorted: readonly number[],
    gates: { minN: number; practical: number; pathExpected: number },
): FunnelLeak {
    const ci90: readonly [number, number] = [
        quantile(sorted, FUNNEL_GAP_DEFAULTS.lowQuantile),
        quantile(sorted, FUNNEL_GAP_DEFAULTS.highQuantile),
    ];
    const hidden = row.component === 'edge' && row.n < gates.minN;
    const closerShape = row.first && gates.pathExpected <= 0;
    const belowPractical =
        row.component === 'edge' && Math.abs(row.delta) < gates.practical;

    return {
        pathCode: row.pathCode,
        edgeCode: row.edgeCode,
        component: row.component,
        expected: hidden ? null : expected,
        ci90: hidden ? null : ci90,
        n: row.n,
        delta: row.delta,
        hidden,
        leak:
            !hidden &&
            !closerShape &&
            !belowPractical &&
            ci90[0] > 0 &&
            expected > 0,
        reason: leakReason(hidden, closerShape, belowPractical),
    };
}

/**
 * Разложение разрыва по рёбрам с апостериорами и фиксированным seed'ом:
 * два запуска с одним seed дают одинаковые `E[ΔS]`, а сумма вкладов
 * рёбер равна `E[ΔS]` пути по построению.
 */
export function decomposeFunnelGap(input: FunnelGapInput): FunnelGapResult {
    const samples = Math.max(1, input.samples ?? FUNNEL_GAP_DEFAULTS.samples);
    const gates = {
        minN: input.minN ?? FUNNEL_GAP_DEFAULTS.minN,
        practical: input.practicalDelta ?? FUNNEL_GAP_DEFAULTS.practicalDelta,
        pathExpected: 0,
    };
    const byCode = new Map(input.edges.map(edge => [edge.code, edge] as const));
    const qGap = qualityGap(input);
    const { plans, series } = buildPlans(input, byCode, qGap !== null);
    const random = mulberry32(input.seed);
    for (let sample = 0; sample < samples; sample += 1) {
        accumulateSample(input, byCode, plans, random, qGap ?? 0);
    }
    const pathExpected = new Map<string, number>();
    const rows = series.map(row => {
        const expected = mean(row.values);
        pathExpected.set(
            row.pathCode,
            (pathExpected.get(row.pathCode) ?? 0) + expected,
        );

        return { row, expected, sorted: [...row.values].sort((a, b) => a - b) };
    });

    return {
        leaks: rows.map(item =>
            toLeak(item.row, item.expected, item.sorted, {
                ...gates,
                pathExpected: pathExpected.get(item.row.pathCode) ?? 0,
            }),
        ),
        expectedGap: rows.reduce((sum, item) => sum + item.expected, 0),
        samples,
        seed: input.seed,
    };
}
