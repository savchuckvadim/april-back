import { OfferPdfTemplateCode } from '../../model/offer-pdf-template-code';
import { OfferPdfDocument } from '../kit/document/OfferPdfDocument';
import type { OfferPdfChrome } from '../kit/document/offer-pdf-chrome';
import { paletteTheme } from '../kit/theme/offer-pdf-palette';
import { OfferPdfTemplate } from '../offer-pdf-template.interface';
import { LavenderCover } from './components/LavenderCover';
import { LavenderFooter } from './components/LavenderFooter';
import { LavenderHeader } from './components/LavenderHeader';
import { GarantPromo } from '../kit/promo/GarantPromo';
import { LAVENDER_PALETTES } from './lavender.theme';

const LAVENDER_CHROME: OfferPdfChrome = {
    Header: LavenderHeader,
    Footer: LavenderFooter,
    Cover: LavenderCover,
    Promo: GarantPromo,
};

/** «Лаванда»: светлый титульник в мягком градиенте, полоса градиента на листах. */
export const lavenderTemplate: OfferPdfTemplate = {
    code: OfferPdfTemplateCode.LAVENDER,
    name: 'Лаванда',
    description:
        'Светлый титульник в мягком градиенте с логотипом Гаранта в цвет гаммы, страница о системе, полоса градиента под шапкой каждого листа.',
    hasCover: true,
    hasPromo: true,
    palettes: LAVENDER_PALETTES,
    logos: ['garant'],
    render: (model, frame) => (
        <OfferPdfDocument
            model={model}
            theme={paletteTheme(LAVENDER_PALETTES, model.palette)}
            chrome={LAVENDER_CHROME}
            frame={frame}
        />
    ),
};
