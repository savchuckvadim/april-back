jest.mock('@react-pdf/renderer', () =>
    jest
        .requireActual<
            typeof import('./helpers/react-pdf.mock')
        >('./helpers/react-pdf.mock')
        .createReactPdfMock(),
);

import { OfferPdfTemplateCode } from '../model/offer-pdf-template-code';
import { ISKRA_PROMO, ISKRA_PROMO_ICONS } from '../templates/iskra/iskra-promo';
import { iskraTemplate } from '../templates/iskra/iskra.template';
import { createOfferPdfModelFixture } from './fixtures/offer-pdf-model.fixture';
import { collectTexts } from './helpers/react-pdf.mock';

const text = (): string =>
    collectTexts(
        iskraTemplate.render(
            createOfferPdfModelFixture({
                templateCode: OfferPdfTemplateCode.ISKRA,
            }),
        ),
    ).join('\n');

describe('«Искра» PDF-шаблон КП', () => {
    it('титульник: ИИ-ассистент, наша компания с ИНН, клиент с ИНН', () => {
        const result = text();
        expect(result).toContain('AI-ассистент ИСКРА');
        expect(result).toContain('ИНН 3666012345');
        expect(result).toContain('ИНН 3664098765');
    });

    it('страница о сервисе — три пункта, затем письмо', () => {
        const result = text();
        for (const item of ISKRA_PROMO.items) {
            expect(result).toContain(item.title);
        }
        expect(result.indexOf(ISKRA_PROMO.title)).toBeLessThan(
            result.indexOf('Здравствуйте, Иван Петрович!'),
        );
        expect(ISKRA_PROMO_ICONS).toHaveLength(ISKRA_PROMO.items.length);
    });

    it('объявляет логотипы Гаранта и Искры и свои картинки', () => {
        expect(iskraTemplate.logos).toEqual(['garant', 'iscra']);
        expect(iskraTemplate.assets).toEqual(
            expect.arrayContaining(['iskra/knot.jpg', ...ISKRA_PROMO_ICONS]),
        );
    });
});
