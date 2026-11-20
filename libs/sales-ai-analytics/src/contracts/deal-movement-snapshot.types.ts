/**
 * Дневной снимок движения сделок в ais (тип `ai-analytics-deal-movement`,
 * зерно portal-day, ключ 'YYYY-MM-DD' по поясу портала). Маленький:
 * итог ночи и смены статуса словами, без состояния по сделкам — оно живёт
 * в Redis (решение 17.11.2026). Чистые типы и проверка формы.
 */
import type { DealMovementStatus } from '../model/deal-movement/deal-movement.types';
import type { DealMovementDigestSummary } from './deal-movement-digest.types';
import type { DealMovementNotesSummary } from './deal-movement-notes.types';
import {
    DEAL_MOVEMENT_RUN_MODES,
    isDealMovementCountsLike,
    type DealMovementRunMode,
} from './deal-movement-run.types';

/** Не больше стольких смен в снимке: остаток — числом `changesTotal`. */
export const DEAL_MOVEMENT_SNAPSHOT_CHANGES_LIMIT = 1000;

/** Смена статуса сделки за ночь — для витрины и разбора «что случилось». */
export interface DealMovementSnapshotChange {
    dealId: string;
    title: string;
    assignedById: number | null;
    amount: number | null;
    from: DealMovementStatus;
    to: DealMovementStatus;
    /** Причины нового статуса словами, по-русски. */
    reasons: string[];
    /**
     * Записана ли смена в ленту сделки этим прогоном. Нет у снимков до
     * второй волны (17.11.2026).
     */
    notified?: boolean;
}

export interface DealMovementSnapshotPayload {
    /** День портала 'YYYY-MM-DD'. */
    day: string;
    mode: DealMovementRunMode;
    calcVersion: string;
    generatedAt: string;
    openTotal: number;
    evaluated: number;
    /** Счёт шёл как базовая линия: прошлого состояния не было или устарело. */
    baseline: boolean;
    firstSeen: number;
    byStatus: Record<DealMovementStatus, number>;
    changes: DealMovementSnapshotChange[];
    /** Всего смен за ночь (в `changes` — не больше лимита). */
    changesTotal: number;
    /** Записи в ленту сделок за прогон; нет у снимков до второй волны. */
    notes?: DealMovementNotesSummary;
    /** Сводка руководителям за прогон; нет у снимков до части Б. */
    digest?: DealMovementDigestSummary;
    warnings: string[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/** Структурная проверка нагрузки снимка при чтении из ais. */
export function isDealMovementSnapshotPayload(
    value: unknown,
): value is DealMovementSnapshotPayload {
    if (!isRecord(value)) return false;
    return (
        typeof value.day === 'string' &&
        (DEAL_MOVEMENT_RUN_MODES as readonly unknown[]).includes(value.mode) &&
        typeof value.openTotal === 'number' &&
        typeof value.evaluated === 'number' &&
        typeof value.changesTotal === 'number' &&
        isDealMovementCountsLike(value.byStatus) &&
        Array.isArray(value.changes) &&
        Array.isArray(value.warnings)
    );
}
