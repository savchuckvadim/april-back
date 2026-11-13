import { OfferPdfDocumentModel } from '../../model/offer-pdf-document.model';
import { OFFER_PDF_DEFAULT_SETTINGS } from '../../model/offer-pdf-settings';
import { OfferPdfTemplateCode } from '../../model/offer-pdf-template-code';
import { createOfferRenderDataFixture } from '@app/konstructor/offer-word/lib/sample-offer-render-data';

export { createOfferRenderDataFixture };

export const createOfferPdfModelFixture = (
    overrides: Partial<OfferPdfDocumentModel> = {},
): OfferPdfDocumentModel => ({
    templateCode: OfferPdfTemplateCode.CLASSIC,
    settings: { ...OFFER_PDF_DEFAULT_SETTINGS },
    data: createOfferRenderDataFixture(),
    letter: { appeal: null, text: null },
    signer: { position: 'Генеральный директор', name: 'А. В. Кузнецов' },
    images: {},
    meta: { date: '31 октября 2026 г.', documentNumber: null },
    ...overrides,
});
