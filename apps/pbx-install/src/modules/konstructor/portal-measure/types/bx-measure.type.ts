/**
 * Сырой элемент единицы измерения из Bitrix (`crm.measure.list` → `result.measures`).
 * Поля приходят в SCREAMING_CASE. Все опциональны — нормализуем при маппинге.
 */
export interface BxMeasureRow {
    ID?: string | number;
    CODE?: string | number;
    MEASURE_TITLE?: string;
    SYMBOL_RUS?: string;
    SYMBOL_INTL?: string;
    SYMBOL_LETTER_INTL?: string;
    IS_DEFAULT?: string;
}

/** Нормализованная единица измерения из Bitrix клиента. */
export interface BxMeasure {
    /** ID единицы измерения в Bitrix (ключ сопоставления с `portal_measure.bitrixId`). */
    id: number;
    /** Код ОКЕИ (например, `796` для «шт»). */
    code: string;
    /** Название единицы измерения (`MEASURE_TITLE`). */
    title: string;
    /** Условное обозначение (`SYMBOL_RUS`/`SYMBOL_INTL`). */
    symbol: string;
    /** Признак единицы измерения по умолчанию. */
    isDefault: boolean;
}

/** Привести сырой элемент Bitrix к {@link BxMeasure}. */
export function toBxMeasure(row: BxMeasureRow): BxMeasure {
    return {
        id: Number(row.ID ?? 0),
        code: String(row.CODE ?? ''),
        title: String(row.MEASURE_TITLE ?? ''),
        symbol: String(row.SYMBOL_RUS ?? row.SYMBOL_INTL ?? ''),
        isDefault: row.IS_DEFAULT === 'Y',
    };
}
