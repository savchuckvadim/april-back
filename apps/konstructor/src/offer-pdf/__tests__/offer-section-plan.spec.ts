import { OFFER_PDF_DEFAULT_SETTINGS } from '../model/offer-pdf-settings';
import { offerSheetFlows } from '../templates/kit/document/document.util';
import {
    priceStartsOwnSheet,
    sheetCapacity,
} from '../templates/kit/document/sheet-fit.util';
import { estimatePriceBlockHeight } from '../templates/kit/price/price-fit.util';
import { CLASSIC_THEME } from '../templates/classic/classic.theme';
import { PEARL_THEME } from '../templates/pearl/pearl.theme';
import {
    createOfferPdfModelFixture,
    createOfferRenderDataFixture,
    productRowsWithSets,
} from './fixtures/offer-pdf-model.fixture';

const settings = (patch: Partial<typeof OFFER_PDF_DEFAULT_SETTINGS> = {}) => ({
    ...OFFER_PDF_DEFAULT_SETTINGS,
    ...patch,
});

const onSheets = {
    letterOnSheets: true,
    priceFitsLetter: false,
    priceStartsSheet: false,
};
const onPromo = {
    letterOnSheets: false,
    priceFitsLetter: false,
    priceStartsSheet: false,
};

describe('потоки листов с разделами КП', () => {
    it('письмо с подписью — на своих листах, наполнение с ценой открывают новый лист', () => {
        expect(offerSheetFlows(settings(), onSheets)).toEqual([
            { withLetter: true, keys: ['stamps'] },
            { withLetter: false, keys: ['infoblocks', 'price'] },
        ]);
    });

    it('без подписи письмо остаётся на листе одно', () => {
        expect(
            offerSheetFlows(settings({ withStamps: false }), onSheets),
        ).toEqual([
            { withLetter: true, keys: [] },
            { withLetter: false, keys: ['infoblocks', 'price'] },
        ]);
    });

    it('«сначала цена», таблица помещается под письмом: цена и подпись на листе письма', () => {
        expect(
            offerSheetFlows(settings({ isPriceFirst: true }), {
                ...onSheets,
                priceFitsLetter: true,
            }),
        ).toEqual([
            { withLetter: true, keys: ['price', 'stamps'] },
            { withLetter: false, keys: ['infoblocks'] },
        ]);
    });

    it('«сначала цена», таблица под письмом не помещается: письмо одно, цена с подписью — со следующего листа', () => {
        expect(
            offerSheetFlows(settings({ isPriceFirst: true }), onSheets),
        ).toEqual([
            { withLetter: true, keys: [] },
            { withLetter: false, keys: ['price', 'stamps'] },
            { withLetter: false, keys: ['infoblocks'] },
        ]);
    });

    it('письмо на промо-странице: подписи среди разделов нет, пустого листа перед наполнением нет', () => {
        expect(offerSheetFlows(settings(), onPromo)).toEqual([
            { withLetter: false, keys: ['infoblocks', 'price'] },
        ]);
        expect(
            offerSheetFlows(settings({ isPriceFirst: true }), onPromo),
        ).toEqual([
            { withLetter: false, keys: ['price'] },
            { withLetter: false, keys: ['infoblocks'] },
        ]);
    });
});

