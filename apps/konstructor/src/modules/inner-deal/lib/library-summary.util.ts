import {
    SUPPLY_NUMBER_TO_KEY,
    supplyCodeFromNumber,
} from '@lib/garant/catalog-install/lib/catalog-codes';
import { CONTRACT_CODE } from '@lib/garant/contract/contract-code.enum';

/**
 * Краткий состав заготовки для карточки в списке «Избранное». У легаси-избранного
 * часто нет ни названия, ни имени сделки, и по одной дате не понять, что внутри.
 * Источник — слепок в колонке `bx_document_deals.rows` (одна JSON-строка):
 *  - v2 (новый конструктор): `{ schemaVersion: 2, general: RowSet, … }`,
 *    строки несут `names`, `refs` (коды поставки и договора) и `price`;
 *  - v1 (легаси): `{ sets: { general: [{ rows: { garant: [...], lt: [...] },
 *    total: [...] }] }, show }`, строки несут `name`, `supply`, `contract`, `price`.
 *
 * Разбор чистый и защищённый: битый, пустой или неузнаваемый слепок даёт null,
 * исключения наружу не выходят. Справочники не читаются. Названия берутся из
 * самой строки; коды поставки и договора переводятся статическими таблицами
 * (имена каталога из сида), неизвестный код отдаётся как есть.
 */

export interface LibrarySummary {
    /** Название комплекта главной строки, например «Гарант-Юрист» */
    complect: string | null;
    /** Поставка главной строки, например «Интернет 1 ОД» */
    supply: string | null;
    /** Договор главной строки, например «Интернет» или «Лицензионный полгода» */
    contract: string | null;
    /** Итог общего набора, ₽ */
    sum: number | null;
    /** Сколько строк в общем наборе */
    rowsCount: number;
}

type JsonRecord = Record<string, unknown>;

/** Строка слепка любой версии в общем виде, только то, что нужно сводке. */
interface SummaryRow {
    /** Признак главной строки (v2: role === 'main'; v1: id === 0) */
    isMain: boolean;
    isGarant: boolean;
    complect: string | null;
    supplyName: string | null;
    supplyCode: string | null;
    contractName: string | null;
    contractCode: string | null;
    sum: number | null;
}

/** Названия договоров по коду (имена каталога «Гарант»). */
const CONTRACT_NAME_BY_CODE: Readonly<Record<string, string>> = {
    [CONTRACT_CODE.INTERNET]: 'Интернет',
    [CONTRACT_CODE.PROXIMA]: 'Проксима',
    [CONTRACT_CODE.ABON6]: 'Абонентский полгода',
    [CONTRACT_CODE.ABON12]: 'Абонентский год',
    [CONTRACT_CODE.ABON24]: 'Абонентский 2 года',
    [CONTRACT_CODE.LIC]: 'Лицензионный',
    [CONTRACT_CODE.LIC6]: 'Лицензионный полгода',
    [CONTRACT_CODE.LIC12]: 'Лицензионный год',
    [CONTRACT_CODE.LIC24]: 'Лицензионный 2 года',
    [CONTRACT_CODE.KEY]: 'Передача ключа доступа',
};

/** Легаси-номер договора в строке v1 → код (тот же порядок, что в каталоге). */
const CONTRACT_CODE_BY_NUMBER: Readonly<Record<number, string>> = {
    0: CONTRACT_CODE.INTERNET,
    1: CONTRACT_CODE.PROXIMA,
    2: CONTRACT_CODE.ABON6,
    3: CONTRACT_CODE.ABON12,
    4: CONTRACT_CODE.LIC6,
    5: CONTRACT_CODE.LIC12,
    6: CONTRACT_CODE.ABON24,
    7: CONTRACT_CODE.LIC24,
    9: CONTRACT_CODE.KEY,
    10: CONTRACT_CODE.KEY,
};

/** Код поставки → название («internet_1» → «Интернет 1 ОД»). */
const SUPPLY_NAME_BY_CODE: Readonly<Record<string, string>> = Object.entries(
    SUPPLY_NUMBER_TO_KEY,
).reduce<Record<string, string>>((acc, [number, key]) => {
    const code = supplyCodeFromNumber(Number(number));
    if (code) acc[code] = key.name;
    return acc;
}, {});

