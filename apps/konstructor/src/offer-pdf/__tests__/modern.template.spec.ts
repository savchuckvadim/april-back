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
import { glassStripes } from '../templates/kit/decor/glass-stripes.util';
import { offerSectionOrder } from '../templates/kit/document/document.util';
import { offerCoverContent } from '../templates/kit/lib/cover.util';
import { modernTemplate } from '../templates/modern/modern.template';
import { createOfferPdfModelFixture } from './fixtures/offer-pdf-model.fixture';
import { collectTexts } from './helpers/react-pdf.mock';

const modelWith = (
    settings: Partial<OfferPdfSettings> = {},
    overrides: Partial<OfferPdfDocumentModel> = {},
): OfferPdfDocumentModel =>
    createOfferPdfModelFixture({
        templateCode: OfferPdfTemplateCode.MODERN,
        settings: { ...OFFER_PDF_DEFAULT_SETTINGS, ...settings },
        ...overrides,
    });

const renderTexts = (settings: Partial<OfferPdfSettings> = {}): string =>
    collectTexts(modernTemplate.render(modelWith(settings))).join('\n');

describe('«Современный» PDF-шаблон КП', () => {
    it('титульник: заголовок, комплект, для кого и кто подготовил — до письма', () => {
        const text = renderTexts();
        expect(text).toContain('КОММЕРЧЕСКОЕ\nПРЕДЛОЖЕНИЕ');
        expect(text).toContain('Подготовлено для');
        expect(text).toContain('ООО «Ромашка»');
        expect(text).toContain('Подготовил');
        expect(text.indexOf('ПРЕДЛОЖЕНИЕ')).toBeLessThan(
            text.indexOf('Здравствуйте, Иван Петрович!'),
        );
    });

    it('без титульника — сразу шапка и письмо, общие блоки на месте', () => {
        const text = renderTexts({ withCover: false });
        expect(text).not.toContain('Подготовлено для');
        expect(text).toContain('Здравствуйте, Иван Петрович!');
        expect(text).toContain('Информационное наполнение');
        expect(text).toContain('Стоимость');
        expect(text).toContain('145 500,00');
    });

    it('менеджер выключен — на титульнике нет «Подготовил»', () => {
        expect(renderTexts({ withManager: false })).not.toContain('Подготовил');
    });
});

describe('общие части стилей', () => {
    it('порядок разделов: подпись под письмом, при «сначала цена» — после цены', () => {
        expect(offerSectionOrder(OFFER_PDF_DEFAULT_SETTINGS)).toEqual([
            'stamps',
            'infoblocks',
            'price',
        ]);
        expect(
            offerSectionOrder({
                ...OFFER_PDF_DEFAULT_SETTINGS,
                isPriceFirst: true,
            }),
        ).toEqual(['price', 'stamps', 'infoblocks']);
        expect(
            offerSectionOrder({
                ...OFFER_PDF_DEFAULT_SETTINGS,
                withStamps: false,
            }),
        ).toEqual(['infoblocks', 'price']);
    });

    it('содержимое титульника — из данных КП, пустое — null', () => {
        const cover = offerCoverContent(
            modelWith(
                {},
                {
                    data: {
                        ...createOfferPdfModelFixture().data,
                        RecipientCompanyName: '  ',
                    },
                },
            ),
        );
        expect(cover.recipient).toBeNull();
        expect(cover.product).toBe('ГАРАНТ-Профессионал. Бухгалтерия');
        expect(cover.manager?.name).toBe('Мария Сидорова');
    });

    it('полосы «стекла»: ширина делится поровну, к краю листа насыщеннее', () => {
        const stripes = glassStripes(120, 4, 1);
        expect(stripes.map(stripe => stripe.x)).toEqual([0, 30, 60, 90]);
        const opacities = stripes.map(stripe => stripe.opacity);
        expect([...opacities].sort((a, b) => a - b)).toEqual(opacities);
        expect(opacities[3]).toBeCloseTo(1);
        expect(glassStripes(120, 4, 0.3)[3]?.opacity).toBeCloseTo(0.3);
    });
});
