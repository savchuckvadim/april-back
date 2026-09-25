/**
 * Исключение сотрудников из распределения по кругу (настройка портала
 * `lead_intake_round_robin_excluded_user_ids`). Чистые функции без I/O.
 */

/** «12, 34;56 7» → [12, 34, 56, 7]; мусор и нули отбрасываются. */
export function parseUserIds(raw: unknown): number[] {
    if (typeof raw !== 'string' && typeof raw !== 'number') return [];
    const ids = String(raw)
        .split(/[\s,;]+/)
        .map(Number)
        .filter(id => Number.isInteger(id) && id > 0);
    return [...new Set(ids)];
}

export interface IRoundRobinExclusion {
    candidates: number[];
    /** Кого реально убрали из круга. */
    removed: number[];
    /** Исключены все — оставили исходный список. */
    fellBack: boolean;
}

/**
 * Убирает исключённых из кандидатов круга.
 *
 * Исключили всех — возвращаем исходный список: заявка без ответственного
 * хуже, чем заявка исключённому (тот же принцип, что у отсева
 * руководителей). Вызывающий пишет об этом предупреждение.
 */
export function excludeFromRoundRobin(
    candidates: number[],
    excluded: number[],
): IRoundRobinExclusion {
    if (!excluded.length || !candidates.length) {
        return { candidates, removed: [], fellBack: false };
    }
    const skip = new Set(excluded);
    const kept = candidates.filter(id => !skip.has(id));
    const removed = candidates.filter(id => skip.has(id));
    if (!kept.length) return { candidates, removed: [], fellBack: true };
    return { candidates: kept, removed, fellBack: false };
}
