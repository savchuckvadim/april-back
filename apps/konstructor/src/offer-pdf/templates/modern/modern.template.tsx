import { OfferPdfTemplateCode } from '../../model/offer-pdf-template-code';
import { OfferPdfDocument } from '../kit/document/OfferPdfDocument';
import type { OfferPdfChrome } from '../kit/document/offer-pdf-chrome';
import { OfferPdfTemplate } from '../offer-pdf-template.interface';
import { ModernCover } from './components/ModernCover';
import { ModernFooter } from './components/ModernFooter';
import { ModernHeader } from './components/ModernHeader';
import { ModernUnderlay } from './components/ModernUnderlay';
import { MODERN_THEME } from './modern.theme';

const MODERN_CHROME: OfferPdfChrome = {
    Header: ModernHeader,
    Footer: ModernFooter,
    Cover: ModernCover,
    Underlay: ModernUnderlay,
};

/** «Современный»: титульник с полосами «рифлёного стекла», лёгкие полосы у края страниц. */
export const modernTemplate: OfferPdfTemplate = {
    code: OfferPdfTemplateCode.MODERN,
    name: 'Современный',
    description:
        'Титульный лист с полосами «рифлёного стекла» и малиновым акцентом, лёгкие полосы у края каждой страницы, минималистичные шапка и подвал.',
    hasCover: true,
    render: (model, frame) => (
        <OfferPdfDocument
            model={model}
            theme={MODERN_THEME}
            chrome={MODERN_CHROME}
            frame={frame}
        />
    ),
};
