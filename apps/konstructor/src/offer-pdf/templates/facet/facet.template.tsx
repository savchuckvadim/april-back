import { OfferPdfTemplateCode } from '../../model/offer-pdf-template-code';
import { OfferPdfDocument } from '../kit/document/OfferPdfDocument';
import type { OfferPdfChrome } from '../kit/document/offer-pdf-chrome';
import { paletteTheme } from '../kit/theme/offer-pdf-palette';
import { OfferPdfTemplate } from '../offer-pdf-template.interface';
import { FacetCover } from './components/FacetCover';
import { FacetFooter } from './components/FacetFooter';
import { FacetHeader } from './components/FacetHeader';
import { GarantPromo } from '../kit/promo/GarantPromo';
import { FACET_PALETTES } from './facet.theme';

const FACET_CHROME: OfferPdfChrome = {
    Header: FacetHeader,
    Footer: FacetFooter,
    Cover: FacetCover,
    Promo: GarantPromo,
};

/** «Грань»: тёмный титульник с гранями, полоса-шапка в цвет гаммы. */
export const facetTemplate: OfferPdfTemplate = {
    code: OfferPdfTemplateCode.FACET,
    name: 'Грань',
    description:
        'Тёмный титульник с диагональными гранями и белым логотипом Гаранта, страница о системе, полоса-шапка в цвет гаммы на каждом листе.',
    hasCover: true,
    hasPromo: true,
    palettes: FACET_PALETTES,
    logos: ['garant'],
    render: (model, frame) => (
        <OfferPdfDocument
            model={model}
            theme={paletteTheme(FACET_PALETTES, model.palette)}
            chrome={FACET_CHROME}
            frame={frame}
        />
    ),
};
