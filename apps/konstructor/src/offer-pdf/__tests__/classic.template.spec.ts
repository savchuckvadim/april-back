jest.mock('@react-pdf/renderer', () =>
    jest
        .requireActual<
            typeof import('./helpers/react-pdf.mock')
        >('./helpers/react-pdf.mock')
        .createReactPdfMock(),
);

import {
    DocumentFieldDescriptionMode,
    DocumentFieldViewMode,
} from '../../offer/type/offer-settings.type';
import { OfferPdfDocumentModel } from '../model/offer-pdf-document.model';
import {
    OFFER_PDF_DEFAULT_SETTINGS,
    OfferPdfSettings,
} from '../model/offer-pdf-settings';
import { classicTemplate } from '../templates/classic/classic.template';
import { pickInfoblockDescription } from '../templates/classic/components/ClassicInfoblocks';
import {
    createOfferPdfModelFixture,
    createOfferRenderDataFixture,
} from './fixtures/offer-pdf-model.fixture';
import { collectTexts } from './helpers/react-pdf.mock';

const renderTexts = (
    settings: Partial<OfferPdfSettings> = {},
    overrides: Partial<OfferPdfDocumentModel> = {},
): string => {
    const model = createOfferPdfModelFixture({
        settings: { ...OFFER_PDF_DEFAULT_SETTINGS, ...settings },
        ...overrides,
    });
    return collectTexts(classicTemplate.render(model)).join('\n');
};

const BIG_DESCRIPTION_MARKER = 'документы федерального и регионального уровня';

describe('классический PDF-шаблон КП', () => {
    it('по умолчанию: реквизиты, письмо, наполнение, цена, подпись, менеджер', () => {
        const text = renderTexts();
        expect(text).toContain('ООО «Гарант-Сервис Воронеж»');
        expect(text).toContain('ИНН 3666012345, КПП 366601001');
        expect(text).toContain('Здравствуйте, Иван Петрович!');
        expect(text).toContain('Информационное наполнение');
        expect(text).toContain('Законодательство Воронежской области');
        expect(text).toContain('Стоимость');
        expect(text).toContain('145 500,00');
        expect(text).toContain('А. В. Кузнецов');
        expect(text).toContain('Мария Сидорова');
        expect(text).toContain('1 / 1');
        // подпись — под письмом, раньше наполнения и цены
        expect(text.indexOf('А. В. Кузнецов')).toBeLessThan(
            text.indexOf('Информационное наполнение'),
        );
    });

    it('режим описания «нет» — только названия, «много» — длинный текст', () => {
        const none = renderTexts({
            descriptionMode: DocumentFieldDescriptionMode.NO,
        });
        expect(none).toContain('Законодательство России');
        expect(none).not.toContain('Федеральные законы');

        const big = renderTexts({
            descriptionMode: DocumentFieldDescriptionMode.BIG,
        });
        expect(big).toContain(BIG_DESCRIPTION_MARKER);
    });

    it('табличные режимы: с разделами — названия групп есть, без разделов — нет', () => {
        const withGroups = renderTexts({
            viewMode: DocumentFieldViewMode.TABLE_WITH_GROUP,
            descriptionMode: DocumentFieldDescriptionMode.NO,
        });
        expect(withGroups).toContain('Судебная практика');

        const plain = renderTexts({
            viewMode: DocumentFieldViewMode.TABLE,
            descriptionMode: DocumentFieldDescriptionMode.NO,
        });
        expect(plain).not.toContain('Судебная практика');
        expect(plain).toContain('Практика высших судов');
    });

    it('isPriceFirst ставит цену раньше наполнения', () => {
        const priceLast = renderTexts({ isPriceFirst: false });
        expect(priceLast.indexOf('Стоимость')).toBeGreaterThan(
            priceLast.indexOf('Информационное наполнение'),
        );
        const priceFirst = renderTexts({ isPriceFirst: true });
        expect(priceFirst.indexOf('Стоимость')).toBeLessThan(
            priceFirst.indexOf('Информационное наполнение'),
        );
    });

    it('менеджер и печати выключаются настройками', () => {
        const text = renderTexts({ withManager: false, withStamps: false });
        expect(text).not.toContain('Мария Сидорова');
        expect(text).not.toContain('А. В. Кузнецов');
    });

    it('письмо и обращение из запроса заменяют текст по умолчанию', () => {
        const text = renderTexts(
            {},
            {
                letter: {
                    appeal: 'Уважаемый Иван Петрович!',
                    text: 'Свой текст письма с <color>акцентом</color>.',
                },
            },
        );
        expect(text).toContain('Уважаемый Иван Петрович!');
        expect(text).toContain('акцентом');
        expect(text).not.toContain('Здравствуйте, Иван Петрович!');
        expect(text).not.toContain('Благодарим за интерес');
    });

    it('номер документа печатается только когда передан', () => {
        expect(renderTexts()).not.toContain('Исх. №');
        const text = renderTexts(
            {},
            { meta: { date: '31 октября 2026 г.', documentNumber: 'КП-42' } },
        );
        expect(text).toContain('Исх. № КП-42 от 31 октября 2026 г.');
    });

    it('колонка скидки есть только при скидке в строках', () => {
        expect(renderTexts()).toContain('Скидка');
        const withoutDiscount = renderTexts(
            {},
            {
                data: createOfferRenderDataFixture({
                    ProductRows: createOfferRenderDataFixture().ProductRows.map(
                        row => ({ ...row, ProductDiscountPercent: '0' }),
                    ),
                }),
            },
        );
        expect(withoutDiscount).not.toContain('Скидка');
    });

    it('фраза об акции и пустое наполнение', () => {
        const text = renderTexts(
            { salePhrase: 'Скидка 20 % до конца месяца' },
            { data: createOfferRenderDataFixture({ infoblocksByGroups: [] }) },
        );
        expect(text).toContain('Скидка 20 % до конца месяца');
        expect(text).not.toContain('Информационное наполнение');
    });

    it('описание по режиму берёт ближайший непустой размер', () => {
        const infoblock = {
            name: 'Блок',
            infoblock: 'Блок',
            smallDescription: 'Коротко',
            mediumDescription: '',
            bigDescription: '',
        };
        expect(
            pickInfoblockDescription(
                infoblock,
                DocumentFieldDescriptionMode.BIG,
            ),
        ).toBe('Коротко');
        expect(
            pickInfoblockDescription(
                infoblock,
                DocumentFieldDescriptionMode.NO,
            ),
        ).toBeNull();
    });
});
