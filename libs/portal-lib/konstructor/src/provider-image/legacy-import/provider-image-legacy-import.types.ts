import { ProviderImageRole } from '../provider-image.role';

/**
 * ВРЕМЕННЫЙ перенос печатей, подписей и логотипов из легаси (таблица `files`)
 * в `provider_images`. После переноса вся папка `legacy-import/` удаляется
 * (порядок — в README картинок поставщика).
 */

/** Поле multipart-запроса, в котором приходят файлы легаси. */
export const PROVIDER_IMAGE_LEGACY_IMPORT_FIELD = 'files';

/** Сколько файлов можно приложить к одному запросу. */
export const PROVIDER_IMAGE_LEGACY_IMPORT_MAX_FILES = 100;

/**
 * Потолок размера одного файла на входе. Картинки сверх лимита поставщика
 * (2 МБ) режет `ProviderImageService`, а этот запас нужен, чтобы запрос с
 * тяжёлым файлом дошёл до отчёта и показал ошибку у своей строки.
 */
export const PROVIDER_IMAGE_LEGACY_IMPORT_MAX_BYTES = 10 * 1024 * 1024;

/** Итог по одной записи легаси. */
export const PROVIDER_IMAGE_LEGACY_IMPORT_STATUSES = [
    'imported',
    'would-import',
    'exists',
    'already',
    'no-file',
    'skipped',
    'error',
] as const;

export type ProviderImageLegacyImportStatus =
    (typeof PROVIDER_IMAGE_LEGACY_IMPORT_STATUSES)[number];

/** Строка отчёта: одна запись `files` реквизитов (или загруженный файл без записи). */
export interface ProviderImageLegacyImportRow {
    /** Домен портала, которому принадлежат реквизиты; null — не определён */
    portalDomain: string | null;
    /** `rqs.id`; 0 — у загруженного файла нет записи в `files` */
    rqId: number;
    rqName: string | null;
    /** Роль в `provider_images`; null — запись не переносится */
    role: ProviderImageRole | null;
    /** `files.id`; 0 — у загруженного файла нет записи в `files` */
    legacyFileId: number;
    legacyPath: string;
    status: ProviderImageLegacyImportStatus;
    /** Пояснение по-русски */
    message: string | null;
}

export interface ProviderImageLegacyImportTotals {
    imported: number;
    wouldImport: number;
    exists: number;
    already: number;
    noFile: number;
    skipped: number;
    error: number;
}

export interface ProviderImageLegacyImportReport {
    dryRun: boolean;
    rows: ProviderImageLegacyImportRow[];
    totals: ProviderImageLegacyImportTotals;
}

/** Загруженный файл: имя несёт относительный путь внутри папки `clients`. */
export interface ProviderImageLegacyUpload {
    name: string;
    buffer: Buffer | undefined;
}
