import {
    PROVIDER_IMAGE_ROLE_LABELS,
    ProviderImageRole,
} from '../provider-image.role';
import {
    PROVIDER_IMAGE_LEGACY_IMPORT_MAX_BYTES,
    PROVIDER_IMAGE_LEGACY_IMPORT_MAX_FILES,
} from './provider-image-legacy-import.types';

const MEGABYTES = PROVIDER_IMAGE_LEGACY_IMPORT_MAX_BYTES / (1024 * 1024);

/** Тексты переноса из легаси: по-русски, с тем, что сделать дальше. */
export const PROVIDER_IMAGE_LEGACY_IMPORT_MESSAGES = {
    noFiles:
        'Файлы не переданы: приложите файлы из папки clients в поле «files».',
    badUpload: `Запрос не разобран: приложите до ${PROVIDER_IMAGE_LEGACY_IMPORT_MAX_FILES} файлов в поле «files» (multipart/form-data).`,
    fileTooLarge: `Один из файлов больше ${MEGABYTES} МБ: уберите его из выбора и повторите.`,
    badDryRun:
        'Параметр dryRun указан неверно: допустимы значения true и false.',
    noRecord:
        'Нет записи в files: путь не найден среди файлов реквизитов, файл не переносится.',
    ambiguous: (ids: readonly number[]) =>
        `Имя файла без пути подходит к нескольким записям files (${ids.join(', ')}): передайте файлы вместе с путём внутри папки clients.`,
    rqMissing: (rqId: number) =>
        `Реквизиты ${rqId} не найдены в базе: запись files ссылается на несуществующие реквизиты.`,
    already: (legacyFileId: number) =>
        `Уже перенесено: у реквизитов есть эта картинка (запись files ${legacyFileId}).`,
    exists: (legacyFileId: number | null) =>
        legacyFileId === null
            ? 'У реквизитов уже есть картинка этой роли, загруженная в админке: перезапись не выполняется.'
            : `У реквизитов уже есть картинка этой роли, перенесённая из другой записи files (${legacyFileId}): перезапись не выполняется.`,
    noFile: (path: string) =>
        `Файл не загружен: в выбранной папке нет ${path}.`,
    wouldImport: (role: ProviderImageRole) =>
        `Будет перенесено: ${PROVIDER_IMAGE_ROLE_LABELS[role]}.`,
    imported: (role: ProviderImageRole) =>
        `Перенесено: ${PROVIDER_IMAGE_ROLE_LABELS[role]}.`,
} as const;