describe('большая таблица цен открывает новый лист', () => {
    const bigPrice = { priceStartsSheet: true };

    it('цена после наполнения уходит в свой поток: наполнение и цена не делят лист', () => {
        expect(
            offerSheetFlows(settings(), { ...onSheets, ...bigPrice }),
        ).toEqual([
            { withLetter: true, keys: ['stamps'] },
            { withLetter: false, keys: ['infoblocks'] },
            { withLetter: false, keys: ['price'] },
        ]);
        expect(
            offerSheetFlows(settings({ withStamps: false }), {
                ...onSheets,
                ...bigPrice,
            }),
        ).toEqual([
            { withLetter: true, keys: [] },
            { withLetter: false, keys: ['infoblocks'] },
            { withLetter: false, keys: ['price'] },
        ]);
    });

    it('письмо на промо-странице: цена всё равно открывает свой лист', () => {
        expect(
            offerSheetFlows(settings(), { ...onPromo, ...bigPrice }),
        ).toEqual([
            { withLetter: false, keys: ['infoblocks'] },
            { withLetter: false, keys: ['price'] },
        ]);
    });

    it('короткая таблица продолжает лист наполнения', () => {
        expect(offerSheetFlows(settings(), onSheets)).toEqual([
            { withLetter: true, keys: ['stamps'] },
            { withLetter: false, keys: ['infoblocks', 'price'] },
        ]);
    });

    it('«сначала цена»: порядок разделов не меняется, лист письма решает priceFitsLetter', () => {
        const priceFirst = settings({ isPriceFirst: true });
        expect(
            offerSheetFlows(priceFirst, {
                ...onSheets,
                ...bigPrice,
                priceFitsLetter: true,
            }),
        ).toEqual([
            { withLetter: true, keys: ['price', 'stamps'] },
            { withLetter: false, keys: ['infoblocks'] },
        ]);
        expect(
            offerSheetFlows(priceFirst, { ...onSheets, ...bigPrice }),
        ).toEqual([
            { withLetter: true, keys: [] },
            { withLetter: false, keys: ['price', 'stamps'] },
            { withLetter: false, keys: ['infoblocks'] },
        ]);
    });
});

describe('когда таблица цен большая', () => {
    const base = createOfferRenderDataFixture();
    const modelOf = (rows: number, name?: string) =>
        createOfferPdfModelFixture({
            data: createOfferRenderDataFixture({
                ProductRows: Array.from({ length: rows }, () => ({
                    ...base.ProductRows[0],
                    ...(name ? { ProductName: name } : {}),
                })),
            }),
        });

    it('одна-три строки продолжают лист наполнения в любой теме', () => {
        for (const theme of [CLASSIC_THEME, PEARL_THEME]) {
            for (const rows of [1, 2, 3]) {
                expect(priceStartsOwnSheet(modelOf(rows), theme)).toBe(false);
            }
        }
    });

    it('три строки с очень длинными названиями не рвутся сами и остаются при наполнении', () => {
        const long = 'ГАРАНТ-Профессионал. Комплект с названием '.repeat(6);
        expect(priceStartsOwnSheet(modelOf(3, long), CLASSIC_THEME)).toBe(
            false,
        );
    });

    it('четыре строки с подписью поставки и больше уходят на новый лист', () => {
        for (const theme of [CLASSIC_THEME, PEARL_THEME]) {
            for (const rows of [4, 5, 9, 14]) {
                expect(priceStartsOwnSheet(modelOf(rows), theme)).toBe(true);
            }
        }
    });

    it('наборы для сравнения: короткая таблица с заголовком остаётся при наполнении, большая уходит на новый лист', () => {
        const withSets = (general: number, sets: number[]) =>
            createOfferPdfModelFixture({
                data: createOfferRenderDataFixture({
                    TotalRow: undefined,
                    ProductRows: productRowsWithSets(
                        Array.from(
                            { length: general },
                            () => base.ProductRows[0],
                        ),
                        sets.map(count =>
                            Array.from(
                                { length: count },
                                () => base.ProductRows[0],
                            ),
                        ),
                    ),
                }),
            });

        for (const theme of [CLASSIC_THEME, PEARL_THEME]) {
            // общая строка и набор из одной строки: три строки с заголовком не рвутся
            expect(priceStartsOwnSheet(withSets(2, [1]), theme)).toBe(false);
            // общий набор из двух строк и два набора по две
            expect(priceStartsOwnSheet(withSets(2, [2, 2]), theme)).toBe(true);
        }
    });

    it('планка — 40 % вместимости листа: таблица ниже неё продолжает лист', () => {
        const rows = Array.from({ length: 4 }, () => ({
            ...base.ProductRows[0],
            ProductName: 'Гарант',
            SupplyNameMarketing: '',
        }));
        const shortRows = createOfferPdfModelFixture({
            data: createOfferRenderDataFixture({ ProductRows: rows }),
        });
        const estimate = estimatePriceBlockHeight(CLASSIC_THEME, {
            rows,
            withCaption: true,
            withTotals: true,
            salePhrase: null,
        });
        expect(estimate).toBeLessThan(sheetCapacity(CLASSIC_THEME) * 0.4);
        expect(priceStartsOwnSheet(shortRows, CLASSIC_THEME)).toBe(false);
    });
});

