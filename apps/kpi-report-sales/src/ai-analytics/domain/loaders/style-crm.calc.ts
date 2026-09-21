/**
 * Сборка счётчиков стиля по менеджерам за месячный сегмент и склейка
 * сегментов окна (документ `ai/tasks/ai-analytics-manager-style.md`,
 * §2.1 оси 4/7/8). Математика единиц наблюдения — в `style-crm.units.ts`.
 *
 * Агрегаты всегда выводятся из рядов единиц одной функцией
 * (`aggregatesOf`) — и для сегмента, и для склейки окна: медианы окна
 * считаются по объединённым выборкам (ряды хранятся в `units`), а не как
 * среднее медиан сегментов; индекс дисперсии — по дням всего окна с
 * порогом, переданным вызывающим (`style_dispersion_min_days`).
 *
 * Чистые функции: без DI, Bitrix и `new Date()`.
 */
import {
    isVoxIncoming,
    type BxVoximplantStatisticRow,
} from '@lib/bitrix/domain/telephony';
import type {
    StyleCrmAggregates,
    StyleCrmLead,
    StyleCrmManagerMonth,
    StyleCrmPromise,
    StyleCrmThresholds,
    StyleCrmUnits,
} from './style-crm.types';
import {
    attemptsPerLead,
    byCallType,
    callsPerWorkday,
    conversationDurationsByType,
    dispersionIndex,
    giveUpCounts,
    leadResponseMinutes,
    median,
    medianDurationByType,
    promiseCounts,
    rhythmContributions,
    STYLE_CRM_CALL_TYPE_KEYS,
    STYLE_CRM_THRESHOLDS,
} from './style-crm.units';

/** Вход расчёта сегмента, общий для одного менеджера и для всех. */
export interface StyleCrmCalcInput {
    /** Рабочие дни сегмента 'YYYY-MM-DD' по возрастанию. */
    workdays: readonly string[];
    leads: readonly StyleCrmLead[];
    promises: readonly StyleCrmPromise[];
    thresholds: StyleCrmThresholds;
}

/** Аддитивные счётчики сегмента — складываются при склейке окна. */
interface StyleCrmCounts {
    giveUpEvents: number;
    giveUps: number;
    promises: number;
    promisesKept: number;
    calls: number;
    /** Доля входящих; null — звонков нет. */
    incomingShare: number | null;
    workdays: number;
}

const managerOf = (row: BxVoximplantStatisticRow): string =>
    String(row.PORTAL_USER_ID ?? '');

const emptyUnits = (): StyleCrmUnits => ({
    attemptsPerLead: [],
    callsPerWorkday: [],
    rhythmPerWorkday: [],
    conversationSecByType: byCallType<number[]>(() => []),
    leadResponseMin: [],
});

/** Агрегаты «Основания» из рядов единиц и аддитивных счётчиков. */
export function aggregatesOf(
    units: StyleCrmUnits,
    counts: StyleCrmCounts,
    thresholds: StyleCrmThresholds,
): StyleCrmAggregates {
    const durations = medianDurationByType(units.conversationSecByType);
    const daily = units.callsPerWorkday;
    return {
        attemptsMedian: median(units.attemptsPerLead),
        giveUpEvents: counts.giveUpEvents,
        giveUps: counts.giveUps,
        giveUpRate: counts.giveUpEvents
            ? counts.giveUps / counts.giveUpEvents
            : null,
        promises: counts.promises,
        promisesKept: counts.promisesKept,
        promiseKeptRate: counts.promises
            ? counts.promisesKept / counts.promises
            : null,
        leadResponseMinMedian: median(units.leadResponseMin),
        conversationSecMedian: durations.all,
        conversationSecMedianByType: durations.byType,
        dispersionIndex: dispersionIndex(daily, thresholds.dispersionMinDays),
        incomingShare: counts.incomingShare,
        callsPerWorkdayMean: daily.length
            ? daily.reduce((sum, value) => sum + value, 0) / daily.length
            : null,
        calls: counts.calls,
        workdays: counts.workdays,
    };
}

/** Счётчики одного менеджера за сегмент по его строкам телефонии. */
export function buildManagerCounters(
    managerId: string,
    rows: readonly BxVoximplantStatisticRow[],
    input: StyleCrmCalcInput,
): StyleCrmManagerMonth {
    const { workdays, leads, promises, thresholds } = input;
    const daily = callsPerWorkday(rows, workdays, thresholds.tempoMinSec);
    const giveUp = giveUpCounts(rows, workdays, thresholds);
    const promise = promiseCounts(promises, rows, thresholds.promiseWindowDays);
    const units: StyleCrmUnits = {
        attemptsPerLead: attemptsPerLead(rows, thresholds.conversationMinSec),
        callsPerWorkday: daily,
        rhythmPerWorkday: rhythmContributions(daily),
        conversationSecByType: conversationDurationsByType(
            rows,
            thresholds.conversationMinSec,
        ),
        leadResponseMin: leadResponseMinutes(leads, rows, workdays),
    };
    const counts: StyleCrmCounts = {
        giveUpEvents: giveUp.events,
        giveUps: giveUp.giveUps,
        promises: promise.promises,
        promisesKept: promise.kept,
        calls: rows.length,
        incomingShare: rows.length
            ? rows.filter(isVoxIncoming).length / rows.length
            : null,
        workdays: workdays.length,
    };
    return { managerId, units, ...aggregatesOf(units, counts, thresholds) };
}

