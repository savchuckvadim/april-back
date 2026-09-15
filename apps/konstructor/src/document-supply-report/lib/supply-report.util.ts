import { ClientTypeEnum } from '../../document-generate/type/client.type';

/**
 * «5 месяцев» / «2 месяца» / «1 месяц» — винительный падеж.
 * Порт `FileController::getMonthTitleAccusative` (Laravel, строка 1176).
 *
 * Отдельно от `getCaseMonthes` из document-generate: тот возвращает только
 * слово и путает 3 → «месяцев», а в документе нужно число вместе со словом.
 */
export const getMonthTitleAccusative = (quantity: number): string => {
    const value = Math.trunc(Number(quantity) || 0);
    const lastDigit = Math.abs(value) % 10;
    const lastTwoDigits = Math.abs(value) % 100;

    if (lastDigit === 1 && lastTwoDigits !== 11) {
        return `${value} месяц`;
    }
    if (
        [2, 3, 4].includes(lastDigit) &&
        !(lastTwoDigits >= 12 && lastTwoDigits <= 14)
    ) {
        return `${value} месяца`;
    }
    return `${value} месяцев`;
};

/** «8008.00» — денежный формат Laravel `number_format($v, 2, '.', '')`. */
export const toMoneyString = (value: unknown): string =>
    (Number(value) || 0).toFixed(2);

/**
 * Тип клиента к коду.
 *
 * Легаси-фронт шлёт объект `{id, code, name, title}` (SelectItem), ветка
 * IS_BACK и новый фронт — строку. Принимаем обе формы, иначе валидация или
 * сравнение `clientType === 'fiz'` молча разваливается.
 */
export const resolveClientTypeCode = (clientType: unknown): ClientTypeEnum => {
    const raw =
        typeof clientType === 'string'
            ? clientType
            : ((clientType as { code?: string } | null)?.code ?? '');

    const known = Object.values(ClientTypeEnum) as string[];
    return known.includes(raw) ? (raw as ClientTypeEnum) : ClientTypeEnum.ORG;
};

/**
 * Значения полей сделки/компании из того вида, в котором их шлёт фронт.
 *
 * `formatBxCompanyState` / `formatBxDealState` отдают ОБЪЕКТ, ключованный по
 * коду поля (`Record<code, {current, field, items}>`), а не массив — Laravel
 * читает его через `foreach ($items as $key => $item)`. Старый код неста ждал
 * массив с `item.key`, поэтому поддерживаем обе формы.
 */
export const toPbxEntries = (
    source: unknown,
): Array<[string, { current?: unknown }]> => {
    if (!source) {
        return [];
    }

    if (Array.isArray(source)) {
        const entries: Array<[string, { current?: unknown }]> = [];
        for (const item of source) {
            const key = String((item as { key?: string })?.key ?? '');
            if (key !== '') {
                entries.push([key, item as { current?: unknown }]);
            }
        }
        return entries;
    }

    if (typeof source === 'object') {
        return Object.entries(source as Record<string, { current?: unknown }>);
    }

    return [];
};

/**
 * Значение поля формы в текст.
 *
 * У select-полей (и у полей pbx) значение приходит объектом `{name|title}`, у
 * остальных — строкой или числом. Без нормализации такое значение попадает в
 * шаблонную строку как есть и превращается в `[object Object]`.
 */
export const readFieldText = (value: unknown): string => {
    if (value === undefined || value === null) {
        return '';
    }
    if (typeof value === 'object') {
        const named = value as { name?: string; title?: string };
        return named.name ?? named.title ?? '';
    }
    if (typeof value === 'string') {
        return value;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
    }
    // функции и symbol в полях формы не встречаются — и стрингифицировать их нечего
    return '';
};

/** Текущее значение поля pbx: enum отдаёт объект, строка/дата — примитив. */
export const readPbxCurrent = (
    item: { current?: unknown } | undefined,
): string => readFieldText(item?.current);
