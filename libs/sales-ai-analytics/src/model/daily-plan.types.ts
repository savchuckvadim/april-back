import type { TimeBudget } from './capacity';

/**
 * Типы плана на день (план `ai-sales-analytics`, §4.9). Вынесены из
 * `model/daily-plan.ts`, чтобы файл модели оставался в пределах 300 строк
 * (прецедент — `model/funnel-gap.types.ts`).
 */

/** Вход обратной задачи по объёму. */
export interface RequiredVolumeInput {
    /** Цель месяца `G`. */
    readonly target: number;
    /** `Y₀` — уже закрытые продажи месяца. */
    readonly doneSales: number;
    /** `λ_pipe`; null — истории стадий нет, пайплайн в расчёт не идёт. */
    readonly pipeline: number | null;
    /** `c_mk` — конверсия единицы объёма в продажу. */
    readonly conversion: number;
    /** `F̄(D_rem)` — средняя зрелость. */
    readonly fBar: number;
    /** `f_min`, дефолт 0,1. */
    readonly fMin?: number;
    /** `r(Ŝ)`; 1 в режимах `none` / `hypothesis`. */
    readonly qualityMultiplier?: number;
}

/** Путь воронки для разворота требуемого объёма. */
export interface UnwindPath {
    readonly code: string;
    /** Коды рёбер по порядку — от входа к продаже. */
    readonly edges: readonly string[];
    /** Историческая доля пути; по умолчанию доли равны. */
    readonly share?: number;
}

/** Требуемый входной объём одного ребра. */
export interface UnwindedEdge {
    readonly edge: string;
    /** `N_k` — сколько активностей нужно на входе ребра. */
    readonly required: number;
    /** `θ_k = 0`: разворот невозможен, объём не определён. */
    readonly unreachable: boolean;
}

/** Один тип активности на входе плана дня. */
export interface DailyPlanTypeInput {
    readonly callType: string;
    /** Ребро воронки, к которому привязан тип. */
    readonly edge?: string;
    /** `N_k` — требуемый объём на остаток месяца (из `unwindPaths`). */
    readonly requiredRemaining: number;
    /** Сделано за месяц. */
    readonly doneMonth: number;
    /** Сделано сегодня. */
    readonly doneToday?: number;
    /** `cap` — потолок дневного темпа; null — не оценён. */
    readonly cap?: number | null;
    /** `L_k` — утечка ребра; задаёт приоритет типов. */
    readonly leak?: number | null;
    /** `activity_duration_min_k` — минут на одну активность. */
    readonly durationMin?: number;
    /** Обучающий минимум за месяц (`training_min_presentations`). */
    readonly trainingMinMonth?: number;
}

/** Вход плана дня. */
export interface DailyPlanInput {
    readonly items: readonly DailyPlanTypeInput[];
    /** `D_m` — рабочих дней в месяце. */
    readonly workdaysInMonth: number;
    /** `days_left_m` — рабочих дней до конца месяца, включая сегодня. */
    readonly daysLeft: number;
    /** `plan_day_ceiling`, дефолт 1,5. */
    readonly ceilingMultiplier?: number;
    /** `day_hours`, дефолт 6. */
    readonly dayHours?: number;
}

/** Одна строка плана дня. */
export interface DailyPlanItem {
    readonly callType: string;
    readonly requiredToday: number;
    readonly doneToday: number;
    /** `план_τ` — месячный план типа с учётом обучающего минимума. */
    readonly monthPlan: number;
    readonly monthDone: number;
    readonly cap: number | null;
    /** Место в приоритете по `L_k`, начиная с 1. */
    readonly priority: number;
    /** `plan_day_ceiling × план_τ/D_m`. */
    readonly ceiling: number;
    /** План уперся в потолок дня. */
    readonly cappedByCeiling: boolean;
    /** Обучающий минимум поднял месячный план. */
    readonly trainingApplied: boolean;
    /** Требуемый объём не определён (разворот упёрся в `θ = 0`). */
    readonly unreachable: boolean;
}

/** Шаг объяснения «как получилось это число». */
export interface DailyPlanStep {
    readonly code: string;
    readonly value: number | null;
    readonly text: string;
}

/** Итог плана дня. */
export interface DailyPlan {
    readonly items: DailyPlanItem[];
    readonly steps: DailyPlanStep[];
    readonly budget: TimeBudget;
}
