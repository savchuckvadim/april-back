/**
 * Статусы и входные типы store-слоя импорта СКАП.
 * Union-литералы — через as const-массивы (ai/rules/pbx-typing.md):
 * те же массивы переиспользуются в @IsIn и Swagger enum админки.
 */

export const SKAP_FILE_STATUSES = [
    'pending',
    'processing',
    'done',
    'error',
    'error_format',
    'skipped',
] as const;
export type SkapFileStatus = (typeof SKAP_FILE_STATUSES)[number];

export const SKAP_ITEM_STATUSES = [
    'created',
    'updated',
    'skipped_no_company',
    'skipped_too_old',
    'error',
] as const;
export type SkapItemStatus = (typeof SKAP_ITEM_STATUSES)[number];

/** Статусы, при которых запись считается «занятой» (не ретраится). */
export const SKAP_ITEM_BUSY_STATUSES: readonly SkapItemStatus[] = [
    'created',
    'updated',
];

export const SKAP_RUN_STATUSES = [
    'running',
    'done',
    'stopped_time_budget',
    'error',
] as const;
export type SkapRunStatus = (typeof SKAP_RUN_STATUSES)[number];

/** Файл с Диска Битрикс для синка журнала (сырые данные листинга). */
export interface SkapDiskFileInput {
    diskFileId: string;
    fileName: string;
    diskUpdatedAt: Date | null;
    size: bigint | null;
}

/** Итог синка листинга Диска с журналом файлов. */
export interface SkapFileSyncResult {
    added: number;
    /** Перезалитые файлы (изменился UPDATE_TIME/size) — сброшены в pending. */
    reset: number;
    unchanged: number;
}

/** Счётчики файла/прогона (кладутся в stats Json). */
export interface SkapFileStats {
    rowsParsed: number;
    itemsCreated: number;
    itemsUpdated: number;
    itemsSkippedNoCompany: number;
    itemsSkippedTooOld: number;
    itemsError: number;
    sessionsSaved: number;
    subscriptionsSaved: number;
    /** Автосозданные контакты (ключ СКАП-логина + задача ответственному). */
    contactsCreated: number;
    warnings: string[];
}

export interface SkapRunStats extends SkapFileStats {
    filesFound: number;
    filesProcessed: number;
    filesError: number;
}

/**
 * Лимит ворнингов, сохраняемых в JSON `stats` (БД): годовой архив даёт
 * тысячи строк «компания не найдена», раздутый JSON ломает сортировки
 * MySQL («Out of sort memory», прод-инцидент 2026-08-12). Полная картина
 * восстанавливается из skap_import_items (status/warning per запись).
 */
export const SKAP_STATS_WARNINGS_LIMIT = 100;

/** Обрезает ворнинги для сохранения в stats (хвост — одной строкой). */
export function capSkapWarnings(
    warnings: string[],
    limit = SKAP_STATS_WARNINGS_LIMIT,
): string[] {
    if (warnings.length <= limit) return warnings;
    return [
        ...warnings.slice(0, limit),
        `…и ещё ${warnings.length - limit} ворнингов (обрезано при сохранении; детали — в skap_import_items)`,
    ];
}

/** Пустые счётчики (стартовое значение аккумулятора). */
export function emptySkapFileStats(): SkapFileStats {
    return {
        rowsParsed: 0,
        itemsCreated: 0,
        itemsUpdated: 0,
        itemsSkippedNoCompany: 0,
        itemsSkippedTooOld: 0,
        itemsError: 0,
        sessionsSaved: 0,
        subscriptionsSaved: 0,
        contactsCreated: 0,
        warnings: [],
    };
}

export function emptySkapRunStats(): SkapRunStats {
    return {
        ...emptySkapFileStats(),
        filesFound: 0,
        filesProcessed: 0,
        filesError: 0,
    };
}

/** Upsert-вход записи логин×месяц. */
export interface SkapItemUpsertInput {
    portalId: bigint;
    domain: string;
    dedupKey: string;
    clientCard: string;
    regList: string;
    login: string;
    /** 1-е число отчётного месяца. */
    period: Date;
    status: SkapItemStatus;
    bitrixItemId?: number | null;
    companyId?: number | null;
    dealId?: number | null;
    contactId?: number | null;
    warning?: string | null;
    sessionCount?: number | null;
    timeTotalMin?: number | null;
    ipCount?: number | null;
    fileId?: string | null;
}

/** Вход bulk-вставки сессии (Online_detail). */
export interface SkapSessionInput {
    portalId: bigint;
    domain: string;
    dedupKey: string;
    itemId?: string | null;
    clientCard: string;
    regList: string;
    login: string;
    complectArmId?: string | null;
    complectType?: string | null;
    startedAt: Date;
    endedAt?: Date | null;
    durationSec: number;
    ip?: string | null;
}

/** Вход bulk-вставки подписки (Prime_lent). */
export interface SkapSubscriptionInput {
    portalId: bigint;
    domain: string;
    dedupKey: string;
    itemId?: string | null;
    clientCard: string;
    regList: string;
    complectArmId: string;
    complectName?: string | null;
    supplyKind?: string | null;
    city?: string | null;
    region?: string | null;
    version?: string | null;
    content?: string | null;
    managerName?: string | null;
    managerEmail?: string | null;
    mailingName?: string | null;
    mailingEmail?: string | null;
    isActive: boolean;
    /** 1-е число месяца снапшота. */
    period: Date;
}
