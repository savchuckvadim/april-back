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
} from '@lib/call-lib/call-report-analytics/lib/json-value.util';
import type {
    CallPageChecklistPlaceView,
    CallPageNeedItemView,
} from './call-page.types';

type Json = Record<string, unknown>;

const text = (value: unknown): string | null => {
    const trimmed = asString(value)?.trim();
    return trimmed ? trimmed : null;
};

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
