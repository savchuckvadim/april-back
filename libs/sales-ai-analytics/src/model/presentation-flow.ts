/**
 * Прогноз продаж месяца «от презентаций» (метод `presentations-v2`, задача
 * 17.11.2026 `2026-11-17-forecast-fix-design.md`).
 *
 * Ожидание продаж месяца m — свёртка отмеченных презентаций со сдвигом:
 * `E[S_m] = q·Σ_{k=0..K} w_k·P_{m−k}`, ядро `w_k ∝ ρ^k` нормировано на
 * отрезке 0…K. Внутри месяца продажи считаются равномерными, поэтому на
 * остаток месяца приходится доля `r = D_rem/D_total`:
 * - от проведённых презентаций `backlog = q·[Σ_{k≥1} w_k·P_{m−k} + w_0·P_done]·r`;
 * - от новых `fresh = q·w_0·(â·D_rem)·r` — поздняя презентация реже
 *   успевает дать продажу в этом же месяце, отсюда квадрат по `D_rem`.
 *
 * Открытые сделки в сумму не входят: их будущие продажи — это и есть
 * продажи от прошлых презентаций, иначе был бы двойной счёт.
 *
 * Подбор `q` и `ρ` по истории портала — `presentation-flow.fit.ts`.
 * Чистая математика: без DI, Bitrix, Prisma, `Date.now`/`Math.random`.
 */
import { registryDefault } from '../params/registry.access';
import { shrinkRate } from './shrink';
import type {
    FlowExpected,
    FlowExpectedInput,
    FlowSeries,
    FlowTotals,
    PresentationFlowFit,
    PresentationFlowParams,
} from './presentation-flow.types';

export * from './presentation-flow.types';

/** Дефолты подбора — из реестра, не литералами. */
export const PRESENTATION_FLOW_DEFAULTS: PresentationFlowParams = {
    maxLag: registryDefault('forecast_lag_max_months'),
    windowMonths: registryDefault('forecast_flow_window_months'),
    rhoDefault: registryDefault('forecast_lag_rho_default'),
    forgetLambda: registryDefault('forget_lambda'),
    minFitMonths: registryDefault('forecast_flow_fit_min_months'),
    minPresentations: registryDefault('forecast_flow_min_presentations'),
    qMax: registryDefault('forecast_q_max'),
};

/** Сила усадки доли менеджера (`forecast_q_kappa`). */
export const PRESENTATION_FLOW_Q_KAPPA = registryDefault('forecast_q_kappa');

/** Наибольшее ρ ядра: при ρ → 1 сдвиг вырождается в «всё равно когда». */
const RHO_MAX = 0.95;

const finite = (value: number | undefined, fallback = 0): number =>
    typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const nonNegative = (value: number | undefined): number =>
    Math.max(0, finite(value));

const clamp = (value: number, min: number, max: number): number =>
    Math.min(max, Math.max(min, value));

/**
 * Ядро сдвига `w_0…w_K`: `w_k ∝ ρ^k`, сумма — единица. При ρ = 0 вся
 * продажа приходит в месяц презентации.
 */
export function lagKernel(rho: number, maxLag: number): number[] {
    const lags = Math.max(0, Math.floor(finite(maxLag)));
    const base = clamp(finite(rho), 0, RHO_MAX);
    const raw = Array.from({ length: lags + 1 }, (_, lag) =>
        lag === 0 ? 1 : Math.pow(base, lag),
    );
    const total = raw.reduce((sum, value) => sum + value, 0);

    return raw.map(value => value / total);
}

/**
 * `Σ_k w_k·P_{i−k}` — презентации со сдвигом для месяца `index`; месяцы
 * раньше начала ряда — нули.
 */
export function laggedValue(
    series: readonly number[],
    index: number,
    kernel: readonly number[],
): number {
    let total = 0;
    kernel.forEach((weight, lag) => {
        const position = index - lag;
        if (position >= 0) {
            total += weight * nonNegative(series[position]);
        }
    });

    return total;
}

/**
 * Продажи и экспозиция ряда с весами подбора: тот же отбор месяцев и та же
 * экспозиция (со сдвигом или без), что у доли портала. Нужны доле
 * менеджера — иначе её не с чем было бы сравнить.
 */
export function flowTotals(
    series: FlowSeries,
    fit: Pick<PresentationFlowFit, 'weights' | 'kernel' | 'exposure'>,
): FlowTotals {
    let sales = 0;
    let exposure = 0;
    fit.weights.forEach((weight, index) => {
        if (!(weight > 0)) return;
        sales += weight * nonNegative(series.sales[index]);
        exposure +=
            weight *
            (fit.exposure === 'lagged'
                ? laggedValue(series.presentations, index, fit.kernel)
                : nonNegative(series.presentations[index]));
    });

    return { sales, exposure };
}

/** Вход доли менеджера: его суммы и доля портала. */
export interface ManagerShareInput {
    readonly totals: FlowTotals;
    /** q портала. */
    readonly portalQ: number;
    /** κ_q — псевдопрезентации усадки. */
    readonly kappa?: number;
}

/** Доля менеджера `q_i = (S_i + κ·q)/(X_i + κ)` и вес своих данных. */
export function managerSalesPerPresentation(input: ManagerShareInput): {
    value: number;
    w: number;
} {
    const shrunk = shrinkRate({
        successes: nonNegative(input.totals.sales),
        exposure: nonNegative(input.totals.exposure),
        prior: {
            mu: nonNegative(input.portalQ),
            kappa: nonNegative(input.kappa ?? PRESENTATION_FLOW_Q_KAPPA),
        },
    });

    return { value: Math.max(0, shrunk.value), w: shrunk.w };
}

/**
 * Ожидание продаж остатка месяца от презентаций: от проведённых
 * (`backlog`) и от новых (`fresh`). При `D_rem = 0` обе части нулевые.
 */
export function presentationFlowExpected(
    input: FlowExpectedInput,
): FlowExpected {
    const total = nonNegative(input.daysTotal);
    const remaining = clamp(nonNegative(input.daysRemaining), 0, total);
    const share = total > 0 ? remaining / total : 0;
    const q = nonNegative(input.q);
    const sameMonth = nonNegative(input.kernel[0]);
    const pastEffective = input.kernel.reduce(
        (sum, weight, lag) =>
            lag === 0
                ? sum
                : sum +
                  nonNegative(weight) *
                      nonNegative(input.pastPresentations[lag - 1]),
        0,
    );
    const backlog =
        q *
        (pastEffective + sameMonth * nonNegative(input.presentationsDone)) *
        share;
    const fresh =
        q *
        sameMonth *
        nonNegative(input.presentationsRate) *
        remaining *
        share;

    return { backlog, fresh, remainingShare: share, pastEffective };
}

/**
 * Запасной расчёт менеджера, который презентации не отмечает: средние
 * продажи месяца на долю оставшихся дней.
 */
export function salesPaceRemainder(
    monthlySales: number | null,
    daysTotal: number,
    daysRemaining: number,
): number {
    const total = nonNegative(daysTotal);
    if (monthlySales === null || total <= 0) return 0;

    return (
        nonNegative(monthlySales) *
        (clamp(nonNegative(daysRemaining), 0, total) / total)
    );
}
