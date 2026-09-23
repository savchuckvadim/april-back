/**
 * Реконсиляция «план — факт» (план Фазы 3, поток П2 `p3-plan-fact`, §4.9).
 *
 * Что здесь считается по каждому показателю:
 * - `pace` — темп: факт, делённый на ту долю плана, которая должна быть
 *   сделана к этому дню по рабочим дням календаря портала
 *   (`workdaysElapsed / workdaysInMonth`). Ровно 1 — идём по плану;
 *   ниже — отстаём. При нулевых рабочих днях темп не определён (`null`),
 *   а не «ноль»: ноль означал бы «ничего не сделано».
 * - `forecastP50` — описательный прогноз закрытия месяца при текущем
 *   темпе: `факт + дневной темп × оставшиеся рабочие дни`, где дневной
 *   темп срезан потолком `plan_day_ceiling` от ровного плана дня.
 *   Потолок не даёт обещать закрытие месяца рывком, которого не бывает.
 * - `gap` — `план − прогноз`; отрицательный разрыв означает, что прогноз
 *   выше плана.
 * - `perDayNeeded` — «сколько надо в день» на оставшиеся рабочие дни.
 *
 * Источник плана — ТОЛЬКО снимок целей руководителя (решение владельца
 * В6 от 22.09.2026): денежного плана в реконсиляции нет.
 *
 * Чистая математика: без DI, Bitrix, Prisma, без `Date.now`/`Math.random`.
 * Все пороги — коды реестра (`registryDefault`), магических чисел нет.
 */
import { registryDefault } from '../params/registry.access';
import {
    PLAN_FACT_INDICATORS,
    PLAN_FACT_REASONS,
    type PlanFactExposure,
    type PlanFactIndicator,
    type PlanFactInput,
    type PlanFactReason,
    type PlanFactRow,
    type PlanFactStatus,
} from './plan-fact.types';

export * from './plan-fact.types';

/**
 * Полоса «идём по плану» вокруг единицы: практический порог разрыва для
 * долей (`delta_prac_pct`, проценты) переведён в долю темпа. Разрыв
 * меньше порога — не отставание и не опережение, а шум месяца.
 */
const PACE_BAND = registryDefault('delta_prac_pct') / 100;

/** Потолок дневного темпа в прогнозе — тот же множитель, что у плана дня. */
const DAY_CEILING = registryDefault('plan_day_ceiling');

const finite = (value: number | null | undefined): number | null =>
    typeof value === 'number' && Number.isFinite(value) ? value : null;

/** Неотрицательное конечное число либо null. */
const nonNegative = (value: number | null | undefined): number | null => {
    const number = finite(value);

    return number === null ? null : Math.max(0, number);
};

/**
 * Статус по темпу: внутри полосы `PACE_BAND` вокруг единицы — идём по
 * плану, ниже — отстаём, выше — опережаем. Темпа нет — плана нет.
 */
export function paceStatus(pace: number | null): PlanFactStatus {
    if (pace === null) return 'no-plan';
    if (pace < 1 - PACE_BAND) return 'behind';
    if (pace > 1 + PACE_BAND) return 'ahead';

    return 'on-track';
}

/** Ожидаемая к этому дню доля месяца по рабочим дням; null — дней нет. */
export function expectedShare(exposure: PlanFactExposure): number | null {
    const total = nonNegative(exposure.workdaysInMonth);
    if (total === null || total <= 0) return null;
    const elapsed = Math.min(total, nonNegative(exposure.workdaysElapsed) ?? 0);

    return elapsed / total;
}

/** Рабочих дней до конца месяца (прошедшие уже включают сегодня). */
export function workdaysLeft(exposure: PlanFactExposure): number {
    const total = nonNegative(exposure.workdaysInMonth) ?? 0;
    const elapsed = Math.min(total, nonNegative(exposure.workdaysElapsed) ?? 0);

    return Math.max(0, total - elapsed);
}

/** Потолок дневного темпа: `plan_day_ceiling × план / рабочие дни`. */
function dailyCeilingOf(
    plan: number,
    exposure: PlanFactExposure,
): number | null {
    const total = nonNegative(exposure.workdaysInMonth);
    if (total === null || total <= 0) return null;
    const multiplier =
        exposure.dayCeiling === null
            ? null
            : (finite(exposure.dayCeiling) ?? DAY_CEILING);

    return multiplier === null ? null : (multiplier * plan) / total;
}

/**
 * Прогноз закрытия месяца при текущем темпе, срезанный потолком дня.
 * Без плана потолка нет — прогноз идёт по чистому темпу факта.
 */
