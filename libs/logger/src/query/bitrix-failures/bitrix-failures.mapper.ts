import { LogRawRow, num, str } from '../log-query.values';
import {
    BITRIX_FAILURE_KINDS,
    BitrixFailureCountRow,
    BitrixFailureGroupStat,
    BitrixFailureKindView,
    BitrixFailureRowView,
    BitrixFailureSummary,
} from './bitrix-failures.types';

/** Сколько групп (приложений, операций) показывать в сводке. */
const SUMMARY_GROUPS_MAX = 20;

const isKind = (value: string): value is BitrixFailureKindView =>
    (BITRIX_FAILURE_KINDS as readonly string[]).includes(value);

/** 0 из ClickHouse (поля нет) — «не известно». */
const positiveOrNull = (value: unknown): number | null => num(value) || null;

/** Строка ClickHouse → строка журнала сбоев. */
export function toBitrixFailureRow(row: LogRawRow): BitrixFailureRowView {
    const kind = str(row.kind);
    const targetLabel = str(row.targetLabel);
    const targetId = str(row.targetId);
    return {
        at: str(row.at),
        app: str(row.app),
        domain: str(row.domain),
        // Пишет только libs/bitrix — незнакомый вид считаем одиночным вызовом.
        kind: isKind(kind) ? kind : 'call',
        method: str(row.method),
        write: num(row.write) === 1 || row.write === true,
        commands: str(row.commands),
        commandsTotal: num(row.commandsTotal),
        target: targetId ? `${targetLabel} ${targetId}`.trim() : '',
        status: positiveOrNull(row.status),
        error: str(row.error),
        operation: str(row.operation),
        source: str(row.source),
        entityType: str(row.entityType),
        entityId: str(row.entityId),
        actorId: positiveOrNull(row.actorId),
        actorName: str(row.actorName),
    };
}

export function toBitrixFailureCount(row: LogRawRow): BitrixFailureCountRow {
    return {
        app: str(row.app),
        operation: str(row.operation),
        writes: num(row.writes),
        reads: num(row.reads),
    };
}

/** Свёртка счёта по ключу: больше сбоев записи — выше. */
function groupBy(
    counts: BitrixFailureCountRow[],
    key: (row: BitrixFailureCountRow) => string,
): BitrixFailureGroupStat[] {
    const groups = new Map<string, BitrixFailureGroupStat>();
    for (const row of counts) {
        const name = key(row);
        const group = groups.get(name) ?? {
            name,
            writes: 0,
            reads: 0,
            total: 0,
        };
        group.writes += row.writes;
        group.reads += row.reads;
        group.total += row.writes + row.reads;
        groups.set(name, group);
    }
    return [...groups.values()]
        .sort((a, b) => b.writes - a.writes || b.total - a.total)
        .slice(0, SUMMARY_GROUPS_MAX);
}

/** Сводка за окно: всего, запись / чтение, по приложениям и операциям. */
export function buildBitrixFailureSummary(
    counts: BitrixFailureCountRow[],
    hours: number,
    now: Date,
): BitrixFailureSummary {
    const writes = counts.reduce((sum, row) => sum + row.writes, 0);
    const reads = counts.reduce((sum, row) => sum + row.reads, 0);
    return {
        hours,
        from: new Date(now.getTime() - hours * 3_600_000).toISOString(),
        to: now.toISOString(),
        total: writes + reads,
        writes,
        reads,
        apps: groupBy(counts, row => row.app),
        operations: groupBy(counts, row => row.operation),
    };
}
