import { IOfferWordRenderData } from '@app/konstructor/offer-word/services/render-data-services/offer-render-data.service';
import { OfferPdfSettings } from '../../../model/offer-pdf-settings';
import type { OfferPdfChrome } from './offer-pdf-chrome';

/** Заголовок PDF в свойствах файла */
export const offerDocumentTitle = (data: IOfferWordRenderData): string =>
    data.GeneralProductName
        ? `Коммерческое предложение — ${data.GeneralProductName}`
        : 'Коммерческое предложение';

/** Какие листы печатаются перед разделами и где стоит письмо */
export interface OfferDocumentPages {
    /** Титульник: есть у стиля и включён настройкой */
    withCover: boolean;
    /** Промо-страница: есть у стиля и включена настройкой */
    withPromo: boolean;
    /** Письмо и подпись стоят на промо-странице — в начале документа их нет */
    letterInPromo: boolean;
}

export const offerDocumentPages = (
    settings: OfferPdfSettings,
    chrome: Pick<OfferPdfChrome, 'Cover' | 'Promo' | 'promoReplacesLetter'>,
): OfferDocumentPages => {
    const withPromo = Boolean(chrome.Promo) && settings.withPromo;
    return {
        withCover: Boolean(chrome.Cover) && settings.withCover,
        withPromo,
        letterInPromo: withPromo && Boolean(chrome.promoReplacesLetter),
    };
};

export type OfferSectionKey = 'price' | 'stamps' | 'infoblocks';

/**
 * Порядок разделов. Подпись руководителя — под письмом, как в старой
 * версии; при «сначала цена» — сразу после цены. В конце документа она
 * оставалась одна на пустой странице. Подписи среди разделов нет, если она
 * выключена или уже стоит под письмом на промо-странице (withoutStamps).
 */
export const offerSectionOrder = (
    settings: OfferPdfSettings,
    withoutStamps = false,
): OfferSectionKey[] => {
    const stamps: OfferSectionKey[] =
        settings.withStamps && !withoutStamps ? ['stamps'] : [];
    return settings.isPriceFirst
        ? ['price', ...stamps, 'infoblocks']
        : [...stamps, 'infoblocks', 'price'];
};
