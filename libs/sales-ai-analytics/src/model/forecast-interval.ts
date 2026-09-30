/**
 * Вилка прогноза месяца P10/P50/P90 (план §4.8, §10 L4; Фаза 4, поток
 * `p4-forecast-model`).
 *
 * Случайна только ещё не случившаяся часть месяца: `Y₀` уже известно, а
 * остаток `μ_rem = max(P50 − Y₀, 0)` распределён как NegBin(μ_rem, φ).
 * Вилка — квантили остатка плюс `Y₀`. Для отдела остатки менеджеров
 * складываются: сумма независимых NegBin с общим φ (одна и та же
 * вероятность `p = 1/φ`) — в точности NegBin с суммарным средним и тем же
 * φ, дисперсия `φ·Σμ`.
 *
 * Чистая математика: без DI, Bitrix, Prisma, `Date.now`/`Math.random`.
 */
import { NEGBIN_DEFAULTS, negBinInterval } from './negbin';
import type { OverdispersionSource } from './overdispersion';

/** Вход вилки одного прогноза (менеджер или отдел). */
export interface ForecastBandInput {
    /** `P50 = Y₀ + λ_pipe + λ_new` из `forecastP50`. */
    readonly p50: number;
    /** `Y₀` — продажи, уже закрытые в месяце. */
    readonly doneSales: number;
    /** Сверхдисперсия φ; по умолчанию `overdispersion_default`. */
    readonly phi?: number;
    /** Откуда φ: дефолт реестра или оценка `quasiPoissonPhi`. */
    readonly phiSource?: OverdispersionSource;
    /** Уровень вилки; по умолчанию `forecast_interval_level`. */
    readonly level?: number;
}

/** Вилка прогноза: границы уровня `level` вокруг P50. */
export interface ForecastBand {
    readonly low: number;
    readonly p50: number;
    readonly high: number;
    readonly level: number;
    readonly phi: number;
    readonly phiSource: OverdispersionSource;
    /** `μ_rem` — ожидание ещё не случившейся части месяца. */
    readonly remaining: number;
}

/** Прогноз одного менеджера — слагаемое отдела. */
export interface ManagerForecastPoint {
    readonly managerId: string;
    readonly p50: number;
    readonly doneSales: number;
    /** Наивная база менеджера из `forecastP50`. */
    readonly naive: number;
    /** `Y₀ + λ_pipe` менеджера; без поля — равно `doneSales`. */
    readonly descriptive?: number;
    /** Известно ли `λ_pipe` менеджера; без поля — считается известным. */
    readonly pipelineKnown?: boolean;
}

/** Сумма прогнозов менеджеров — вход вилки отдела. */
export interface DepartmentAggregate {
    /** `Σ P50` менеджеров. */
    readonly p50: number;
    /** `Σ Y₀`. */
    readonly done: number;
    /** `Σ naive`. */
    readonly naive: number;
    /** `Σ (Y₀ + λ_pipe)`. */
    readonly descriptive: number;
    /** `Σ max(P50 − Y₀, 0)` — случайная часть отдела. */
    readonly remaining: number;
    /** Сколько менеджеров вошло в сумму. */
    readonly managers: number;
    /** Сколько из них без `λ_pipe` (`pipelineKnown = false`). */
    readonly pipelineUnknown: number;
}

/** Вход вилки отдела. */
export interface DepartmentBandInput {
    readonly managers: readonly ManagerForecastPoint[];
    readonly phi?: number;
    readonly phiSource?: OverdispersionSource;
    readonly level?: number;
}

const nonNegative = (value: number | undefined): number =>
    typeof value === 'number' && Number.isFinite(value) && value > 0
        ? value
        : 0;

/**
 * Вилка одного прогноза. Границы — целые квантили NegBin остатка плюс
 * `Y₀`; P50 — вещественное ожидание, поэтому при очень малом `μ_rem` с
 * большим φ верхний квантиль может оказаться ниже P50 — тогда границы
 * растягиваются до P50, чтобы вилка всегда содержала центр.
 */
export function forecastBand(input: ForecastBandInput): ForecastBand {
    const done = nonNegative(input.doneSales);
    const p50 = Math.max(done, nonNegative(input.p50));
    const remaining = p50 - done;
    const phi = Math.max(1, nonNegative(input.phi) || NEGBIN_DEFAULTS.phi);
    const level =
        typeof input.level === 'number' && Number.isFinite(input.level)
            ? Math.min(1, Math.max(0, input.level))
            : NEGBIN_DEFAULTS.level;
    const interval = negBinInterval(remaining, phi, level);

    return {
        low: Math.min(done + interval.low, p50),
        p50,
        high: Math.max(done + interval.high, p50),
        level,
        phi,
        phiSource: input.phiSource ?? 'default',
        remaining,
    };
}

/**
 * Сумма прогнозов менеджеров в фиксированном порядке `managerId` —
 * одинаковый набор менеджеров даёт побитово одинаковые суммы независимо
 * от порядка на входе.
 */
export function aggregateDepartment(
    managers: readonly ManagerForecastPoint[],
): DepartmentAggregate {
    const ordered = [...managers].sort((a, b) =>
        a.managerId < b.managerId ? -1 : a.managerId > b.managerId ? 1 : 0,
    );
    let p50 = 0;
    let done = 0;
    let naive = 0;
    let descriptive = 0;
    let remaining = 0;
    let pipelineUnknown = 0;
    for (const manager of ordered) {
        const managerDone = nonNegative(manager.doneSales);
        const managerP50 = Math.max(managerDone, nonNegative(manager.p50));
        p50 += managerP50;
        done += managerDone;
        naive += nonNegative(manager.naive);
        descriptive += Math.max(
            managerDone,
            nonNegative(manager.descriptive ?? managerDone),
        );
        remaining += managerP50 - managerDone;
        if (manager.pipelineKnown === false) {
            pipelineUnknown += 1;
        }
    }

    return {
        p50,
        done,
        naive,
        descriptive,
        remaining,
        managers: ordered.length,
        pipelineUnknown,
    };
}

/** Вилка отдела по сумме менеджеров: `Σ μ_rem` под NegBin с общим φ. */
export function departmentBand(input: DepartmentBandInput): ForecastBand {
    const aggregate = aggregateDepartment(input.managers);

    return forecastBand({
        p50: aggregate.p50,
        doneSales: aggregate.done,
        phi: input.phi,
        phiSource: input.phiSource,
        level: input.level,
    });
}
