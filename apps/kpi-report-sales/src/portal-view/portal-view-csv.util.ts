/**
 * Списки-строки настроек вида отчёта («a,b,c»): общие для вкладок,
 * бейджей и скрытых колонок планов. Отдельный файл, чтобы разбор новых
 * полей (portal-view-labels.util) не зависел от portal-view.util и не
 * замыкал импорты по кругу.
 */

/** Список без повторов, порядок первого появления сохраняется. */
export function uniqueList<T>(items: readonly T[]): T[] {
    return [...new Set(items)];
}

/**
 * Список из строки через запятую: пробелы по краям и пустые элементы
 * отбрасываются, повторы схлопываются. Не строка (чужой тип в настройке) —
 * пустой список.
 */
export function parseCsvList(raw: unknown): string[] {
    if (typeof raw !== 'string') return [];
    return uniqueList(
        raw
            .split(',')
            .map(item => item.trim())
            .filter(item => item !== ''),
    );
}

/** Список → строка через запятую (как хранится в настройке). */
export function joinCsvList(items: readonly string[]): string {
    return items.join(',');
}
