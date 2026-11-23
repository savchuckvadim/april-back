jest.mock('@react-pdf/renderer', () =>
    jest
        .requireActual<
            typeof import('./helpers/react-pdf.mock')
        >('./helpers/react-pdf.mock')
        .createReactPdfMock(),
);

import {
    OFFER_PDF_DEFAULT_SETTINGS,
    OfferPdfSettings,
} from '../model/offer-pdf-settings';
import { CLASSIC_THEME } from '../templates/classic/classic.theme';
import { sheetCapacity } from '../templates/kit/document/sheet-fit.util';
import { estimateVariantBannerHeight } from '../templates/kit/document/variant-banner.util';
import { offerCoverContent } from '../templates/kit/lib/cover.util';
import { variantTitleOf } from '../templates/kit/lib/variant-title.util';
import { OfferPdfTemplate } from '../templates/offer-pdf-template.interface';
import { OFFER_PDF_TEMPLATES } from '../templates/offer-pdf-template.registry';
import { createOfferPdfModelFixture } from './fixtures/offer-pdf-model.fixture';
import { collectTexts } from './helpers/react-pdf.mock';

/**
 * Каждый вариант независимого режима печатается своим документом: название
 * варианта видно на титульнике и в шапке первого листа. Документ без названия
 * варианта печатается как раньше.
 */
const TITLE = 'Вариант «Юрист»: ГАРАНТ-Профессионал на 3 доступа';

const occurrences = (texts: string[], needle: string): number =>
    texts.filter(text => text.includes(needle)).length;

const textsOf = (
    template: OfferPdfTemplate,
    settings: Partial<OfferPdfSettings>,
    variantTitle?: string | null,
): string[] =>
    collectTexts(
        template.render(
            createOfferPdfModelFixture({
                templateCode: template.code,
                settings: { ...OFFER_PDF_DEFAULT_SETTINGS, ...settings },
                ...(variantTitle === undefined ? {} : { variantTitle }),
            }),
        ),
    );

describe('название варианта на листах PDF-КП', () => {
    describe.each(OFFER_PDF_TEMPLATES)('стиль $code', template => {
        it('с титульником — название на нём и в шапке первого листа', () => {
            const texts = textsOf(template, { withCover: true }, TITLE);
            expect(occurrences(texts, TITLE)).toBe(template.hasCover ? 2 : 1);
        });

        it('без титульника — название в шапке первого листа', () => {
            const texts = textsOf(template, { withCover: false }, TITLE);
            expect(occurrences(texts, TITLE)).toBe(1);
        });

        it('название стоит раньше письма и разделов', () => {
            const texts = textsOf(template, { withCover: false }, TITLE);
            const title = texts.findIndex(text => text.includes(TITLE));
            const price = texts.findIndex(text => text.includes('Стоимость'));
            expect(title).toBeGreaterThanOrEqual(0);
            expect(title).toBeLessThan(price);
        });

        it('без названия или с пустым — документ печатается как раньше', () => {
            const before = textsOf(template, {});
            expect(textsOf(template, {}, null)).toEqual(before);
            expect(textsOf(template, {}, '   ')).toEqual(before);
        });
    });

    it('название берётся из модели обрезанным; пусто — нет названия', () => {
        const model = createOfferPdfModelFixture({ variantTitle: '  Юрист  ' });
        expect(variantTitleOf(model)).toBe('Юрист');
        expect(offerCoverContent(model).variantTitle).toBe('Юрист');
        expect(variantTitleOf(createOfferPdfModelFixture())).toBeNull();
        expect(
            variantTitleOf(createOfferPdfModelFixture({ variantTitle: ' ' })),
        ).toBeNull();
    });

    it('оценка высоты названия: нет названия — ноль, длинное занимает больше строк, но в лист помещается', () => {
        expect(estimateVariantBannerHeight(CLASSIC_THEME, null)).toBe(0);
        const short = estimateVariantBannerHeight(CLASSIC_THEME, 'Юрист');
        const long = estimateVariantBannerHeight(
            CLASSIC_THEME,
            TITLE.repeat(4),
        );
        expect(short).toBeGreaterThan(0);
        expect(long).toBeGreaterThan(short);
        expect(long).toBeLessThan(sheetCapacity(CLASSIC_THEME));
    });
});
