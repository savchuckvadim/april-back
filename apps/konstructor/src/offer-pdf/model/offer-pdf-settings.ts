import {
    DocumentFieldDescriptionMode,
    DocumentFieldViewMode,
} from './offer-document-settings.type';

/**
 * Настройки КП — те же, что были в старой PHP-версии: сколько описания
 * наполнения, список или таблица, печати, менеджер, порядок «цена/наполнение».
 */
export interface OfferPdfSettings {
    descriptionMode: DocumentFieldDescriptionMode;
    viewMode: DocumentFieldViewMode;
    /**
     * Сопроводительное письмо. Выключено: КП идёт без письма, а печать и
     * подпись поставщика, что стоят под ним, не печатаются (решение владельца
     * 27.11.2026). Запросы без поля печатают письмо, как раньше.
     */
    withLetter: boolean;
    withStamps: boolean;
    withManager: boolean;
    isPriceFirst: boolean;
    salePhrase: string | null;
    /** Титульный лист — у стилей, где он есть; у остальных ни на что не влияет */
    withCover: boolean;
    /** Промо-страница после титульника — у стилей, где она есть */
    withPromo: boolean;
}

/** Вход с фронта: любое поле можно не передавать — подставится умолчание. */
export type OfferPdfSettingsInput = {
    [K in keyof OfferPdfSettings]?: OfferPdfSettings[K] | null;
};

export const OFFER_PDF_DEFAULT_SETTINGS: Readonly<OfferPdfSettings> = {
    descriptionMode: DocumentFieldDescriptionMode.SMALL,
    viewMode: DocumentFieldViewMode.LIST,
    withLetter: true,
    withStamps: true,
    withManager: true,
    isPriceFirst: false,
    salePhrase: null,
    withCover: true,
    withPromo: true,
};

export const resolveOfferPdfSettings = (
    input?: OfferPdfSettingsInput | null,
): OfferPdfSettings => {
    const salePhrase = input?.salePhrase?.trim() ?? '';
    return {
        descriptionMode:
            input?.descriptionMode ??
            OFFER_PDF_DEFAULT_SETTINGS.descriptionMode,
        viewMode: input?.viewMode ?? OFFER_PDF_DEFAULT_SETTINGS.viewMode,
        withLetter: input?.withLetter ?? OFFER_PDF_DEFAULT_SETTINGS.withLetter,
        withStamps: input?.withStamps ?? OFFER_PDF_DEFAULT_SETTINGS.withStamps,
        withManager:
            input?.withManager ?? OFFER_PDF_DEFAULT_SETTINGS.withManager,
        isPriceFirst:
            input?.isPriceFirst ?? OFFER_PDF_DEFAULT_SETTINGS.isPriceFirst,
        salePhrase: salePhrase.length > 0 ? salePhrase : null,
        withCover: input?.withCover ?? OFFER_PDF_DEFAULT_SETTINGS.withCover,
        withPromo: input?.withPromo ?? OFFER_PDF_DEFAULT_SETTINGS.withPromo,
    };
};
