/**
 * Чистые функции стора снапшотов (план Фазы 2 §3.2): порядок по
 * возрасту, верхняя граница выборки, фильтр в памяти, «одна запись на
 * ключ», сигнатура расчёта, колонки без null и ретенция. Без DI, Bitrix
 * и Prisma —
 * вынесены из стора по лимиту 300 строк и покрываются его спекой.
 */
import {
    AI_ANALYTICS_SNAPSHOT_STATUS,
    SnapshotEnvelope,
} from '@lib/sales-ai-analytics';
import type {
    AiAnalyticsSnapshotFilter,
    AiAnalyticsSnapshotRecord,
} from './ai-analytics-snapshot.types';

export const DAY_MS = 24 * 60 * 60 * 1000;

/** Минимум полей строки ais для упорядочивания по возрасту. */
export interface AgedRow {
    id: string;
    createdAt: Date;
}

/** По возрастанию возраста: created_at, при равенстве — числовой id. */
export function compareByAge(a: AgedRow, b: AgedRow): number {
    return (
        a.createdAt.getTime() - b.createdAt.getTime() ||
        Number(a.id) - Number(b.id)
    );
}

/** Как compareByAge, но первичен id: он монотонен при вставке в ais. */
function compareById(a: AgedRow, b: AgedRow): number {
    return (
        Number(a.id) - Number(b.id) ||
        a.createdAt.getTime() - b.createdAt.getTime()
    );
}

export function sortByAge<T extends AgedRow>(rows: readonly T[]): T[] {
    return [...rows].sort(compareByAge);
}

/**
 * limit самых свежих строк (по возрасту) в порядке возрастания возраста;
 * без limit — все. Эмулирует `take` репозитория, которого у AiService
 * пока нет: граница относится к сырым строкам, а не к отфильтрованным.
 */
export function capNewest<T extends AgedRow>(
    rows: readonly T[],
    limit: number | undefined,
): T[] {
    const sorted = sortByAge(rows);
    return limit === undefined
        ? sorted
        : sorted.slice(Math.max(sorted.length - limit, 0));
}

export function isPositiveInteger(value: unknown): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

/**
 * Колонки записи без null и undefined: поля AiCreateDto необязательные, а
 * новая строка ais и так получает NULL — так user_id портальной записи и
 * расход без вызова модели не тащат null через DTO.
 */
export function withoutNullColumns<T extends object>(
    columns: T,
): { [K in keyof T]?: NonNullable<T[K]> } {
    const entries = Object.entries(columns as Record<string, unknown>).filter(
        ([, value]) => value !== null && value !== undefined,
    );
    return Object.fromEntries(entries) as {
        [K in keyof T]?: NonNullable<T[K]>;
    };
}

/** Фильтр статуса и менеджеров (в памяти: репозиторий ais не умеет user_id). */
export function matchesFilter(
    record: AiAnalyticsSnapshotRecord,
    filter: AiAnalyticsSnapshotFilter,
): boolean {
    if (
        !filter.includeSuperseded &&
        record.status === AI_ANALYTICS_SNAPSHOT_STATUS.superseded
    ) {
        return false;
    }
    if (!filter.managerIds?.length) return true;
    return filter.managerIds.includes(record.managerId);
}

/** Ключ субъекта записи: период + менеджер (пусто — портал). */
function subjectKey(record: AiAnalyticsSnapshotRecord): string {
    return `${record.periodKey}|${record.managerId ?? ''}`;
}

/**
 * Одна запись на ключ periodKey + managerId — с максимальным id (при
 * равенстве — свежее created_at). Порядок результата — по возрасту.
 */
export function pickLatestPerKey(
    records: readonly AiAnalyticsSnapshotRecord[],
): AiAnalyticsSnapshotRecord[] {
    const byKey = new Map<string, AiAnalyticsSnapshotRecord>();
    for (const record of records) {
        const key = subjectKey(record);
        const current = byKey.get(key);
        if (current === undefined || compareById(current, record) < 0) {
            byKey.set(key, record);
        }
    }
    return sortByAge([...byKey.values()]);
}

/** Сигнатура расчёта совпадает: те же входы, параметры и версия кода. */
export function sameSignature(
    record: AiAnalyticsSnapshotRecord,
    envelope: SnapshotEnvelope<unknown>,
): boolean {
    return (
        record.inputsHash === envelope.inputsHash &&
        record.paramsVersion === envelope.paramsVersion &&
        record.calcVersion === envelope.calcVersion
    );
}

/** Все записи, кроме keep последних на менеджера (keep ≤ 0 — все). */
export function expiredByCount(
    records: readonly AiAnalyticsSnapshotRecord[],
    keep: number,
): AiAnalyticsSnapshotRecord[] {
    const byManager = new Map<string, AiAnalyticsSnapshotRecord[]>();
    for (const record of records) {
        const key = record.managerId ?? '';
        byManager.set(key, [...(byManager.get(key) ?? []), record]);
    }
    return [...byManager.values()].flatMap(group =>
        keep > 0 ? group.slice(0, Math.max(group.length - keep, 0)) : group,
    );
}

/** Записи старше retention дней от now. */
export function expiredByDays(
    records: readonly AiAnalyticsSnapshotRecord[],
    days: number | null,
    now: Date = new Date(),
): AiAnalyticsSnapshotRecord[] {
    if (days === null) return [];
    const edge = now.getTime() - days * DAY_MS;
    return records.filter(record => record.createdAt.getTime() < edge);
}
