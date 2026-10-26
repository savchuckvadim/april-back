/** Раздел путеводителя по поддержке для админки: markdown (подмножество GFM). */
export interface SupportGuideSection {
    key: string;
    title: string;
    markdown: string;
}

/**
 * Состояние пункта «что осталось, чтобы заработало»:
 * done — сделано (проверено по настройкам или факту), todo — не сделано,
 * manual — админка проверить не может, как проверить — в подсказке.
 */
export const SUPPORT_GUIDE_CHECK_STATUSES = ['done', 'todo', 'manual'] as const;
export type SupportGuideCheckStatus =
    (typeof SUPPORT_GUIDE_CHECK_STATUSES)[number];

export interface SupportGuideLink {
    title: string;
    /** Путь админки (`/portal/7/app-settings`) или внешний адрес. */
    href: string;
}

export interface SupportGuideCheck {
    key: string;
    title: string;
    status: SupportGuideCheckStatus;
    /** Что сделать или как проверить. Markdown. */
    hint: string;
    link: SupportGuideLink | null;
}

/** Путеводитель: тексты + живое состояние портала линии. */
export interface SupportGuide {
    /** Портал открытой линии поддержки. */
    lineDomain: string;
    /** Портал линии в нашей БД; null — его там нет, настройки не сохранить. */
    portalId: number | null;
    summary: string;
    checklist: SupportGuideCheck[];
    sections: SupportGuideSection[];
    links: SupportGuideLink[];
}
