import { OfferPdfTemplateCode } from '../../model/offer-pdf-template-code';
import { BrandHeader } from '../kit/chrome/BrandHeader';
import { ManagerFooter } from '../kit/chrome/ManagerFooter';
import { OfferPdfDocument } from '../kit/document/OfferPdfDocument';
import type { OfferPdfChrome } from '../kit/document/offer-pdf-chrome';
import { GarantPromo } from '../kit/promo/GarantPromo';
import { OfferPdfTemplate } from '../offer-pdf-template.interface';
import { PearlCover } from './components/PearlCover';
import { PearlUnderlay } from './components/PearlUnderlay';
import { PEARL_ASSETS, PEARL_THEME } from './pearl.theme';

const PEARL_CHROME: OfferPdfChrome = {
    Header: BrandHeader,
    Footer: ManagerFooter,
    Cover: PearlCover,
    Underlay: PearlUnderlay,
    Promo: GarantPromo,
};

/** «Перламутр»: перламутровое стекло, разделы на белых карточках. */
export const pearlTemplate: OfferPdfTemplate = {
    code: OfferPdfTemplateCode.PEARL,
    name: 'Перламутр',
    description:
        'Титульник с перламутровым стеклом, страница о системе, пастельная полоса сверху листов и разделы на белых карточках.',
    hasCover: true,
    hasPromo: true,
    assets: [PEARL_ASSETS.cover, PEARL_ASSETS.sheet],
    logos: ['garant'],
    render: (model, frame) => (
        <OfferPdfDocument
            model={model}
            theme={PEARL_THEME}
            chrome={PEARL_CHROME}
            frame={frame}
        />
    ),
};
