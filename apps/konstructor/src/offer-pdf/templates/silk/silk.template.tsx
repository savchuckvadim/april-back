import { OfferPdfTemplateCode } from '../../model/offer-pdf-template-code';
import { BrandHeader } from '../kit/chrome/BrandHeader';
import { ManagerFooter } from '../kit/chrome/ManagerFooter';
import { OfferPdfDocument } from '../kit/document/OfferPdfDocument';
import type { OfferPdfChrome } from '../kit/document/offer-pdf-chrome';
import { GarantPromo } from '../kit/promo/GarantPromo';
import { OfferPdfTemplate } from '../offer-pdf-template.interface';
import { SilkCover } from './components/SilkCover';
import { SilkUnderlay } from './components/SilkUnderlay';
import { SILK_ASSETS, SILK_THEME } from './silk.theme';

const SILK_CHROME: OfferPdfChrome = {
    Header: BrandHeader,
    Footer: ManagerFooter,
    Cover: SilkCover,
    Underlay: SilkUnderlay,
    Promo: GarantPromo,
};

/** «Шёлк»: золотые волны, разделы на белых карточках. */
export const silkTemplate: OfferPdfTemplate = {
    code: OfferPdfTemplateCode.SILK,
    name: 'Шёлк',
    description:
        'Титульник с золотыми линиями-волнами, страница о системе, те же волны бледно под белыми карточками разделов.',
    hasCover: true,
    hasPromo: true,
    assets: [SILK_ASSETS.cover],
    logos: ['garant'],
    render: (model, frame) => (
        <OfferPdfDocument
            model={model}
            theme={SILK_THEME}
            chrome={SILK_CHROME}
            frame={frame}
        />
    ),
};
