import { OfferPdfTemplateCode } from '../../model/offer-pdf-template-code';
import { BrandHeader } from '../kit/chrome/BrandHeader';
import { ManagerFooter } from '../kit/chrome/ManagerFooter';
import { defineOfferPdfTemplate } from '../kit/document/define-offer-pdf-template';
import { PearlCover } from './components/PearlCover';
import { PearlPromo } from './components/PearlPromo';
import { PearlPromoUnderlay } from './components/PearlPromoUnderlay';
import { PearlUnderlay } from './components/PearlUnderlay';
import { PEARL_ASSETS, PEARL_THEME } from './pearl.theme';

/** «Перламутр»: перламутровое стекло, разделы на белых карточках. */
export const pearlTemplate = defineOfferPdfTemplate({
    code: OfferPdfTemplateCode.PEARL,
    name: 'Перламутр',
    description:
        'Титульник с перламутровым стеклом, страница о системе с перламутровой шапкой, разделы на белых карточках поверх перламутра.',
    theme: PEARL_THEME,
    chrome: {
        Header: BrandHeader,
        Footer: ManagerFooter,
        Cover: PearlCover,
        Underlay: PearlUnderlay,
        Promo: PearlPromo,
        PromoUnderlay: PearlPromoUnderlay,
    },
    assets: PEARL_ASSETS,
    logos: ['garant'],
});
