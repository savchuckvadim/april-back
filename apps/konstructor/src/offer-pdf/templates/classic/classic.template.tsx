import { OfferPdfTemplateCode } from '../../model/offer-pdf-template-code';
import { OfferPdfDocument } from '../kit/document/OfferPdfDocument';
import type { OfferPdfChrome } from '../kit/document/offer-pdf-chrome';
import { OfferPdfTemplate } from '../offer-pdf-template.interface';
import { CLASSIC_THEME } from './classic.theme';
import { ClassicFooter } from './components/ClassicFooter';
import { ClassicHeader } from './components/ClassicHeader';

/** Классика без титульника и подложки: реквизиты в шапке, менеджер в подвале */
const CLASSIC_CHROME: OfferPdfChrome = {
    Header: ClassicHeader,
    Footer: ClassicFooter,
};

/**
 * Классический КП — перенос старого Blade-шаблона: письмо, цена,
 * наполнение, подпись/печать, менеджер в подвале. Порядок «цена ↔
 * наполнение» и наличие блоков — из настроек модели.
 */
export const classicTemplate: OfferPdfTemplate = {
    code: OfferPdfTemplateCode.CLASSIC,
    name: 'Классический',
    description:
        'Как в прежней версии: письмо, таблица цен, наполнение списком или таблицей, подпись и печать, контакты менеджера.',
    hasCover: false,
    hasPromo: false,
    render: (model, frame) => (
        <OfferPdfDocument
            model={model}
            theme={CLASSIC_THEME}
            chrome={CLASSIC_CHROME}
            frame={frame}
        />
    ),
};
