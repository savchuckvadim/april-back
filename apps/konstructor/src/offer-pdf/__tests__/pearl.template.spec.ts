jest.mock('@react-pdf/renderer', () =>
    jest
        .requireActual<
            typeof import('./helpers/react-pdf.mock')
        >('./helpers/react-pdf.mock')
        .createReactPdfMock(),
);

import { OfferPdfTemplateCode } from '../model/offer-pdf-template-code';
import { GARANT_PROMO } from '../templates/kit/promo/garant-promo';
import { PEARL_ASSETS, PEARL_THEME } from '../templates/pearl/pearl.theme';
import { pearlTemplate } from '../templates/pearl/pearl.template';
import { createOfferPdfModelFixture } from './fixtures/offer-pdf-model.fixture';
import { collectTexts } from './helpers/react-pdf.mock';

describe('«Перламутр» PDF-шаблон КП', () => {
    it('титульник, страница о системе и разделы — без картинок в storage тоже собирается', () => {
        const text = collectTexts(
            pearlTemplate.render(
                createOfferPdfModelFixture({
                    templateCode: OfferPdfTemplateCode.PEARL,
                }),
            ),
        ).join('\n');
        expect(text).toContain('ИНН 3664098765');
        expect(text.indexOf(GARANT_PROMO.title)).toBeLessThan(
            text.indexOf('Здравствуйте, Иван Петрович!'),
        );
        expect(text).toContain('145 500,00');
    });

    it('объявляет картинки и логотип; разделы на карточках', () => {
        expect(pearlTemplate.assets).toEqual([
            PEARL_ASSETS.cover,
            PEARL_ASSETS.sheet,
            PEARL_ASSETS.glow,
            PEARL_ASSETS.soft,
        ]);
        expect(pearlTemplate.logos).toEqual(['garant']);
        expect(PEARL_THEME.surface?.background).toBe('#FFFFFF');
    });
});
