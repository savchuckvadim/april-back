/**
 * Суперпользователь вендора (сотрудник April) — единый источник правды
 * вместо угадывания на фронте по фамилии. Задаётся env-переменной
 * `BX_SUPER_USER_IDS` в формате `domain:id[,domain:id...]`, например
 * `example.bitrix24.ru:123,other.bitrix24.ru:456`.
 *
 * Домены сравниваются без учёта регистра, id — целые > 0. Мусорные
 * записи не роняют разбор: они возвращаются в `invalid`, а сервис пишет
 * по ним один warn. Пустая переменная — суперпользователей нет.
 */

/** Имя env-переменной со списком суперпользователей. */
export const BX_SUPER_USER_IDS_ENV = 'BX_SUPER_USER_IDS' as const;

/** «домен в нижнем регистре → Bitrix-id суперпользователей портала». */
export type SuperUserMap = ReadonlyMap<string, ReadonlySet<number>>;

export interface SuperUserParseResult {
    map: SuperUserMap;
    /** Записи, не подошедшие под формат `domain:id` (как в исходной строке). */
    invalid: string[];
}

const ENTRY_SEPARATOR = ',';
const PAIR_SEPARATOR = ':';
const POSITIVE_INT = /^\d+$/;
const WHITESPACE = /\s/;

/** Ключ домена: без пробелов по краям и в нижнем регистре. */
const normalizeDomain = (domain: string): string => domain.trim().toLowerCase();

/** Одна запись `domain:id` → пара, иначе null. */
const parseEntry = (entry: string): [string, number] | null => {
    const parts = entry.split(PAIR_SEPARATOR);
    if (parts.length !== 2) return null;
    const domain = normalizeDomain(parts[0]);
    const rawId = parts[1].trim();
    if (!domain || WHITESPACE.test(domain) || !POSITIVE_INT.test(rawId)) {
        return null;
    }
    const id = Number(rawId);
    return Number.isSafeInteger(id) && id > 0 ? [domain, id] : null;
};

/** Разбор значения `BX_SUPER_USER_IDS` (чистая функция, без логов). */
export const parseSuperUserIds = (
    raw: string | null | undefined,
): SuperUserParseResult => {
    const map = new Map<string, Set<number>>();
    const invalid: string[] = [];
    const entries = (raw ?? '')
        .split(ENTRY_SEPARATOR)
        .map(entry => entry.trim())
        .filter(Boolean);
    for (const entry of entries) {
        const pair = parseEntry(entry);
        if (!pair) {
            invalid.push(entry);
            continue;
        }
        const [domain, id] = pair;
        const ids = map.get(domain) ?? new Set<number>();
        ids.add(id);
        map.set(domain, ids);
    }
    return { map, invalid };
};

/** Суперпользователь ли `userId` на портале `domain`; id ≤ 0 — никогда. */
export const isSuperUserId = (
    domain: string,
    userId: number,
    map: SuperUserMap,
): boolean => {
    if (!Number.isInteger(userId) || userId <= 0) return false;
    return map.get(normalizeDomain(domain ?? ''))?.has(userId) === true;
};
