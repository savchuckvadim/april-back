/**
 * Схема эталонной книги цен «Гаранта» — повторяет формат рабочего файла
 * владельца (storage/app/garant/prices.xlsx): один файл = одно действие
 * «обновить цены».
 *
 * Листы:
 * - regions            рабсы регионов (стоимость одного рабса);
 * - universal-weights  вес и АБС универсальных комплектов (ЦЕН НЕТ —
 *                      цена считается АБС × рабс региона × коэффициент ОД);
 * - prof-prices-msc    прайс PROF, Москва: строка — комплект, колонка — ОД;
 * - prof-prices-regions то же для регионов;
 * - lt                 пакеты ЛегалТех: вес и цены Москва/регионы;
 * - star               СТАР: вес и цены Москва/регионы;
 * - consalting         продукты консалтинга: АБС (ЦЕН НЕТ).
 */

/** Имена листов книги цен — совпадают с рабочим файлом */
export const PRICE_BOOK_SHEETS = {
    regions: 'regions',
    universalWeights: 'universal-weights',
    profMsk: 'prof-prices-msc',
    profRegions: 'prof-prices-regions',
    lt: 'lt',
    star: 'star',
    consalting: 'consalting',
} as const;

/** Лист регионов: ключ — name (код региона), значение — rabs */
export const REGION_COLUMNS = {
    id: 'id',
    title: 'title',
    rabs: 'rabs',
    code: 'name',
    infoblock: 'Infoblock',
} as const;

/** Лист универсальных комплектов: вес и АБС, цен нет */
export const UNIVERSAL_COLUMNS = {
    name: 'Название',
    weight: 'Вес',
    abs: 'АБС',
} as const;

/** Листы PROF-прайса: ключ — complectCode, цены по числу ОД */
export const PROF_COLUMNS = {
    complectName: 'complectName',
    complectNumber: 'ComplectNumber',
    complectCode: 'complectCode',
} as const;

/** Ключевые (неценовые) колонки PROF-листов */
export const PROF_KEY_COLUMNS: readonly string[] = [
    PROF_COLUMNS.complectName,
    PROF_COLUMNS.complectNumber,
    PROF_COLUMNS.complectCode,
    '', // первая колонка в prof-prices-regions без заголовка
];

/**
 * Эталонная сетка ОД в заголовках прайса. Звёздочки в оригинале
 * означают сноску поставщика и к данным не относятся.
 */
export const PROF_OD_COLUMNS: readonly string[] = [
    '1 ОД*',
    '2 ОД*',
    '3 ОД*',
    '5 ОД*',
    '10 ОД**',
    '20 ОД**',
    '30 ОД**',
    '50 ОД**',
];

/** Листы пакетов услуг (ЛегалТех, СТАР) */
export const SERVICE_COLUMNS = {
    id: 'id',
    name: 'name',
    weight: 'weight',
    msk: 'msk',
    regions: 'regions',
    type: 'type',
    code: 'code',
} as const;

/** Лист консалтинга: АБС вместо цены */
export const CONSALTING_COLUMNS = {
    id: 'id',
    name: 'name',
    title: 'title',
    description: 'description',
    productId: 'productId',
    six: 'six',
    eleven: 'eleven',
    abs: 'abs',
    price: 'price',
    code: 'code',
} as const;

/**
 * Число ОД из заголовка колонки прайса: «10 ОД**» → 10.
 * Терпит разное число звёздочек, пробелы и регистр.
 */
export const parseOdHeader = (header: string): number | null => {
    const match = /^\s*(\d+)\s*ОД/i.exec(header.trim());
    if (!match) return null;
    const quantity = Number(match[1]);
    return Number.isFinite(quantity) && quantity > 0 ? quantity : null;
};

/** Заголовок колонки для числа ОД (как в эталоне: до 5 ОД — одна звёздочка) */
export const odColumnHeader = (usersQuantity: number): string =>
    `${usersQuantity} ОД${usersQuantity <= 5 ? '*' : '**'}`;
