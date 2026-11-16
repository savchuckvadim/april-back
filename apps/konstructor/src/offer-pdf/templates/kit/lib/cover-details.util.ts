import type { OfferCoverContent } from './cover.util';
import { joinNonEmpty } from './text.util';

/** «ИНН 3664098765» или пусто */
export const recipientInnLine = (cover: OfferCoverContent): string =>
    cover.recipientInn ? `ИНН ${cover.recipientInn}` : '';

/** Телефон и почта менеджера одной строкой */
export const managerContactsLine = (cover: OfferCoverContent): string =>
    cover.manager
        ? joinNonEmpty([cover.manager.phone, cover.manager.email], ' · ')
        : '';
