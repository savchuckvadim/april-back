import {
    LegacyOfferLetter,
    OfferLetterEntity,
    OfferLetterScope,
} from './offer-letter.entity';

/** Данные для создания письма. */
export interface CreateOfferLetterData {
    portalId: number;
    bxUserId: number | null;
    name: string;
    text: string;
    isDefault: boolean;
    isActive?: boolean;
    sort?: number;
    legacyFieldId?: number | null;
}

/**
 * Поля письма, которые можно менять. Область (портал, менеджер) и флаг «по
 * умолчанию» сюда не входят: флаг меняется только через `setScopeDefault`.
 */
export interface UpdateOfferLetterData {
    name?: string;
    text?: string;
    isActive?: boolean;
    sort?: number;
}

export abstract class OfferLetterRepository {
    /** Все письма портала: портальные и личные менеджеров, по порядку `sort` */
    abstract findByPortal(portalId: number): Promise<OfferLetterEntity[]>;

    abstract findById(id: string): Promise<OfferLetterEntity | null>;

    /** Активное письмо портала по умолчанию (не личное) по домену портала */
    abstract findPortalDefault(
        domain: string,
    ): Promise<OfferLetterEntity | null>;

    /** Есть ли такой портал: письмо без портала нарушило бы внешний ключ */
    abstract portalExists(portalId: number): Promise<boolean>;

    /** Какие из легаси-полей уже перенесены */
    abstract findImportedLegacyFieldIds(fieldIds: number[]): Promise<number[]>;

    abstract create(data: CreateOfferLetterData): Promise<OfferLetterEntity>;

    /** null — письма с таким id нет */
    abstract update(
        id: string,
        data: UpdateOfferLetterData,
    ): Promise<OfferLetterEntity | null>;

    /** false — письма с таким id нет */
    abstract delete(id: string): Promise<boolean>;

    /**
     * Одной транзакцией: у всех писем области флаг «по умолчанию» снят, кроме
     * `defaultId`, у которого он стоит. `null` — в области нет письма по
     * умолчанию.
     */
    abstract setScopeDefault(
        scope: OfferLetterScope,
        defaultId: string | null,
    ): Promise<void>;

    /** Письма порталов из легаси-шаблонов `offer` — источник переноса */
    abstract findLegacyPortalLetters(): Promise<LegacyOfferLetter[]>;
}
