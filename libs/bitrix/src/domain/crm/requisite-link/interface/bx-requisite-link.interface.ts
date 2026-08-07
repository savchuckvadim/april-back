/**
 * Типы crm.requisite.link.* — связь реквизитов с объектами CRM.
 *
 * Связь используют сделки/счета/предложения (ENTITY_TYPE_ID 2, 5, 7, 31 и
 * динамические объекты): сам реквизит принадлежит компании или контакту, а
 * link-таблица говорит, какой реквизит «выбран» у конкретной сделки.
 */
export interface IBXRequisiteLink {
    /** Тип объекта: сделка — 2, старый счёт — 5, предложение — 7, новый счёт — 31. */
    ENTITY_TYPE_ID: number;
    ENTITY_ID: number;
    /** Реквизит клиента. Битрикс возвращает id строками. */
    REQUISITE_ID: number | string;
    /** Банковский реквизит клиента. */
    BANK_DETAIL_ID: number | string;
    /** Реквизит «моей компании». */
    MC_REQUISITE_ID: number | string;
    /** Банковский реквизит «моей компании». */
    MC_BANK_DETAIL_ID: number | string;
}

export interface IBXRequisiteLinkGetRequest {
    entityTypeId: number;
    entityId: number;
}

/** register принимает полный набор полей связи, обёрнутый в fields. */
export type IBXRequisiteLinkRegisterFields = IBXRequisiteLink;
