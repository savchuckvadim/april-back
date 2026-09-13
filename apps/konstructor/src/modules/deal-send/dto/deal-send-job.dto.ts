import { IBXDeal, IBXProductRowRow } from '@lib/bitrix';

/**
 * Джоба записи сделки: и поля, и единицы измерения товарных строк уже
 * разрезолвлены на этапе HTTP — воркеру портальная схема не нужна, он пишет.
 */
export interface DealSendJobDto {
    domain: string;
    dealId: number;
    fields: Partial<IBXDeal>;
    /** undefined — товарные строки не трогаем (пустой массив их очистит). */
    productRows?: IBXProductRowRow[];
}
