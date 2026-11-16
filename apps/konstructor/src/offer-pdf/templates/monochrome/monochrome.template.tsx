import { OfferPdfTemplateCode } from '../../model/offer-pdf-template-code';
import { defineOfferPdfTemplate } from '../kit/document/define-offer-pdf-template';
import { MonoCover } from './components/MonoCover';
import { MonoFooter } from './components/MonoFooter';
import { MonoHeader } from './components/MonoHeader';
import { MonoTab } from './components/MonoTab';
import { MONOCHROME_THEME } from './monochrome.theme';

/** «Монохром»: серый лист, чёрный текст, тонкие крупные заголовки, вкладка у края. */
export const monochromeTemplate = defineOfferPdfTemplate({
    code: OfferPdfTemplateCode.MONOCHROME,
    name: 'Монохром',
    description:
        'Строгий чёрно-серый стиль: тёплый серый лист, тонкие крупные заголовки, на титульнике комплект крупно и клиент с ИНН, чёрная вкладка у края каждой страницы.',
    theme: MONOCHROME_THEME,
    chrome: {
        Header: MonoHeader,
        Footer: MonoFooter,
        Cover: MonoCover,
        Underlay: MonoTab,
    },
});
