/**
 * Подписи CRM-сущностей для текстов, которые читает человек (описания
 * задач, комментарии таймлайна, push).
 *
 * Зачем отдельным утилем: подпись собиралась в каждом форматтере заново, и
 * контакт в описании задачи назывался иначе, чем тот же контакт в записи
 * таймлайна. Правило одно — фамилия, имя, отчество; чего нет, того нет.
 */

/** Минимум полей контакта, из которых складывается подпись. */
export interface INamedContact {
    NAME?: string | null;
    LAST_NAME?: string | null;
    SECOND_NAME?: string | null;
}

/** «Иванов Иван Иванович»; пусто — контакт без имени вовсе. */
export const contactFullName = (contact: INamedContact): string =>
    [contact.LAST_NAME, contact.NAME, contact.SECOND_NAME]
        .map(part => (part ?? '').trim())
        .filter(Boolean)
        .join(' ');

/**
 * Заголовок сущности (`TITLE` компании/сделки/лида) либо честный запасной
 * вариант: пустая подпись у ссылки — это кликабельная пустота.
 */
export const entityTitleOr = (raw: unknown, fallback: string): string => {
    const title = typeof raw === 'string' ? raw.trim() : '';
    return title || fallback;
};