export function forecastAtPace(
    plan: number | null,
    fact: number,
    exposure: PlanFactExposure,
): number | null {
    const elapsed = nonNegative(exposure.workdaysElapsed) ?? 0;
    const left = workdaysLeft(exposure);
    if (elapsed <= 0) return left > 0 ? null : fact;
    const rate = fact / elapsed;
    const ceiling = plan === null ? null : dailyCeilingOf(plan, exposure);
    const capped = ceiling === null ? rate : Math.min(rate, ceiling);

    return fact + capped * left;
}

/** «Сколько надо в день», чтобы закрыть план; null — дней не осталось. */
export function perDayNeeded(
    plan: number,
    fact: number,
    exposure: PlanFactExposure,
): number | null {
    const left = workdaysLeft(exposure);

    return left <= 0 ? null : Math.max(0, plan - fact) / left;
}

/** Причины строки без повторов и в порядке появления. */
function withReason(
    reasons: PlanFactReason[],
    reason: PlanFactReason,
): PlanFactReason[] {
    return reasons.includes(reason) ? reasons : [...reasons, reason];
}

/**
 * Строка без чисел: план не задан или факта нет. Статус `no-plan` для
 * отсутствующей цели — это не «ноль плана», а «цели не было».
 */
function emptyRow(
    indicator: PlanFactIndicator,
    plan: number | null,
    fact: number | null,
    reasons: readonly PlanFactReason[],
): PlanFactRow {
    return {
        indicator,
        plan,
        fact,
        pace: null,
        forecastP50: null,
        gap: null,
        perDayNeeded: null,
        status: 'no-plan',
        reasons: [...reasons],
    };
}

/** Сверка одного показателя: план × факт × экспозиция → строка витрины. */
export function reconcileIndicator(
    indicator: PlanFactIndicator,
    plan: number | null,
    fact: number | null,
    exposure: PlanFactExposure,
): PlanFactRow {
    const planValue = nonNegative(plan);
    const factValue = nonNegative(fact);
    let reasons: PlanFactReason[] = [];
    if (factValue === null) {
        reasons = withReason(reasons, PLAN_FACT_REASONS.factMissing);
    }
    if (planValue === null) {
        reasons = withReason(reasons, PLAN_FACT_REASONS.planMissing);
    } else if (planValue <= 0) {
        reasons = withReason(reasons, PLAN_FACT_REASONS.targetEmpty);
    }
    if (planValue === null || planValue <= 0 || factValue === null) {
        return emptyRow(indicator, planValue, factValue, reasons);
    }
    const share = expectedShare(exposure);
    if (share === null) {
        reasons = withReason(reasons, PLAN_FACT_REASONS.noWorkdays);
    }
    const pace =
        share === null || share <= 0 ? null : factValue / (planValue * share);
    const forecast = forecastAtPace(planValue, factValue, exposure);
    const needed = perDayNeeded(planValue, factValue, exposure);
    if (needed === null) {
        reasons = withReason(reasons, PLAN_FACT_REASONS.noDaysLeft);
    }
    const dailyOff = exposure.dailyPlanEnabled === false;
    if (dailyOff) {
        reasons = withReason(reasons, PLAN_FACT_REASONS.dailyPlanDisabled);
    }

    return {
        indicator,
        plan: planValue,
        fact: factValue,
        pace,
        forecastP50: forecast,
        gap: forecast === null ? null : planValue - forecast,
        perDayNeeded: dailyOff ? null : needed,
        status: paceStatus(pace),
        reasons,
    };
}

/**
 * Реконсиляция всех показателей одного менеджера (или отдела целиком):
 * строки идут в порядке `PLAN_FACT_INDICATORS` — порядок витрины
 * фиксирован справочником, а не порядком ключей входного объекта.
 */
export function reconcile(input: PlanFactInput): PlanFactRow[] {
    return PLAN_FACT_INDICATORS.map(indicator =>
        reconcileIndicator(
            indicator,
            input.plan[indicator] ?? null,
            input.fact[indicator] ?? null,
            input.exposure,
        ),
    );
}

/**
 * Свод отдела: планы и факты складываются по показателям, экспозиция
 * общая (календарь портала один). Строка без плана хотя бы у одного
 * менеджера не обнуляет свод — складываются заданные цели.
 */
export function reconcileTeam(
    inputs: readonly PlanFactInput[],
    exposure: PlanFactExposure,
): PlanFactRow[] {
    return PLAN_FACT_INDICATORS.map(indicator => {
        const plan = sumOf(inputs.map(item => item.plan[indicator] ?? null));
        const fact = sumOf(inputs.map(item => item.fact[indicator] ?? null));

        return reconcileIndicator(indicator, plan, fact, exposure);
    });
}

/** Сумма заданных значений; ни одного заданного — null, а не ноль. */
function sumOf(values: readonly (number | null)[]): number | null {
    const known = values
        .map(nonNegative)
        .filter((value): value is number => value !== null);

    return known.length === 0
        ? null
        : known.reduce((sum, value) => sum + value, 0);
}