/** Счётчики всех менеджеров сегмента (менеджер без звонков — нулевая строка). */
export function buildMonthCounters(
    managerIds: readonly string[],
    rows: readonly BxVoximplantStatisticRow[],
    input: StyleCrmCalcInput,
): StyleCrmManagerMonth[] {
    const rowsByManager = new Map<string, BxVoximplantStatisticRow[]>();
    for (const row of rows) {
        const managerId = managerOf(row);
        if (!managerId) continue;
        const list = rowsByManager.get(managerId) ?? [];
        list.push(row);
        rowsByManager.set(managerId, list);
    }
    return managerIds.map(managerId =>
        buildManagerCounters(managerId, rowsByManager.get(managerId) ?? [], {
            ...input,
            leads: input.leads.filter(lead => lead.managerId === managerId),
            promises: input.promises.filter(
                item => item.managerId === managerId,
            ),
        }),
    );
}

/**
 * Склейка сегментов окна в один набор рядов на менеджера. Агрегаты
 * пересчитываются из объединённых рядов с ПЕРЕДАННЫМИ порогами — так
 * сегмент из кэша, посчитанный при другом `style_dispersion_min_days`,
 * не протаскивает старый индекс дисперсии в окно.
 */
export function mergeManagerMonths(
    months: readonly StyleCrmManagerMonth[][],
    thresholds: StyleCrmThresholds = STYLE_CRM_THRESHOLDS,
): StyleCrmManagerMonth[] {
    const byManager = new Map<string, StyleCrmManagerMonth[]>();
    for (const month of months) {
        for (const item of month) {
            byManager.set(item.managerId, [
                ...(byManager.get(item.managerId) ?? []),
                item,
            ]);
        }
    }
    return [...byManager.entries()].map(([managerId, items]) =>
        foldManager(managerId, items, thresholds),
    );
}

/** Сегменты одного менеджера → ряды окна и агрегаты по ним. */
function foldManager(
    managerId: string,
    items: readonly StyleCrmManagerMonth[],
    thresholds: StyleCrmThresholds,
): StyleCrmManagerMonth {
    const units = items.reduce<StyleCrmUnits>(
        (acc, item) => mergeUnits(acc, item.units),
        emptyUnits(),
    );
    const calls = items.reduce((sum, item) => sum + item.calls, 0);
    const counts: StyleCrmCounts = {
        giveUpEvents: items.reduce((sum, item) => sum + item.giveUpEvents, 0),
        giveUps: items.reduce((sum, item) => sum + item.giveUps, 0),
        promises: items.reduce((sum, item) => sum + item.promises, 0),
        promisesKept: items.reduce((sum, item) => sum + item.promisesKept, 0),
        calls,
        incomingShare: mergeShare(items, calls),
        workdays: items.reduce((sum, item) => sum + item.workdays, 0),
    };
    return { managerId, units, ...aggregatesOf(units, counts, thresholds) };
}

/** Объединение рядов единиц двух сегментов (порядок — по сегментам). */
function mergeUnits(a: StyleCrmUnits, b: StyleCrmUnits): StyleCrmUnits {
    return {
        attemptsPerLead: [...a.attemptsPerLead, ...b.attemptsPerLead],
        callsPerWorkday: [...a.callsPerWorkday, ...b.callsPerWorkday],
        rhythmPerWorkday: [...a.rhythmPerWorkday, ...b.rhythmPerWorkday],
        conversationSecByType: Object.fromEntries(
            STYLE_CRM_CALL_TYPE_KEYS.map(key => [
                key,
                [
                    ...a.conversationSecByType[key],
                    ...b.conversationSecByType[key],
                ],
            ]),
        ) as StyleCrmUnits['conversationSecByType'],
        leadResponseMin: [...a.leadResponseMin, ...b.leadResponseMin],
    };
}

/** Доля входящих окна: взвешенная по звонкам сегментов; null — звонков нет. */
function mergeShare(
    items: readonly StyleCrmManagerMonth[],
    calls: number,
): number | null {
    if (calls === 0) return null;
    return (
        items.reduce(
            (sum, item) => sum + (item.incomingShare ?? 0) * item.calls,
            0,
        ) / calls
    );
}
