import { LegacyOfferLetter, OfferLetterEntity } from './offer-letter.entity';

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

export abstract class OfferLetterRepository {
    /** Все письма портала: портальные и личные менеджеров */
    abstract findByPortal(portalId: number): Promise<OfferLetterEntity[]>;

    /** Активное письмо портала по умолчанию (не личное) по домену портала */
    abstract findPortalDefault(
        domain: string,
    ): Promise<OfferLetterEntity | null>;

    /** Какие из легаси-полей уже перенесены */
    abstract findImportedLegacyFieldIds(fieldIds: number[]): Promise<number[]>;

    abstract create(data: CreateOfferLetterData): Promise<OfferLetterEntity>;

    /** Письма порталов из легаси-шаблонов `offer` — источник переноса */
    abstract findLegacyPortalLetters(): Promise<LegacyOfferLetter[]>;
}
