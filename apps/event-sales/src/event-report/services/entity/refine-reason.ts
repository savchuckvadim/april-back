import { clipText } from '../task/event-task-title';

/**
 * Причина «на доработке» — чистый сборщик для поля `op_refined_reason`.
 *
 * Поле пишет фрейм из чек-листа доработки, и набранное менеджером не
 * перекрывается никогда (решение владельца 02.09.2026). Этот сборщик —
 * ФОЛБЭК для пустого поля: возражения клиента (справочник + формулировка
 * своими словами), а если их нет — комментарий отчёта.
 *
 * На ПЕРЕНОСЕ задачи «Доработка» комментарий отчёта в причину не идёт:
 * перенос — это «недозвон» или «перенесли на завтра», и такой текст
 * причиной доработки не является.
 *
 * Ни портала, ни Bitrix, ни экранирования: `toBatchSafeText` — свойство
 * транспорта, он в точке записи (модель полей).
 */

/** Item «Нет возражений»: явный ответ «их нет», в причину как имя не идёт. */
export const OBJECTION_NONE_CODE = 'op_objection_none';

/** Лимит поля причины: string-UF в карточке, дальше — обрезка с «…». */
export const REFINE_REASON_MAX_LENGTH = 500;

export interface RefineObjection {
    readonly code: string;
    readonly name: string;
}

export interface RefineReasonSource {
    /** Выбранные возражения носителя (сделка → компания → лид). */
    readonly objections: readonly RefineObjection[];
    /** Формулировка клиента своими словами (`op_objection_comment`). */
    readonly objectionComment: string;
    /** Комментарий отчёта — фолбэк, когда возражений нет. */
    readonly reportComment: string;
    /** Перенос задачи «Доработка» — фолбэк на комментарий выключен. */
    readonly isTransfer: boolean;
}

/**
 * `Нет денег, ЛПР против — «дорого и не сейчас»`; пусто → `null` (поле не
 * трогаем — это не обнуление).
 */
export const composeRefineReason = (src: RefineReasonSource): string | null => {
    const names = src.objections
        .filter(objection => objection.code !== OBJECTION_NONE_CODE)
        .map(objection => objection.name.trim())
        .filter(Boolean)
        .join(', ');
    const comment = src.objectionComment.trim();
    const head = [names, comment ? `«${comment}»` : '']
        .filter(Boolean)
        .join(' — ');
    const text = head || (src.isTransfer ? '' : src.reportComment.trim());
    if (!text) return null;
    return text.length > REFINE_REASON_MAX_LENGTH
        ? `${clipText(text, REFINE_REASON_MAX_LENGTH - 1).trimEnd()}…`
        : text;
};
