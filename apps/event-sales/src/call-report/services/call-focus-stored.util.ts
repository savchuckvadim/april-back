import type { CallFocusKey } from '../contracts/call-focus-analysis.contract';

/**
 * Сохранённые ответы проходов неполного разбора (16.11.2026).
 *
 * Разбор — три фокус-прохода, проход методики и синтез. Когда один проход
 * сорвался, разбор пишется неполным, а догон раньше переделывал его целиком:
 * пять вызовов модели ради одного недостающего. Теперь неполный разбор
 * уносит с собой сырые ответы выживших проходов (`extra.focusPasses`), и
 * догон зовёт только недостающий проход и синтез — два вызова вместо пяти.
 *
 * Ответы годятся, только пока не сменился промпт разбора; ответ прохода
 * методики — пока у портала та же методика той же версии. Полный разбор
 * сохранённых проходов не несёт. Чистые функции без DI.
 */

/** Ключ внутри `extra` записи разбора. */
export const STORED_FOCUS_PASSES_KEY = 'focusPasses';

/** Сырой ответ одного прохода — объект по его схеме. */
export type FocusPassResult = Record<string, unknown>;

export interface StoredFocusPasses {
    /** Версия промпта разбора, которой получены ответы. */
    promptVersion: string;
    /** Ответы выживших фокус-проходов. */
    passes: Partial<Record<CallFocusKey, FocusPassResult>>;
    /** Ответ прохода методики и метка методики (`код@версия`), которой он получен. */
    methodology?: { tag: string; result: FocusPassResult };
}

const FOCUS_KEYS: readonly CallFocusKey[] = ['form', 'content', 'movement'];

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/** Что сохранить у неполного разбора: только то, что реально есть. */
export function buildStoredFocusPasses(
    byKey: Readonly<Record<CallFocusKey, FocusPassResult | null>>,
    methodology: { tag: string; result: FocusPassResult } | null,
    promptVersion: string,
): StoredFocusPasses {
    const passes: Partial<Record<CallFocusKey, FocusPassResult>> = {};
    for (const key of FOCUS_KEYS) {
        const result = byKey[key];
        if (result) passes[key] = result;
    }
    return {
        promptVersion,
        passes,
        ...(methodology ? { methodology } : {}),
    };
}

/**
 * Сохранённые проходы из `user_result` записи разбора; их нет или запись
 * кривая — null. `extra` — открытое поле записи, поэтому форма проверяется.
 */
export function parseStoredFocusPasses(
    userResult: unknown,
): StoredFocusPasses | null {
    if (!isRecord(userResult) || !isRecord(userResult.extra)) return null;
    const raw = userResult.extra[STORED_FOCUS_PASSES_KEY];
    if (!isRecord(raw) || typeof raw.promptVersion !== 'string') return null;
    if (!isRecord(raw.passes)) return null;
    const passes: Partial<Record<CallFocusKey, FocusPassResult>> = {};
    for (const key of FOCUS_KEYS) {
        const result = raw.passes[key];
        if (isRecord(result)) passes[key] = result;
    }
    const methodology =
        isRecord(raw.methodology) &&
        typeof raw.methodology.tag === 'string' &&
        isRecord(raw.methodology.result)
            ? { tag: raw.methodology.tag, result: raw.methodology.result }
            : undefined;
    if (Object.keys(passes).length === 0 && !methodology) return null;
    return {
        promptVersion: raw.promptVersion,
        passes,
        ...(methodology ? { methodology } : {}),
    };
}

/**
 * Годятся ли сохранённые проходы для догона: получены текущим промптом.
 * Сменился промпт — разбор переделывается целиком.
 */
export function usableStoredFocusPasses(
    stored: StoredFocusPasses | null,
    promptVersion: string,
): stored is StoredFocusPasses {
    return stored !== null && stored.promptVersion === promptVersion;
}

/** Сколько проходов сохранено — понять, прибавилось ли после попытки. */
export function storedFocusPassCount(stored: StoredFocusPasses | null): number {
    if (!stored) return 0;
    return Object.keys(stored.passes).length + (stored.methodology ? 1 : 0);
}

/** `user_result` с сохранёнными проходами (остальной `extra` не трогается). */
export function withFocusPasses(
    userResult: unknown,
    stored: StoredFocusPasses,
): Record<string, unknown> {
    const base = isRecord(userResult) ? userResult : {};
    const extra = isRecord(base.extra) ? base.extra : {};
    return {
        ...base,
        extra: { ...extra, [STORED_FOCUS_PASSES_KEY]: stored },
    };
}

/**
 * `user_result` без сохранённых проходов — для записи, которую заменил
 * полный разбор: хранить их дальше незачем. Пустой `extra` убирается.
 */
export function withoutFocusPasses(userResult: unknown): unknown {
    if (!isRecord(userResult) || !isRecord(userResult.extra)) return userResult;
    if (!(STORED_FOCUS_PASSES_KEY in userResult.extra)) return userResult;
    const without = (source: Record<string, unknown>, dropped: string) =>
        Object.fromEntries(
            Object.entries(source).filter(([key]) => key !== dropped),
        );
    const restExtra = without(userResult.extra, STORED_FOCUS_PASSES_KEY);
    const rest = without(userResult, 'extra');
    return Object.keys(restExtra).length > 0
        ? { ...rest, extra: restExtra }
        : rest;
}
