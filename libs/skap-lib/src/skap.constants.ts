/** Имя папки загрузок СКАП на Диске группы отдела сервиса. */
export const SKAP_DISK_FOLDER_NAME = 'СКАП. Загрузка';

/** Redis-лок тика крона импорта СКАП. */
export const SKAP_SCAN_LOCK_KEY = 'skap-import:scan-lock';

/** Ключ времени последнего скана домена: skap:last-scan:{domain}. */
export function buildSkapLastScanKey(domain: string): string {
    return `skap:last-scan:${domain}`;
}
