import {
    FIVE_K_TEXT_BLOCKS,
    HVOST_TEXT_BLOCKS,
    type ChecklistTextBlock,
} from './checklist-text-blocks.const';
import {
    parseChecklistRecord,
    recordEntriesOf,
    type ChecklistRecordEntry,
} from './checklist-text-record.util';

/**
 * Читаемый текст разбора чек-листа («5К», «Хвост»). Модель иногда кладёт в
 * текстовое поле запись словаря ({'client': 'Юрист;', 'company': None}) — в
 * карточку, ленту и на страницу звонка она уходила как есть. Здесь такая
 * запись превращается в строки по одной на блок в порядке анкеты:
 * «Клиент: …», «Компания: …»; пустое значение — «не выяснено», хвостовая «;»
 * снимается, незнакомые ключи — в конце как есть. Обычный текст (строки,
 * нумерованный список с ✓/✗) возвращается без изменений, только без
 * пробелов по краям. Исключений не бросает.
 */

/** Значение блока, о котором ничего не сказано. */
export const CHECKLIST_EMPTY_VALUE = 'не выяснено';

/** Текст значения одной строкой: пробелы схлопнуты, хвостовая «;» снята. */
function cleanText(value: string): string {
    return value
        .replace(/\s+/gu, ' ')
        .replace(/[\s;]+$/u, '')
        .trim();
}

/** Значение записи текстом: строка, список строк, да/нет, вложенная запись. */
function valueText(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return cleanText(value);
    if (typeof value === 'boolean') return value ? 'да' : 'нет';
    if (typeof value === 'number') return String(value);
    if (Array.isArray(value)) {
        return value
            .map(valueText)
            .filter(item => item !== '')
            .join('; ');
    }
    const entries = recordEntriesOf(value) ?? [];
    return entries
        .map(([key, nested]) => `${key}: ${valueText(nested)}`)
        .join('; ');
}

const lineOf = (label: string, value: unknown): string =>
    `${label}: ${valueText(value) || CHECKLIST_EMPTY_VALUE}`;

/**
 * Строки блоков из пар записи; ни одного ключа анкеты — null (это не запись
 * чек-листа, текст остаётся как есть).
 */
function formatEntries(
    entries: readonly ChecklistRecordEntry[],
    blocks: readonly ChecklistTextBlock[],
): string | null {
    const byKey = new Map(entries);
    const known = blocks.filter(block => byKey.has(block.key));
    if (known.length === 0) return null;
    const knownKeys = new Set(known.map(block => block.key));
    return [
        ...known.map(block => lineOf(block.label, byKey.get(block.key))),
        ...entries
            .filter(([key]) => !knownKeys.has(key))
            .map(([key, value]) => lineOf(key, value)),
    ].join('\n');
}

/**
 * Текст разбора чек-листа для показа и записи. Строка — запись словаря
 * превращается в строки блоков, остальное только обрезается; объект (запись
 * уже разобрана) — строки блоков; null и прочее — null.
 */
export function normalizeChecklistText(
    value: unknown,
    blocks: readonly ChecklistTextBlock[],
): string | null {
    try {
        if (typeof value === 'string') {
            const text = value.trim();
            const entries = parseChecklistRecord(text);
            return (entries && formatEntries(entries, blocks)) ?? text;
        }
        const entries = recordEntriesOf(value);
        return entries ? formatEntries(entries, blocks) : null;
    } catch {
        return typeof value === 'string' ? value.trim() : null;
    }
}

/** Текст разбора «5К» (fiveKAnalysis) для показа и записи. */
export function normalizeFiveKAnalysisText(value: unknown): string | null {
    return normalizeChecklistText(value, FIVE_K_TEXT_BLOCKS);
}

/** Текст разбора «Хвоста» (hvostAnalysis) для показа и записи. */
export function normalizeHvostAnalysisText(value: unknown): string | null {
    return normalizeChecklistText(value, HVOST_TEXT_BLOCKS);
}