describe('оценка высоты раздела «Стоимость»', () => {
    const row = (name: string, supply?: string) => ({
        ProductName: name,
        SupplyNameMarketing: supply,
    });
    const base = { withCaption: true, withTotals: true, salePhrase: null };

    it('растёт с числом строк, длиной названий и подписью поставки', () => {
        const one = estimatePriceBlockHeight(CLASSIC_THEME, {
            ...base,
            rows: [row('Гарант-Юрист')],
        });
        const three = estimatePriceBlockHeight(CLASSIC_THEME, {
            ...base,
            rows: [
                row('Гарант-Юрист'),
                row('Гарант-Юрист'),
                row('Гарант-Юрист'),
            ],
        });
        const long = estimatePriceBlockHeight(CLASSIC_THEME, {
            ...base,
            rows: [
                row(
                    'ГАРАНТ-Профессионал. Комплект с длинным названием для переноса строки в таблице',
                    'Интернет версия на 3 одновременных доступа к системе',
                ),
            ],
        });
        expect(three).toBeGreaterThan(one);
        expect(long).toBeGreaterThan(one);
    });

    it('строки-заголовки наборов для сравнения добавляют высоту', () => {
        const plain = [row('Гарант-Юрист'), row('Гарант-Юрист')];
        const titled = [
            row('Гарант-Юрист'),
            {
                ...row('Гарант-Юрист'),
                IsSetFirstRow: true,
                ProductSetTitle: 'Набор 1',
            },
        ];
        const twoTitles = [
            {
                ...row('Гарант-Юрист'),
                IsSetFirstRow: true,
                ProductSetTitle: 'Набор 1',
            },
            {
                ...row('Гарант-Юрист'),
                IsSetFirstRow: true,
                ProductSetTitle: 'Набор 2',
            },
        ];
        const heightOf = (rows: typeof plain) =>
            estimatePriceBlockHeight(CLASSIC_THEME, { ...base, rows });

        expect(heightOf(titled)).toBeGreaterThan(heightOf(plain));
        expect(heightOf(twoTitles)).toBeGreaterThan(heightOf(titled));
        // высота заголовка — ячейка с рамкой и строка текста кегля таблицы: не больше строки товара
        const perTitle = heightOf(titled) - heightOf(plain);
        const { sizes, lineHeight } = CLASSIC_THEME;
        expect(perTitle).toBeGreaterThanOrEqual(sizes.sm * lineHeight);
        expect(perTitle).toBeLessThan(sizes.sm * lineHeight * 2 + 12);
    });

    it('признак первой строки без заголовка и строки общего набора высоту не меняют', () => {
        const plain = [row('Гарант-Юрист'), row('Гарант-Юрист')];
        const marked = [
            {
                ...row('Гарант-Юрист'),
                IsSetFirstRow: false,
                ProductSetTitle: '',
            },
            {
                ...row('Гарант-Юрист'),
                IsSetFirstRow: true,
                ProductSetTitle: '',
            },
        ];

        expect(
            estimatePriceBlockHeight(CLASSIC_THEME, { ...base, rows: marked }),
        ).toBe(
            estimatePriceBlockHeight(CLASSIC_THEME, { ...base, rows: plain }),
        );
    });

    it('без итога и с фразой об акции высота меняется в нужную сторону', () => {
        const rows = [row('Гарант-Юрист')];
        const withTotals = estimatePriceBlockHeight(CLASSIC_THEME, {
            ...base,
            rows,
        });
        expect(
            estimatePriceBlockHeight(CLASSIC_THEME, {
                ...base,
                rows,
                withTotals: false,
            }),
        ).toBeLessThan(withTotals);
        expect(
            estimatePriceBlockHeight(CLASSIC_THEME, {
                ...base,
                rows,
                salePhrase: 'При оплате до конца месяца — скидка 5 %',
            }),
        ).toBeGreaterThan(withTotals);
    });
});
