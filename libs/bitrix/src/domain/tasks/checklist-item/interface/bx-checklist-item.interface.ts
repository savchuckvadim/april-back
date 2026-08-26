/**
 * Участник пункта чек-листа (`FIELDS[MEMBERS]`): ключ — id пользователя,
 * `TYPE` — роль. Битрикс добавляет участника пункта в саму задачу в той же
 * роли, поэтому поле трогаем осознанно.
 */
export const EBXChecklistMemberType = {
    /** Соисполнитель. */
    ACCOMPLICE: 'A',
    /** Наблюдатель. */
    AUDITOR: 'U',
} as const;

export type BXChecklistMemberType =
    (typeof EBXChecklistMemberType)[keyof typeof EBXChecklistMemberType];

export type IBXChecklistItemMembers = Record<
    string | number,
    { TYPE: BXChecklistMemberType }
>;

export interface IBXChecklistItemFields {
    TITLE: string;
    IS_COMPLETE?: 'Y' | 'N';
    /** Чем меньше — тем выше пункт в списке. */
    SORT_INDEX?: number;
    COMPLETED_BY?: number | string;
    /** Пункт важный (жирная отметка в карточке задачи). */
    IS_IMPORTANT?: 'Y' | 'N';
    /**
     * Родительский пункт. `0` — создать НОВЫЙ чек-лист (пункт становится его
     * названием); не передавать — пункт уедет в верхний чек-лист задачи
     * (а если его нет — Битрикс создаст).
     */
    PARENT_ID?: number | string;
    MEMBERS?: IBXChecklistItemMembers;
}

export interface IBXChecklistItemAddRequest {
    TASKID: number | string;
    FIELDS: IBXChecklistItemFields;
}

export interface IBXChecklistItemAddResponse {
    result: number;
}

export interface IBXChecklistItemGetRequest {
    TASKID: number | string;
    ITEMID: number | string;
}

export interface IBXChecklistItem {
    ID: string;
    TITLE: string;
    IS_COMPLETE: 'Y' | 'N';
    SORT_INDEX: string;
    TASK_ID?: string;
    /** `0` (или отсутствие) — сам чек-лист, иначе id родительского пункта. */
    PARENT_ID?: string | number;
    CREATED_BY?: string;
    IS_IMPORTANT?: 'Y' | 'N';
    /** Кто последним переключил галку; null — пункт не трогали. */
    TOGGLED_BY?: string | null;
    /** Когда переключили (ISO); '' либо null — не трогали. */
    TOGGLED_DATE?: string | null;
    [key: string]: unknown;
}

export interface IBXChecklistItemGetResponse {
    result: IBXChecklistItem;
}

/** Поля, по которым `task.checklistitem.getlist` умеет сортировать. */
export type BXChecklistItemOrderField =
    | 'ID'
    | 'PARENT_ID'
    | 'CREATED_BY'
    | 'TITLE'
    | 'SORT_INDEX'
    | 'IS_COMPLETE'
    | 'IS_IMPORTANT'
    | 'TOGGLED_BY'
    | 'TOGGLED_DATE';

export interface IBXChecklistItemGetListRequest {
    TASKID: number | string;
    /**
     * Сортировка `{ поле: 'asc' | 'desc' }`. По умолчанию Битрикс отдаёт
     * по `ID` убыванием — для читаемого чек-листа сортируем по `SORT_INDEX`.
     */
    ORDER?: Partial<Record<BXChecklistItemOrderField, 'asc' | 'desc'>>;
    /** Страница выдачи: метод отдаёт максимум 50 пунктов за вызов. */
    start?: number;
}

/**
 * ВНИМАНИЕ: это payload БЕЗ обёртки `{ result }` — `callType` оборачивает
 * его сам (`IBitrixResponse<T>`), как во всех crm-схемах. Соседние
 * add/get/update-ответы этого файла исторически объявлены с обёрткой; их не
 * трогаем — потребителей у них нет, а поведение схемы менять вне задачи.
 */
export type IBXChecklistItemGetListResponse = IBXChecklistItem[];

export interface IBXChecklistItemUpdateRequest {
    TASKID: number | string;
    ITEMID: number | string;
    FIELDS: Partial<IBXChecklistItemFields>;
}

export interface IBXChecklistItemUpdateResponse {
    result: boolean;
}

export interface IBXChecklistItemDeleteRequest {
    TASKID: number | string;
    ITEMID: number | string;
}

export interface IBXChecklistItemDeleteResponse {
    result: boolean;
}

export interface IBXChecklistItemCompleteRequest {
    TASKID: number | string;
    ITEMID: number | string;
}

export interface IBXChecklistItemCompleteResponse {
    result: boolean;
}
