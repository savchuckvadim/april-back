/**
 * Календарные помощники аудита: ключи месяца/даты в часовом поясе портала
 * и окно последних N календарных месяцев. Только чистые функции.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

function datePartsOf(
    date: Date,
    timeZone: string,
    options: Intl.DateTimeFormatOptions,
): Record<string, string> {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        ...options,
    }).formatToParts(date);
    return Object.fromEntries(parts.map(part => [part.type, part.value]));
}

/** Месяц YYYY-MM в часовом поясе. */
export function monthKeyOf(date: Date, timeZone: string): string {
    const parts = datePartsOf(date, timeZone, {
        year: 'numeric',
        month: '2-digit',
    });
    return `${parts.year}-${parts.month}`;
}

/** Дата YYYY-MM-DD в часовом поясе (для имени файла и заголовка). */
export function dateKeyOf(date: Date, timeZone: string): string {
    const parts = datePartsOf(date, timeZone, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    });
    return `${parts.year}-${parts.month}-${parts.day}`;
}

function parseMonthKey(monthKey: string): { year: number; month: number } {
    const [year, month] = monthKey.split('-').map(Number);
    return { year, month };
}

function formatMonthKey(utcDate: Date): string {
    const month = String(utcDate.getUTCMonth() + 1).padStart(2, '0');
    return `${utcDate.getUTCFullYear()}-${month}`;
}

/** Последние `months` календарных месяцев по возрастанию, текущий включительно. */
export function monthWindow(
    now: Date,
    months: number,
    timeZone: string,
): string[] {
    const { year, month } = parseMonthKey(monthKeyOf(now, timeZone));
    const keys: string[] = [];
    for (let offset = months - 1; offset >= 0; offset -= 1) {
        keys.push(
            formatMonthKey(new Date(Date.UTC(year, month - 1 - offset, 1))),
        );
    }
    return keys;
}

/**
 * Нижняя граница выборки из БД: начало первого месяца окна (UTC) минус
 * сутки — запас на разницу часовых поясов, точный отбор идёт по ключу месяца.
 */
export function windowLowerBound(firstMonth: string): Date {
    const { year, month } = parseMonthKey(firstMonth);
    return new Date(Date.UTC(year, month - 1, 1) - DAY_MS);
}
