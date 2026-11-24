import { IBXCompany, IBXDeal } from '@/modules/bitrix';

/**
 * Снимок карточек на момент события: всё, что поток документов читает из
 * Битрикса перед записью. Счётчики считаются как «значение из снимка + 1»,
 * поэтому снимок обязан быть свежим — он читается внутри слота клиента.
 */
export interface EventDocumentSnapshot {
    /** Компания клиента; null — не прочитана (удалена, нет прав). */
    readonly company: IBXCompany | null;
    /** Основная сделка события. */
    readonly baseDeal: IBXDeal;
    /** Сделка презентации; null — документ не «после презентации». */
    readonly presentationDeal: IBXDeal | null;
}

/** Ключи команд читающей пачки. */
export const EVENT_DOCUMENT_READ_CMD = {
    company: 'get_company',
    baseDeal: 'get_base_deal',
    presentationDeal: 'get_pres_deal',
    presentationDeals: 'list_pres_deals',
} as const;
