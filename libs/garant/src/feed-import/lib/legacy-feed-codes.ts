/**
 * Таблицы соответствия легаси-адресации Google-фида (номера комплектов,
 * поставок, пакетов) стабильным кодам каталога. Зеркало выверенных карт
 * фронта конструктора (front/apps/konstructor …/catalog/lib/legacy-codes.ts):
 * фид — замороженное легаси, адресация уже не изменится.
 *
 * Прайс и каталог джойнятся ТОЛЬКО по кодам (фронт ищет цену по
 * price.supply_code === supply.code и price.garant_package_code ===
 * package.code), поэтому номера фида обязаны превращаться в коды здесь.
 */

/** Легаси-номер комплекта → code (prof и universal вперемешку, как в фиде) */
export const COMPLECT_NUMBER_TO_CODE: Record<number, string> = {
    0: 'buh',
    1: 'buhgos',
    2: 'ur',
    3: 'expert',
    4: 'office',
    5: 'glavbuh',
    6: 'glavbuhgos',
    7: 'company',
    8: 'companyPro',
    9: 'classic',
    10: 'classicPlus',
    11: 'universal',
    12: 'universalPlus',
    13: 'professional',
    14: 'master',
    15: 'analyst',
    16: 'analystPlus',
    17: 'maximum',
    18: 'exzak',
    19: 'exbuild',
    20: 'exjobsec',
};

/** Номера универсальной линейки в карте комплектов (остальные — prof) */
export const UNIVERSAL_COMPLECT_NUMBERS: readonly number[] = [
    9, 10, 11, 12, 13, 14, 15, 16, 17,
];

/** Имена универсальных комплектов (фид их знает, карта — подстраховка) */
export const UNIVERSAL_COMPLECT_NAMES: Record<number, string> = {
    9: 'Классик',
    10: 'Классик+',
    11: 'Универсал',
    12: 'Универсал+',
    13: 'Профессионал',
    14: 'Мастер',
    15: 'Аналитик',
    16: 'Аналитик+',
    17: 'Максимум',
};

export type SupplyFeedKind = 'internet' | 'proxima';

/** Коды особых поставок — совпадают с фронтом и админкой */
export const SUPPLY_CODE_FLASH = 'proxima_flash';
export const SUPPLY_CODE_LOCAL = 'proxima_local';
export const SUPPLY_CODE_STD = 'internet_std';

export interface SupplyNumberKey {
    type: SupplyFeedKind;
    usersQuantity: number;
    special?: 'std' | 'local' | 'flash';
    name: string;
}

/**
 * Легаси-номер поставки (0..18) → тип, число ОД и человекочитаемое имя.
 * Внимание: 9 — «Локальная» (проксима!), 10 — «Флэш»; сетка не «1–9 интернет,
 * 10–18 проксима», как считал excel-парсер.
 */
export const SUPPLY_NUMBER_TO_KEY: Record<number, SupplyNumberKey> = {
    0: {
        type: 'internet',
        usersQuantity: 0,
        special: 'std',
        name: 'Интернет Стандартная',
    },
    1: { type: 'internet', usersQuantity: 1, name: 'Интернет 1 ОД' },
    2: { type: 'internet', usersQuantity: 2, name: 'Интернет 2 ОД' },
    3: { type: 'internet', usersQuantity: 3, name: 'Интернет 3 ОД' },
    4: { type: 'internet', usersQuantity: 5, name: 'Интернет 5 ОД' },
    5: { type: 'internet', usersQuantity: 10, name: 'Интернет 10 ОД' },
    6: { type: 'internet', usersQuantity: 20, name: 'Интернет 20 ОД' },
    7: { type: 'internet', usersQuantity: 30, name: 'Интернет 30 ОД' },
    8: { type: 'internet', usersQuantity: 50, name: 'Интернет 50 ОД' },
    9: {
        type: 'proxima',
        usersQuantity: 1,
        special: 'local',
        name: 'Локальная',
    },
    10: {
        type: 'proxima',
        usersQuantity: 1,
        special: 'flash',
        name: 'Проксима Флэш',
    },
    11: { type: 'proxima', usersQuantity: 1, name: 'Проксима 1 ОД' },
    12: { type: 'proxima', usersQuantity: 2, name: 'Проксима 2 ОД' },
    13: { type: 'proxima', usersQuantity: 3, name: 'Проксима 3 ОД' },
    14: { type: 'proxima', usersQuantity: 5, name: 'Проксима 5 ОД' },
    15: { type: 'proxima', usersQuantity: 10, name: 'Проксима 10 ОД' },
    16: { type: 'proxima', usersQuantity: 20, name: 'Проксима 20 ОД' },
    17: { type: 'proxima', usersQuantity: 30, name: 'Проксима 30 ОД' },
    18: { type: 'proxima', usersQuantity: 50, name: 'Проксима 50 ОД' },
};

/** Код поставки по легаси-номеру (`internet_5`, `proxima_flash`, …) */
export const supplyCodeFromNumber = (number: number): string | null => {
    const key = SUPPLY_NUMBER_TO_KEY[number];
    if (!key) return null;
    if (key.special === 'std') return SUPPLY_CODE_STD;
    if (key.special === 'local') return SUPPLY_CODE_LOCAL;
    if (key.special === 'flash') return SUPPLY_CODE_FLASH;
    return `${key.type}_${key.usersQuantity}`;
};

/** Легаси-номер LT-пакета в фиде → код пакета garant_packages */
export const LT_PACKAGE_NUMBER_TO_CODE: Record<number, string> = {
    13: 'ltpackSmall',
    14: 'ltpackMedium',
    15: 'ltpackBig',
};

/** Имена LT-пакетов для сида (фид дублирует, карта — подстраховка) */
export const LT_PACKAGE_NAMES: Record<string, string> = {
    ltpackSmall: 'ГАРАНТ-LegalTech. Малый пакет',
    ltpackMedium: 'ГАРАНТ-LegalTech. Средний пакет',
    ltpackBig: 'ГАРАНТ-LegalTech. Большой пакет',
};

/** Код пакета СТАР */
export const STAR_PACKAGE_CODE = 'starpack';

/** Консалтинг: номер из фида → code (рабсы редактируются в админке) */
export const CONSALTING_NUMBER_TO_CODE: Record<number, string> = {
    0: 'hotline',
    1: 'sovex',
    2: 'pkpremium',
};
