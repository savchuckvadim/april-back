import { IBXDeal, IBXProductRowRow } from '@lib/bitrix';

/**
 * Джоба записи сделки: и поля, и единицы измерения товарных строк уже
 * разрезолвлены на этапе HTTP — воркеру портальная схема не нужна, он пишет.
 */
/** Элемент смарта: куда писать поля (camelCase ufCrm…) и строки (ownerType динамического типа). */
export interface DealSendSmartTarget {
    kind: 'smart';
    entityTypeId: number;
    smartId: number;
    /** `T{hex(entityTypeId)}` — ownerType товарных строк динамического типа */
    ownerType: string;
}

export interface DealSendJobDto {
    domain: string;
    dealId: number;
    fields: Partial<IBXDeal>;
    /** undefined — товарные строки не трогаем (пустой массив их очистит). */
    productRows?: IBXProductRowRow[];
    /** Не задан — пишем в сделку (deal.update + строки сделки) */
    target?: DealSendSmartTarget;
}
