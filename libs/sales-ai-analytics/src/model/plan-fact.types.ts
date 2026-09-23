/**
 * Типы реконсиляции «план — факт» (план Фазы 3, поток П2 `p3-plan-fact`).
 * Вынесены из `model/plan-fact.ts`, чтобы файл модели держался в пределах
 * 300 строк (прецедент — `model/daily-plan.types.ts`).
 *
 * Источник плана — ТОЛЬКО снимок целей руководителя (снапшот `plan`,
 * решение владельца В6 от 22.09.2026): денежного плана в реконсиляции
 * нет, поэтому у показателей нет денежных единиц.
 */

/** Показатели реконсиляции: цели руководителя, которые есть в снимке. */
export const PLAN_FACT_INDICATORS = [
    'sales',
    'calls',
    'presentations',
] as const;

/** Код показателя реконсиляции. */
export type PlanFactIndicator = (typeof PLAN_FACT_INDICATORS)[number];

/**
 * Итог сверки одного показателя. `no-plan` — цели нет (план не задан или
 * равен нулю): в этом случае числа темпа, прогноза и разрыва отсутствуют
 * по построению, а не «не посчитались».
 */
export const PLAN_FACT_STATUSES = [
    'on-track',
    'behind',
    'ahead',
    'no-plan',
] as const;

/** Статус строки реконсиляции. */
export type PlanFactStatus = (typeof PLAN_FACT_STATUSES)[number];

/**
 * Почему в строке нет числа (штатная деградация, §5.4): цель не задана,
 * рабочих дней месяца нет, факт месяца не рассчитан, план дня выключен
 * настройкой портала.
 */
export const PLAN_FACT_REASONS = {
    /** Снимка `plan` за месяц нет или в нём нет этого менеджера. */
    planMissing: 'plan-missing',
    /** Цель показателя не задана или равна нулю. */
    targetEmpty: 'target-empty',
    /** Факт месяца не рассчитан: снапшота `manager-month` нет. */
    factMissing: 'fact-missing',
    /** Рабочих дней в месяце ноль — темп не определён. */
    noWorkdays: 'no-workdays',
    /** Рабочих дней до конца месяца не осталось — «сколько в день» нет. */
    noDaysLeft: 'no-days-left',
    /** `ai_analytics_daily_plan_enabled = false` — дневной разбивки нет. */
    dailyPlanDisabled: 'daily-plan-disabled',
} as const;

/** Код причины отсутствия числа. */
export type PlanFactReason =
    (typeof PLAN_FACT_REASONS)[keyof typeof PLAN_FACT_REASONS];

/** Доля месяца, прошедшая по рабочим дням календаря портала. */
export interface PlanFactExposure {
    /** `D_m` — рабочих дней в месяце по календарю портала. */
    readonly workdaysInMonth: number;
    /** Рабочих дней месяца, уже прошедших (включая день расчёта). */
    readonly workdaysElapsed: number;
    /**
     * `plan_day_ceiling` — во сколько раз дневная норма может превысить
     * ровный темп. Ограничивает прогноз: догонять план бесконечным
     * рывком нельзя. `null` — потолка нет.
     */
    readonly dayCeiling?: number | null;
    /**
     * Дневная разбивка разрешена на портале
     * (`ai_analytics_daily_plan_enabled`); false → `perDayNeeded = null`
     * с причиной `daily-plan-disabled`, а не 403.
     */
    readonly dailyPlanEnabled?: boolean;
}

/** План одного показателя: цель месяца; null — не задана. */
export type PlanFactTargets = Readonly<
    Partial<Record<PlanFactIndicator, number | null>>
>;

/** Факт одного показателя на дату расчёта; null — факт не рассчитан. */
export type PlanFactValues = Readonly<
    Partial<Record<PlanFactIndicator, number | null>>
>;

/** Строка реконсиляции по одному показателю. */
export interface PlanFactRow {
    readonly indicator: PlanFactIndicator;
    /** Цель месяца; null — плана нет. */
    readonly plan: number | null;
    /** Факт на дату расчёта; null — факт не рассчитан. */
    readonly fact: number | null;
    /**
     * Темп: факт, делённый на ожидаемую по рабочим дням долю плана.
     * 1 — идём ровно по плану, ниже — отстаём. null — плана нет, факта
     * нет или рабочих дней ноль.
     */
    readonly pace: number | null;
    /**
     * Описательный прогноз закрытия месяца при текущем темпе, срезанный
     * потолком дня. null — считать не из чего.
     */
    readonly forecastP50: number | null;
    /** `план − прогноз`; отрицательный — прогноз выше плана. */
    readonly gap: number | null;
    /**
     * Сколько нужно в день на оставшиеся рабочие дни, чтобы закрыть план.
     * null — плана нет, дней не осталось или дневная разбивка выключена.
     */
    readonly perDayNeeded: number | null;
    readonly status: PlanFactStatus;
    /** Почему чисел нет; пусто — все числа посчитаны. */
    readonly reasons: readonly PlanFactReason[];
}

/** Вход реконсиляции по одному менеджеру (или по отделу целиком). */
export interface PlanFactInput {
    readonly plan: PlanFactTargets;
    readonly fact: PlanFactValues;
    readonly exposure: PlanFactExposure;
}
