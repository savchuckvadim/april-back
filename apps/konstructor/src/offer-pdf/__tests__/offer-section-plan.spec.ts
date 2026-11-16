import { OFFER_PDF_DEFAULT_SETTINGS } from '../model/offer-pdf-settings';
import { offerSheetFlows } from '../templates/kit/document/document.util';
import { estimatePriceBlockHeight } from '../templates/kit/price/price-fit.util';
import { CLASSIC_THEME } from '../templates/classic/classic.theme';

const settings = (patch: Partial<typeof OFFER_PDF_DEFAULT_SETTINGS> = {}) => ({
    ...OFFER_PDF_DEFAULT_SETTINGS,
    ...patch,
});

const onSheets = { letterOnSheets: true, priceFitsLetter: false };
const onPromo = { letterOnSheets: false, priceFitsLetter: false };

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
                letterOnSheets: true,
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
            rows: [row('Гарант-Юрист'), row('Гарант-Юрист'), row('Гарант-Юрист')],
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
