/**
 * Шаги подбора доли продаж на презентацию и сдвига (метод
 * `presentations-v2`): подбор со сдвигом по сетке ρ с проверкой отношения
 * правдоподобия и запасной расчёт отношением сумм. Вход — уже выбранный
 * счётчик презентаций (`presentation-flow.fit.ts`).
 *
 * Чистая математика: без DI, Bitrix, Prisma, `Date.now`/`Math.random`.
 */
import { lagKernel, laggedValue } from './presentation-flow';
import type {
    AiForecastEntry,
    FlowMonth,
    PresentationFlowFit,
    PresentationFlowParams,
} from './presentation-flow.types';

/** Константы процедуры подбора (не настройки портала). */
export const PRESENTATION_FLOW_PROCEDURE = {
    /** Сетка ρ: 0; 0,05; … 0,9. */
    rhoGrid: Array.from({ length: 19 }, (_, index) => index / 20),
    /** Порог отношения правдоподобия: χ²₁ на 95 %. */
    lrThreshold: 3.84,
    /** Продаж в месяцах подбора — меньше, сдвиг не подбирается. */
    minFitSales: 20,
    /** Месяцев с презентациями — меньше, прогноз от них не строится. */
    minMonthsWithPresentations: 3,
    /** Сколько последних месяцев смотрим, выбирая счётчик презентаций. */
    entryMonths: 3,
} as const;

/** Ряды подбора по месяцам: выбранный счётчик, продажи, возраст месяца. */
export interface FlowFitSeries {
    readonly presentations: readonly number[];
    readonly sales: readonly number[];
    /** Возраст месяца: 0 — последний месяц ряда. */
    readonly ages: readonly number[];
}

/** Кандидат подбора: ρ, доля и девианс. */
interface Candidate {
    readonly rho: number;
    readonly q: number;
    readonly deviance: number;
}

export const sumOf = (values: readonly number[]): number =>
    values.reduce((total, value) => total + value, 0);

/** Взвешенный девианс Пуассона `2·Σ a·[S·ln(S/μ) − (S − μ)]`. */
function devianceOf(
    sales: readonly number[],
    exposure: readonly number[],
    weights: readonly number[],
    q: number,
): number {
    let total = 0;
    weights.forEach((weight, index) => {
        if (!(weight > 0)) return;
        const mu = q * exposure[index];
        const observed = sales[index];
        if (mu <= 0) {
            total += observed > 0 ? Number.POSITIVE_INFINITY : 0;
            return;
        }
        total +=
            2 *
            weight *
            (observed > 0
                ? observed * Math.log(observed / mu) - (observed - mu)
                : mu);
    });

    return total;
}

/** Кандидат ρ: экспозиция со сдвигом, доля и девианс по месяцам подбора. */
function candidateOf(
    rho: number,
    series: FlowFitSeries,
    weights: readonly number[],
    maxLag: number,
): Candidate {
    const kernel = lagKernel(rho, maxLag);
    const exposure = weights.map((weight, index) =>
        weight > 0 ? laggedValue(series.presentations, index, kernel) : 0,
    );
    const weightedSales = sumOf(
        weights.map((weight, index) => weight * series.sales[index]),
    );
    const weightedExposure = sumOf(
        weights.map((weight, index) => weight * exposure[index]),
    );
    const q = weightedExposure > 0 ? weightedSales / weightedExposure : 0;

    return { rho, q, deviance: devianceOf(series.sales, exposure, weights, q) };
}

/** Индексы месяцев окна, у которых известны K месяцев истории до них. */
function fitIndexes(
    months: readonly FlowMonth[],
    windowMonths: number,
    maxLag: number,
): number[] {
    const start = Math.max(0, months.length - windowMonths);
    const indexes: number[] = [];
    for (let index = start; index < months.length; index += 1) {
        if (index - maxLag < 0) continue;
        const history = months.slice(index - maxLag, index + 1);
        if (history.every(month => month.known)) indexes.push(index);
    }

    return indexes;
}

/** Вес месяца λ^возраст; месяц не в выборке — 0. */
function weightsOf(
    indexes: readonly number[],
    series: FlowFitSeries,
    forgetLambda: number,
): number[] {
    const chosen = new Set(indexes);

    return series.ages.map((age, index) =>
        chosen.has(index) ? Math.pow(forgetLambda, age) : 0,
    );
}

/** Подбор со сдвигом; месяцев или продаж мало — null. */
export function laggedFit(
    months: readonly FlowMonth[],
    series: FlowFitSeries,
    params: PresentationFlowParams,
    entry: AiForecastEntry,
): PresentationFlowFit | null {
    const indexes = fitIndexes(months, params.windowMonths, params.maxLag);
    const sales = sumOf(indexes.map(index => series.sales[index]));
    if (
        indexes.length < params.minFitMonths ||
        sales < PRESENTATION_FLOW_PROCEDURE.minFitSales
    ) {
        return null;
    }
    const weights = weightsOf(indexes, series, params.forgetLambda);
    const fallback = candidateOf(
        params.rhoDefault,
        series,
        weights,
        params.maxLag,
    );
    const best = PRESENTATION_FLOW_PROCEDURE.rhoGrid
        .map(rho => candidateOf(rho, series, weights, params.maxLag))
        .reduce(
            (left, right) => (right.deviance < left.deviance ? right : left),
            fallback,
        );
    const identified =
        fallback.deviance - best.deviance >=
        PRESENTATION_FLOW_PROCEDURE.lrThreshold;
    const chosen = identified ? best : fallback;

    return {
        status: identified ? 'estimated' : 'default-lag',
        reason: identified ? null : 'lag-not-identified',
        entry,
        q: chosen.q,
        rho: chosen.rho,
        kernel: lagKernel(chosen.rho, params.maxLag),
        exposure: 'lagged',
        weights,
        fitMonths: indexes.length,
        sales,
        presentations: sumOf(indexes.map(index => series.presentations[index])),
        deviance: Number.isFinite(chosen.deviance) ? chosen.deviance : null,
    };
}

/** Отношение сумм без сдвига по известным месяцам окна; экспозиции нет — null. */
export function ratioFit(
    months: readonly FlowMonth[],
    series: FlowFitSeries,
    params: PresentationFlowParams,
    entry: AiForecastEntry,
): PresentationFlowFit | null {
    const start = Math.max(0, months.length - params.windowMonths);
    const indexes = months.flatMap((month, index) =>
        index >= start && month.known ? [index] : [],
    );
    const weights = weightsOf(indexes, series, params.forgetLambda);
    const exposure = sumOf(
        weights.map((weight, index) => weight * series.presentations[index]),
    );
    if (exposure <= 0) return null;
    const weightedSales = sumOf(
        weights.map((weight, index) => weight * series.sales[index]),
    );

    return {
        status: 'default-lag',
        reason: 'lag-history-short',
        entry,
        q: weightedSales / exposure,
        rho: params.rhoDefault,
        kernel: lagKernel(params.rhoDefault, params.maxLag),
        exposure: 'ratio',
        weights,
        fitMonths: indexes.length,
        sales: sumOf(indexes.map(index => series.sales[index])),
        presentations: sumOf(indexes.map(index => series.presentations[index])),
        deviance: null,
    };
}
