/**
 * Типы формат-гварда выгрузок СКАП: три вида файлов, typed-строки и
 * результат парсинга с ворнингами. Защита от смены формата: парсинг идёт
 * по ИМЕНАМ колонок заголовка (header-map), не по позициям.
 */

export const SKAP_FILE_KINDS = [
    'online',
    'online_detail',
    'prime_lent',
] as const;
export type SkapFileKind = (typeof SKAP_FILE_KINDS)[number];

/** Версии форматов (пишутся в skap_import_files и в поле смарта). */
export const SKAP_FORMAT_VERSIONS = {
    online: 'online_v1',
    online_detail: 'online_detail_v1',
    prime_lent: 'prime_lent_v1',
} as const satisfies Record<SkapFileKind, string>;

/** Коды ворнингов формата (типизировано — уходят в stats и алерты). */
export const SKAP_FORMAT_WARNING_CODES = [
    'format_extra_columns',
    'format_no_header',
    'rows_skipped',
] as const;
export type SkapFormatWarningCode = (typeof SKAP_FORMAT_WARNING_CODES)[number];

export interface SkapFormatWarning {
    code: SkapFormatWarningCode;
    message: string;
}

/**
 * Обязательная колонка пропала/переименована либо файл не распознан —
 * записи по файлу НЕ создаются, файл получает status=error_format,
 * немедленный Telegram-алерт.
 */
export class SkapFormatError extends Error {
    constructor(
        readonly kind: SkapFileKind | null,
        message: string,
    ) {
        super(message);
        this.name = 'SkapFormatError';
    }
}

/** Строка Online.csv: агрегат логин × месяц (источник элемента смарта). */
export interface SkapOnlineRow {
    regList: string;
    rpName: string;
    clientCard: string;
    clientName: string;
    complectArmId: string;
    supplyKind: string;
    complectType: string;
    netCoef: string;
    loginCreated: Date | null;
    login: string;
    sessionCount: number;
    ipCount: number;
    ipList: string;
    timeMs: number;
}

/** Строка Online_detail.csv: одна сессия (заход/выход/длительность/IP). */
export interface SkapDetailRow {
    regList: string;
    rpName: string;
    clientCard: string;
    clientName: string;
    complectArmId: string;
    complectType: string;
    netCoef: string;
    login: string;
    loginCreated: Date | null;
    startedAt: Date;
    endedAt: Date | null;
    durationMs: number;
    ip: string;
}

/** Строка Prime_lent.csv: комплект × рассылка (месячный справочник). */
export interface SkapPrimeLentRow {
    regList: string;
    rpName: string;
    city: string;
    region: string;
    clientCard: string;
    clientName: string;
    complectArmId: string;
    supplyKind: string;
    complectName: string;
    netCoef: string;
    version: string;
    content: string;
    managerName: string;
    managerEmail: string;
    mailingName: string;
    mailingEmail: string;
    isActive: boolean;
}

export interface SkapParsedFile<TRow> {
    kind: SkapFileKind;
    formatVersion: string;
    rows: TRow[];
    warnings: SkapFormatWarning[];
}

/** Результат разбора файла любого вида (discriminated по kind). */
export type SkapParsedAnyFile =
    | ({ kind: 'online' } & SkapParsedFile<SkapOnlineRow>)
    | ({ kind: 'online_detail' } & SkapParsedFile<SkapDetailRow>)
    | ({ kind: 'prime_lent' } & SkapParsedFile<SkapPrimeLentRow>);
