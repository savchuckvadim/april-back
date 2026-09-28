/**
 * Пометка «кто отчитался за сотрудника» — чистые данные и подписи.
 *
 * Режим руководителя в «Звонках» (решения владельца 28.09.2026): отчёт по
 * делу сотрудника идёт ОТ ИМЕНИ сотрудника — сделки, задачи и KPI остаются
 * за ним. Руководитель виден только пометкой, и текст этой пометки обязан
 * быть одинаковым в истории карточки, таймлайне, задаче и KPI.
 */
export interface ActingManagerMark {
    /** Bitrix ID того, кто фактически отправил отчёт. */
    readonly id: number;
    /** Имя для подписи; пустое — подставится нейтральная подпись с ID. */
    readonly name: string;
    /**
     * Сотрудник входит в периметр руководителя по структуре отдела продаж.
     * false — структура не подтвердила (или не прочиталась): пометка
     * остаётся, но без слова «руководитель» — называть так человека, чью
     * роль не подтвердили, значило бы врать в истории клиента.
     */
    readonly isConfirmedHead: boolean;
}

const LABEL_CONFIRMED = 'Отчитался руководитель';
const LABEL_UNCONFIRMED = 'Отчёт отправил';

/** Подпись строки пометки — зависит от того, подтверждена ли роль. */
export const actingManagerLabel = (mark: ActingManagerMark): string =>
    mark.isConfirmedHead ? LABEL_CONFIRMED : LABEL_UNCONFIRMED;

/** Имя для подписи; без имени — нейтрально, с идентификатором. */
export const actingManagerName = (mark: ActingManagerMark): string =>
    mark.name.trim() || `сотрудник #${mark.id}`;

/** «Отчитался руководитель: Иванов Иван» — одной строкой, без разметки. */
export const actingManagerNote = (mark: ActingManagerMark): string =>
    `${actingManagerLabel(mark)}: ${actingManagerName(mark)}`;

/** Ссылка на профиль сотрудника на портале. */
export const userProfileUrl = (domain: string, userId: number): string =>
    `https://${domain}/company/personal/user/${userId}/`;

/**
 * Комментарий менеджера с пометкой в хвосте — для мест, где пометке негде
 * жить отдельной строкой (комментарий записи KPI).
 */
export const withActingManagerNote = (
    comment: string,
    note: string,
): string => {
    const text = comment?.trim() ?? '';
    if (!note) return text;
    return text ? `${text} (${note})` : note;
};
