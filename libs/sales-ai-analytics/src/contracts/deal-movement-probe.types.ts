/**
 * Движение сделок: проверка записи в ленту на одной сделке (решение
 * 17.11.2026). Админка ставит джобу в очередь event-sales, воркер пишет в
 * сделку служебную запись журнала и комментарий и смотрит, сдвигают ли они
 * «последнюю активность» сделки; итог — в Redis. Пишет в живой портал —
 * запускается только руками, автоматического вызова нет. Чистые типы.
 */

/** Данные джобы проверки (очередь EVENT_SALES_DEAL_MOVEMENT_RUN). */
export interface DealMovementProbeJobData {
    domain: string;
    dealId: number;
    requestedBy: string;
}

/** Одна проверка на портал: пока она ждёт или идёт, вторая не ставится. */
export const dealMovementProbeJobId = (domain: string): string =>
    `${domain}:deal-movement:probe`;

/** Без повторов: повтор написал бы в сделку ещё две записи. */
export const DEAL_MOVEMENT_PROBE_JOB_OPTIONS = {
    attempts: 1,
    removeOnComplete: true,
    removeOnFail: true,
} as const;

/** Текст обеих проверочных записей. */
export const DEAL_MOVEMENT_PROBE_NOTE_TEXT =
    'Проверка записи в ленту — служебная, можно удалить';

/** Чем закончилась проверка. */
export const DEAL_MOVEMENT_PROBE_PHASES = [
    'running',
    'done',
    'refused',
    'failed',
] as const;
export type DealMovementProbePhase =
    (typeof DEAL_MOVEMENT_PROBE_PHASES)[number];

/** «Последняя активность» сделки до и после каждой записи, ISO. */
export interface DealMovementProbeMoments {
    before: string | null;
    afterLogMessage: string | null;
    afterComment: string | null;
    /** Когда ушла служебная запись (наши часы). */
    logMessageAt: string | null;
    /** Когда ушёл комментарий (наши часы). */
    commentAt: string | null;
}

export interface DealMovementProbeResult {
    domain: string;
    dealId: number;
    phase: DealMovementProbePhase;
    startedAt: string;
    finishedAt: string | null;
    moments: DealMovementProbeMoments;
    /** Сдвигает ли служебная запись последнюю активность; null — не дошли. */
    logMessageShifts: boolean | null;
    /** Сдвигает ли комментарий последнюю активность; null — не дошли. */
    commentShifts: boolean | null;
    /** Выводы словами, по-русски. */
    conclusions: string[];
    /** Отказ или сбой словами; null — проверка прошла. */
    error: string | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/** Структурная проверка итога при чтении из Redis. */
export function isDealMovementProbeResult(
    value: unknown,
): value is DealMovementProbeResult {
    return (
        isRecord(value) &&
        typeof value.domain === 'string' &&
        typeof value.dealId === 'number' &&
        (DEAL_MOVEMENT_PROBE_PHASES as readonly unknown[]).includes(
            value.phase,
        ) &&
        typeof value.startedAt === 'string' &&
        isRecord(value.moments) &&
        Array.isArray(value.conclusions)
    );
}
