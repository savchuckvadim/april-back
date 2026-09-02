/**
 * Лимиты текстов задачи обзвона.
 *
 * `TITLE` у задач Битрикса — `varchar(250)` (`b_tasks.TITLE`): заголовок
 * длиннее не ложится, и `tasks.task.add` отказывает ЦЕЛИКОМ — задача не
 * создаётся, а отчёт при этом выглядит проведённым. Заголовок собирается
 * из типа события, имени плана (во фрейме до 250 символов) и имени
 * контакта — вместе они лимит переступают легко.
 *
 * Комментарий события (`UF_TASK_EVENT_COMMENT`) — строковое UF без лимита
 * на портале, но фрейм режет комментарий на 4000; тот же потолок здесь —
 * страховка от payload мимо фрейма (легаси-сборка, ручной вызов).
 */
export const TASK_TITLE_MAX_LENGTH = 250;
export const TASK_COMMENT_MAX_LENGTH = 4000;

const ELLIPSIS = '…';

/**
 * Заголовок задачи в лимит: режется ИМЯ ПЛАНА, тип события и контакт
 * остаются — по типу парсится вид события (`event-type-token`), по контакту
 * задачу ищут в списке.
 */
export const clipTaskTitle = (
    parts: { typeName: string; eventName: string; contactName: string },
    max: number = TASK_TITLE_MAX_LENGTH,
): string => {
    const compose = (eventName: string): string => {
        let title = `${parts.typeName}  ${eventName}`.trim();
        if (parts.contactName) title += `  ${parts.contactName}`;
        return title;
    };

    const full = compose(parts.eventName);
    if (full.length <= max) return full;

    const overflow = full.length - max;
    const room = parts.eventName.length - overflow - ELLIPSIS.length;
    if (room > 0) {
        return compose(`${parts.eventName.slice(0, room)}${ELLIPSIS}`);
    }
    // Имени плана не хватает даже под многоточие — режем что есть.
    return full.slice(0, max);
};

/** Текст в лимит без многоточия: обрубок комментария лучше отказа задачи. */
export const clipText = (text: string, max: number): string =>
    text.length > max ? text.slice(0, max) : text;
