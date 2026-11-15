import { IOfferWordRenderData } from '@app/konstructor/offer-word/services/render-data-services/offer-render-data.service';
import { OfferPdfSettings } from '../../../model/offer-pdf-settings';

/** Заголовок PDF в свойствах файла */
export const offerDocumentTitle = (data: IOfferWordRenderData): string =>
    data.GeneralProductName
        ? `Коммерческое предложение — ${data.GeneralProductName}`
        : 'Коммерческое предложение';

export type OfferSectionKey = 'price' | 'stamps' | 'infoblocks';

/**
 * Порядок разделов. Подпись руководителя — под письмом, как в старой
 * версии; при «сначала цена» — сразу после цены. В конце документа она
 * оставалась одна на пустой странице.
 */
export const offerSectionOrder = (
    settings: OfferPdfSettings,
): OfferSectionKey[] => {
    const withStamps: OfferSectionKey[] = settings.withStamps ? ['stamps'] : [];
    return settings.isPriceFirst
        ? ['price', ...withStamps, 'infoblocks']
        : [...withStamps, 'infoblocks', 'price'];
};
