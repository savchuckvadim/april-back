import { isRopPeriodKind, RopPeriodKind } from '../period/rop-period';

/**
 * Итог последнего прогона периода — в Redis для состояния в админке:
 * что выпущено, кому, сколько задач, с какими предупреждениями.
 */
export const ROP_RUN_STATUS = {
    /** Прогон дошёл до конца (отчёт посчитан, задачи — по режиму). */
    ran: 'ran',
    /** Прогон упал; причина — в `error`. */
    failed: 'failed',
} as const;

export type RopRunStatus = (typeof ROP_RUN_STATUS)[keyof typeof ROP_RUN_STATUS];

export interface RopRunSummary {
    readonly kind: RopPeriodKind;
    readonly periodKey: string;
    /** Момент прогона, ISO. */
    readonly at: string;
    readonly status: RopRunStatus;
    /** «Только считать»: задачи не ставились. */
    readonly countOnly: boolean;
    /** Проба одному сотруднику (ручной запуск). */
    readonly preview: boolean;
    readonly recipients: number;
    readonly tasksCreated: number;
    readonly tasksAlreadyDone: number;
    readonly tasksClosed: number;
    /** Строки итога отчёта для людей. */
    readonly summary: readonly string[];
    readonly warnings: readonly string[];
    readonly error: string | null;
}

/** Сколько предупреждений хранить в итоге. */
export const ROP_RUN_SUMMARY_MAX_WARNINGS = 10;

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const isCount = (value: unknown): value is number =>
    typeof value === 'number' && Number.isInteger(value) && value >= 0;

const isStrings = (value: unknown): value is string[] =>
    Array.isArray(value) && value.every(item => typeof item === 'string');

const isStatus = (value: unknown): value is RopRunStatus =>
    value === ROP_RUN_STATUS.ran || value === ROP_RUN_STATUS.failed;

/** Строка из Redis → итог; чужая или битая форма — null. */
export function parseRopRunSummary(raw: string | null): RopRunSummary | null {
    if (!raw) return null;
    let value: unknown;
    try {
        value = JSON.parse(raw);
    } catch {
        return null;
    }
    if (!isRecord(value)) return null;
    const {
        kind,
        periodKey,
        at,
        status,
        countOnly,
        preview,
        recipients,
        tasksCreated,
        tasksAlreadyDone,
        tasksClosed,
        summary,
        warnings,
        error,
    } = value;
    if (
        !isRopPeriodKind(kind) ||
        typeof periodKey !== 'string' ||
        typeof at !== 'string' ||
        !isStatus(status) ||
        typeof countOnly !== 'boolean' ||
        typeof preview !== 'boolean' ||
        !isCount(recipients) ||
        !isCount(tasksCreated) ||
        !isCount(tasksAlreadyDone) ||
        !isCount(tasksClosed) ||
        !isStrings(summary) ||
        !isStrings(warnings) ||
        !(error === null || typeof error === 'string')
    ) {
        return null;
    }
    return {
        kind,
        periodKey,
        at,
        status,
        countOnly,
        preview,
        recipients,
        tasksCreated,
        tasksAlreadyDone,
        tasksClosed,
        summary,
        warnings,
        error,
    };
}
