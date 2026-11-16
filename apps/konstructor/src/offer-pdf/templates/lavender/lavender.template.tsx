import { OfferPdfTemplateCode } from '../../model/offer-pdf-template-code';
import { defineOfferPdfTemplate } from '../kit/document/define-offer-pdf-template';
import { GarantPromo } from '../kit/promo/GarantPromo';
import { LavenderCover } from './components/LavenderCover';
import { LavenderFooter } from './components/LavenderFooter';
import { LavenderHeader } from './components/LavenderHeader';
import { LAVENDER_PALETTES } from './lavender.theme';

/** «Лаванда»: светлый титульник в мягком градиенте, полоса градиента на листах. */
export const lavenderTemplate = defineOfferPdfTemplate({
    code: OfferPdfTemplateCode.LAVENDER,
    name: 'Лаванда',
    description:
        'Светлый титульник в мягком градиенте с логотипом Гаранта в цвет гаммы, страница о системе, полоса градиента под шапкой каждого листа.',
    palettes: LAVENDER_PALETTES,
    chrome: {
        Header: LavenderHeader,
        Footer: LavenderFooter,
        Cover: LavenderCover,
        Promo: GarantPromo,
    },
    logos: ['garant'],
});
