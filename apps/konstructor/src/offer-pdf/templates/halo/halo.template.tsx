import { OfferPdfTemplateCode } from '../../model/offer-pdf-template-code';
import { defineOfferPdfTemplate } from '../kit/document/define-offer-pdf-template';
import { GarantPromo } from '../kit/promo/GarantPromo';
import { HaloCover } from './components/HaloCover';
import { HaloFooter } from './components/HaloFooter';
import { HaloHeader } from './components/HaloHeader';
import { HALO_ASSETS, HALO_THEME } from './halo.theme';

/** «Ореол»: размытые кольца на титульнике, коралловые черты на листах. */
export const haloTemplate = defineOfferPdfTemplate({
    code: OfferPdfTemplateCode.HALO,
    name: 'Ореол',
    description:
        'Титульник с размытыми цветными кольцами и коралловой чертой, страница о системе, коралловые градиентные черты под шапкой и в подвале.',
    theme: HALO_THEME,
    chrome: {
        Header: HaloHeader,
        Footer: HaloFooter,
        Cover: HaloCover,
        Promo: GarantPromo,
    },
    assets: HALO_ASSETS,
    logos: ['garant'],
});
