/**
 * Операции sales-хуков из app-cache (`event-sales-hooks`, group
 * `operation`): статус живёт час, поэтому мониторинг — это «что
 * происходило за последний час-два», а не архив.
 */
export type HookOperationStatus = 'queued' | 'running' | 'done' | 'failed';

export interface HookOperationView {
    operationId: string;
    hook: string;
    domain: string;
    source: string;
    status: HookOperationStatus;
    itemsCount: number;
    queuedAt: string;
    startedAt: string | null;
    finishedAt: string | null;
    error: string | null;
    /** Число предупреждений в результате (`result.warnings`), если хук их отдаёт. */
    warningsCount: number | null;
    /** Короткая выжимка результата для таблицы. */
    resultSummary: string | null;
    /** Когда запись обновлялась в кэше (время бэка). */
    updatedAt: string | null;
}

export interface HookOperationsByHook {
    hook: string;
    total: number;
    failed: number;
    running: number;
    lastAt: string | null;
}

export interface HookOperationsSummary {
    total: number;
    queued: number;
    running: number;
    done: number;
    failed: number;
    byHook: HookOperationsByHook[];
    lastActivityAt: string | null;
}

const STATUSES: readonly HookOperationStatus[] = [
    'queued',
    'running',
    'done',
    'failed',
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const str = (value: unknown): string | null =>
    typeof value === 'string' ? value : null;

/**
 * Разбор JSON операции из app-cache в типизированную строку таблицы.
 * Повреждённая запись (нет operationId/hook) пропускается — null.
 */
export function parseHookOperation(
    data: unknown,
    updatedAt: Date | null,
): HookOperationView | null {
    if (!isRecord(data)) return null;
    const operationId = str(data.operationId);
    const hook = str(data.hook);
    const status = str(data.status);
    if (!operationId || !hook || !status) return null;
    if (!STATUSES.includes(status as HookOperationStatus)) return null;

    const result = data.result;
    let warningsCount: number | null = null;
    if (isRecord(result) && Array.isArray(result.warnings)) {
        warningsCount = result.warnings.length;
    }

    return {
        operationId,
        hook,
        domain: str(data.domain) ?? '',
        source: str(data.source) ?? '',
        status: status as HookOperationStatus,
        itemsCount: typeof data.itemsCount === 'number' ? data.itemsCount : 0,
        queuedAt: str(data.queuedAt) ?? '',
        startedAt: str(data.startedAt),
        finishedAt: str(data.finishedAt),
        error: str(data.error),
        warningsCount,
        resultSummary: summarizeResult(result),
        updatedAt: updatedAt ? updatedAt.toISOString() : null,
    };
}

/** Короткая строка по результату: ключи верхнего уровня со скалярами и размерами массивов. */
export function summarizeResult(result: unknown): string | null {
    if (!isRecord(result)) return null;
    const parts: string[] = [];
    for (const [key, value] of Object.entries(result)) {
        if (key === 'warnings') continue;
        if (Array.isArray(value)) parts.push(`${key}: ${value.length}`);
        else if (
            typeof value === 'number' ||
            typeof value === 'boolean' ||
            (typeof value === 'string' && value.length <= 40)
        ) {
            parts.push(`${key}: ${String(value)}`);
        }
        if (parts.length >= 6) break;
    }
    return parts.length ? parts.join(' · ') : null;
}

/** Сводка по списку операций (уже отфильтрованному по порталу/хуку). */
export function summarizeOperations(
    operations: readonly HookOperationView[],
): HookOperationsSummary {
    const byHook = new Map<string, HookOperationsByHook>();
    const counts = { queued: 0, running: 0, done: 0, failed: 0 };
    let lastActivityAt: string | null = null;

    for (const op of operations) {
        counts[op.status] += 1;
        const item = byHook.get(op.hook) ?? {
            hook: op.hook,
            total: 0,
            failed: 0,
            running: 0,
            lastAt: null,
        };
        item.total += 1;
        if (op.status === 'failed') item.failed += 1;
        if (op.status === 'running' || op.status === 'queued')
            item.running += 1;
        const at = op.finishedAt ?? op.startedAt ?? op.queuedAt ?? null;
        if (at && (!item.lastAt || at > item.lastAt)) item.lastAt = at;
        if (at && (!lastActivityAt || at > lastActivityAt)) lastActivityAt = at;
        byHook.set(op.hook, item);
    }

    return {
        total: operations.length,
        ...counts,
        byHook: [...byHook.values()].sort((a, b) =>
            a.hook.localeCompare(b.hook),
        ),
        lastActivityAt,
    };
}
