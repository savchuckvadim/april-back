/**
 * Ссылка на карточку элемента смарт-процесса в Bitrix24:
 * `https://{домен}/crm/type/{entityTypeId}/details/{itemId}/` — тот же
 * формат, что строит `buildSmartItemLink` для витрины. Хвост запроса или
 * якорь (`?…`, `#…`) допускаются, схема только https.
 */
export const AI_REVIEW_LINK_PATTERN =
    /^https:\/\/([a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+)\/crm\/type\/(\d+)\/details\/(\d+)\/?(?:[?#].*)?$/i;

export interface SmartItemLinkParts {
    /** Домен портала в нижнем регистре. */
    domain: string;
    entityTypeId: number;
    itemId: number;
}

/** Разбор ссылки; null — не ссылка на карточку элемента смарта. */
export function parseSmartItemLink(link: string): SmartItemLinkParts | null {
    const match = AI_REVIEW_LINK_PATTERN.exec(link.trim());
    if (!match) return null;
    const entityTypeId = Number(match[2]);
    const itemId = Number(match[3]);
    if (entityTypeId <= 0 || itemId <= 0) return null;
    return { domain: match[1].toLowerCase(), entityTypeId, itemId };
}
