import { OfferPdfTemplateCode } from '../../model/offer-pdf-template-code';
import { OfferPdfDocument } from '../kit/document/OfferPdfDocument';
import type { OfferPdfChrome } from '../kit/document/offer-pdf-chrome';
import { OfferPdfTemplate } from '../offer-pdf-template.interface';
import { MonoCover } from './components/MonoCover';
import { MonoFooter } from './components/MonoFooter';
import { MonoHeader } from './components/MonoHeader';
import { MonoTab } from './components/MonoTab';
import { MONOCHROME_THEME } from './monochrome.theme';

const MONOCHROME_CHROME: OfferPdfChrome = {
    Header: MonoHeader,
    Footer: MonoFooter,
    Cover: MonoCover,
    Underlay: MonoTab,
};

/** «Монохром»: серый лист, чёрный текст, тонкие крупные заголовки, вкладка у края. */
export const monochromeTemplate: OfferPdfTemplate = {
    code: OfferPdfTemplateCode.MONOCHROME,
    name: 'Монохром',
    description:
        'Строгий чёрно-серый стиль: тёплый серый лист, тонкие крупные заголовки, на титульнике комплект крупно и клиент с ИНН, чёрная вкладка у края каждой страницы.',
    hasCover: true,
    hasPromo: false,
    render: (model, frame) => (
        <OfferPdfDocument
            model={model}
            theme={MONOCHROME_THEME}
            chrome={MONOCHROME_CHROME}
            frame={frame}
        />
    ),
};
