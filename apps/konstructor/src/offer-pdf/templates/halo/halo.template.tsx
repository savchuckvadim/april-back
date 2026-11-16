import { OfferPdfTemplateCode } from '../../model/offer-pdf-template-code';
import { OfferPdfDocument } from '../kit/document/OfferPdfDocument';
import type { OfferPdfChrome } from '../kit/document/offer-pdf-chrome';
import { GarantPromo } from '../kit/promo/GarantPromo';
import { OfferPdfTemplate } from '../offer-pdf-template.interface';
import { HaloCover } from './components/HaloCover';
import { HaloFooter } from './components/HaloFooter';
import { HaloHeader } from './components/HaloHeader';
import { HALO_ASSETS, HALO_THEME } from './halo.theme';

const HALO_CHROME: OfferPdfChrome = {
    Header: HaloHeader,
    Footer: HaloFooter,
    Cover: HaloCover,
    Promo: GarantPromo,
};

/** «Ореол»: размытые кольца на титульнике, коралловые черты на листах. */
export const haloTemplate: OfferPdfTemplate = {
    code: OfferPdfTemplateCode.HALO,
    name: 'Ореол',
    description:
        'Титульник с размытыми цветными кольцами и коралловой чертой, страница о системе, коралловые градиентные черты под шапкой и в подвале.',
    hasCover: true,
    hasPromo: true,
    assets: [HALO_ASSETS.cover],
    logos: ['garant'],
    render: (model, frame) => (
        <OfferPdfDocument
            model={model}
            theme={HALO_THEME}
            chrome={HALO_CHROME}
            frame={frame}
        />
    ),
};
