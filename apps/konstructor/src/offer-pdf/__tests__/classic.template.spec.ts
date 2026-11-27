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
} from '../model/offer-document-settings.type';
import { OfferPdfDocumentModel } from '../model/offer-pdf-document.model';
import {
    OFFER_PDF_DEFAULT_SETTINGS,
    OfferPdfSettings,
} from '../model/offer-pdf-settings';
import { classicTemplate } from '../templates/classic/classic.template';
import {
    isLongDescription,
    pickInfoblockDescription,
} from '../templates/kit/infoblocks/infoblock-description.util';
import { estimateLines } from '../templates/kit/lib/text.util';
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

    it('письмо выключено: письма и подписи нет, наполнение, цена и менеджер на месте', () => {
        const text = renderTexts({ withLetter: false });
        expect(text).not.toContain('Здравствуйте, Иван Петрович!');
        expect(text).not.toContain('Благодарим за интерес');
        // подпись и печать стоят под письмом: настройка withStamps включена, но без письма их нет
        expect(OFFER_PDF_DEFAULT_SETTINGS.withStamps).toBe(true);
        expect(text).not.toContain('А. В. Кузнецов');
        expect(text).toContain('Информационное наполнение');
        expect(text).toContain('Стоимость');
        expect(text).toContain('Мария Сидорова');
    });

    it('письмо выключено и «сначала цена»: цена, затем наполнение, без письма и подписи', () => {
        const text = renderTexts({ withLetter: false, isPriceFirst: true });
        expect(text).not.toContain('Здравствуйте, Иван Петрович!');
        expect(text).not.toContain('А. В. Кузнецов');
        expect(text.indexOf('Стоимость')).toBeLessThan(
            text.indexOf('Информационное наполнение'),
        );
    });

    it('письмо выключено: текст письма из запроса в документ не попадает', () => {
        const text = renderTexts(
            { withLetter: false },
            {
                letter: {
                    appeal: 'Уважаемый Иван Петрович!',
                    text: 'Свой текст письма с <color>акцентом</color>.',
                },
            },
        );
        expect(text).not.toContain('Уважаемый Иван Петрович!');
        expect(text).not.toContain('акцентом');
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

    describe('настройка showDiscount', () => {
        it('по умолчанию скидка показывается: колонка, процент и цена до скидки', () => {
            const text = renderTexts();
            expect(text).toContain('Скидка');
            expect(text).toContain('15 %');
            expect(text).toContain('12 500,00');
        });

        it('выключена: колонки «Скидка» нет, в «Цене» цена со скидкой', () => {
            const text = renderTexts({ showDiscount: false });
            expect(text).not.toContain('Скидка');
            expect(text).not.toContain('15 %');
            // цена до скидки (по прайсу) не печатается, цена со скидкой — да
            expect(text).not.toContain('12 500,00');
            expect(text).toContain('10 625,00');
            // сумма строки и итог остаются
            expect(text).toContain('127 500,00');
            expect(text).toContain('145 500,00');
        });

        it('итоги КП скидку не печатают ни при какой настройке', () => {
            // TotalDiscountSum образца
            expect(renderTexts()).not.toContain('22 500,00');
            expect(renderTexts({ showDiscount: false })).not.toContain(
                '22 500,00',
            );
        });

        it('строки без скидки: настройка ничего не меняет', () => {
            const rows = createOfferRenderDataFixture().ProductRows.map(
                row => ({ ...row, ProductDiscountPercent: '0' }),
            );
            const overrides = {
                data: createOfferRenderDataFixture({ ProductRows: rows }),
            };
            expect(renderTexts({ showDiscount: false }, overrides)).toBe(
                renderTexts({ showDiscount: true }, overrides),
            );
        });
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

describe('длинные описания режутся по странице', () => {
    it('строки считаются по абзацам и ширине колонки', () => {
        expect(estimateLines('', 80)).toBe(1);
        expect(estimateLines('а'.repeat(81), 80)).toBe(2);
        expect(estimateLines('раз\nдва\n\nтри', 80)).toBe(4);
    });

    it('список журналов и сплошной абзац — длинные; пара строк — короткая', () => {
        const journals = Array.from(
            { length: 20 },
            (_, index) => `Журнал № ${index + 1}`,
        ).join('\n');
        expect(isLongDescription(journals, 80)).toBe(true);
        expect(isLongDescription('слово '.repeat(200), 80)).toBe(true);
        expect(isLongDescription('Региональное законодательство', 80)).toBe(
            false,
        );
        expect(isLongDescription(null, 80)).toBe(false);
    });
});
