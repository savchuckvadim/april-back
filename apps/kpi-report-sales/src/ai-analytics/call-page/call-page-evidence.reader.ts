/**
 * Места разбора в разговоре из `ais.user_result` (задание focus-v3.4):
 * потребности с цитатой и секундой, места пунктов «хвоста» и 5К. Разбор
 * прежних версий этих полей не несёт — списки пустые. Секунды уже проверены
 * приёмом разбора по расшифровке. Чистые функции.
 */
import {
    asNumber,
    asRecordArray,
    asString,
    asStringArray,
} from '@lib/call-lib/call-report-analytics/lib/json-value.util';
import type {
    CallPageChecklistPlaceView,
    CallPageNeedItemView,
} from './call-page.types';

type Json = Record<string, unknown>;

/** Пустое значение, которое модель пишет словом: «в null» на странице не нужно. */
const EMPTY_WORDS: ReadonlySet<string> = new Set(['null', 'undefined', 'nan']);

/** Непустой текст без пробелов по краям; «null» словом — пусто. */
export const readText = (value: unknown): string | null => {
    const trimmed = asString(value)?.trim();
    return trimmed && !EMPTY_WORDS.has(trimmed.toLowerCase()) ? trimmed : null;
};

/** Список строк: пустые и «null» словом — пропускаются. */
export const readTexts = (value: unknown): string[] =>
    asStringArray(value)
        .map(readText)
        .filter((item): item is string => item !== null);

const text = readText;

/** Секунды записи: неотрицательное число, иначе null. */
export const evidenceSeconds = (value: unknown): number | null => {
    const number = asNumber(value);
    return number !== null && number >= 0 ? number : null;
};

function needItemOf(item: Json): CallPageNeedItemView | null {
    const need = text(item.need);
    return need === null
        ? null
        : {
              need,
              quote: text(item.quote),
              startSec: evidenceSeconds(item.startSec),
          };
}

function checklistPlaceOf(item: Json): CallPageChecklistPlaceView | null {
    const key = text(item.key);
    const quote = text(item.quote);
    return key === null || quote === null
        ? null
        : { key, quote, startSec: evidenceSeconds(item.startSec) };
}

const present = <T>(items: (T | null)[]): T[] =>
    items.filter((item): item is T => item !== null);

/** Потребности с местом в разговоре; прежний разбор — пусто. */
export const readNeedItems = (value: unknown): CallPageNeedItemView[] =>
    present(asRecordArray(value).map(needItemOf));

/** Места пунктов «хвоста» или 5К; прежний разбор — пусто. */
export const readChecklistPlaces = (
    value: unknown,
): CallPageChecklistPlaceView[] =>
    present(asRecordArray(value).map(checklistPlaceOf));
