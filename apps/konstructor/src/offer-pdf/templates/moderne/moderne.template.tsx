import { OfferPdfTemplateCode } from '../../model/offer-pdf-template-code';
import { BrandHeader } from '../kit/chrome/BrandHeader';
import { OfferPdfDocument } from '../kit/document/OfferPdfDocument';
import type { OfferPdfChrome } from '../kit/document/offer-pdf-chrome';
import { OfferPdfTemplate } from '../offer-pdf-template.interface';
import { ModerneCover } from './components/ModerneCover';
import { ModerneFooter } from './components/ModerneFooter';
import { ModernePromo } from './components/ModernePromo';
import { ModerneUnderlay } from './components/ModerneUnderlay';
import { MODERNE_ASSETS, MODERNE_THEME } from './moderne.theme';

const MODERNE_CHROME: OfferPdfChrome = {
    Header: BrandHeader,
    Footer: ModerneFooter,
    Cover: ModerneCover,
    Underlay: ModerneUnderlay,
    Promo: ModernePromo,
    promoReplacesLetter: true,
};

/** «Модерн» — перенос вордовского шаблона. */
export const moderneTemplate: OfferPdfTemplate = {
    code: OfferPdfTemplateCode.MODERNE,
    name: 'Модерн',
    description:
        'Как вордовский «Модерн»: фиолетово-синяя заливка на титульнике, письмо портала отдельной страницей, наполнение в две колонки, мягкие пятна в углах листов.',
    hasCover: true,
    hasPromo: true,
    assets: [
        MODERNE_ASSETS.cover,
        MODERNE_ASSETS.cornerTop,
        MODERNE_ASSETS.cornerBottom,
    ],
    logos: ['garant'],
    render: (model, frame) => (
        <OfferPdfDocument
            model={model}
            theme={MODERNE_THEME}
            chrome={MODERNE_CHROME}
            frame={frame}
        />
    ),
};
