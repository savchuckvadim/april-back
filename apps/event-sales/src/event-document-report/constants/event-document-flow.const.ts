/**
 * Сколько событий «документ сформирован» выполняется одновременно. Разные
 * клиенты идут параллельно; по одному клиенту — строго по одному (слот
 * клиента в обработчике).
 */
export const EVENT_DOCUMENT_FLOW_CONCURRENCY = 4;

/** Одновременных событий на портал: один портал не занимает всех воркеров. */
export const EVENT_DOCUMENT_MAX_PER_DOMAIN = 2;

/** Пауза перед повторной попыткой занять слот клиента. */
export const EVENT_DOCUMENT_SLOT_RETRY_DELAY_MS = 3000;

/** Потолок перекладываний (~7,5 минуты): дальше — ошибка, а не вечное ожидание. */
export const EVENT_DOCUMENT_MAX_SLOT_RETRIES = 150;

/** Подпись операции в тревогах и журнале сбоев Битрикса. */
export const EVENT_DOCUMENT_OPERATION = 'Поток документов';

/** Ключи команд пишущей пачки. */
export const EVENT_DOCUMENT_WRITE_CMD = {
    company: 'doc_company',
    baseDeal: 'doc_base_deal',
    presentationDeal: 'doc_pres_deal',
    presentationDealRows: 'doc_pres_deal_rows',
    presentationListRow: 'doc_pres_list_row',
} as const;
