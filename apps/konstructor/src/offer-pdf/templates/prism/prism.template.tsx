import { OfferPdfTemplateCode } from '../../model/offer-pdf-template-code';
import { OfferPdfDocument } from '../kit/document/OfferPdfDocument';
import type { OfferPdfChrome } from '../kit/document/offer-pdf-chrome';
import { OfferPdfTemplate } from '../offer-pdf-template.interface';
import { PrismCover } from './components/PrismCover';
import { PrismFooter } from './components/PrismFooter';
import { PrismHeader } from './components/PrismHeader';
import { PrismUnderlay } from './components/PrismUnderlay';
import { PRISM_THEME } from './prism.theme';

const PRISM_CHROME: OfferPdfChrome = {
    Header: PrismHeader,
    Footer: PrismFooter,
    Cover: PrismCover,
    Underlay: PrismUnderlay,
};

/** «Призма»: титульник с полосами «рифлёного стекла», лёгкие полосы у края страниц. */
export const prismTemplate: OfferPdfTemplate = {
    code: OfferPdfTemplateCode.PRISM,
    name: 'Призма',
    description:
        'Титульный лист с полосами «рифлёного стекла» и малиновым акцентом, лёгкие полосы у края каждой страницы, минималистичные шапка и подвал.',
    hasCover: true,
    render: (model, frame) => (
        <OfferPdfDocument
            model={model}
            theme={PRISM_THEME}
            chrome={PRISM_CHROME}
            frame={frame}
        />
    ),
};
