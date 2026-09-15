/**
 * Сборка счётчиков стиля по менеджерам за месячный сегмент и склейка
 * сегментов окна (документ `ai/tasks/ai-analytics-manager-style.md`,
 * §2.1 оси 4/7/8). Математика единиц наблюдения — в `style-crm.units.ts`.
 *
 * Чистые функции: без DI, Bitrix и `new Date()`.
 */
import {
    isVoxConversation,
    isVoxIncoming,
    voxCallDurationSec,
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
    callsPerWorkday,
    dispersionIndex,
    giveUpCounts,
    leadResponseMinutes,
    median,
    promiseCounts,
    rhythmContributions,
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

const managerOf = (row: BxVoximplantStatisticRow): string =>
    String(row.PORTAL_USER_ID ?? '');

/** Счётчики одного менеджера за сегмент по его строкам телефонии. */
export function buildManagerCounters(
    managerId: string,
    rows: readonly BxVoximplantStatisticRow[],
    input: StyleCrmCalcInput,
): StyleCrmManagerMonth {
    const { workdays, leads, promises, thresholds } = input;
    const daily = callsPerWorkday(rows, workdays, thresholds.tempoMinSec);
    const attempts = attemptsPerLead(rows, thresholds.conversationMinSec);
    const giveUp = giveUpCounts(rows, workdays, thresholds);
    const promise = promiseCounts(promises, rows, thresholds.promiseWindowDays);
    const durations = rows
        .filter(row => isVoxConversation(row, thresholds.conversationMinSec))
        .map(voxCallDurationSec);
    const units: StyleCrmUnits = {
        attemptsPerLead: attempts,
        callsPerWorkday: daily,
        rhythmPerWorkday: rhythmContributions(daily),
    };
    const aggregates: StyleCrmAggregates = {
        attemptsMedian: median(attempts),
        giveUpEvents: giveUp.events,
        giveUps: giveUp.giveUps,
        giveUpRate: giveUp.events ? giveUp.giveUps / giveUp.events : null,
        promises: promise.promises,
        promisesKept: promise.kept,
        promiseKeptRate: promise.promises
            ? promise.kept / promise.promises
            : null,
        leadResponseMinMedian: median(
            leadResponseMinutes(leads, rows, workdays),
        ),
        conversationSecMedian: median(durations),
        dispersionIndex: dispersionIndex(daily, thresholds.dispersionMinDays),
        incomingShare: rows.length
            ? rows.filter(isVoxIncoming).length / rows.length
            : null,
        callsPerWorkdayMean: daily.length
            ? daily.reduce((sum, value) => sum + value, 0) / daily.length
            : null,
        calls: rows.length,
        workdays: workdays.length,
    };
    return { managerId, units, ...aggregates };
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

/** Склейка сегментов окна в один набор рядов на менеджера. */
export function mergeManagerMonths(
    months: readonly StyleCrmManagerMonth[][],
): StyleCrmManagerMonth[] {
    const merged = new Map<string, StyleCrmManagerMonth>();
    for (const month of months) {
        for (const item of month) {
            const current = merged.get(item.managerId);
            merged.set(
                item.managerId,
                current === undefined ? item : mergeTwo(current, item),
            );
        }
    }
    return [...merged.values()];
}

function mergeTwo(
    a: StyleCrmManagerMonth,
    b: StyleCrmManagerMonth,
): StyleCrmManagerMonth {
    const units: StyleCrmUnits = {
        attemptsPerLead: [
            ...a.units.attemptsPerLead,
            ...b.units.attemptsPerLead,
        ],
        callsPerWorkday: [
            ...a.units.callsPerWorkday,
            ...b.units.callsPerWorkday,
        ],
        rhythmPerWorkday: [
            ...a.units.rhythmPerWorkday,
            ...b.units.rhythmPerWorkday,
        ],
    };
    const giveUpEvents = a.giveUpEvents + b.giveUpEvents;
    const giveUps = a.giveUps + b.giveUps;
    const promises = a.promises + b.promises;
    const promisesKept = a.promisesKept + b.promisesKept;
    const calls = a.calls + b.calls;
    const workdays = a.workdays + b.workdays;
    const callsSum = units.callsPerWorkday.reduce(
        (sum, value) => sum + value,
        0,
    );
    return {
        managerId: a.managerId,
        units,
        attemptsMedian: median(units.attemptsPerLead),
        giveUpEvents,
        giveUps,
        giveUpRate: giveUpEvents ? giveUps / giveUpEvents : null,
        promises,
        promisesKept,
        promiseKeptRate: promises ? promisesKept / promises : null,
        leadResponseMinMedian: mergeMedian(
            a.leadResponseMinMedian,
            b.leadResponseMinMedian,
        ),
        conversationSecMedian: mergeMedian(
            a.conversationSecMedian,
            b.conversationSecMedian,
        ),
        dispersionIndex: dispersionIndex(
            units.callsPerWorkday,
            STYLE_CRM_THRESHOLDS.dispersionMinDays,
        ),
        incomingShare: mergeShare(a, b, calls),
        callsPerWorkdayMean: units.callsPerWorkday.length
            ? callsSum / units.callsPerWorkday.length
            : null,
        calls,
        workdays,
    };
}

/** Медианы сегментов усредняются: сырых рядов длительностей не храним. */
function mergeMedian(a: number | null, b: number | null): number | null {
    if (a === null) return b;
    if (b === null) return a;
    return (a + b) / 2;
}

function mergeShare(
    a: StyleCrmManagerMonth,
    b: StyleCrmManagerMonth,
    calls: number,
): number | null {
    if (calls === 0) return null;
    return (
        ((a.incomingShare ?? 0) * a.calls + (b.incomingShare ?? 0) * b.calls) /
        calls
    );
}