/** Порядок групп строк в наборе v1: главный Гарант идёт первым. */
const V1_ROW_GROUPS = [
    'garant',
    'lt',
    'lt_other',
    'consalting',
    'star',
    'academy',
] as const;

/** Код, который маппер v1 ставит вместо нерасшифрованной поставки/договора. */
const UNKNOWN_CODE = 'unknown';

const asRecord = (value: unknown): JsonRecord | null =>
    typeof value === 'object' && value !== null && !Array.isArray(value)
        ? (value as JsonRecord)
        : null;

const asText = (value: unknown): string | null => {
    if (typeof value !== 'string') return null;
    const text = value.trim();
    return text ? text : null;
};

const asNumber = (value: unknown): number | null => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'string' && value.trim() !== '') {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
};

const round2 = (value: number): number => Math.round(value * 100) / 100;

const asCode = (value: unknown): string | null => {
    const code = asText(value);
    return code && code !== UNKNOWN_CODE ? code : null;
};

/** Сумма строк; null, если ни у одной строки нет числовой суммы. */
const sumOfRows = (rows: readonly SummaryRow[]): number | null => {
    let total = 0;
    let found = false;
    for (const row of rows) {
        if (row.sum === null) continue;
        total += row.sum;
        found = true;
    }
    return found ? round2(total) : null;
};

/** Строка v2: имена в `names`, коды в `refs`, деньги в `price`. */
const readRowV2 = (raw: unknown): SummaryRow | null => {
    const row = asRecord(raw);
    if (!row) return null;
    const names = asRecord(row.names);
    const refs = asRecord(row.refs);
    const price = asRecord(row.price);
    return {
        isMain: row.role === 'main',
        isGarant: row.productType === 'garant',
        complect: asText(names?.name) ?? asText(names?.shortName),
        supplyName: null,
        supplyCode: asCode(refs?.supplyCode),
        contractName: null,
        contractCode: asCode(refs?.contractCode),
        sum: asNumber(price?.sum),
    };
};

/** Строка v1: `supply` и `contract` вложенными объектами со своими именами. */
const readRowV1 = (raw: unknown, isGarant: boolean): SummaryRow | null => {
    const row = asRecord(raw);
    if (!row) return null;
    const supply = asRecord(row.supply);
    const contract = asRecord(row.contract);
    const price = asRecord(row.price);

    const supplyNumber = asNumber(supply?.number);
    const supplyKey =
        supplyNumber === null ? undefined : SUPPLY_NUMBER_TO_KEY[supplyNumber];
    const contractNumber = asNumber(contract?.number);

    return {
        isMain: asNumber(row.id) === 0,
        isGarant,
        complect: asText(row.name) ?? asText(row.shortName),
        supplyName: asText(supply?.name) ?? supplyKey?.name ?? null,
        supplyCode: null,
        contractName: asText(contract?.name),
        contractCode:
            asCode(contract?.code) ??
            (contractNumber === null
                ? null
                : (CONTRACT_CODE_BY_NUMBER[contractNumber] ?? null)),
        sum: asNumber(price?.sum),
    };
};

const readRows = (
    rawRows: unknown,
    read: (raw: unknown) => SummaryRow | null,
): SummaryRow[] => {
    if (!Array.isArray(rawRows)) return [];
    const rows: SummaryRow[] = [];
    for (const raw of rawRows as unknown[]) {
        const row = read(raw);
        if (row) rows.push(row);
    }
    return rows;
};

/** Главная строка: помеченная главной, иначе первый Гарант, иначе первая. */
const mainRowOf = (rows: readonly SummaryRow[]): SummaryRow | null =>
    rows.find(row => row.isMain) ??
    rows.find(row => row.isGarant) ??
    rows[0] ??
    null;

/**
 * Название договора: известный код даёт имя каталога, иначе имя, сохранённое
 * в строке, иначе сам код. Сохранённое имя легаси бывает латиницей («Internet»)
 * или обобщённым («Абонентский» без срока), поэтому код главнее.
 */
