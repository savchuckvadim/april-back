/**
 * Чтение дневного снимка движения сделок любой формы: витрина получает
 * одинаковый вид и у старых снимков (форма 1 — без сумм, разреза по
 * ответственным и проверок продвижения: там пусто, без падения), и у
 * новых. Чужие и битые элементы молча отбрасываются. Чистые функции.
 */
import {
    DEAL_MOVEMENT_PROGRESS_OUTCOMES,
    type DealMovementProgressCheck,
} from '../model/deal-movement/deal-movement.progress-check';
import {
    DEAL_MOVEMENT_STATUSES,
    type DealMovementStatus,
} from '../model/deal-movement/deal-movement.types';
import { normalizeDealMovementCounts } from './deal-movement-run.types';
import {
    isDealMovementSnapshotPayload,
    type DealMovementStatusSum,
    type DealMovementStatusSums,
} from './deal-movement-snapshot.types';

/** Снимок дня в объёме витрины (сериализуем — витрина держит его в кэше). */
export interface DealMovementSnapshotView {
    /** День портала 'YYYY-MM-DD'. */
    day: string;
    generatedAt: string | null;
    /** Форма снимка: 1 — до 20.11.2026, 2 — с суммами и разрезом. */
    form: number;
    openTotal: number;
    evaluated: number;
    /** Счёт по статусам — есть у любой формы. */
    byStatus: Record<DealMovementStatus, number>;
    /** Счёт и сумма по статусам; null — форма 1. */
    totals: DealMovementStatusSums | null;
    /** Ответственный → счёт и сумма; null — форма 1 (разреза нет). */
    byManager: Record<string, DealMovementStatusSums> | null;
    /** Отметки проверки продвижения; у формы 1 — пусто. */
    progressChecks: DealMovementProgressCheck[];
    /** За сколько дней ждали переход стадии; null — форма 1. */
    progressCheckDays: number | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const finiteOr = (value: unknown, fallback: number): number =>
    typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const sumOf = (value: unknown): DealMovementStatusSum => ({
    count: isRecord(value) ? finiteOr(value.count, 0) : 0,
    amountSum: isRecord(value) ? finiteOr(value.amountSum, 0) : 0,
});

/** Пустые счёт и сумма по всем статусам. */
export const emptyDealMovementStatusSums = (): DealMovementStatusSums =>
    Object.fromEntries(
        DEAL_MOVEMENT_STATUSES.map(status => [
            status,
            { count: 0, amountSum: 0 },
        ]),
    ) as DealMovementStatusSums;

/** Счёт и сумма по статусам из ais: нет статуса — нули; не объект — null. */
export function readDealMovementStatusSums(
    value: unknown,
): DealMovementStatusSums | null {
    if (!isRecord(value)) return null;
    return Object.fromEntries(
        DEAL_MOVEMENT_STATUSES.map(status => [status, sumOf(value[status])]),
    ) as DealMovementStatusSums;
}

function readByManager(
    value: Record<string, unknown>,
): Record<string, DealMovementStatusSums> {
    const result: Record<string, DealMovementStatusSums> = {};
    for (const [managerId, sums] of Object.entries(value)) {
        const read = readDealMovementStatusSums(sums);
        if (read !== null) result[managerId] = read;
    }
    return result;
}

const isProgressCheck = (value: unknown): value is DealMovementProgressCheck =>
    isRecord(value) &&
    typeof value.transcriptionId === 'string' &&
    typeof value.dealId === 'string' &&
    typeof value.at === 'string' &&
    typeof value.progress === 'number' &&
    (DEAL_MOVEMENT_PROGRESS_OUTCOMES as readonly unknown[]).includes(
        value.outcome,
    );

/** Нагрузка записи ais → вид снимка; не снимок движения сделок — null. */
export function readDealMovementSnapshot(
    value: unknown,
): DealMovementSnapshotView | null {
    if (!isDealMovementSnapshotPayload(value)) return null;
    const raw = value as unknown as Record<string, unknown>;
    const form = finiteOr(raw.form, 1);
    const totals = readDealMovementStatusSums(raw.totals);
    return {
        day: value.day,
        generatedAt:
            typeof value.generatedAt === 'string' ? value.generatedAt : null,
        form,
        openTotal: value.openTotal,
        evaluated: value.evaluated,
        byStatus: normalizeDealMovementCounts(value.byStatus),
        totals,
        byManager: isRecord(raw.byManager)
            ? readByManager(raw.byManager)
            : null,
        progressChecks: Array.isArray(raw.progressChecks)
            ? raw.progressChecks.filter(isProgressCheck)
            : [],
        progressCheckDays:
            typeof raw.progressCheckDays === 'number' &&
            raw.progressCheckDays > 0
                ? raw.progressCheckDays
                : null,
    };
}
