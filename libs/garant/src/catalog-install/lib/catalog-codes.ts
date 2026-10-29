/**
 * Коды сущностей каталога «Гарант» и их соответствие легаси-номерам.
 * Зеркало выверенных карт фронта конструктора
 * (front/apps/konstructor …/catalog/lib/legacy-codes.ts).
 *
 * Прайс и каталог джойнятся ТОЛЬКО по кодам: фронт ищет цену по
 * price.supply_code === supply.code и price.garant_package_code ===
 * package.code. Поэтому коды — единственный допустимый ключ в таблицах
 * и в БД; номера остались лишь для сверки со старыми выгрузками.
 */

/** Легаси-номер комплекта → code (prof и universal вперемешку) */
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

/** Имена универсальных комплектов для сида чистого каталога */
export const UNIVERSAL_COMPLECT_NAMES: Record<number, string> = {
    9: 'Гарант-Классик',
    10: 'Гарант-Классик+',
    11: 'Гарант-Универсал',
    12: 'Гарант-Универсал+',
    13: 'Гарант-Профессионал',
    14: 'Гарант-Мастер',
    15: 'Гарант-Аналитик',
    16: 'Гарант-Аналитик+',
    17: 'Гарант-Максимум',
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

/**
 * Коэффициенты видов поставки по легаси-номеру. Нужны для цены
 * универсальной линейки и консалтинга: цена = рабс × рабс региона ×
 * коэффициент. У PROF коэффициент не участвует — там цена из прайса.
 *
 * Значения из рабочего слепка легаси-каталога
 * (front/apps/konstructor …/catalog/lib/__fixtures__/oldinit.json).
 */
export const SUPPLY_COEFFICIENTS: Record<number, number> = {
    0: 1, // Интернет Стандартная
    1: 1.25, // Интернет 1 ОД
    2: 1.5,
    3: 2,
    4: 3, // 5 ОД
    5: 4, // 10 ОД
    6: 5, // 20 ОД
    7: 6, // 30 ОД
    8: 7, // 50 ОД
    9: 1, // Локальная
    10: 1.1, // Проксима Флэш
    11: 1.25, // Проксима 1 ОД
    12: 1.5,
    13: 2,
    14: 3, // 5 ОД
    15: 4, // 10 ОД
    16: 5, // 20 ОД
    17: 6, // 30 ОД
    18: 7, // 50 ОД
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

/**
 * Рабсы универсальной линейки (цена = рабс × рабс региона × коэффициент
 * поставки). Меняются редко — заводятся таблицей цен, дальше правятся в
 * админке карточкой комплекта.
 *
 * Шкала именно такая (единицы, не сотни): рабс региона ≈ 3000 ₽, и цена
 * получается из произведения. Значения из рабочего файла владельца
 * (storage/app/garant/prices.xlsx, лист universal-weights, 28.10.2026).
 */
export const UNIVERSAL_COMPLECT_ABS: Record<number, number> = {
    9: 2, // Гарант-Классик
    10: 3, // Гарант-Классик+
    11: 4, // Гарант-Универсал
    12: 4.5, // Гарант-Универсал+
    13: 5, // Гарант-Профессионал
    14: 6, // Гарант-Мастер
    15: 8, // Гарант-Аналитик
    16: 10, // Гарант-Аналитик+
    17: 14, // Гарант-Максимум
};

/**
 * Веса универсальных комплектов (сколько рабочих мест «весит» комплект).
 * У «Максимума» веса нет — в рабочем файле клетка пустая.
 */
export const UNIVERSAL_COMPLECT_WEIGHTS: Record<number, number> = {
    9: 1, // Гарант-Классик
    10: 1.5, // Гарант-Классик+
    11: 2, // Гарант-Универсал
    12: 3, // Гарант-Универсал+
    13: 4, // Гарант-Профессионал
    14: 6, // Гарант-Мастер
    15: 9, // Гарант-Аналитик
    16: 12, // Гарант-Аналитик+
};

/** Легаси-номер LT-пакета → код пакета garant_packages */
export const LT_PACKAGE_NUMBER_TO_CODE: Record<number, string> = {
    13: 'ltpackSmall',
    14: 'ltpackMedium',
    15: 'ltpackBig',
    1020: 'ltpackMediumOld',
};

/**
 * Имена и веса LT-пакетов для сида. Коды — те, по которым ищет цену
 * конструктор (front/apps/konstructor …/catalog/lib/legacy-codes.ts),
 * имена и веса — из рабочего файла владельца (лист lt, 28.10.2026).
 */
export const LT_PACKAGE_NAMES: Record<string, string> = {
    ltpackSmall: 'Гарант-LegalTech. Малый пакет',
    ltpackMedium: 'Гарант-LegalTech. Средний пакет',
    ltpackBig: 'Гарант-LegalTech. Большой пакет',
    ltpackMediumOld: 'Гарант-LegalTech. Средний Устаревший',
};

export const LT_PACKAGE_WEIGHTS: Record<string, number> = {
    ltpackSmall: 2,
    ltpackMedium: 5,
    ltpackBig: 10,
    ltpackMediumOld: 4,
};

/** Код пакета СТАР и его параметры для сида (цены — таблицей) */
export const STAR_PACKAGE_CODE = 'starpack';
export const STAR_PACKAGE_NAME = 'СТАР';
export const STAR_PACKAGE_FULL_NAME = 'Система торговых аналитических решений';
export const STAR_PACKAGE_WEIGHT = 10;

/**
 * Консалтинг: у продуктов не цены, а рабсы (как у универсальной линейки),
 * поэтому в прайс-таблицу они не входят — задаются сидом и правятся
 * карточкой пакета в админке.
 */
export interface ConsaltingSeedItem {
    code: string;
    name: string;
    fullName: string;
    number: number;
    abs: number;
}

export const CONSALTING_PACKAGES: readonly ConsaltingSeedItem[] = [
    {
        code: 'hotline',
        name: 'Горячая Линия',
        fullName: 'Горячая Линия',
        number: 0,
        abs: 0,
    },
    {
        code: 'sovex',
        name: 'Советы экспертов',
        fullName: 'Советы экспертов. Проверки, налоги, право',
        number: 1,
        abs: 1,
    },
    {
        code: 'pkpremium',
        name: 'Правовой консалтинг',
        fullName: 'Правовой консалтинг. Премиум',
        number: 2,
        abs: 3,
    },
];
