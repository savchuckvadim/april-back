import { registryDefault } from '../params/registry.access';
import { CAPACITY_DEFAULTS, TimeBudget, timeBudget } from './capacity';
import type {
    DailyPlan,
    DailyPlanInput,
    DailyPlanItem,
    DailyPlanStep,
    DailyPlanTypeInput,
    RequiredVolumeInput,
    UnwindPath,
    UnwindedEdge,
} from './daily-plan.types';
import { LAG_CDF_DEFAULTS, maturityFloor } from './lag-cdf';

export * from './daily-plan.types';

/**
 * План на день как обратная задача (план `ai-sales-analytics`, §4.9;
 * Фаза 2, поток `p2-model-forecast-plan`).
 *
 * `N_req = max(0, G − Y₀ − λ_pipe) / (c_mk·F̄(D_rem))`, `F̄ ≥ f_min = 0,1`;
 * в режиме `betaSource: data` знаменатель дополнительно умножается на
 * `r(Ŝ)`, в режимах `none` / `hypothesis` — нет (здесь это просто число,
 * тип `QualityLink` не импортируется, чтобы поток оставался независимым).
 *
 * Требуемый исход разворачивается по путям воронки `N_k = N_{k+1}/E[θ_mk]`,
 * упирается в связующее ограничение по capacity и в бюджет времени дня.
 * Менеджер видит одно число на тип: `D_τ = max(0, (план_τ − сделано_τ)/дней
 * осталось)` с потолком `plan_day_ceiling × план_τ/D_m` — догонять месячный
 * недобор за три дня не план, а демотивация.
 *
 * Чистая математика: без DI, Bitrix и Prisma, без `Date.now`/`Math.random`.
 */

/** Дефолты плана дня из реестра параметров. */
export const DAILY_PLAN_DEFAULTS = {
    /** `plan_day_ceiling` — множитель к равномерному дневному плану. */
    ceilingMultiplier: registryDefault('plan_day_ceiling'),
    /** `f_min` — нижняя граница зрелости в обратной задаче. */
    fMin: LAG_CDF_DEFAULTS.fMin,
    /** `day_hours` — рабочих часов в дне; один источник — `capacity.ts`. */
    dayHours: CAPACITY_DEFAULTS.dayHours,
} as const;

/** Коды шагов объяснения, не зависящие от типа активности. */
export const AI_DAILY_PLAN_STEP_CODES = [
    'days_left',
    'ceiling_rule',
    'time_budget',
] as const;

/** Код общего шага объяснения плана дня. */
export type DailyPlanStepCode = (typeof AI_DAILY_PLAN_STEP_CODES)[number];

const finite = (value: number | undefined, fallback = 0): number =>
    typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const positive = (value: number | undefined): number =>
    Math.max(0, finite(value));

/** Число с одной десятичной и запятой — для текстов объяснения. */
const ru1 = (value: number): string => value.toFixed(1).replace('.', ',');

/**
 * `N_req = max(0, G − Y₀ − λ_pipe)/(c_mk·F̄·r)`. Нулевой знаменатель при
 * положительном недоборе даёт `Infinity` — честное «объёмом не берётся»;
 * план дня такой вход не пропускает и помечает `unreachable`.
 */
export function requiredVolume(input: RequiredVolumeInput): number {
    const gap =
        finite(input.target) -
        finite(input.doneSales) -
        finite(input.pipeline ?? undefined);
    if (gap <= 0) {
        return 0;
    }
    const fBar = maturityFloor(
        finite(input.fBar),
        finite(input.fMin, DAILY_PLAN_DEFAULTS.fMin),
    );
    const denominator =
        positive(input.conversion) *
        fBar *
        positive(finite(input.qualityMultiplier, 1));

    return denominator > 0 ? gap / denominator : Number.POSITIVE_INFINITY;
}

/** Нормированные доли путей: пустые доли — равномерно. */
function pathShares(paths: readonly UnwindPath[]): number[] {
    const raw = paths.map(path => positive(path.share ?? undefined));
    const total = raw.reduce((sum, value) => sum + value, 0);
    if (total <= 0) {
        return paths.map(() => (paths.length > 0 ? 1 / paths.length : 0));
    }

    return raw.map(value => value / total);
}

/**
 * Разворот требуемого исхода по путям воронки: `N_k = N_{k+1}/E[θ_mk]`,
 * доли путей — исторические. Объёмы одного ребра из разных путей
 * складываются; порядок результата — порядок воронки от входа к продаже.
 */
