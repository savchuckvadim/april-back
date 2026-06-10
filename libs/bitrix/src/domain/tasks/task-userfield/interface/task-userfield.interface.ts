import { BitrixLangMap } from '../../../crm';

/**
 * Тип пользовательского поля задачи.
 * Bitrix для задач поддерживает ограниченный набор типов
 * (см. task.item.userfield.gettypes): string, double, datetime, boolean.
 */
export enum ETaskUserFieldType {
    STRING = 'string',
    DOUBLE = 'double',
    DATETIME = 'datetime',
    BOOLEAN = 'boolean',
}

/**
 * Тело PARAMS для методов task.item.userfield.add / task.item.userfield.update.
 */
export interface ITaskUserFieldParams {
    USER_TYPE_ID: ETaskUserFieldType | string;
    FIELD_NAME: string; // префикс UF_ (обычно UF_TASK_)
    XML_ID?: string;
    LABEL?: string;
    EDIT_FORM_LABEL?: BitrixLangMap | string;
    SORT?: number | string;
    MULTIPLE?: 'Y' | 'N';
    MANDATORY?: 'Y' | 'N';
    SETTINGS?: Record<string, unknown>;
}

/**
 * Элемент ответа task.item.userfield.getlist.
 */
export interface ITaskUserField {
    ID: string;
    ENTITY_ID: string; // TASKS_TASK
    FIELD_NAME: string;
    USER_TYPE_ID: string;
    XML_ID: string | null;
    SORT: string;
    MULTIPLE: 'Y' | 'N';
    MANDATORY: 'Y' | 'N';
    SHOW_FILTER: string;
    SHOW_IN_LIST: 'Y' | 'N';
    EDIT_IN_LIST: 'Y' | 'N';
    IS_SEARCHABLE: 'Y' | 'N';
    SETTINGS: Record<string, unknown> | unknown[];
}

/**
 * Параметры сортировки/фильтрации для task.item.userfield.getlist.
 */
export interface ITaskUserFieldListOrder {
    [field: string]: 'asc' | 'desc' | 'ASC' | 'DESC';
}
export interface ITaskUserFieldListFilter {
    [field: string]: string | number | string[];
}
