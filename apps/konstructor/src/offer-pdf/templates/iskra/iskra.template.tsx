import { OfferPdfTemplateCode } from '../../model/offer-pdf-template-code';
import { defineOfferPdfTemplate } from '../kit/document/define-offer-pdf-template';
import { IskraCover } from './components/IskraCover';
import { IskraFooter } from './components/IskraFooter';
import { IskraHeader } from './components/IskraHeader';
import { IskraPromo } from './components/IskraPromo';
import { IskraUnderlay } from './components/IskraUnderlay';
import { ISKRA_ASSETS, ISKRA_THEME } from './iskra.theme';

/** «Искра» — для КП с сервисом «Искра», по вордовскому шаблону. */
export const iskraTemplate = defineOfferPdfTemplate({
    code: OfferPdfTemplateCode.ISKRA,
    name: 'Искра',
    description:
        'Для КП с сервисом «Искра», как вордовский шаблон: логотипы Гаранта и Искры, оранжевый узел на титульнике, страница о том, что умеет нейросеть, наполнение в две колонки.',
    theme: ISKRA_THEME,
    chrome: {
        Header: IskraHeader,
        Footer: IskraFooter,
        Cover: IskraCover,
        Underlay: IskraUnderlay,
        Promo: IskraPromo,
    },
    assets: ISKRA_ASSETS,
    logos: ['garant', 'iscra'],
});