const contractLabel = (
    row: SummaryRow,
    fallbackCode: string | null,
): string | null => {
    const code = row.contractCode ?? fallbackCode;
    return (
        (code ? CONTRACT_NAME_BY_CODE[code] : undefined) ??
        row.contractName ??
        code
    );
};

/** Название поставки: имя из строки, иначе имя по коду, иначе сам код. */
const supplyLabel = (
    row: SummaryRow,
    fallbackCode: string | null,
): string | null => {
    const code = row.supplyCode ?? fallbackCode;
    return (
        row.supplyName ?? (code ? SUPPLY_NAME_BY_CODE[code] : undefined) ?? code
    );
};

const buildSummary = (
    rows: readonly SummaryRow[],
    sum: number | null,
    fallbackSupplyCode: string | null,
    fallbackContractCode: string | null,
): LibrarySummary | null => {
    const main = mainRowOf(rows);
    if (!main) return null;
    return {
        // комплект есть только у Гаранта; у сервисной строки главной названия комплекта нет
        complect: main.isGarant ? main.complect : null,
        supply: supplyLabel(main, fallbackSupplyCode),
        contract: contractLabel(main, fallbackContractCode),
        sum,
        rowsCount: rows.length,
    };
};

/**
 * Слепок v2. Итог общего набора: ручная правка свёрнутой строки
 * (`general.totalPrice`) главнее суммы строк, как в конструкторе.
 */
const summarizeV2 = (snapshot: JsonRecord): LibrarySummary | null => {
    const general = asRecord(snapshot.general);
    if (!general) return null;
    const rows = readRows(general.rows, readRowV2);
    if (!rows.length) return null;
    const manualTotal = asNumber(asRecord(general.totalPrice)?.sum);
    return buildSummary(
        rows,
        manualTotal ?? sumOfRows(rows),
        asCode(snapshot.supplyCode),
        asCode(snapshot.contractCode),
    );
};

/**
 * Слепок v1. Общий набор — `sets.general[0]`; строки лежат группами по типу
 * товара. В свёрнутом режиме (`show: 'set'`) итог берётся из total-строки,
 * иначе суммируются строки.
 */
const summarizeV1 = (snapshot: JsonRecord): LibrarySummary | null => {
    const generalSets = asRecord(snapshot.sets)?.general;
    const general = Array.isArray(generalSets)
        ? asRecord((generalSets as unknown[])[0])
        : null;
    const groups = asRecord(general?.rows);
    if (!general || !groups) return null;

    const rows: SummaryRow[] = [];
    for (const group of V1_ROW_GROUPS) {
        rows.push(
            ...readRows(groups[group], raw =>
                readRowV1(raw, group === 'garant'),
            ),
        );
    }
    if (!rows.length) return null;

    const totalRow = Array.isArray(general.total)
        ? readRowV1((general.total as unknown[])[0], true)
        : null;
    const collapsedTotal =
        snapshot.show === 'set' ? (totalRow?.sum ?? null) : null;
    return buildSummary(rows, collapsedTotal ?? sumOfRows(rows), null, null);
};

/**
 * Сводка слепка для списка заготовок. Слепки v2 и v1 с непустым общим набором
 * дают сводку; битый или пустой JSON, неузнаваемый формат и набор без строк
 * дают null. Один `JSON.parse` на вызов, запросов в БД и Битрикс нет,
 * исключения наружу не выходят.
 */
export const librarySummaryOf = (
    rawSnapshot: string | null | undefined,
): LibrarySummary | null => {
    if (typeof rawSnapshot !== 'string') return null;
    const text = rawSnapshot.trim();
    // слепок — всегда объект; 'null', пустота и скаляры разбирать незачем
    if (!text.startsWith('{')) return null;
    try {
        const snapshot = asRecord(JSON.parse(text));
        if (!snapshot) return null;
        return snapshot.schemaVersion === 2
            ? summarizeV2(snapshot)
            : summarizeV1(snapshot);
    } catch {
        return null;
    }
};
