import { createOfferRenderDataFixture } from '@app/konstructor/offer-word/lib/sample-offer-render-data';
import { OfferPdfDocumentModel } from '../model/offer-pdf-document.model';
import { resolveOfferPdfSettings } from '../model/offer-pdf-settings';
import { OfferPdfTemplateCode } from '../model/offer-pdf-template-code';

/**
 * КП-образец для превью стилей: тот же «Гарант-Офис», что и у витрины
 * Word-шаблонов, титульник включён. Промо-страница выключена: от превью
 * нужна только первая страница, а у стилей с промо она всегда титульная —
 * лишний лист только замедлял сборку. Данные вымышленные — в превью не
 * уходит ничего из сделок.
 */
export const sampleOfferPdfModel = (
    templateCode: OfferPdfTemplateCode,
    palette: string | null = null,
): OfferPdfDocumentModel => ({
    templateCode,
    palette,
    settings: resolveOfferPdfSettings({ withPromo: false }),
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
