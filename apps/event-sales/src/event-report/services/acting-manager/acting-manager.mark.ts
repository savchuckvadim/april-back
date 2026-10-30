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
    /**
     * Сотрудник, которому руководитель назначил следующий шаг
     * (`plan.responsibility`). Владелец 30.10.2026: из истории должно быть
     * видно не только кто отчитался, но и на кого записана работа. Нет —
     * строки «Назначено сотруднику» не будет.
     */
    readonly employee?: ActingManagerEmployee;
}

export interface ActingManagerEmployee {
    readonly id: number;
    /** Имя из структуры отдела; пустое — подпись с ID. */
    readonly name: string;
}

const LABEL_CONFIRMED = 'Отчитался руководитель';
const LABEL_UNCONFIRMED = 'Отчёт отправил';
const LABEL_EMPLOYEE = 'Назначено сотруднику';

/** Подпись строки пометки — зависит от того, подтверждена ли роль. */
export const actingManagerLabel = (mark: ActingManagerMark): string =>
    mark.isConfirmedHead ? LABEL_CONFIRMED : LABEL_UNCONFIRMED;

/** Имя для подписи; без имени — нейтрально, с идентификатором. */
export const actingManagerName = (mark: ActingManagerMark): string =>
    mark.name.trim() || `сотрудник #${mark.id}`;

/** «Отчитался руководитель: Иванов Иван» — одной строкой, без разметки. */
export const actingManagerNote = (mark: ActingManagerMark): string =>
    `${actingManagerLabel(mark)}: ${actingManagerName(mark)}`;

/** Подпись строки о сотруднике — одна на историю, таймлайн и задачу. */
export const actingManagerEmployeeLabel = (): string => LABEL_EMPLOYEE;

/** Имя сотрудника для подписи; без имени — с идентификатором. */
export const actingManagerEmployeeName = (
    employee: ActingManagerEmployee,
): string => employee.name.trim() || `сотрудник #${employee.id}`;

/** «Назначено сотруднику: Зрелова Анна»; '' — сотрудник не известен. */
export const actingManagerEmployeeNote = (mark: ActingManagerMark): string =>
    mark.employee
        ? `${LABEL_EMPLOYEE}: ${actingManagerEmployeeName(mark.employee)}`
        : '';

/** Обе строки пометки в одну — для мест без переносов (комментарий KPI). */
export const actingManagerInlineNote = (mark: ActingManagerMark): string =>
    [actingManagerNote(mark), actingManagerEmployeeNote(mark)]
        .filter(Boolean)
        .join(', ');

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
