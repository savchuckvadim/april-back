/**
 * Событие «документ сформирован» (КП, счёт, договор, отчёт о поставке):
 * бэк конструктора ставит задание в `QueueNames.EVENT_SALES_DOCUMENT_FLOW`,
 * воркер event-sales двигает основную сделку, обновляет поля карточек и
 * пишет списки «ОП KPI» и «ОП История». Тип общий для обеих сторон очереди:
 * приложения монорепо не импортируют код друг друга.
 */

/** Что сформировано. КП со счётом — два значения в одном событии. */
export const SALES_DOCUMENT_KIND = {
    offer: 'offer',
    invoice: 'invoice',
    contract: 'contract',
    supply: 'supply',
} as const;

export type SalesDocumentKind =
    (typeof SALES_DOCUMENT_KIND)[keyof typeof SALES_DOCUMENT_KIND];

export const SALES_DOCUMENT_KINDS: readonly SalesDocumentKind[] =
    Object.values(SALES_DOCUMENT_KIND);

/**
 * Презентация, в продолжение которой сформирован документ. Блок передан —
 * документ «после презентации»; ни одного id — воркер сам возьмёт последнюю
 * презентацию основной сделки.
 */
export interface SalesDocumentPresentationRef {
    /** Сделка презентации (воронка «Презентации»). */
    readonly dealId?: number;
    /** Элемент смарт-процесса «Презентации». */
    readonly smartItemId?: number;
}

/** Товарная строка в формате `crm.item.productrow.set`. */
export interface SalesDocumentProductRow {
    readonly productName: string;
    readonly price: number;
    readonly quantity: number;
    readonly priceNetto?: number;
    readonly discountSum?: number;
    readonly discountTypeId?: number;
    readonly measureCode?: string;
    readonly measureId?: number;
    readonly sort?: number;
}

export interface SalesDocumentEventJobData {
    /** Номер события: выдаёт конструктор, по нему отсекается повтор. */
    readonly eventId: string;
    /** Домен портала. */
    readonly domain: string;
    /** Кто сформировал документ. */
    readonly userId: number;
    /** Компания клиента. */
    readonly companyId: number;
    /** Основная сделка («ОП Основная»). */
    readonly dealId: number;
    /** Какие документы сформированы. */
    readonly kinds: readonly SalesDocumentKind[];
    /** Момент формирования, ISO-строка: он же дата документа в карточке. */
    readonly createdAt: string;
    /** Заполнен — документ в продолжение презентации. */
    readonly presentation?: SalesDocumentPresentationRef;
    /** Сумма документа. */
    readonly sum?: number;
    /** Товарные строки: уходят в сделку презентации. */
    readonly productRows?: readonly SalesDocumentProductRow[];
    /** Короткий текст для комментария: позиции, цена, количество. */
    readonly summary?: string;
}

/** Один джоб на событие: повторная постановка того же события не дублируется. */
export const salesDocumentEventJobId = (eventId: string): string =>
    `sales-document:${eventId}`;

/**
 * Автоповторов нет: счётчики документов считаются как «прочитал + 1», и
 * повтор после частичной записи удвоил бы их. Сбой уходит в Telegram.
 */
export const SALES_DOCUMENT_EVENT_ATTEMPTS = 1;
