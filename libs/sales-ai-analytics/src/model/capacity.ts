/**
 * Capacity полосы стажа, связующее ограничение плана и бюджет времени дня
 * (план `ai-sales-analytics`, §4.9; Фаза 2, поток `p2-model-forecast-plan`).
 *
 * `cap` — **квантиль** дневного темпа полосы стажа (`cap_quantile`, дефолт
 * p90), а не среднее: план упирается в то, что менеджер уже показывал в
 * лучшие дни. Гейт оценки — `≥ 3 менеджера × 3 месяца` без proxy-месяцев,
 * до него берётся сконфигурированный дефолт `cap_level_activity`.
 *
 * Связующее ограничение — **первое** ребро воронки, где требуемый дневной
 * темп `N_k / D_rem` выше потолка: именно оно делает цель недостижимой
 * объёмом, остальные рёбра лечить бесполезно.
 *
 * Чистая математика: без DI, Bitrix и Prisma, без `Date.now`/`Math.random`.
 */
import { registryDefault } from '../params/registry.access';
import { quantileOf } from './quantile.util';

/** Как получен потолок дневного темпа. */
export const AI_CAPACITY_SOURCES = ['estimated', 'default'] as const;

/** Источник `cap`: оценка по менеджер-дням или дефолт реестра. */
export type CapacitySource = (typeof AI_CAPACITY_SOURCES)[number];

/** Дневной темп одного менеджера в одном месяце полосы стажа. */
export interface CapacityDayRate {
    readonly managerId: string;
    /** Ключ месяца `YYYY-MM` — гейт считает различные месяцы. */
    readonly monthKey: string;
    /** Активностей в рабочий день. */
    readonly rate: number;
    /** Месяц с `daysSource = proxy` в оценку не входит (§4.9). */
    readonly proxy?: boolean;
}

/** Настройки оценки capacity. */
export interface CapacityOptions {
    /** `cap_quantile` — квантиль дневного темпа, дефолт 0,9. */
    readonly quantile?: number;
    /** Гейт: различных менеджеров в выборке, дефолт 3. */
    readonly minManagers?: number;
    /** Гейт: различных месяцев в выборке, дефолт 3. */
    readonly minMonths?: number;
    /** Дефолт `cap_level_activity` для типа активности. */
    readonly fallback: number;
}

/** Потолок дневного темпа с источником и объёмом выборки. */
export interface CapacityEstimate {
    readonly cap: number;
    readonly source: CapacitySource;
    /** Менеджер-дней в выборке после отсева proxy. */
    readonly n: number;
    readonly managers: number;
    readonly months: number;
}

/** Требуемый объём одного ребра за остаток месяца. */
export interface CapacityRequirement {
    readonly edge: string;
    /** `N_k` — требуемый объём ребра до конца месяца. */
    readonly required: number;
}

/** Потолки по рёбрам и остаток рабочих дней. */
export interface CapacityCaps {
    /** `cap_k` по коду ребра; null — потолок не оценён. */
    readonly byEdge: Readonly<Record<string, number | null>>;
    /** `D_rem` — оставшиеся рабочие дни месяца. */
    readonly daysRemaining: number;
}

/** Связующее ограничение: первое ребро, упирающееся в capacity. */
export interface BindingConstraint {
    readonly edge: string | null;
    readonly unreachable: boolean;
    /** Требуемый дневной темп связующего ребра; null — дней не осталось. */
    readonly perDay: number | null;
    readonly cap: number | null;
}

/** Бюджет времени дня: сумма минут против `day_hours·60`. */
export interface TimeBudget {
    readonly minutes: number;
    readonly limitMinutes: number;
    readonly withinBudget: boolean;
}

