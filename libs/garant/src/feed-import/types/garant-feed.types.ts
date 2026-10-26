/**
 * Структура Google-фида цен (Apps Script легаси-таблицы) и отчёта импорта.
 * Фид — внешние данные: каждая строка проверяется type guard-ами, невалидные
 * попадают в отчёт как skipped, а не роняют импорт.
 */

/** Строка prof/lt-прайса фида: номерная адресация + цена */
export interface FeedProfPriceRow {
    number: number;
    complectName: string;
    complectNumber: number;
    /** Номер поставки 1..18; у lt/universal — false */
    supplyNumber: number | false;
    price: number;
    /** 0 — регионы, 1 — Москва (у universal — код региона, такие строки не импортируются) */
    region: number | string;
    complectType: number | boolean;
}

/** Строка СТАР: единственный пакет с двумя ценами */
export interface FeedStarRow {
    number: number;
    name: string;
    fullName: string;
    msk: number;
    regions: number;
    description: string;
    type: string;
    weight: number;
}

/** Строка регионального справочника фида */
export interface FeedRegionRow {
    number: number;
    title: string;
    abs: number;
    /** Код региона (в фиде поле называется name) */
    name: string;
    infoblock: string;
}

/** Консалтинг-продукт фида (рабсы для сида пакетов) */
export interface FeedConsaltingRow {
    id: number;
    name: string;
    title: string;
    rabs: number;
}

/** Полный фид (используемые секции) */
export interface GarantFeed {
    prices: {
        prof: FeedProfPriceRow[];
        universal: FeedProfPriceRow[];
        lt: FeedProfPriceRow[];
        star: FeedStarRow[];
    };
    regions: FeedRegionRow[];
    consalting: FeedConsaltingRow[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null;

const isFiniteNumber = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value);

export const isFeedProfPriceRow = (value: unknown): value is FeedProfPriceRow =>
    isRecord(value) &&
    isFiniteNumber(value.complectNumber) &&
    isFiniteNumber(value.price) &&
    (isFiniteNumber(value.supplyNumber) || value.supplyNumber === false) &&
    (isFiniteNumber(value.region) || typeof value.region === 'string');

export const isFeedStarRow = (value: unknown): value is FeedStarRow =>
    isRecord(value) &&
    typeof value.name === 'string' &&
    isFiniteNumber(value.msk) &&
    isFiniteNumber(value.regions);

export const isFeedRegionRow = (value: unknown): value is FeedRegionRow =>
    isRecord(value) &&
    typeof value.name === 'string' &&
    value.name.length > 0 &&
    typeof value.title === 'string' &&
    isFiniteNumber(value.abs);

export const isFeedConsaltingRow = (
    value: unknown,
): value is FeedConsaltingRow =>
    isRecord(value) &&
    isFiniteNumber(value.id) &&
    typeof value.name === 'string' &&
    isFiniteNumber(value.rabs);

const toArray = (value: unknown): unknown[] =>
    Array.isArray(value) ? value : [];

/**
 * Приводит сырой JSON фида к типизированной структуре.
 * Секции с неожиданной формой превращаются в пустые массивы — дальше
 * импортёры сами сообщат «нет строк» в отчёте.
 */
export const parseGarantFeed = (raw: unknown): GarantFeed => {
    const root = isRecord(raw) ? raw : {};
    const prices = isRecord(root.prices) ? root.prices : {};
    return {
        prices: {
            prof: toArray(prices.prof).filter(isFeedProfPriceRow),
            universal: toArray(prices.universal).filter(isFeedProfPriceRow),
            lt: toArray(prices.lt).filter(isFeedProfPriceRow),
            star: toArray(prices.star).filter(isFeedStarRow),
        },
        regions: toArray(root.regions).filter(isFeedRegionRow),
        consalting: toArray(root.consalting).filter(isFeedConsaltingRow),
    };
};

/** Причина пропуска строки при импорте */
export interface ImportSkippedRow {
    key: string;
    reason: string;
}

/** Итог одной секции импорта */
export interface ImportSectionReport {
    section: string;
    created: number;
    updated: number;
    skipped: ImportSkippedRow[];
}

export const emptyReport = (section: string): ImportSectionReport => ({
    section,
    created: 0,
    updated: 0,
    skipped: [],
});
