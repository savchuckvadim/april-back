/**
 * Факты прогноза отдела (поток B2b), не зависящие от DI: что взять из
 * модели портала (φ и чек), простое среднее трёх замороженных месяцев,
 * продажи отдела по ростеру и разбор теневого журнала из `ais`.
 *
 * Отделено от `department-forecast.step.ts` по образцу `forecast.facts.ts`:
 * шаг оркеструет и пишет, разбор — здесь. Чужая или старая форма
 * читается структурно и деградирует до дефолтов реестра, а не роняет
 * прогон (§5.4). Чистые функции: без DI, Bitrix и `new Date()`.
 */
import {
    AI_LOGNORMAL_CHECK_SOURCES,
    CHECK_LOGNORMAL_M_CODE,
    CHECK_LOGNORMAL_V_CODE,
    LOGNORMAL_CHECK_DEFAULTS,
    resolveNumberParam,
    type ForecastLogDay,
    type ForecastLogSnapshot,
    type LognormalCheckSource,
    type OverdispersionSource,
    type ParamContext,
} from '@lib/sales-ai-analytics';
import { AI_FORECAST_MEAN_MONTHS } from '../constants/ai-forecast-log.const';
import {
    isMonthFrozen,
    monthKeysBack,
} from '../constants/ai-manager-snapshot.const';
import { previousMonthKey } from '../constants/ai-snapshot.const';
import type {
    PortalManagerMonth,
    PortalModelPayload,
} from '../domain/assembler/portal-model.types';
import type { AiAnalyticsSnapshotRecord } from '../store/ai-analytics-snapshot.store';

type Unknown = Record<string, unknown>;

const isObject = (value: unknown): value is Unknown =>
    typeof value === 'object' && value !== null;

const isFiniteNumber = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value);

/** Логнормальный чек, по которому продажи переводятся в деньги. */
export interface DepartmentCheck {
    readonly m: number;
    readonly v: number;
    readonly source: LognormalCheckSource;
}

/** Что прогноз отдела берёт из модели портала. */
export interface DepartmentModelFacts {
    /** φ модели; undefined — дефолт реестра внутри библиотеки. */
    readonly phi: number | undefined;
    readonly phiSource: OverdispersionSource;
    readonly check: DepartmentCheck;
}

const isCheckSource = (value: unknown): value is LognormalCheckSource =>
    typeof value === 'string' &&
    (AI_LOGNORMAL_CHECK_SOURCES as readonly string[]).includes(value);

/**
 * Чек: поле модели `checkLognormal` (его кладёт месячная модель портала
 * Фазы 4), а без него — прайор реестра `check_lognormal_m/v` с
 * переопределениями портала. Модель без своей оценки и без пула
 * (`default`) несёт прайор реестра на момент пересчёта — берём живой
 * реестр, чтобы новая настройка портала не ждала месячного пересчёта.
 */
function checkOf(
    model: Partial<PortalModelPayload> | null,
    registry: ParamContext,
): DepartmentCheck {
    const raw: unknown = isObject(model) ? model.checkLognormal : undefined;
    if (
        isObject(raw) &&
        isFiniteNumber(raw.m) &&
        isFiniteNumber(raw.v) &&
        raw.v >= 0 &&
        !(raw.source === 'default' && raw.priorFromPool !== true)
    ) {
        return {
            m: raw.m,
            v: raw.v,
            source: isCheckSource(raw.source) ? raw.source : 'default',
        };
    }

    return {
        m:
            resolveNumberParam(CHECK_LOGNORMAL_M_CODE, registry) ??
            LOGNORMAL_CHECK_DEFAULTS.priorM,
        v:
            resolveNumberParam(CHECK_LOGNORMAL_V_CODE, registry) ??
            LOGNORMAL_CHECK_DEFAULTS.priorV,
        source: 'default',
    };
}

