/** Пункт промо-страницы: заголовок и текст (разметка как у письма) */
export interface OfferPdfPromoItem {
    title: string;
    text: string;
}

/** Промо-страница: о системе или о сервисе. Тексты пока в коде стилей */
export interface OfferPdfPromo {
    title: string;
    /** Вступление под заголовком */
    lead?: string;
    items: readonly OfferPdfPromoItem[];
    /** Заключение под пунктами */
    note?: string;
}
