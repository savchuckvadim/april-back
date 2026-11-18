/**
 * Подбор доли продаж на презентацию `q` и сдвига `ρ` по истории портала
 * (метод `presentations-v2`, задача 17.11.2026).
 *
 * 1. Вход: уникальные презентации, если за три последних месяца их не
 *    меньше порога, иначе все; меньше порога и их — портал презентации не
 *    отмечает (`not-applicable`). Выбор один на всё окно истории.
 * 2. Месяцы окна W с полной историей презентаций за K месяцев до них.
 *    Для каждого ρ сетки: `X_m = Σ_k w_k·P_{m−k}`, `q̂ = Σ a·S / Σ a·X`
 *    (оценка Пуассона, вес месяца `a = λ^возраст`), взвешенный девианс.
 * 3. Подобранное ρ берётся, только если оно лучше ρ₀ по отношению
 *    правдоподобия (`≥ 3,84`, χ² с одной степенью свободы на 95 %): при
 *    ровном ряде презентаций сдвиг не различим, честнее взять ρ₀.
 * 4. Мало месяцев или продаж — ρ₀ и `q = Σ a·S / Σ a·P` (в устойчивом ряде
 *    отношение сумм от сдвига не зависит).
 * 5. `q` выше `forecast_q_max` — презентации отмечены не полностью.
 *
 * Шаги подбора — `presentation-flow.estimate.ts`.
 * Чистая математика: без DI, Bitrix, Prisma, `Date.now`/`Math.random`.
 */
import { lagKernel, PRESENTATION_FLOW_DEFAULTS } from './presentation-flow';
import {
    laggedFit,
    PRESENTATION_FLOW_PROCEDURE,
    ratioFit,
    sumOf,
    type FlowFitSeries,
} from './presentation-flow.estimate';
import type {
    AiForecastEntry,
    FlowMonth,
    PresentationFlowFit,
    PresentationFlowParams,
    PresentationFlowReason,
} from './presentation-flow.types';

export { PRESENTATION_FLOW_PROCEDURE } from './presentation-flow.estimate';

/** Значение выбранного счётчика презентаций месяца. */
export const presentationsOf = (
    month: Pick<FlowMonth, 'presentationsUniq' | 'presentations'>,
    entry: AiForecastEntry,
): number =>
    Math.max(
        0,
        entry === 'presentation-uniq'
            ? month.presentationsUniq
            : month.presentations,
    );

/** Счётчик входа и отмечает ли портал презентации вообще. */
export function flowEntryOf(
    months: readonly FlowMonth[],
    minPresentations: number,
): { entry: AiForecastEntry; marked: boolean } {
    const recent = months
        .slice(-PRESENTATION_FLOW_PROCEDURE.entryMonths)
        .filter(month => month.known);
    const total = (entry: AiForecastEntry): number =>
        sumOf(recent.map(month => presentationsOf(month, entry)));
    if (total('presentation-uniq') >= minPresentations) {
        return { entry: 'presentation-uniq', marked: true };
    }
    if (total('presentation') >= minPresentations) {
        return { entry: 'presentation', marked: true };
    }

    return { entry: 'presentation-uniq', marked: false };
}

/** Параметры с подстановкой дефолтов вместо нечисел. */
export function presentationFlowParamsOf(
    params: Partial<PresentationFlowParams>,
): PresentationFlowParams {
    const pick = (key: keyof PresentationFlowParams): number => {
        const value = params[key];
        return typeof value === 'number' && Number.isFinite(value)
            ? value
            : PRESENTATION_FLOW_DEFAULTS[key];
    };

    return {
        maxLag: Math.max(0, Math.floor(pick('maxLag'))),
        windowMonths: Math.max(1, Math.floor(pick('windowMonths'))),
        rhoDefault: pick('rhoDefault'),
        forgetLambda: pick('forgetLambda'),
        minFitMonths: Math.max(1, pick('minFitMonths')),
        minPresentations: Math.max(0, pick('minPresentations')),
        qMax: pick('qMax'),
    };
}

/**
 * Подбор доли продаж на презентацию и сдвига по месяцам отдела `months`
 * (по возрастанию, подряд, только месяцы раньше месяца прогноза).
 */
export function fitPresentationFlow(
    months: readonly FlowMonth[],
    overrides: Partial<PresentationFlowParams> = {},
): PresentationFlowFit {
    const params = presentationFlowParamsOf(overrides);
    const { entry, marked } = flowEntryOf(months, params.minPresentations);
    const series: FlowFitSeries = {
        presentations: months.map(month =>
            month.known ? presentationsOf(month, entry) : 0,
        ),
        sales: months.map(month =>
            month.known ? Math.max(0, month.sales) : 0,
        ),
        ages: months.map((_, index) => months.length - 1 - index),
    };
    const notApplicable = (
        reason: PresentationFlowReason,
        q = 0,
    ): PresentationFlowFit => ({
        status: 'not-applicable',
        reason,
        entry,
        q,
        rho: params.rhoDefault,
        kernel: lagKernel(params.rhoDefault, params.maxLag),
        exposure: 'ratio',
        weights: months.map(() => 0),
        fitMonths: 0,
        sales: sumOf(series.sales),
        presentations: sumOf(series.presentations),
        deviance: null,
    });
    if (!marked) return notApplicable('presentations-not-marked');
    const withPresentations = series.presentations.filter(
        value => value > 0,
    ).length;
    if (
        withPresentations <
        PRESENTATION_FLOW_PROCEDURE.minMonthsWithPresentations
    ) {
        return notApplicable('history-short');
    }
    const fit =
        laggedFit(months, series, params, entry) ??
        ratioFit(months, series, params, entry);
    if (fit === null) return notApplicable('history-short');

    return fit.q > params.qMax
        ? notApplicable('sales-exceed-presentations', fit.q)
        : fit;
}
