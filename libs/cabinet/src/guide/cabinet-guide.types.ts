/**
 * Путеводитель по кабинету клиента для админки: тексты + живой чек-лист
 * готовности (по окружению admin — корневой .env — и настройкам в БД).
 */

/** Раздел путеводителя: markdown (подмножество GFM). */
export interface CabinetGuideSection {
    key: string;
    title: string;
    markdown: string;
}

/**
 * Состояние пункта «что осталось, чтобы заработало»:
 * done — сделано, todo — не сделано, manual — админка проверить не может
 * (как проверить — в подсказке).
 */
export const CABINET_GUIDE_CHECK_STATUSES = ['done', 'todo', 'manual'] as const;
export type CabinetGuideCheckStatus =
    (typeof CABINET_GUIDE_CHECK_STATUSES)[number];

export interface CabinetGuideLink {
    title: string;
    /** Путь админки (`/client`) или внешний адрес. */
    href: string;
}

export interface CabinetGuideCheck {
    key: string;
    title: string;
    status: CabinetGuideCheckStatus;
    /** Что сделать или как проверить. Markdown. */
    hint: string;
    link: CabinetGuideLink | null;
}

/** Сколько всего подключено — для шапки путеводителя. */
export interface CabinetGuideCounters {
    portals: number;
    portalsWithClient: number;
    portalsWithOwner: number;
    /** Активные участники (владельцы + участники). */
    members: number;
    /** Заявки из фрейма, ждущие подтверждения. */
    pending: number;
    telegramBindings: number;
}

/** Факты, из которых собирается чек-лист (собирает сервис, проверяет чистая функция). */
export interface CabinetGuideFacts {
    /** Таблицы portal_users и telegram_bindings есть (миграции применены). */
    tablesReady: boolean;
    authJwtSecretSet: boolean;
    authEnabled: boolean;
    cookieDomain: string | null;
    corsAllowsSite: boolean;
    siteUrl: string;
    botTokenSet: boolean;
    /** Имя бота по ответу Telegram; null — токена нет или Telegram не узнал его. */
    botUsername: string | null;
    webhookUrl: string;
    mailHost: string;
}

export interface CabinetGuide {
    summary: string;
    /** null — таблицы кабинета ещё не созданы. */
    counters: CabinetGuideCounters | null;
    checklist: CabinetGuideCheck[];
    sections: CabinetGuideSection[];
    links: CabinetGuideLink[];
}
