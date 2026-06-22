import { IBxMeasure } from '@/modules/bitrix';

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

/** Привести сырой элемент Bitrix (`crm.measure.*`) к {@link BxMeasure}. */
export function toBxMeasure(row: IBxMeasure): BxMeasure {
    return {
        id: Number(row.ID ?? 0),
        code: String(row.CODE ?? ''),
        title: String(row.MEASURE_TITLE ?? ''),
        symbol: String(row.SYMBOL_RUS ?? row.SYMBOL_INTL ?? ''),
        isDefault: row.IS_DEFAULT === 'Y',
    };
}
