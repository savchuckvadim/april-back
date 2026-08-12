/** Имя папки загрузок СКАП на Диске группы отдела сервиса. */
export const SKAP_DISK_FOLDER_NAME = 'СКАП. Загрузка';

/** Redis-лок тика крона импорта СКАП. */
export const SKAP_SCAN_LOCK_KEY = 'skap-import:scan-lock';

/** Ключ времени последнего скана домена: skap:last-scan:{domain}. */
export function buildSkapLastScanKey(domain: string): string {
    return `skap:last-scan:${domain}`;
}

/** Redis-лок еженедельного крона сводных задач по контактам СКАП. */
export const SKAP_CONTACT_TASK_LOCK_KEY = 'skap-contact-task:lock';

/** Метка «до какого момента контакты уже разобраны в задачи» (per-домен). */
export function buildSkapContactTaskKey(domain: string): string {
    return `skap:contact-task:last:${domain}`;
}

/** Сколько автосозданных контактов идёт в одну сводную задачу. */
export const SKAP_CONTACT_TASK_CHUNK = 30;
