/**
 * Разбор «записи словаря» в тексте разбора чек-листа: модель иногда кладёт в
 * текстовое поле не строки, а словарь — JSON ({"client": "…"}) или запись в
 * духе Python ({'client': '…', 'company': None}). Здесь — только разбор на
 * пары «ключ → значение»; подписи и порядок — checklist-text.normalize.
 * Чистые функции, исключений не бросают.
 */

/** Пара «ключ → значение» из записи; значение — как пришло. */
export type ChecklistRecordEntry = readonly [key: string, value: unknown];

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/** Пары записи-объекта (уже разобранного JSON или объекта из базы). */
export function recordEntriesOf(value: unknown): ChecklistRecordEntry[] | null {
    return isPlainRecord(value) ? Object.entries(value) : null;
}

/** Обычный JSON-объект; не JSON или не объект — null. */
function parseJsonRecord(text: string): ChecklistRecordEntry[] | null {
    try {
        return recordEntriesOf(JSON.parse(text) as unknown);
    } catch {
        return null;
    }
}

/**
 * Перед запятой стоит конец значения (кавычка, скобка, None/null, число) —
 * значит, за запятой начинается следующий ключ, а не продолжение текста.
 */
const VALUE_END = /(['"\]}]|\bNone|\bnull|\bTrue|\bFalse|\btrue|\bfalse|\d)$/u;

/** Строка без внешних кавычек и с раскрытыми экранированиями (\' \" \n). */
function unquote(raw: string): string {
    let value = raw;
    const quote = value.charAt(0);
    if (quote === "'" || quote === '"') {
        value = value.slice(1);
        if (value.endsWith(quote)) value = value.slice(0, -1);
    }
    return value.replace(/\\[nrt]/gu, ' ').replace(/\\(['"\\])/gu, '$1');
}

/** Значение записи в духе Python: None/null, True/False, список, строка. */
function decodeLooseValue(raw: string): unknown {
    if (/^(None|null)$/u.test(raw)) return null;
    if (/^(True|true)$/u.test(raw)) return true;
    if (/^(False|false)$/u.test(raw)) return false;
    if (raw.startsWith('[') && raw.endsWith(']')) {
        const inner = raw.slice(1, -1).trim();
        if (!inner) return [];
        return inner
            .split(/(?<=['"])\s*,\s*(?=['"])/u)
            .map(item => unquote(item.trim()));
    }
    return unquote(raw);
}

/**
 * Запись в духе Python: ключи в одинарных (или двойных) кавычках, значения —
 * строки с любыми апострофами внутри, None, списки строк. Границы пар ищутся
 * по шаблону «, 'ключ':» с той же кавычкой, что у первого ключа, и только
 * если перед запятой закончилось значение.
 */
function parseLooseRecord(text: string): ChecklistRecordEntry[] | null {
    const body = text.slice(1, -1);
    const first = /^\s*(['"]?)([\p{L}_][\p{L}\p{N}_]*)\1\s*:/u.exec(body);
    if (!first) return null;
    const quote = first[1];
    const keyPattern = new RegExp(
        `,\\s*${quote}([\\p{L}_][\\p{L}\\p{N}_]*)${quote}\\s*:`,
        'gu',
    );
    const entries: ChecklistRecordEntry[] = [];
    let key = first[2];
    let valueStart = first[0].length;
    for (const match of body.matchAll(keyPattern)) {
        const index = match.index ?? 0;
        if (index < valueStart) continue;
        const value = body.slice(valueStart, index).trim();
        if (!VALUE_END.test(value)) continue;
        entries.push([key, decodeLooseValue(value)]);
        key = match[1];
        valueStart = index + match[0].length;
    }
    entries.push([key, decodeLooseValue(body.slice(valueStart).trim())]);
    return entries;
}

/**
 * Пары записи из строки; строка не похожа на запись (не в фигурных скобках,
 * без «ключ:» в начале) — null.
 */
export function parseChecklistRecord(
    text: string,
): ChecklistRecordEntry[] | null {
    if (!text.startsWith('{') || !text.endsWith('}')) return null;
    return parseJsonRecord(text) ?? parseLooseRecord(text);
}
