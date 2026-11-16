jest.mock('@react-pdf/renderer', () =>
    jest
        .requireActual<
            typeof import('./helpers/react-pdf.mock')
        >('./helpers/react-pdf.mock')
        .createReactPdfMock(),
);

import { OfferPdfTemplateCode } from '../model/offer-pdf-template-code';
import { HALO_ASSETS } from '../templates/halo/halo.theme';
import { haloTemplate } from '../templates/halo/halo.template';
import { GARANT_PROMO } from '../templates/kit/promo/garant-promo';
import { SILK_ASSETS } from '../templates/silk/silk.theme';
import { silkTemplate } from '../templates/silk/silk.template';
import { createOfferPdfModelFixture } from './fixtures/offer-pdf-model.fixture';
import { collectTexts } from './helpers/react-pdf.mock';

describe.each([
    { template: haloTemplate, cover: HALO_ASSETS.cover },
    { template: silkTemplate, cover: SILK_ASSETS.cover },
])('«$template.name» PDF-шаблон КП', ({ template, cover }) => {
    it('титульник, страница о системе, письмо и цена', () => {
        const text = collectTexts(
            template.render(
                createOfferPdfModelFixture({
                    templateCode: template.code as OfferPdfTemplateCode,
                }),
            ),
        ).join('\n');
        expect(text).toContain('ИНН 3664098765');
        expect(text.indexOf(GARANT_PROMO.title)).toBeLessThan(
            text.indexOf('Здравствуйте, Иван Петрович!'),
        );
        expect(text).toContain('145 500,00');
    });

    it('объявляет картинку титульника и логотип Гаранта', () => {
        expect(template.assets).toContain(cover);
        expect(template.logos).toEqual(['garant']);
    });
});
