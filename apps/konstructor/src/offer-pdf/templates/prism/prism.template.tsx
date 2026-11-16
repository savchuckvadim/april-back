import { OfferPdfTemplateCode } from '../../model/offer-pdf-template-code';
import { defineOfferPdfTemplate } from '../kit/document/define-offer-pdf-template';
import { PrismCover } from './components/PrismCover';
import { PrismFooter } from './components/PrismFooter';
import { PrismHeader } from './components/PrismHeader';
import { PrismUnderlay } from './components/PrismUnderlay';
import { PRISM_THEME } from './prism.theme';

/** «Призма»: титульник с полосами «рифлёного стекла», лёгкие полосы у края страниц. */
export const prismTemplate = defineOfferPdfTemplate({
    code: OfferPdfTemplateCode.PRISM,
    name: 'Призма',
    description:
        'Титульный лист с полосами «рифлёного стекла» и малиновым акцентом, лёгкие полосы у края каждой страницы, минималистичные шапка и подвал.',
    theme: PRISM_THEME,
    chrome: {
        Header: PrismHeader,
        Footer: PrismFooter,
        Cover: PrismCover,
        Underlay: PrismUnderlay,
    },
});
