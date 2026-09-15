/**
 * Календарная арифметика жёстких счётчиков стиля: разница дат, перечень
 * дней периода и «рабочие минуты» между двумя моментами (документ
 * `ai/tasks/ai-analytics-manager-style.md`, §2.1 ось 7, `leadResponseMin`).
 *
 * Вынесено из `style-crm.units.ts` по лимиту 300 строк: счётчики осей и
 * работа с датами — разные ответственности, и даты нужны ещё и
 * загрузчику (перечень рабочих дней сегмента).
 *
 * Чистые функции: без DI, Bitrix и `new Date()` от текущего момента.
 */

const DAY_MS = 86_400_000;

/** Разница дат в календарных днях (b − a); нераспознанная дата → NaN. */
export function daysBetween(a: string, b: string): number {
    return (
        (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS
    );
}

/** Список дат от a до b включительно ('YYYY-MM-DD'); b < a → пусто. */
export function daysRange(a: string, b: string): string[] {
    const days: string[] = [];
    const start = Date.parse(`${a}T00:00:00Z`);
    const end = Date.parse(`${b}T00:00:00Z`);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
        return days;
    }
    for (let time = start; time <= end; time += DAY_MS) {
        days.push(new Date(time).toISOString().slice(0, 10));
    }
    return days;
}

/**
 * Рабочие минуты между двумя моментами: календарные минуты минус целые
 * нерабочие сутки между ними. Отрицательный интервал (звонок раньше
 * создания) и нераспознанные даты → null.
 *
 * ⚠ Рабочих ЧАСОВ портала в календаре нет, поэтому вечерний лид с
 * утренним звонком даёт завышенную задержку — открытый вопрос владельцу.
 */
export function workingMinutesBetween(
    fromIso: string,
    toIso: string,
    workdays: readonly string[],
): number | null {
    const from = Date.parse(fromIso);
    const to = Date.parse(toIso);
    if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) {
        return null;
    }
    const fromDay = fromIso.slice(0, 10);
    const toDay = toIso.slice(0, 10);
    const workdaySet = new Set(workdays);
    let nonWorking = 0;
    for (const day of daysRange(fromDay, toDay)) {
        // Крайние сутки считаются частично — их не вычитаем целиком.
        if (day === fromDay || day === toDay) continue;
        if (!workdaySet.has(day)) nonWorking += 1;
    }
    const minutes = (to - from) / 60_000 - nonWorking * 24 * 60;
    return Math.max(0, Math.round(minutes));
}
