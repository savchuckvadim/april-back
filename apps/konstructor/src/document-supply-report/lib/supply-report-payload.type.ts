/**
 * Формы кусков payload’а, которые легаси-конструктор шлёт «как есть», без DTO.
 *
 * В DTO они объявлены как `any` / `Record<string, unknown>`: валидировать их
 * строго нельзя (фронт шлёт больше полей, чем нам нужно, и whitelist срежет
 * лишнее), но читать их без типов — значит тащить `any` через весь сервис.
 * Поэтому здесь описано ровно то, что реально читает генерация отчёта.
 */

/** Контакт сделки из `bxContacts`: карточка битрикса + поля формы ОРК. */
export interface SupplyReportContactPayload {
    contact?: {
        NAME?: string;
        POST?: string;
        COMMENTS?: string;
        PHONE?: Array<{ VALUE?: string }>;
    };
    fields?: Array<{
        field?: { code?: string; title?: string };
        current?: { code?: string; title?: string };
    }>;
}

/** Поле заполненной формы отчёта о поставке из `supplyReport`. */
export interface SupplyReportFormPayloadItem {
    code?: string;
    type?: string;
    /** У select-полей значение приходит объектом, у остальных — строкой. */
    value?: string | number | { code?: string; name?: string } | null;
    items?: Array<{ code?: string; name?: string }>;
}

/** Состояние провайдера: из него нужен только реквизит `fullname`. */
export interface ContractProviderStatePayload {
    current?: { rq?: { fullname?: string } };
}

/** Блок консалтинга: нужен только заголовок текущего варианта. */
export interface ConsaltingPayload {
    current?: { title?: string };
}
