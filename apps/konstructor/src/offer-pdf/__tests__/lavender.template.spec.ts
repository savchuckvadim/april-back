jest.mock('@react-pdf/renderer', () =>
    jest
        .requireActual<
            typeof import('./helpers/react-pdf.mock')
        >('./helpers/react-pdf.mock')
        .createReactPdfMock(),
);

import { OFFER_PDF_DEFAULT_SETTINGS } from '../model/offer-pdf-settings';
import { OfferPdfTemplateCode } from '../model/offer-pdf-template-code';
import { GARANT_PROMO } from '../templates/kit/promo/garant-promo';
import { LAVENDER_PALETTES } from '../templates/lavender/lavender.theme';
import { lavenderTemplate } from '../templates/lavender/lavender.template';
import { createOfferPdfModelFixture } from './fixtures/offer-pdf-model.fixture';
import { collectTexts } from './helpers/react-pdf.mock';

const renderTexts = (palette: string | null = null): string =>
    collectTexts(
        lavenderTemplate.render(
            createOfferPdfModelFixture({
                templateCode: OfferPdfTemplateCode.LAVENDER,
                palette,
                settings: { ...OFFER_PDF_DEFAULT_SETTINGS },
            }),
        ),
    ).join('\n');

describe('«Лаванда» PDF-шаблон КП', () => {
    it('титульник с ИНН клиента, страница о системе, затем письмо', () => {
        const text = renderTexts();
        expect(text).toContain('ИНН 3664098765');
        expect(text).toContain('Подготовил');
        expect(text.indexOf(GARANT_PROMO.title)).toBeLessThan(
            text.indexOf('Здравствуйте, Иван Петрович!'),
        );
    });

    it('у каждой гаммы свои два цвета градиента', () => {
        const gradients = LAVENDER_PALETTES.map(
            palette => palette.theme.colors.gradient,
        );
        expect(gradients.every(Boolean)).toBe(true);
        expect(new Set(gradients.map(item => item?.join())).size).toBe(
            LAVENDER_PALETTES.length,
        );
        expect(renderTexts('mint')).toContain('145 500,00');
    });
});
