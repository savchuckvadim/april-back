import { OfferPdfTemplateCode } from '../../model/offer-pdf-template-code';
import { BrandHeader } from '../kit/chrome/BrandHeader';
import { ManagerFooter } from '../kit/chrome/ManagerFooter';
import { defineOfferPdfTemplate } from '../kit/document/define-offer-pdf-template';
import { GarantPromo } from '../kit/promo/GarantPromo';
import { PearlCover } from './components/PearlCover';
import { PearlUnderlay } from './components/PearlUnderlay';
import { PEARL_ASSETS, PEARL_THEME } from './pearl.theme';

/** «Перламутр»: перламутровое стекло, разделы на белых карточках. */
export const pearlTemplate = defineOfferPdfTemplate({
    code: OfferPdfTemplateCode.PEARL,
    name: 'Перламутр',
    description:
        'Титульник с перламутровым стеклом, страница о системе, пастельная полоса сверху листов и разделы на белых карточках.',
    theme: PEARL_THEME,
    chrome: {
        Header: BrandHeader,
        Footer: ManagerFooter,
        Cover: PearlCover,
        Underlay: PearlUnderlay,
        Promo: GarantPromo,
    },
    assets: PEARL_ASSETS,
    logos: ['garant'],
});
