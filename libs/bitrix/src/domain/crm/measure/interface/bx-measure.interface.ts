/**
 * Единица измерения Bitrix (`crm.measure.*`).
 * Поля в SCREAMING_CASE — как отдаёт/принимает Bitrix REST.
 */
export interface IBxMeasure {
    ID?: string | number;
    /** Код ОКЕИ (например, `796` для «шт»). */
    CODE?: string | number;
    MEASURE_TITLE?: string;
    SYMBOL_RUS?: string;
    SYMBOL_INTL?: string;
    SYMBOL_LETTER_INTL?: string;
    IS_DEFAULT?: 'Y' | 'N';
}

/** Ответ `crm.measure.list` (внутри `result`). */
export interface IBxMeasureListResponse {
    measures: IBxMeasure[];
}

/** Ответ `crm.measure.get` (внутри `result`). */
export interface IBxMeasureGetResponse {
    measure: IBxMeasure;
}
