import {
    SUPPLY_CODE_FLASH,
    SUPPLY_CODE_LOCAL,
    SUPPLY_CODE_STD,
    SUPPLY_NUMBER_TO_KEY,
    supplyCodeFromNumber,
} from '../../catalog-install/lib/catalog-codes';

/**
 * Схема эталонной таблицы цен. Формат повторяет привычную таблицу
 * владельца: строка = комплект, колонка = вид поставки, отдельные листы
 * для регионов и Москвы.
 *
 * Проксима с одним ОД встречается трижды и это НЕ дубль: «Локальная»
 * (proxima_local), «Флэш» (proxima_flash) и обычная проксима на 1 ОД
 * (proxima_1) — разные виды поставки с разной ценой, поэтому у каждой
 * своя колонка.
 */

/** Листы прайса: region_type '0' — регионы, '1' — Москва */
export const PRICE_SHEET_REGIONS = 'prof-regions';
export const PRICE_SHEET_MSK = 'prof-msk';
export const PRICE_SHEET_SERVICES = 'services';

export const PRICE_SHEETS: ReadonlyArray<{
    name: string;
    regionType: '0' | '1';
    title: string;
}> = [
    { name: PRICE_SHEET_REGIONS, regionType: '0', title: 'Регионы' },
    { name: PRICE_SHEET_MSK, regionType: '1', title: 'Москва' },
];

/** Ключевые колонки матричных листов (не являются поставками) */
export const PRICE_COLUMN_COMPLECT_CODE = 'complect_code';
export const PRICE_COLUMN_COMPLECT_NAME = 'name';
export const PRICE_KEY_COLUMNS = [
    PRICE_COLUMN_COMPLECT_CODE,
    PRICE_COLUMN_COMPLECT_NAME,
];

/** Колонки листа услуг */
export const SERVICE_COLUMN_PACKAGE_CODE = 'package_code';
export const SERVICE_COLUMN_NAME = 'name';
export const SERVICE_COLUMN_MSK = 'msk';
export const SERVICE_COLUMN_REGIONS = 'regions';
export const SERVICE_COLUMNS = [
    SERVICE_COLUMN_PACKAGE_CODE,
    SERVICE_COLUMN_NAME,
    SERVICE_COLUMN_MSK,
    SERVICE_COLUMN_REGIONS,
];

/**
 * Порядок колонок-поставок в эталоне — как в привычной таблице:
 * интернет (станд. + 1..50 ОД), затем проксима (Локальная, Флэш, 1..50 ОД).
 */
export const PRICE_SUPPLY_COLUMN_ORDER: readonly string[] = (() => {
    const internet = [SUPPLY_CODE_STD];
    const proxima = [SUPPLY_CODE_LOCAL, SUPPLY_CODE_FLASH];
    for (const [numberKey, key] of Object.entries(SUPPLY_NUMBER_TO_KEY)) {
        if (key.special) continue;
        const code = supplyCodeFromNumber(Number(numberKey));
        if (!code) continue;
        if (key.type === 'internet') internet.push(code);
        else proxima.push(code);
    }
    return [...internet, ...proxima];
})();

/** Человекочитаемый заголовок-подсказка для колонки поставки */
export const supplyColumnTitle = (code: string): string => {
    for (const [numberKey, key] of Object.entries(SUPPLY_NUMBER_TO_KEY)) {
        if (supplyCodeFromNumber(Number(numberKey)) === code) return key.name;
    }
    return code;
};
