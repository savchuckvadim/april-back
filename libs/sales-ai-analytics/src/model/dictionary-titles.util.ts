/**
 * Русские названия кодов справочников смарта разбора звонка для текстов
 * витрины: разделы разговора, категории возражений, сигналы риска.
 * Коды наружу в человекочитаемых текстах не ходят (правило владельца);
 * неизвестный код остаётся как есть, чтобы текст не терял смысл.
 *
 * Чистые функции над константами `pbx-aicall-smart`.
 */
import {
    CALL_REPORT_CALL_TYPE_ITEMS,
    CALL_REPORT_COACHING_ITEMS,
    CALL_REPORT_OBJECTION_ITEMS,
    CALL_REPORT_RISK_FLAG_ITEMS,
    CALL_REPORT_SECTIONS,
} from '@lib/portal-lib/pbx/pbx-aicall-smart/type/pbx-aicall-smart.type';
import { CALL_MISTAKE_SIGNAL_TITLES } from './manager-signal.rules';

const SECTION_TITLES: ReadonlyMap<string, string> = new Map(
    CALL_REPORT_SECTIONS.map(section => [section.code, section.title]),
);

const OBJECTION_TITLES: ReadonlyMap<string, string> = new Map(
    CALL_REPORT_OBJECTION_ITEMS.map(item => [item.CODE, item.VALUE]),
);

/**
 * Виды сигналов руководителю: риск-флаги разбора, ошибки менеджера
 * (manager-signal.rules) и приоритет коучинга «Срочно на разбор» — так
 * подписаны алерты, отправленные до 11.11.2026.
 */
const RISK_TITLES: ReadonlyMap<string, string> = new Map([
    ...CALL_REPORT_RISK_FLAG_ITEMS.map(
        item => [item.CODE, item.VALUE] as const,
    ),
    ...CALL_REPORT_COACHING_ITEMS.map(item => [item.CODE, item.VALUE] as const),
    ...Object.entries(CALL_MISTAKE_SIGNAL_TITLES),
]);

const CALL_TYPE_TITLES: ReadonlyMap<string, string> = new Map(
    CALL_REPORT_CALL_TYPE_ITEMS.map(item => [item.CODE, item.VALUE]),
);

/** Категория возражения без кода в справочнике. */
export const OBJECTION_NO_CATEGORY_TITLE = 'Без категории';

/** Первая буква строчная — подпись стоит внутри фразы. */
export const lowerFirst = (title: string): string =>
    title.charAt(0).toLowerCase() + title.slice(1);

/** Первая буква прописная — подпись открывает фразу («Оценка ниже…»). */
export const upperFirst = (title: string): string =>
    title.charAt(0).toUpperCase() + title.slice(1);

/** Название раздела с большой буквы: «Работа по цене»; чужой код — как есть. */
export function sectionTitleOf(code: string): string {
    return SECTION_TITLES.get(code) ?? code;
}

/** Название категории возражения: «Цена»; null или чужой код — «Без категории». */
export function objectionTitleOf(category: string | null): string {
    if (category === null || category === '')
        return OBJECTION_NO_CATEGORY_TITLE;

    return OBJECTION_TITLES.get(category) ?? OBJECTION_NO_CATEGORY_TITLE;
}

/** Название сигнала риска строчными: «конфликт / грубость»; чужой код — как есть. */
export function riskTitleOf(kind: string): string {
    const title = RISK_TITLES.get(kind);

    return title === undefined ? kind : lowerFirst(title);
}

/** Название типа звонка из справочника смарта; чужой код — как есть. */
export function callTypeTitleOf(callType: string): string {
    return CALL_TYPE_TITLES.get(callType) ?? callType;
}
