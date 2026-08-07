/**
 * Типы crm.entity.mergeBatch — объединение однотипных CRM-сущностей.
 *
 * Метод сливает данные всех элементов `entityIds` в ПЕРВЫЙ элемент массива,
 * остальные элементы БЕЗВОЗВРАТНО УДАЛЯЮТСЯ. Порядок массива — не деталь
 * реализации, а судьба данных: survivor всегда первый.
 */

/** entityTypeId, которые поддерживает mergeBatch (по официальной документации). */
export enum EBxMergeEntityTypeId {
    LEAD = 1,
    DEAL = 2,
    CONTACT = 3,
    COMPANY = 4,
    QUOTE = 7,
    INVOICE = 31,
    SMART_PROCESS = 128,
}

export interface IBXMergeBatchParams {
    /** Тип объединяемых сущностей — все элементы одного типа. */
    entityTypeId: EBxMergeEntityTypeId | number;
    /**
     * Идентификаторы: минимум два. Первый — survivor (в него сливаются
     * данные), остальные удаляются.
     */
    entityIds: number[];
}

/** Тело запроса метода — параметры ВЛОЖЕНЫ в поле `params`. */
export interface IBXMergeBatchRequest {
    params: IBXMergeBatchParams;
}

export type BxMergeBatchStatus = 'SUCCESS' | 'CONFLICT' | 'ERROR';

export interface IBXMergeBatchResult {
    /**
     * SUCCESS — объединено; CONFLICT — Битрикс нашёл противоречивые данные
     * (разрешается только руками в штатном интерфейсе); ERROR — ошибка.
     */
    STATUS: BxMergeBatchStatus;
    /** Идентификаторы сущностей, УДАЛЁННЫХ в ходе объединения. */
    ENTITY_IDS: number[];
}