/** φ и чек из модели портала; модели нет — дефолты реестра. */
export function modelFactsOf(
    model: Partial<PortalModelPayload> | null,
    registry: ParamContext,
): DepartmentModelFacts {
    const estimate = model?.overdispersion;
    const phi =
        isObject(estimate) &&
        isFiniteNumber(estimate.value) &&
        estimate.value > 0
            ? estimate.value
            : undefined;

    return {
        phi,
        phiSource:
            phi !== undefined && estimate?.source === 'estimated'
                ? 'estimated'
                : 'default',
        check: checkOf(model, registry),
    };
}

/**
 * Три последних ЗАМОРОЖЕННЫХ месяца на день прогона: до 3-го числа
 * прошлый месяц ещё может переписаться, поэтому окно сдвигается на месяц
 * назад.
 */
export function mean3MonthKeys(day: string): string[] {
    const previous = previousMonthKey(day);
    const latest = isMonthFrozen(previous, day)
        ? previous
        : previousMonthKey(`${previous}-01`);

    return monthKeysBack(latest, AI_FORECAST_MEAN_MONTHS);
}

/**
 * Продажи отдела по месяцам: сумма `salesCount` менеджеров ростера, по
 * одной записи на менеджер-месяц (последняя побеждает). Месяца без
 * записей ростера в карте нет — «нет факта», а не ноль.
 */
export function rosterMonthSales(
    months: readonly PortalManagerMonth[],
    roster: readonly string[],
): Map<string, number> {
    const allowed = new Set(roster);
    const perManager = new Map<string, number>();
    for (const month of months) {
        if (!allowed.has(month.managerId)) continue;
        perManager.set(
            `${month.monthKey}\u0000${month.managerId}`,
            month.salesCount,
        );
    }
    const sums = new Map<string, number>();
    for (const [key, sales] of perManager) {
        const monthKey = key.slice(0, key.indexOf('\u0000'));
        sums.set(monthKey, (sums.get(monthKey) ?? 0) + sales);
    }

    return sums;
}

/** Среднее продаж отдела за месяцы окна; хотя бы одного месяца нет → null. */
export function mean3Of(
    sums: ReadonlyMap<string, number>,
    monthKeys: readonly string[],
): number | null {
    if (monthKeys.length === 0) return null;
    let total = 0;
    for (const monthKey of monthKeys) {
        const sales = sums.get(monthKey);
        if (sales === undefined) return null;
        total += sales;
    }

    return total / monthKeys.length;
}

/** День журнала пригоден: день и числа вилки на месте. */
function isLogDay(value: unknown): value is ForecastLogDay {
    return (
        isObject(value) &&
        typeof value.day === 'string' &&
        isFiniteNumber(value.low) &&
        isFiniteNumber(value.p50) &&
        isFiniteNumber(value.high) &&
        isFiniteNumber(value.naive) &&
        isFiniteNumber(value.done)
    );
}

/** Нагрузка журнала прогноза отдела; чужая форма → null. */
export function forecastLogOf(payload: unknown): ForecastLogSnapshot | null {
    if (!isObject(payload) || typeof payload.monthKey !== 'string') {
        return null;
    }
    if (!Array.isArray(payload.days) || !isObject(payload.meta)) return null;
    const days = (payload.days as unknown[]).filter(isLogDay);

    return {
        monthKey: payload.monthKey,
        days,
        actual: isFiniteNumber(payload.actual) ? payload.actual : null,
        checkSource: isCheckSource(payload.checkSource)
            ? payload.checkSource
            : null,
        meta: payload.meta as unknown as ForecastLogSnapshot['meta'],
    };
}

/** Журналы по месяцам: одна актуальная запись отдела на месяц. */
export function forecastLogsOf(
    records: readonly AiAnalyticsSnapshotRecord[],
): Map<string, ForecastLogSnapshot> {
    const logs = new Map<string, ForecastLogSnapshot>();
    for (const record of records) {
        if (record.managerId !== null) continue;
        const log = forecastLogOf(record.payload);
        if (log !== null && log.monthKey === record.periodKey) {
            logs.set(record.periodKey, log);
        }
    }

    return logs;
}
