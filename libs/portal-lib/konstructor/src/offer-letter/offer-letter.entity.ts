/** Текст сопроводительного письма КП (`offer_letters`). */
export class OfferLetterEntity {
    /** uuid */
    id: string;
    portalId: number;
    /** null — письмо портала; задан — личное письмо менеджера */
    bxUserId: number | null;
    name: string;
    /** Разметка прежняя: `<color>`, `<red>`, `<bold>` */
    text: string;
    isDefault: boolean;
    isActive: boolean;
    sort: number;
    /** Поле `fields`, из которого перенесено письмо портала */
    legacyFieldId: number | null;
    createdAt: Date | null;
    updatedAt: Date | null;
}

/** Письмо портала в легаси-шаблоне `offer` (`templates` → `fields`). */
export interface LegacyOfferLetter {
    portalId: number;
    domain: string;
    templateId: number;
    /** Поле `letter`: его текст лежит в `description` */
    fieldId: number;
    text: string;
    /** Поле `isLetter` («с письмом?») — было ли письмо включено */
    enabled: boolean;
}
