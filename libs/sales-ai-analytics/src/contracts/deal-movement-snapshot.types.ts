/**
 * Дневной снимок движения сделок в ais (тип `ai-analytics-deal-movement`,
 * зерно portal-day, ключ 'YYYY-MM-DD' по поясу портала). Маленький:
 * итог ночи и смены статуса словами, без состояния по сделкам — оно живёт
 * в Redis (решение 17.11.2026). Чистые типы и проверка формы.
 *
 * Форма 2 (20.11.2026, витрина «Движение сделок»): суммы по статусам,
 * разрез по ответственным и отметки проверки продвижения звонков. Список
 * проблемных сделок — отдельной записью (`deal-movement-deals.types.ts`):
 * снимки дня витрина читает за весь период, а список — только последний.
 */
import type { DealMovementProgressCheck } from '../model/deal-movement/deal-movement.progress-check';
import type { DealMovementStatus } from '../model/deal-movement/deal-movement.types';
import type { DealMovementDigestSummary } from './deal-movement-digest.types';
import type { DealMovementNotesSummary } from './deal-movement-notes.types';
import {
    DEAL_MOVEMENT_RUN_MODES,
    isDealMovementCountsLike,
    type DealMovementRunMode,
} from './deal-movement-run.types';

/**
 * Форма снимка: 2 — с суммами, разрезом по ответственным и проверками
 * продвижения (20.11.2026). У снимков формы 1 поля `form` нет.
 */
export const DEAL_MOVEMENT_SNAPSHOT_FORM = 2;

/** Сколько сделок в статусе и на какую сумму (сделка без суммы — 0). */
export interface DealMovementStatusSum {
    count: number;
    amountSum: number;
}

/** Счёт и сумма по каждому статусу. */
export type DealMovementStatusSums = Record<
    DealMovementStatus,
    DealMovementStatusSum
>;

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
    /** Форма снимка; нет — форма 1 (до 20.11.2026). */
    form?: number;
    /** Счёт и сумма по статусам всех оценённых сделок; нет у формы 1. */
    totals?: DealMovementStatusSums;
    /**
     * Ответственный (Bitrix-id строкой) → счёт и сумма по статусам. Сделки
     * без ответственного — только в `totals`. Нет у формы 1.
     */
    byManager?: Record<string, DealMovementStatusSums>;
    /**
     * Проверка продвижения: звонки с продвижением 4–5 и окончательный итог
     * («стадия сдвинулась вперёд» / «не сдвинулась за N дней»). Нет у
     * формы 1.
     */
    progressChecks?: DealMovementProgressCheck[];
    /** За сколько дней после звонка ждали переход стадии; нет у формы 1. */
    progressCheckDays?: number;
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
