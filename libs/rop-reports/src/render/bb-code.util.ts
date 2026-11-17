/**
 * BB-код описаний задач-отчётов (`DESCRIPTION_IN_BBCODE: 'Y'`): защита
 * текста извне, ссылки, жирный, таблицы. Обобщение помощников описания
 * задачи отчёта по дублям.
 *
 * Различаем ТЕКСТ (имя, название клиента, цитата — пришло извне и может
 * содержать квадратные скобки) и ФРАГМЕНТ BB-кода (уже собранная
 * разметка). Текст защищается `bbSafe` / `bbClip` (подпись ссылки —
 * внутри `bbLink`), фрагменты передаются как есть. Задача ставится прямым вызовом
 * `tasks.task.add`, не batch-командой: переносы — обычные `\n`.
 */

/** Текст извне внутри BB-кода: скобки ломают разметку, пробелы — в один. */
export const bbSafe = (text: string): string =>
    String(text ?? '')
        .replace(/\[/g, '(')
        .replace(/\]/g, ')')
        .replace(/\s+/g, ' ')
        .trim();

/** Защищённый текст не длиннее `max` символов; обрезанный — с «…». */
export const bbClip = (text: string, max: number): string => {
    const value = bbSafe(text);
    return value.length > max ? `${value.slice(0, max - 1).trim()}…` : value;
};

/** Ссылка с защищённой подписью. */
export const bbLink = (url: string, text: string): string =>
    `[URL=${url}]${bbSafe(text)}[/URL]`;

/** Жирный фрагмент (содержимое — уже BB-код или защищённый текст). */
export const bbBold = (fragment: string): string => `[B]${fragment}[/B]`;

/** Строка таблицы из фрагментов; в шапке ячейки жирные. */
export const bbRow = (cells: readonly string[], header = false): string =>
    `[TR]${cells
        .map(cell => `[TD]${header ? bbBold(cell) : cell}[/TD]`)
        .join('')}[/TR]`;

/** Таблица: шапка и строки фрагментов, по строке разметки на строку. */
export const bbTable = (
    header: readonly string[],
    rows: readonly (readonly string[])[],
): string =>
    [
        '[TABLE]',
        bbRow(header, true),
        ...rows.map(cells => bbRow(cells)),
        '[/TABLE]',
    ].join('\n');
