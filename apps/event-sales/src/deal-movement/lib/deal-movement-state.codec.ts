import {
    DEAL_MOVEMENT_REASONS,
    DEAL_MOVEMENT_STATUSES,
    type DealMovementReason,
    type DealMovementStateEntry,
    type DealMovementStatus,
} from '@lib/sales-ai-analytics';

/**
 * Запись состояния сделки ↔ значение поля Redis-хеша. Значение — JSON
 * записи; разбор строгий: чужая или битая запись не роняет счёт, а
 * пропускается — сделка получит базовую линию заново.
 */

const isStatus = (value: unknown): value is DealMovementStatus =>
    (DEAL_MOVEMENT_STATUSES as readonly unknown[]).includes(value);

const isReason = (value: unknown): value is DealMovementReason =>
    (DEAL_MOVEMENT_REASONS as readonly unknown[]).includes(value);

const stringOrNull = (value: unknown): string | null =>
    typeof value === 'string' ? value : null;

const numberOrNull = (value: unknown): number | null =>
    typeof value === 'number' && Number.isFinite(value) ? value : null;

export const encodeDealMovementEntry = (
    entry: DealMovementStateEntry,
): string => JSON.stringify(entry);

export function decodeDealMovementEntry(
    raw: string,
): DealMovementStateEntry | null {
    let value: unknown;
    try {
        value = JSON.parse(raw);
    } catch {
        return null;
    }
    if (typeof value !== 'object' || value === null) return null;
    const record = value as Record<string, unknown>;
    if (
        !isStatus(record.status) ||
        !isStatus(record.notifiedStatus) ||
        typeof record.checkedAt !== 'string'
    ) {
        return null;
    }
    return {
        status: record.status,
        notifiedStatus: record.notifiedStatus,
        reasons: Array.isArray(record.reasons)
            ? record.reasons.filter(isReason)
            : [],
        stageCode: stringOrNull(record.stageCode),
        amount: numberOrNull(record.amount),
        assignedById: numberOrNull(record.assignedById),
        lastActivityAt: stringOrNull(record.lastActivityAt),
        changedAt: stringOrNull(record.changedAt),
        notifiedAt: stringOrNull(record.notifiedAt),
        checkedAt: record.checkedAt,
    };
}
