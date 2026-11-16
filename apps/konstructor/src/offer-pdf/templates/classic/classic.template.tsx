import { OfferPdfTemplateCode } from '../../model/offer-pdf-template-code';
import { defineOfferPdfTemplate } from '../kit/document/define-offer-pdf-template';
import { CLASSIC_THEME } from './classic.theme';
import { ClassicFooter } from './components/ClassicFooter';
import { ClassicHeader } from './components/ClassicHeader';

/**
 * Классический КП — перенос старого Blade-шаблона: письмо, цена,
 * наполнение, подпись/печать, менеджер в подвале. Порядок «цена ↔
 * наполнение» и наличие блоков — из настроек модели. Без титульника и
 * подложки: реквизиты в шапке, менеджер в подвале.
 */
export const classicTemplate = defineOfferPdfTemplate({
    code: OfferPdfTemplateCode.CLASSIC,
    name: 'Классический',
    description:
        'Как в прежней версии: письмо, таблица цен, наполнение списком или таблицей, подпись и печать, контакты менеджера.',
    theme: CLASSIC_THEME,
    chrome: {
        Header: ClassicHeader,
        Footer: ClassicFooter,
    },
});
