import {
    DocumentFieldDescriptionMode,
    DocumentFieldViewMode,
} from '../../offer/type/offer-settings.type';

/**
 * Настройки КП — те же, что были в старой PHP-версии: сколько описания
 * наполнения, список или таблица, печати, менеджер, порядок «цена/наполнение».
 */
export interface OfferPdfSettings {
    descriptionMode: DocumentFieldDescriptionMode;
    viewMode: DocumentFieldViewMode;
    withStamps: boolean;
    withManager: boolean;
    isPriceFirst: boolean;
    salePhrase: string | null;
}

/** Вход с фронта: любое поле можно не передавать — подставится умолчание. */
export type OfferPdfSettingsInput = {
    [K in keyof OfferPdfSettings]?: OfferPdfSettings[K] | null;
};

export const OFFER_PDF_DEFAULT_SETTINGS: Readonly<OfferPdfSettings> = {
    descriptionMode: DocumentFieldDescriptionMode.SMALL,
    viewMode: DocumentFieldViewMode.LIST,
    withStamps: true,
    withManager: true,
    isPriceFirst: false,
    salePhrase: null,
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
        withStamps: input?.withStamps ?? OFFER_PDF_DEFAULT_SETTINGS.withStamps,
        withManager:
            input?.withManager ?? OFFER_PDF_DEFAULT_SETTINGS.withManager,
        isPriceFirst:
            input?.isPriceFirst ?? OFFER_PDF_DEFAULT_SETTINGS.isPriceFirst,
        salePhrase: salePhrase.length > 0 ? salePhrase : null,
    };
};
