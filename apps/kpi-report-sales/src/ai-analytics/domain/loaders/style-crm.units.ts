/**
 * Единицы наблюдения жёстких счётчиков стиля: попытки дозвона на лид,
 * отказ от второй попытки, объёмы рабочего дня, вклад дня в индекс
 * дисперсии, обещанные даты, скорость ответа на лид (документ
 * `ai/tasks/ai-analytics-manager-style.md`, §2.1 оси 4/7/8).
 *
 * Без DI, Bitrix и `new Date()` — всё приходит аргументами, поэтому
 * каждый счётчик проверяется формулой в спеке.
 */
import {
    isVoxConversation,
    isVoxIncoming,
    voxCallDurationSec,
    voxEntityKey,
    type BxVoximplantStatisticRow,
} from '@lib/bitrix/domain/telephony';
import { daysBetween, workingMinutesBetween } from './style-crm.dates.util';
import type {
    StyleCrmLead,
    StyleCrmPromise,
    StyleCrmThresholds,
} from './style-crm.types';

/** Пороги счётчиков по умолчанию (документ §2.1). */
export const STYLE_CRM_THRESHOLDS: StyleCrmThresholds = {
    conversationMinSec: 30,
    tempoMinSec: 60,
    giveUpWorkdays: 3,
    promiseWindowDays: 2,
    dispersionMinDays: 15,
};

/** День звонка 'YYYY-MM-DD' в TZ портала (CALL_START_DATE идёт с оффсетом). */
export const voxCallDay = (row: BxVoximplantStatisticRow): string =>
    String(row.CALL_START_DATE ?? '').slice(0, 10);

const byStartDate = (
    a: BxVoximplantStatisticRow,
    b: BxVoximplantStatisticRow,
): number =>
    String(a.CALL_START_DATE ?? '').localeCompare(
        String(b.CALL_START_DATE ?? ''),
    );

