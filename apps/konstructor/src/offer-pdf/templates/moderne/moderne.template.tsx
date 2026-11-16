import { OfferPdfTemplateCode } from '../../model/offer-pdf-template-code';
import { BrandHeader } from '../kit/chrome/BrandHeader';
import { ManagerFooter } from '../kit/chrome/ManagerFooter';
import { defineOfferPdfTemplate } from '../kit/document/define-offer-pdf-template';
import { ModerneCover } from './components/ModerneCover';
import { ModernePromo } from './components/ModernePromo';
import { ModerneUnderlay } from './components/ModerneUnderlay';
import { MODERNE_ASSETS, MODERNE_THEME } from './moderne.theme';

/** «Модерн» — перенос вордовского шаблона. */
export const moderneTemplate = defineOfferPdfTemplate({
    code: OfferPdfTemplateCode.MODERNE,
    name: 'Модерн',
    description:
        'Как вордовский «Модерн»: фиолетово-синяя заливка на титульнике, письмо портала отдельной страницей, наполнение в две колонки, мягкие пятна в углах листов.',
    theme: MODERNE_THEME,
    chrome: {
        Header: BrandHeader,
        Footer: ManagerFooter,
        Cover: ModerneCover,
        Underlay: ModerneUnderlay,
        Promo: ModernePromo,
        promoReplacesLetter: true,
    },
    assets: MODERNE_ASSETS,
    logos: ['garant'],
});
