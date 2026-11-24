/**
 * Старый список «Презентации» отдела продаж. Ключ списка в слепке портала —
 * `${group}_${type}`, то есть `sales_presentation`.
 *
 * Строки списка создаёт легаси-хук (Laravel) при планировании презентации.
 * Новый бэк их не заводит — только дописывает в уже существующую строку
 * суммы документов, сформированных после презентации.
 */
export const PBX_SALES_PRESENTATION_LIST_CODE = 'sales_presentation' as const;

/** Коды полей списка без префикса `sales_presentation_`. */
export const PBX_SALES_PRESENTATION_LIST_FIELD_CODES = {
    /** Сумма предложения. */
    sumOffer: 'pres_sum_offer',
    /** Сумма счёта. */
    sumInvoice: 'pres_sum_invoice',
    /** Комментарий после презентации (множественное поле). */
    doneComment: 'pres_done_comment',
    /** Перспективность. */
    prospectsType: 'pres_prospects_type',
} as const;

export type PbxSalesPresentationListFieldCode =
    (typeof PBX_SALES_PRESENTATION_LIST_FIELD_CODES)[keyof typeof PBX_SALES_PRESENTATION_LIST_FIELD_CODES];

/** Варианты поля «Перспективность», которые пишет новый бэк. */
export const PBX_SALES_PRESENTATION_LIST_ITEM_CODES = {
    prospectsGood: 'pres_prospects_good',
} as const;

/** Код строки списка: `{основная сделка}_{сделка презентации}`. */
export const salesPresentationListRowCode = (
    baseDealId: number | string,
    presentationDealId: number | string,
): string => `${baseDealId}_${presentationDealId}`;
