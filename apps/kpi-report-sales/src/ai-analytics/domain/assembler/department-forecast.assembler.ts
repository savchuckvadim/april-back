/**
 * Сборка теневого журнала прогноза отдела (план §4.8, §10 L4; поток B2b):
 * день журнала из прогнозов менеджеров и слияние дня в нагрузку
 * `ai-analytics-forecast-log` (portal-month, массив дней).
 *
 * Математика — библиотека: сумма менеджеров (`aggregateDepartment`),
 * вилка отдела NegBin с общим φ (`departmentBand`), деньги по
 * логнормальному чеку (`moneyBand`). Здесь только раскладка входов и
 * правило журнала: один день — одна запись, повтор дня заменяет её
 * (идемпотентность ночного прогона), факт месяца до бэктеста — null.
 *
 * Чистые функции: без DI, Bitrix и `new Date()`; случайность только через
 * переданный seed.
 */
import {
    aggregateDepartment,
    departmentBand,
    moneyBand,
    type ForecastLogDay,
    type ForecastLogSnapshot,
    type LognormalCheckSource,
    type ManagerForecastPoint,
    type OverdispersionSource,
} from '@lib/sales-ai-analytics';
import type { AiSnapshotMeta } from './manager-snapshot.types';
import type { ForecastPayload } from './forecast.types';

/** Прогноз менеджера → слагаемое отдела. */
export function managerPointOf(
    managerId: string,
    payload: ForecastPayload,
): ManagerForecastPoint {
    return {
        managerId,
        p50: payload.p50,
        doneSales: payload.doneSales,
        naive: payload.naive,
        descriptive: payload.descriptive,
        pipelineKnown: payload.pipelineExpected !== null,
    };
}

/** Вход дня журнала. */
export interface ForecastLogDayInput {
    readonly day: string;
    readonly managers: readonly ManagerForecastPoint[];
    /** φ модели портала; undefined — дефолт реестра. */
    readonly phi: number | undefined;
    readonly phiSource: OverdispersionSource;
    /** Уровень вилки (`forecast_interval_level`). */
    readonly level: number;
    /** Логнормальный чек `m`, `v`. */
    readonly check: { readonly m: number; readonly v: number };
    /** Зерно Монте-Карло денег (`seedOf(domain, day, calcVersion)`). */
    readonly seed: number;
    /** Среднее продаж отдела за три замороженных месяца; null — нет. */
    readonly mean3: number | null;
    readonly modelSnapshotId: string | null;
}

/** День журнала: вилка продаж и денег, простые базы и сделанное. */
export function buildForecastLogDay(
    input: ForecastLogDayInput,
): ForecastLogDay {
    const aggregate = aggregateDepartment(input.managers);
    const band = departmentBand({
        managers: input.managers,
        phi: input.phi,
        phiSource: input.phiSource,
        level: input.level,
    });
    const money = moneyBand({
        salesBand: band,
        m: input.check.m,
        v: input.check.v,
        seed: input.seed,
        level: band.level,
    });

    return {
        day: input.day,
        low: band.low,
        p50: band.p50,
        high: band.high,
        level: band.level,
        phi: band.phi,
        phiSource: band.phiSource,
        naive: aggregate.naive,
        mean3: input.mean3,
        done: aggregate.done,
        money: { low: money.low, p50: money.p50, high: money.high },
        managers: aggregate.managers,
        pipelineUnknown: aggregate.pipelineUnknown,
        modelSnapshotId: input.modelSnapshotId,
    };
}

/** Вход слияния дня в журнал месяца. */
export interface ForecastLogMergeInput {
    readonly monthKey: string;
    /** Журнал месяца из `ais`; null — первый день месяца в журнале. */
    readonly previous: ForecastLogSnapshot | null;
    readonly day: ForecastLogDay;
    readonly checkSource: LognormalCheckSource | null;
    readonly meta: AiSnapshotMeta;
}

/**
 * Журнал месяца с днём: запись того же дня заменяется, дни — по
 * возрастанию. Факт месяца переносится как есть (его ставит бэктест).
 */
export function mergeForecastLog(
    input: ForecastLogMergeInput,
): ForecastLogSnapshot {
    const kept = (input.previous?.days ?? []).filter(
        day => day.day !== input.day.day,
    );
    const days = [...kept, input.day].sort((left, right) =>
        left.day < right.day ? -1 : left.day > right.day ? 1 : 0,
    );

    return {
        monthKey: input.monthKey,
        days,
        actual: input.previous?.actual ?? null,
        checkSource: input.checkSource,
        meta: input.meta,
    };
}

/** Журнал закрытого месяца с фактом продаж (ставит бэктест). */
export function withActual(
    log: ForecastLogSnapshot,
    actual: number,
    meta: AiSnapshotMeta,
): ForecastLogSnapshot {
    return { ...log, actual, meta };
}
