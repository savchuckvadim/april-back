import { OfferPdfTemplateCode } from '../../model/offer-pdf-template-code';
import { BrandHeader } from '../kit/chrome/BrandHeader';
import { ManagerFooter } from '../kit/chrome/ManagerFooter';
import { defineOfferPdfTemplate } from '../kit/document/define-offer-pdf-template';
import { GarantPromo } from '../kit/promo/GarantPromo';
import { SilkCover } from './components/SilkCover';
import { SilkUnderlay } from './components/SilkUnderlay';
import { SILK_ASSETS, SILK_THEME } from './silk.theme';

/** «Шёлк»: золотые волны, разделы на белых карточках. */
export const silkTemplate = defineOfferPdfTemplate({
    code: OfferPdfTemplateCode.SILK,
    name: 'Шёлк',
    description:
        'Титульник с золотыми линиями-волнами, страница о системе, те же волны бледно под белыми карточками разделов.',
    theme: SILK_THEME,
    chrome: {
        Header: BrandHeader,
        Footer: ManagerFooter,
        Cover: SilkCover,
        Underlay: SilkUnderlay,
        Promo: GarantPromo,
    },
    assets: SILK_ASSETS,
    logos: ['garant'],
});
