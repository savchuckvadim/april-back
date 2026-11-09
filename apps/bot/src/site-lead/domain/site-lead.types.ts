/**
 * Заявка с сайта April: то, что посетитель оставил в форме, плюс страница,
 * с которой он её отправил. Доменная форма — DTO её реализует.
 */

/** Виды заявок: от вида зависит заголовок сообщения в чате. */
export const SITE_LEAD_KINDS = ['demo', 'callback', 'offer'] as const;
export type SiteLeadKind = (typeof SITE_LEAD_KINDS)[number];

/** Заголовок сообщения в чате заявок по виду заявки. */
export const SITE_LEAD_TITLES: Record<SiteLeadKind, string> = {
    demo: 'Заявка на демо',
    callback: 'Заявка с сайта',
    offer: 'Просят КП на почту',
};

export interface SiteLead {
    kind: SiteLeadKind;
    name?: string;
    /** Телефон или почта — хотя бы одно: иначе связаться не с кем. */
    phone?: string;
    email?: string;
    company?: string;
    comment?: string;
    /** Путь страницы сайта: по нему видно, что человек читал перед заявкой. */
    page: string;
}

/** Предельные длины полей формы (символы до экранирования). */
export const SITE_LEAD_LIMITS = {
    name: 100,
    phone: 40,
    email: 200,
    company: 200,
    comment: 2000,
    page: 200,
} as const satisfies Record<Exclude<keyof SiteLead, 'kind'>, number>;

/**
 * В телефоне не меньше десяти цифр — иначе перезвонить некуда. Якорь «^»
 * обязателен: без него движок пробует каждую позицию строки, и длинная
 * строка без цифр проверяется за квадратичное время.
 */
export const SITE_LEAD_PHONE_PATTERN = /^(?:\D*\d){10}/;

/** Путь страницы сайта: начинается с «/», без пробелов. */
export const SITE_LEAD_PAGE_PATTERN = /^\/\S*$/;

/**
 * Потолок СООБЩЕНИЙ сайта в чат за минуту на весь процесс — предохранитель:
 * у Telegram около 20 сообщений в минуту на группу, а чат общий с сигналами
 * поддержки, им нужен запас. Бриф резервирует все свои части разом.
 * Одного посетителя режет сайт (лимит по адресу в Next-маршрутах), а
 * напрямую без ключа сайта ручку не вызвать (SiteLeadKeyGuard).
 */
export const SITE_LEAD_MAX_PER_MINUTE = 15;

/** Итог приёма: доставлено, отбито потолком или Telegram не принял. */
export type SiteLeadSubmitResult = 'delivered' | 'throttled' | 'failed';