/** Дефолты Фазы 2 по разделу 4.9 и реестру параметров. */
export const CAPACITY_DEFAULTS = {
    /** `cap_quantile`. */
    quantile: registryDefault('cap_quantile'),
    /**
     * Гейт оценки: менеджеров и месяцев.
     * Не параметр реестра: ценз оценки потолка из плана §4.9
     * (≥ 3 менеджера × 3 месяца без proxy), кода в §2.1–2.2 нет.
     */
    minManagers: 3,
    minMonths: 3,
    /** `day_hours` — рабочих часов в дне. */
    dayHours: registryDefault('day_hours'),
} as const;

/**
 * Квантиль (тип 7) — общий примитив модели (`quantile.util.ts`); здесь
 * реэкспортируется: потолок полосы — его главный потребитель, и код,
 * работающий с capacity, импортирует квантиль отсюда.
 */
export { quantileOf };

const MINUTES_IN_HOUR = 60;

const finite = (value: number | undefined, fallback = 0): number =>
    typeof value === 'number' && Number.isFinite(value) ? value : fallback;

/**
 * `cap` — квантиль дневного темпа полосы стажа. Пока гейт не выполнен
 * (`≥ 3 менеджера × 3 месяца` без proxy), возвращается дефолт реестра:
 * оценка p90 по двум менеджерам — это не потолок полосы, а их личный.
 */
export function capacityQuantile(
    dayRates: readonly CapacityDayRate[],
    options: CapacityOptions,
): CapacityEstimate {
    const usable = dayRates.filter(
        item => item.proxy !== true && Number.isFinite(item.rate),
    );
    const managers = new Set(usable.map(item => item.managerId)).size;
    const months = new Set(usable.map(item => item.monthKey)).size;
    const fallback = Math.max(0, finite(options.fallback));
    const enough =
        managers >= (options.minManagers ?? CAPACITY_DEFAULTS.minManagers) &&
        months >= (options.minMonths ?? CAPACITY_DEFAULTS.minMonths);
    if (!enough) {
        return {
            cap: fallback,
            source: 'default',
            n: usable.length,
            managers,
            months,
        };
    }

    return {
        cap: quantileOf(
            usable.map(item => item.rate),
            options.quantile ?? CAPACITY_DEFAULTS.quantile,
        ),
        source: 'estimated',
        n: usable.length,
        managers,
        months,
    };
}

/**
 * Первое ребро с `N_k / D_rem > cap`. Порядок массива — порядок воронки от
 * входа к продаже, поэтому «первое» означает «самое раннее».
 * При `D_rem = 0` деления нет: любой положительный остаток недостижим.
 */
export function bindingConstraint(
    required: readonly CapacityRequirement[],
    caps: CapacityCaps,
): BindingConstraint {
    const days = Math.floor(Math.max(0, finite(caps.daysRemaining)));
    for (const item of required) {
        const cap = caps.byEdge[item.edge] ?? null;
        const need = Math.max(0, finite(item.required));
        if (need <= 0) {
            continue;
        }
        if (days <= 0) {
            return { edge: item.edge, unreachable: true, perDay: null, cap };
        }
        if (cap === null || !Number.isFinite(cap)) {
            continue;
        }
        const perDay = need / days;
        if (perDay > cap) {
            return { edge: item.edge, unreachable: true, perDay, cap };
        }
    }

    return { edge: null, unreachable: false, perDay: null, cap: null };
}

/**
 * Бюджет времени дня: `Σ N_k·activity_duration_min_k ≤ day_hours·60`.
 * Превышение — признак «не влезает», а не запрет: план остаётся, но
 * руководитель видит, что день физически не вмещает объём.
 */
export function timeBudget(
    required: Readonly<Record<string, number>>,
    durationsMin: Readonly<Record<string, number>>,
    dayHours: number = CAPACITY_DEFAULTS.dayHours,
): TimeBudget {
    const minutes = Object.entries(required).reduce(
        (sum, [type, count]) =>
            sum +
            Math.max(0, finite(count)) *
                Math.max(0, finite(durationsMin[type])),
        0,
    );
    const limitMinutes = Math.max(0, finite(dayHours)) * MINUTES_IN_HOUR;

    return { minutes, limitMinutes, withinBudget: minutes <= limitMinutes };
}
