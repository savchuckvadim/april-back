import { OfferPdfTemplateCode } from '../../model/offer-pdf-template-code';
import { defineOfferPdfTemplate } from '../kit/document/define-offer-pdf-template';
import { GarantPromo } from '../kit/promo/GarantPromo';
import { FacetCover } from './components/FacetCover';
import { FacetFooter } from './components/FacetFooter';
import { FacetHeader } from './components/FacetHeader';
import { FACET_PALETTES } from './facet.theme';

/** «Грань»: тёмный титульник с гранями, полоса-шапка в цвет гаммы. */
export const facetTemplate = defineOfferPdfTemplate({
    code: OfferPdfTemplateCode.FACET,
    name: 'Грань',
    description:
        'Тёмный титульник с диагональными гранями и белым логотипом Гаранта, страница о системе, полоса-шапка в цвет гаммы на каждом листе.',
    palettes: FACET_PALETTES,
    chrome: {
        Header: FacetHeader,
        Footer: FacetFooter,
        Cover: FacetCover,
        Promo: GarantPromo,
    },
    logos: ['garant'],
});
