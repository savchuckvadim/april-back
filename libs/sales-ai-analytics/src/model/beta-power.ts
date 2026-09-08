/**
 * Мощность оценки β «качество → исход» и гейт её публикации
 * (план §4.4 «мощность и гейт», решение А.3 — счётчик с первого дня).
 *
 * Ориентир аналитической формулы:
 * `SE ≈ 1/√(n·p̄(1−p̄)·Var(S^form)·r·d_eff)`, где `p̄ ≈ 0,4` — доля ближнего
 * исхода, `σ_S ≈ 1,5` — разброс оценки формы, `r ≈ 0,7` — надёжность
 * предиктора, `d_eff ≈ 0,8` — поправка на кластеризацию по менеджерам.
 *
 * Гейт (`beta_gate`, v3): `SE(β̂_pooled) ≤ 0,07` **и** 90 %-интервал
 * наклона калибровки накрывает 1, причём оба условия выполнены **два
 * месячных пересчёта подряд** (гистерезис). Поэтому счётчик «до оценки β»
 * добавляет к объёму для целевого SE ещё `gateMonths − 1` месяц удержания.
 */
export const BETA_POWER_DEFAULTS = {
    /** Доля ближнего исхода p̄. */
    pBar: 0.4,
    /** Разброс оценки формы σ_S по шкале 1–10. */
    sdScore: 1.5,
    /** Надёжность предиктора r (`icc_form`, до измерения — ориентир). */
    reliability: 0.7,
    /** Поправка на кластеризацию d_eff. */
    designEffect: 0.8,
    /** `beta_gate_se` — целевая точность оценки. */
    seTarget: 0.07,
    /** Месяцев подряд, которые гейт должен держаться. */
    gateMonths: 2,
} as const;

/** Параметры дизайна, входящие в формулу мощности. */
export interface BetaPowerDesign {
    readonly pBar?: number;
    readonly sdScore?: number;
    readonly reliability?: number;
    readonly designEffect?: number;
}

/** Вход расчёта стандартной ошибки β. */
export interface BetaStandardErrorInput extends BetaPowerDesign {
    /** Число звонков-триггеров (подтверждённых презентаций). */
    readonly n: number;
}

/** Счётчик «до оценки β» для витрины РОПа. */
export interface BetaGateCountdown {
    /** SE при накопленном объёме; null — объёма ещё нет. */
    readonly seNow: number | null;
    /** Сколько презентаций осталось до возможного прохождения гейта. */
    readonly presentationsLeft: number;
    /** Сколько месяцев при текущем темпе; null — темп не задан. */
    readonly monthsLeft: number | null;
    /** Объём, при котором SE достигает целевого (без удержания). */
    readonly presentationsForSe: number;
    /** Месяцев удержания, добавленных гистерезисом гейта. */
    readonly holdMonths: number;
}

/** Вход проверки гейта. */
export interface BetaGateInput {
    /** SE(β̂_pooled) последнего пересчёта. */
    readonly se: number | null;
    /** 90 %-интервал наклона калибровки. */
    readonly calibrationSlopeCi90: readonly [number, number] | null;
    /** Сколько месячных пересчётов подряд условия выполнены. */
    readonly consecutiveMonths: number;
    readonly seTarget?: number;
    readonly gateMonths?: number;
}

const positive = (value: number | undefined, fallback: number): number =>
    typeof value === 'number' && Number.isFinite(value) && value > 0
        ? value
        : fallback;

/** Информационный множитель `p̄(1−p̄)·Var(S)·r·d_eff` на одно наблюдение. */
function informationPerCall(design: BetaPowerDesign): number {
    const pBar = Math.min(
        0.999,
        Math.max(0.001, positive(design.pBar, BETA_POWER_DEFAULTS.pBar)),
    );
    const sd = positive(design.sdScore, BETA_POWER_DEFAULTS.sdScore);
    const reliability = Math.min(
        1,
        positive(design.reliability, BETA_POWER_DEFAULTS.reliability),
    );
    const dEff = positive(
        design.designEffect,
        BETA_POWER_DEFAULTS.designEffect,
    );

    return pBar * (1 - pBar) * sd * sd * reliability * dEff;
}

/**
 * `SE(β̂) ≈ 1/√(n·p̄(1−p̄)·Var(S^form)·r·d_eff)`. При `n ≤ 0` оценки нет —
 * возвращается `Infinity` (счётчик показывает это как `seNow: null`).
 */
export function betaStandardError(input: BetaStandardErrorInput): number {
    const n = Number.isFinite(input.n) ? Math.max(0, input.n) : 0;
    const information = n * informationPerCall(input);
    if (information <= 0) {
        return Number.POSITIVE_INFINITY;
    }

    return 1 / Math.sqrt(information);
}

/** Объём, при котором SE достигает целевого значения. */
export function presentationsForSe(
    seTarget: number = BETA_POWER_DEFAULTS.seTarget,
    design: BetaPowerDesign = {},
): number {
    const target = positive(seTarget, BETA_POWER_DEFAULTS.seTarget);
    const information = informationPerCall(design);
    if (information <= 0) {
        return Number.POSITIVE_INFINITY;
    }

    return Math.ceil(1 / (target * target * information));
}

/**
 * Счётчик «до оценки β ≈ N презентаций / M месяцев» (А.3 — показывается
 * с первого дня). При 50 подтверждённых презентациях в месяц и нуле
 * накопленных до `SE = 0,07` остаётся ≈ 700–900 презентаций и 14–18
 * месяцев: объём для целевого SE плюс месяц удержания гейта.
 */
export function betaGateCountdown(input: {
    readonly presentations: number;
    readonly presentationsPerMonth: number;
    readonly seTarget?: number;
    readonly gateMonths?: number;
    readonly design?: BetaPowerDesign;
}): BetaGateCountdown {
    const design = input.design ?? {};
    const done = Number.isFinite(input.presentations)
        ? Math.max(0, input.presentations)
        : 0;
    const perMonth = Math.max(0, input.presentationsPerMonth);
    const forSe = presentationsForSe(
        input.seTarget ?? BETA_POWER_DEFAULTS.seTarget,
        design,
    );
    const holdMonths = Math.max(
        0,
        (input.gateMonths ?? BETA_POWER_DEFAULTS.gateMonths) - 1,
    );
    const required = forSe + holdMonths * perMonth;
    const left = Math.max(0, Math.ceil(required - done));
    const se = betaStandardError({ ...design, n: done });

    return {
        seNow: Number.isFinite(se) ? se : null,
        presentationsLeft: left,
        monthsLeft: perMonth > 0 ? Math.ceil(left / perMonth) : null,
        presentationsForSe: forSe,
        holdMonths,
    };
}

/**
 * Гейт `beta_gate`: `SE ≤ beta_gate_se` **и** 90 %-интервал наклона
 * калибровки накрывает 1 **и** оба условия держатся два месяца подряд.
 */
export function betaGatePassed(input: BetaGateInput): boolean {
    const target = positive(input.seTarget, BETA_POWER_DEFAULTS.seTarget);
    const months = input.gateMonths ?? BETA_POWER_DEFAULTS.gateMonths;
    const ci = input.calibrationSlopeCi90;
    if (input.se === null || !Number.isFinite(input.se) || input.se > target) {
        return false;
    }
    if (!ci || ci[0] > 1 || ci[1] < 1) {
        return false;
    }

    return input.consecutiveMonths >= months;
}
