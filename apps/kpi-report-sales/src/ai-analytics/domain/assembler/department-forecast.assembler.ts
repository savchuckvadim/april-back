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
    AI_FORECAST_METHOD_CURRENT,
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

/**
 * Прогноз менеджера → слагаемое отдела. С методом `presentations-v2`
 * «уже в работе» считается от презентаций и известно всегда: открытые
 * сделки в середину не входят, их отсутствие ничего не прячет.
 */
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
        pipelineKnown:
            payload.flow !== undefined || payload.pipelineExpected !== null,
    };
}

/** Метод, вход и подбор дня журнала — поля дня `ForecastLogDay`. */
export type ForecastLogDayFlowFields = Pick<
    ForecastLogDay,
    'method' | 'entry' | 'flow'
>;

/**
 * Метод и подбор дня по прогнозам менеджеров: подбор один на портал, его
 * несёт любой прогноз от презентаций. Таких нет (старые записи) — пусто:
 * день читается как расчёт по звонкам.
 */
export function dayFlowOf(
    payloads: readonly ForecastPayload[],
): ForecastLogDayFlowFields {
    const flows = payloads.flatMap(payload =>
        payload.flow === undefined ? [] : [payload],
    );
    const first = flows[0];
    if (first?.flow === undefined) return {};

    return {
        method: AI_FORECAST_METHOD_CURRENT,
        ...(first.entry === undefined ? {} : { entry: first.entry }),
        flow: {
            status: first.flow.status,
            reason: first.flow.reason,
            q: first.flow.portalQ,
            rho: first.flow.rho,
            salesHistoryManagers: flows.filter(
                payload => payload.flow?.source === 'sales-history',
            ).length,
        },
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
    /** Метод и подбор дня (`dayFlowOf`); нет — расчёт по звонкам. */
    readonly flow?: ForecastLogDayFlowFields;
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
        descriptive: aggregate.descriptive,
        money: { low: money.low, p50: money.p50, high: money.high },
        managers: aggregate.managers,
        pipelineUnknown: aggregate.pipelineUnknown,
        modelSnapshotId: input.modelSnapshotId,
        ...(input.flow ?? {}),
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

/**
 * Журнал закрытого месяца с фактом продаж (ставит бэктест). Источник
 * дней журнала (`meta.source`, его ставит воспроизведение по истории)
 * сохраняется: бэктест меняет только факт, а не дни.
 */
export function withActual(
    log: ForecastLogSnapshot,
    actual: number,
    meta: AiSnapshotMeta,
): ForecastLogSnapshot {
    const source = log.meta.source;

    return {
        ...log,
        actual,
        meta: source === undefined ? meta : { ...meta, source },
    };
}