export function unwindPaths(
    nOutcome: number,
    edgeThetas: Readonly<Record<string, number>>,
    paths: readonly UnwindPath[],
): UnwindedEdge[] {
    const outcome = positive(nOutcome);
    const shares = pathShares(paths);
    const order: string[] = [];
    for (const path of paths) {
        for (const edge of path.edges) {
            if (!order.includes(edge)) {
                order.push(edge);
            }
        }
    }
    const required = new Map<string, number>();
    const broken = new Set<string>();
    paths.forEach((path, index) => {
        let need = outcome * shares[index];
        let unreachable = false;
        for (let step = path.edges.length - 1; step >= 0; step -= 1) {
            const edge = path.edges[step];
            const theta = finite(edgeThetas[edge]);
            unreachable = unreachable || !(theta > 0);
            if (unreachable) {
                broken.add(edge);
                continue;
            }
            need /= theta;
            required.set(edge, (required.get(edge) ?? 0) + need);
        }
    });

    return order.map(edge => ({
        edge,
        required: broken.has(edge)
            ? Number.POSITIVE_INFINITY
            : (required.get(edge) ?? 0),
        unreachable: broken.has(edge),
    }));
}

/** Сортировка типов по утечке `L_k` убыванию; без `L_k` — в конец. */
const byLeak = (a: DailyPlanTypeInput, b: DailyPlanTypeInput): number =>
    finite(b.leak ?? undefined, -1) - finite(a.leak ?? undefined, -1) ||
    a.callType.localeCompare(b.callType);

/** Строка плана по одному типу активности. */
function planItem(
    input: DailyPlanTypeInput,
    priority: number,
    workdays: number,
    daysLeft: number,
    ceilingMultiplier: number,
): DailyPlanItem {
    const rawRequired = input.requiredRemaining;
    const unreachable =
        typeof rawRequired !== 'number' ||
        !Number.isFinite(rawRequired) ||
        rawRequired < 0;
    const doneMonth = positive(input.doneMonth);
    const training = positive(input.trainingMinMonth);
    const byVolume = doneMonth + (unreachable ? 0 : rawRequired);
    const monthPlan = Math.max(byVolume, training);
    const ceiling =
        workdays > 0 ? (ceilingMultiplier * monthPlan) / workdays : 0;
    const raw =
        daysLeft > 0 ? Math.max(0, monthPlan - doneMonth) / daysLeft : 0;

    return {
        callType: input.callType,
        requiredToday: Math.min(raw, ceiling),
        doneToday: positive(input.doneToday),
        monthPlan,
        monthDone: doneMonth,
        cap: typeof input.cap === 'number' ? input.cap : null,
        priority,
        ceiling,
        cappedByCeiling: raw > ceiling,
        trainingApplied: training > byVolume,
        unreachable,
    };
}

/** Общие шаги объяснения плюс шаг на каждый тип активности. */
function planSteps(
    items: readonly DailyPlanItem[],
    daysLeft: number,
    ceilingMultiplier: number,
    budget: TimeBudget,
): DailyPlanStep[] {
    const steps: DailyPlanStep[] = [
        {
            code: 'days_left',
            value: daysLeft,
            text: `Рабочих дней до конца месяца: ${daysLeft}.`,
        },
        {
            code: 'ceiling_rule',
            value: ceilingMultiplier,
            text: `Потолок дня: ${ru1(ceilingMultiplier)} × месячный план ÷ рабочие дни месяца.`,
        },
    ];
    for (const item of items) {
        steps.push({
            code: `plan:${item.callType}`,
            value: item.requiredToday,
            text: `${item.callType}: план месяца ${ru1(item.monthPlan)}, сделано ${ru1(item.monthDone)}, на сегодня ${ru1(item.requiredToday)}${item.cappedByCeiling ? ' (упёрлись в потолок дня)' : ''}.`,
        });
    }
    steps.push({
        code: 'time_budget',
        value: budget.minutes,
        text: `Время: ${Math.round(budget.minutes)} мин из ${Math.round(budget.limitMinutes)}${budget.withinBudget ? '' : ' — не влезает в день'}.`,
    });

    return steps;
}

/**
 * План на день по типам активности: приоритет по утечке `L_k`, обучающий
 * минимум поднимает месячный план, каждое число ограничено потолком дня.
 * При `days_left = 0` деления на ноль нет — план дня равен нулю.
 */
export function dailyPlan(input: DailyPlanInput): DailyPlan {
    const workdays = Math.max(0, Math.floor(finite(input.workdaysInMonth)));
    const daysLeft = Math.max(0, Math.floor(finite(input.daysLeft)));
    const ceilingMultiplier = positive(
        finite(input.ceilingMultiplier, DAILY_PLAN_DEFAULTS.ceilingMultiplier),
    );
    const items = [...input.items]
        .sort(byLeak)
        .map((item, index) =>
            planItem(item, index + 1, workdays, daysLeft, ceilingMultiplier),
        );
    const durations: Record<string, number> = {};
    const required: Record<string, number> = {};
    for (const item of input.items) {
        durations[item.callType] = positive(item.durationMin);
    }
    for (const item of items) {
        required[item.callType] = item.requiredToday;
    }
    const budget = timeBudget(
        required,
        durations,
        finite(input.dayHours, DAILY_PLAN_DEFAULTS.dayHours),
    );

    return {
        items,
        steps: planSteps(items, daysLeft, ceilingMultiplier, budget),
        budget,
    };
}
