import { OfferPdfTemplateCode } from '../../model/offer-pdf-template-code';
import { OfferPdfDocument } from '../kit/document/OfferPdfDocument';
import type { OfferPdfChrome } from '../kit/document/offer-pdf-chrome';
import { OfferPdfTemplate } from '../offer-pdf-template.interface';
import { IskraCover } from './components/IskraCover';
import { IskraFooter } from './components/IskraFooter';
import { IskraHeader } from './components/IskraHeader';
import { IskraPromo } from './components/IskraPromo';
import { IskraUnderlay } from './components/IskraUnderlay';
import { ISKRA_ASSETS, ISKRA_THEME } from './iskra.theme';

const ISKRA_CHROME: OfferPdfChrome = {
    Header: IskraHeader,
    Footer: IskraFooter,
    Cover: IskraCover,
    Underlay: IskraUnderlay,
    Promo: IskraPromo,
};

/** «Искра» — для КП с сервисом «Искра», по вордовскому шаблону. */
export const iskraTemplate: OfferPdfTemplate = {
    code: OfferPdfTemplateCode.ISKRA,
    name: 'Искра',
    description:
        'Для КП с сервисом «Искра», как вордовский шаблон: логотипы Гаранта и Искры, оранжевый узел на титульнике, страница о том, что умеет нейросеть, наполнение в две колонки.',
    hasCover: true,
    hasPromo: true,
    assets: Object.values(ISKRA_ASSETS),
    logos: ['garant', 'iscra'],
    render: (model, frame) => (
        <OfferPdfDocument
            model={model}
            theme={ISKRA_THEME}
            chrome={ISKRA_CHROME}
            frame={frame}
        />
    ),
};