/** Медиана ряда (для чётной длины — среднее двух средних); [] → null. */
export function median(values: readonly number[]): number | null {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 1
        ? sorted[middle]
        : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** Индекс избыточной дисперсии Var/mean − 1 (выборочная дисперсия, n − 1). */
export function dispersionIndex(
    daily: readonly number[],
    minDays: number,
): number | null {
    if (daily.length < minDays) return null;
    const mean = daily.reduce((sum, value) => sum + value, 0) / daily.length;
    if (mean <= 0) return null;
    const variance =
        daily.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
        (daily.length - 1);
    return variance / mean - 1;
}

/**
 * Вклад каждого дня в индекс дисперсии со знаком минус: среднее по дням
 * равно −Var/x̄ (с поправкой n/(n−1)), поэтому сравнение средних по
 * менеджерам — это сравнение индексов, а больше значит ровнее.
 */
export function rhythmContributions(daily: readonly number[]): number[] {
    if (daily.length < 2) return [];
    const mean = daily.reduce((sum, value) => sum + value, 0) / daily.length;
    if (mean <= 0) return [];
    const scale = daily.length / (daily.length - 1);
    return daily.map(value => -(((value - mean) ** 2 / mean) * scale));
}

/** Звонки по сущности CRM в порядке времени (только с привязкой). */
function byEntity(
    rows: readonly BxVoximplantStatisticRow[],
): Map<string, BxVoximplantStatisticRow[]> {
    const map = new Map<string, BxVoximplantStatisticRow[]>();
    for (const row of [...rows].sort(byStartDate)) {
        const key = voxEntityKey(row);
        if (key === null) continue;
        const list = map.get(key) ?? [];
        list.push(row);
        map.set(key, list);
    }
    return map;
}

/**
 * Исходящие звонки сущности, если её ПЕРВЫМ тронул менеджер; null —
 * исходящих нет или до первого исходящего был входящий. Единица оси 4 —
 * лид, до которого менеджер дозванивается сам: входящее обращение из
 * знаменателя исключено (документ §2.1, ось 4, «входящие лиды из
 * знаменателя исключены»), и это правило одинаково для `attemptsToConnect`
 * и `giveUpRate` — иначе две половины одной оси считались бы по разным
 * множествам сущностей.
 */
function outgoingInitiated(
    calls: readonly BxVoximplantStatisticRow[],
): BxVoximplantStatisticRow[] | null {
    const firstOutgoingAt = calls.findIndex(row => !isVoxIncoming(row));
    if (firstOutgoingAt === -1) return null;
    // Входящий раньше первого исходящего — сущность пришла сама.
    if (calls.slice(0, firstOutgoingAt).some(isVoxIncoming)) return null;
    return calls.filter(row => !isVoxIncoming(row));
}

/**
 * Попытки дозвона до первого разговора по каждой сущности (ось 4).
 * Учитываются только ИСХОДЯЩИЕ: сущности, где первым был входящий
 * звонок, из знаменателя исключены — дозвон по входящему обращению это
 * не настойчивость менеджера (документ §2.1, ось 4).
 */
export function attemptsPerLead(
    rows: readonly BxVoximplantStatisticRow[],
    conversationMinSec: number,
): number[] {
    const attempts: number[] = [];
    for (const calls of byEntity(rows).values()) {
        const outgoing = outgoingInitiated(calls);
        if (outgoing === null) continue;
        const connectedAt = outgoing.findIndex(row =>
            isVoxConversation(row, conversationMinSec),
        );
        attempts.push(connectedAt === -1 ? outgoing.length : connectedAt + 1);
    }
    return attempts;
}

/**
 * Отказ от второй попытки: среди сущностей, где ПЕРВАЯ исходящая попытка
 * прошла без разговора, доля тех, где второй попытки не было в
 * `giveUpWorkdays` рабочих дней (документ §2.1, `giveUpRate`).
 * Знаменатель тот же, что у `attemptsPerLead`: сущности, до которых
 * менеджер дозванивался сам (входящие обращения исключены).
 */
export function giveUpCounts(
    rows: readonly BxVoximplantStatisticRow[],
    workdays: readonly string[],
    thresholds: StyleCrmThresholds,
): { events: number; giveUps: number } {
    let events = 0;
    let giveUps = 0;
    for (const calls of byEntity(rows).values()) {
        const outgoing = outgoingInitiated(calls);
        if (outgoing === null) continue;
        const first = outgoing[0];
        if (isVoxConversation(first, thresholds.conversationMinSec)) {
            continue;
        }
        events += 1;
        const deadline = workdayDeadline(
            voxCallDay(first),
            workdays,
            thresholds.giveUpWorkdays,
        );
        const retried = outgoing
            .slice(1)
            .some(row => voxCallDay(row) <= deadline);
        if (!retried) giveUps += 1;
    }
    return { events, giveUps };
}

/**
 * Дата, до которой (включительно) ждём вторую попытку: `workdays`
 * рабочих дней после дня первой. Календарь кончился — граница окна.
 */
export function workdayDeadline(
    day: string,
    workdays: readonly string[],
    count: number,
): string {
    const after = workdays.filter(date => date > day);
    if (after.length === 0) return day;
    return after[Math.min(count, after.length) - 1];
}

/** Исходящих разговоров не короче порога по каждому рабочему дню. */
export function callsPerWorkday(
    rows: readonly BxVoximplantStatisticRow[],
    workdays: readonly string[],
    tempoMinSec: number,
): number[] {
    const counts = new Map<string, number>();
    for (const row of rows) {
        if (isVoxIncoming(row)) continue;
        if (voxCallDurationSec(row) < tempoMinSec) continue;
        const day = voxCallDay(row);
        counts.set(day, (counts.get(day) ?? 0) + 1);
    }
    return workdays.map(day => counts.get(day) ?? 0);
}

/** Обещанные даты: выполнено — звонок той же сущности в ±окно дней. */
export function promiseCounts(
    promises: readonly StyleCrmPromise[],
    rows: readonly BxVoximplantStatisticRow[],
    windowDays: number,
): { promises: number; kept: number } {
    const daysByEntity = new Map<string, string[]>();
    for (const row of rows) {
        const key = voxEntityKey(row);
        if (key === null) continue;
        const list = daysByEntity.get(key) ?? [];
        list.push(voxCallDay(row));
        daysByEntity.set(key, list);
    }
    let kept = 0;
    for (const promise of promises) {
        const days = daysByEntity.get(promise.entityKey) ?? [];
        const hit = days.some(
            day => Math.abs(daysBetween(promise.date, day)) <= windowDays,
        );
        if (hit) kept += 1;
    }
    return { promises: promises.length, kept };
}

/**
 * Скорость ответа на лид в РАБОЧИХ минутах: от создания лида до первого
 * исходящего звонка по нему. Нерабочие дни из интервала вычитаются
 * целиком (рабочие часы портала в календаре не заданы — упрощение
 * документировано, см. handoff).
 */
export function leadResponseMinutes(
    leads: readonly StyleCrmLead[],
    rows: readonly BxVoximplantStatisticRow[],
    workdays: readonly string[],
): number[] {
    const firstCallByLead = new Map<string, string>();
    for (const row of [...rows].sort(byStartDate)) {
        if (isVoxIncoming(row)) continue;
        const key = voxEntityKey(row);
        if (key === null || !key.startsWith('LEAD:')) continue;
        if (!firstCallByLead.has(key)) {
            firstCallByLead.set(key, String(row.CALL_START_DATE ?? ''));
        }
    }
    const response: number[] = [];
    for (const lead of leads) {
        const startedAt = firstCallByLead.get(`LEAD:${lead.id}`);
        if (startedAt === undefined) continue;
        const minutes = workingMinutesBetween(
            lead.createdAt,
            startedAt,
            workdays,
        );
        if (minutes !== null) response.push(minutes);
    }
    return response;
}
