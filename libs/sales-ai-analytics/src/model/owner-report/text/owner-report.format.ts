import { formatRuDate, formatRuDateRange } from '../../iso-week.util';
import {
    ruCount,
    ruDecimal,
    ruInt,
    type RuPluralForms,
} from '../../ru-text.util';
import type { OwnerShare } from '../owner-report.types';

/**
 * Форматирование чисел отчёта собственнику. Единственный способ печатать
 * числа в тексте: факт-чек ответа модели разбирает те же строки, и числа
 * обязаны совпадать до знака.
 */

const NBSP = ' ';
const THOUSAND = 1_000;
const MILLION = 1_000_000;

export const REPORT_FORMS = {
    calls: ['разговор', 'разговора', 'разговоров'] as RuPluralForms,
    callsGenitive: ['разговора', 'разговоров', 'разговоров'] as RuPluralForms,
    deals: ['сделка', 'сделки', 'сделок'] as RuPluralForms,
    /** «вернуть 1 сделку» — винительный падеж. */
    dealsAccusative: ['сделку', 'сделки', 'сделок'] as RuPluralForms,
    managers: ['сотрудник', 'сотрудника', 'сотрудников'] as RuPluralForms,
    days: ['рабочий день', 'рабочих дня', 'рабочих дней'] as RuPluralForms,
    weeks: ['неделя', 'недели', 'недель'] as RuPluralForms,
    objections: ['возражение', 'возражения', 'возражений'] as RuPluralForms,
    points: ['пункт', 'пункта', 'пунктов'] as RuPluralForms,
} as const;

/** Целое с разрядами через неразрывный пробел: 102000 → «102 000». */
export function intText(value: number): string {
    return String(ruInt(value)).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
}

/** Процент целым: 28.57 → «29 %»; null → «—». */
export function pctText(pct: number | null): string {
    return pct === null ? '—' : `${ruInt(pct)}${NBSP}%`;
}

/** «19 из 91 (21 %)»; при пустом знаменателе — «нет данных». */
export function shareText(share: OwnerShare): string {
    if (share.n === 0) return 'нет данных';
    return `${share.successes} из ${share.n} (${pctText(share.pct)})`;
}

/** «19 из 91 разговоров» — с формой слова знаменателя. */
export function shareOfText(share: OwnerShare, forms: RuPluralForms): string {
    if (share.n === 0) return 'нет данных';
    return `${share.successes} из ${ruCount(share.n, forms)}`;
}

/** «12 разговоров». */
export function countText(count: number, forms: RuPluralForms): string {
    return ruCount(count, forms);
}

/** Рубли: 62 500 → «62,5 тыс. ₽», 1 240 000 → «1,2 млн ₽», 900 → «900 ₽». */
export function moneyText(amount: number): string {
    if (amount >= MILLION)
        return `${ruDecimal(amount / MILLION, 1)}${NBSP}млн${NBSP}₽`;
    if (amount >= THOUSAND) {
        const thousands = amount / THOUSAND;
        const text = Number.isInteger(thousands)
            ? String(thousands)
            : ruDecimal(thousands, 1);
        return `${text}${NBSP}тыс.${NBSP}₽`;
    }
    return `${intText(amount)}${NBSP}₽`;
}

/** Разница долей в пунктах: +7 → «на 7 пунктов больше». */
export function pointsDeltaText(
    current: number | null,
    previous: number | null,
): string | null {
    if (current === null || previous === null) return null;
    const delta = ruInt(current - previous);
    if (delta === 0) return 'на уровне прошлого периода';
    const abs = Math.abs(delta);
    return `${delta > 0 ? 'больше' : 'меньше'} на ${ruCount(abs, REPORT_FORMS.points)}`;
}

/** «1–31 октября 2026» или «1 октября 2026», если день один. */
export function periodText(from: string, to: string): string {
    return from === to ? formatRuDate(from) : formatRuDateRange(from, to);
}
