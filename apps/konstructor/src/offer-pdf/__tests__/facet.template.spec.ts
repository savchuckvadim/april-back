jest.mock('@react-pdf/renderer', () =>
    jest
        .requireActual<
            typeof import('./helpers/react-pdf.mock')
        >('./helpers/react-pdf.mock')
        .createReactPdfMock(),
);

import { OfferPdfDocumentModel } from '../model/offer-pdf-document.model';
import {
    OFFER_PDF_DEFAULT_SETTINGS,
    OfferPdfSettings,
} from '../model/offer-pdf-settings';
import { OfferPdfTemplateCode } from '../model/offer-pdf-template-code';
import { CLASSIC_THEME } from '../templates/classic/classic.theme';
import { FACET_PALETTES } from '../templates/facet/facet.theme';
import { facetTemplate } from '../templates/facet/facet.template';
import {
    COVER_FACETS,
    HEADER_FACETS,
    polygonPath,
} from '../templates/facet/lib/facet-shapes.util';
import { GARANT_PROMO } from '../templates/kit/promo/garant-promo';
import { paletteTheme } from '../templates/kit/theme/offer-pdf-palette';
import {
    coverPaperColor,
    coverTextColor,
    strongAccent,
} from '../templates/kit/theme/theme-colors.util';
import { createOfferPdfModelFixture } from './fixtures/offer-pdf-model.fixture';
import { collectTexts } from './helpers/react-pdf.mock';

const modelWith = (
    settings: Partial<OfferPdfSettings> = {},
): OfferPdfDocumentModel =>
    createOfferPdfModelFixture({
        templateCode: OfferPdfTemplateCode.FACET,
        settings: { ...OFFER_PDF_DEFAULT_SETTINGS, ...settings },
    });

const renderTexts = (settings: Partial<OfferPdfSettings> = {}): string =>
    collectTexts(facetTemplate.render(modelWith(settings))).join('\n');

describe('«Грань» PDF-шаблон КП', () => {
    it('титульник, затем страница о системе, затем письмо', () => {
        const text = renderTexts();
        expect(text).toContain('ГАРАНТ-Профессионал. Бухгалтерия');
        expect(text).toContain('ИНН 3664098765');
        expect(text.indexOf('Подготовлено для')).toBeLessThan(
            text.indexOf(GARANT_PROMO.title),
        );
        expect(text.indexOf(GARANT_PROMO.title)).toBeLessThan(
            text.indexOf('Здравствуйте, Иван Петрович!'),
        );
    });

    it('без титульника и промо — сразу письмо и разделы', () => {
        const text = renderTexts({ withCover: false, withPromo: false });
        expect(text).not.toContain('Подготовлено для');
        expect(text).not.toContain(GARANT_PROMO.title);
        expect(text).toContain('Здравствуйте, Иван Петрович!');
        expect(text).toContain('145 500,00');
    });

    it('стиль объявляет гаммы и логотип Гаранта', () => {
        expect(facetTemplate.hasPromo).toBe(true);
        expect(facetTemplate.logos).toEqual(['garant']);
        expect(facetTemplate.palettes?.map(palette => palette.code)).toEqual([
            'garant',
            'claret',
            'graphite',
        ]);
    });
});

describe('гаммы и грани', () => {
    it('выбранная гамма — её тема, неизвестная — первая', () => {
        expect(paletteTheme(FACET_PALETTES, 'claret').colors.accent).toBe(
            FACET_PALETTES[1]?.theme.colors.accent,
        );
        expect(paletteTheme(FACET_PALETTES, 'нет такой')).toBe(
            FACET_PALETTES[0].theme,
        );
        expect(paletteTheme(FACET_PALETTES, null)).toBe(
            FACET_PALETTES[0].theme,
        );
    });

    it('многоугольник грани — замкнутый путь SVG', () => {
        expect(
            polygonPath([
                [0, 0],
                [10, 0],
                [10, 5],
            ]),
        ).toBe('M 0 0 L 10 0 L 10 5 Z');
    });

    it('у каждой грани путь готов заранее', () => {
        for (const facet of [...COVER_FACETS, ...HEADER_FACETS]) {
            expect(facet.d).toMatch(/^M [\d.]+ [\d.]+( L [\d.]+ [\d.]+)+ Z$/);
        }
    });

    it('цвета темы с запасным значением', () => {
        const [facet] = FACET_PALETTES;
        expect(strongAccent(facet.theme)).toBe(facet.theme.colors.accentStrong);
        expect(coverPaperColor(facet.theme)).toBe(
            facet.theme.colors.coverPaper,
        );
        expect(coverTextColor(facet.theme)).toBe('#FFFFFF');
        // у темы без этих цветов — акцент и белый
        expect(strongAccent(CLASSIC_THEME)).toBe(CLASSIC_THEME.colors.accent);
        expect(coverPaperColor(CLASSIC_THEME)).toBe(
            CLASSIC_THEME.colors.accent,
        );
        expect(coverTextColor(CLASSIC_THEME)).toBe('#FFFFFF');
    });
});
