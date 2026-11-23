import { CONTRACT_LTYPE } from '../type/contract.type';

/** Короткая единица сервисного договора: оплата помесячно. */
export const MEASURE_SHORT_SERVICE = 'мес.';
/** Короткая единица абонемента, лицензии и ключа. */
export const MEASURE_SHORT_PIECE = 'шт.';

/**
 * Единица измерения для печати документа.
 * `short` стоит в колонке «Ед.» и в строке «Итого»; `caption` — длинная
 * формулировка портала, её печатают мелкой подписью в названии товара.
 */
export interface DocumentMeasure {
    short: string;
    caption: string;
}

/**
 * Названия, которые сами служат короткой единицей: подпись с ними ничего не
 * добавила бы к колонке «Ед.». Сравнение идёт по нормализованному названию
 * (нижний регистр, без точек на концах и лишних пробелов).
 */
const PLAIN_UNIT_NAMES: ReadonlySet<string> = new Set([
    'шт',
    'штука',
    'мес',
    'месяц',
]);

const normalizeMeasureName = (name: string): string =>
    name.trim().replace(/\s+/g, ' ').replace(/\.+$/, '').toLowerCase();

const isKnownContractType = (value: unknown): value is CONTRACT_LTYPE =>
    Object.values(CONTRACT_LTYPE).includes(value as CONTRACT_LTYPE);

/**
 * Единица измерения документа по виду договора. Правило общее для Word-КП,
 * PDF-КП, счёта, договора и отчёта о поставке:
 *
 * - сервисный договор (оплата помесячно): `мес.`, подписи нет;
 * - абонемент, лицензия, ключ: `шт.`, подпись — название меры с портала
 *   («Лицензия 6 месяцев»); у короткого названия вроде «шт.» подписи нет;
 * - вид договора неизвестен: название портала как есть и пустая подпись —
 *   строка печатается так же, как до появления правила.
 *
 * Меры Битрикса (`portal_measure.bitrixId` в товарных строках сделки) сюда не
 * входят: функция отвечает только за печать документов.
 */
export const resolveDocumentMeasure = (
    contractType: CONTRACT_LTYPE | string | null | undefined,
    portalMeasureName: string | null | undefined,
): DocumentMeasure => {
    const portalName = (portalMeasureName ?? '').trim();

    if (!isKnownContractType(contractType)) {
        return { short: portalMeasureName ?? '', caption: '' };
    }
    if (contractType === CONTRACT_LTYPE.SERVICE) {
        return { short: MEASURE_SHORT_SERVICE, caption: '' };
    }

    const isPlain = PLAIN_UNIT_NAMES.has(normalizeMeasureName(portalName));
    return {
        short: MEASURE_SHORT_PIECE,
        caption: isPlain ? '' : portalName,
    };
};
