import { createOfferRenderDataFixture } from '@app/konstructor/offer-word/lib/sample-offer-render-data';
import { OfferPdfDocumentModel } from '../model/offer-pdf-document.model';
import { resolveOfferPdfSettings } from '../model/offer-pdf-settings';
import { OfferPdfTemplateCode } from '../model/offer-pdf-template-code';

/** Меняется при правке образца — по нему клиент сбрасывает кэш превью */
export const STYLE_PREVIEW_SAMPLE_VERSION = 'garant-office-1';

/**
 * КП-образец для превью стилей: тот же «Гарант-Офис», что и у витрины
 * Word-шаблонов, настройки по умолчанию (титульник включён). Данные
 * вымышленные — в превью не уходит ничего из сделок.
 */
export const sampleOfferPdfModel = (
    templateCode: OfferPdfTemplateCode,
): OfferPdfDocumentModel => ({
    templateCode,
    settings: resolveOfferPdfSettings(),
    data: createOfferRenderDataFixture({
        GeneralProductName: 'Гарант-Офис',
        GeneralProductByContractName:
            'Услуги по информационному обслуживанию Гарант-Офис',
    }),
    letter: { appeal: null, text: null },
    signer: { position: 'Генеральный директор', name: 'А. В. Кузнецов' },
    images: {},
    meta: { date: '1 декабря 2026 г.', documentNumber: null },
});
