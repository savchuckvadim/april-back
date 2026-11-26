import {
    salesDocumentProductRows,
    toSalesDocumentProductRow,
} from '../lib/sales-document-product-rows';
import {
    generalRowsOf,
    salesDocumentSum,
    toPositiveInt,
} from '../lib/sales-document-source';
import { describeSalesDocument, formatRubles } from '../lib/sales-document-summary';
import { garantSet, offerSource, priceRow } from './sales-document.fixtures';

describe('toSalesDocumentProductRow: строка конструктора в товарную строку Bitrix', () => {
    it('цена со скидкой, цена по прайсу и скидка в рублях', () => {
        const row = priceRow({
            name: 'Гарант-Максимум',
            list: 1200,
            current: 1000,
            quantity: 12,
            measureCode: 15,
        });

        expect(toSalesDocumentProductRow(row, 3)).toEqual({
            productName: 'Гарант-Максимум',
            price: 1000,
            quantity: 12,
            priceNetto: 1200,
            discountSum: 200,
            discountTypeId: 1,
            measureCode: '15',
            measureId: 15,
            sort: 3,
        });
    });

    it('без скидки цена по прайсу равна цене, скидка нулевая', () => {
        const mapped = toSalesDocumentProductRow(
            priceRow({ list: 500, current: 500, quantity: 1 }),
            0,
        );

        expect(mapped).toMatchObject({
            price: 500,
            priceNetto: 500,
            discountSum: 0,
        });
    });

    it('цена по прайсу ниже цены игнорируется: скидка не уходит в минус', () => {
        const mapped = toSalesDocumentProductRow(
            priceRow({ list: 400, current: 500, quantity: 1 }),
            0,
        );

        expect(mapped).toMatchObject({ priceNetto: 500, discountSum: 0 });
    });

    it('хвосты плавающей точки срезаются до копеек', () => {
        const mapped = toSalesDocumentProductRow(
            priceRow({ list: 1000.3, current: 700.1, quantity: 1 }),
            0,
        );

        expect(mapped).toMatchObject({
            price: 700.1,
            priceNetto: 1000.3,
            discountSum: 300.2,
        });
    });

    it('без кода единицы строка уходит без measureCode и measureId', () => {
        const mapped = toSalesDocumentProductRow(priceRow({}), 0);

        expect(mapped).not.toHaveProperty('measureCode');
        expect(mapped).not.toHaveProperty('measureId');
    });

    it('название берётся из shortName, когда name пусто', () => {
        const mapped = toSalesDocumentProductRow(
            priceRow({ name: '', shortName: 'Макс' }),
            0,
        );

        expect(mapped?.productName).toBe('Макс');
    });

    it.each([
        ['пустое название', priceRow({ name: '', shortName: '' })],
        ['нулевое количество', priceRow({ quantity: 0 })],
        ['цена не число', priceRow({ current: Number.NaN })],
        ['отрицательная цена', priceRow({ current: -1 })],
    ])('строка пропускается: %s', (_title, row) => {
        expect(toSalesDocumentProductRow(row, 0)).toBeNull();
    });
});

describe('salesDocumentProductRows: строки общих наборов', () => {
    it('строки наборов для сравнения в событие не попадают', () => {
        const general = priceRow({ name: 'Основной' });
        const alternative = priceRow({ name: 'Для сравнения', type: 'alternative' });

        const rows = salesDocumentProductRows([
            { rows: [general, alternative] },
        ]);

        expect(rows.map(row => row.productName)).toEqual(['Основной']);
    });

    it('нет rows: строки берутся из общих наборов', () => {
        const rows = salesDocumentProductRows([
            { sets: { general: [garantSet(priceRow({ name: 'Из набора' }))] } },
        ]);

        expect(rows.map(row => row.productName)).toEqual(['Из набора']);
    });

    it('несколько документов: строки идут подряд, sort сквозной', () => {
        const rows = salesDocumentProductRows([
            { rows: [priceRow({ name: 'А' }), priceRow({ name: 'Б' })] },
            { rows: [priceRow({ name: 'В' })] },
        ]);

        expect(rows.map(row => [row.productName, row.sort])).toEqual([
            ['А', 0],
            ['Б', 1],
            ['В', 2],
        ]);
    });

    it('непригодная строка не сдвигает sort следующих', () => {
        const rows = salesDocumentProductRows([
            {
                rows: [
                    priceRow({ name: 'А' }),
                    priceRow({ name: '', shortName: '' }),
                    priceRow({ name: 'В' }),
                ],
            },
        ]);

        expect(rows.map(row => row.sort)).toEqual([0, 1]);
    });

    it('generalRowsOf: пустой документ даёт пустой список', () => {
        expect(generalRowsOf({})).toEqual([]);
    });
});

describe('salesDocumentSum: итог общего набора', () => {
    it('берётся price.sum итоговой строки', () => {
        expect(
            salesDocumentSum([offerSource({ current: 1000, quantity: 12 })]),
        ).toBe(12000);
    });

    it('несколько документов: итоги складываются', () => {
        expect(
            salesDocumentSum([
                offerSource({ totalSum: 100000.1 }),
                offerSource({ totalSum: 50000.2 }),
            ]),
        ).toBe(150000.3);
    });

    it('нет price.sum: цена × количество', () => {
        const total = priceRow({ current: 300, quantity: 4 });
        Object.assign(total.price, { sum: undefined });

        expect(salesDocumentSum([{ total }])).toBe(1200);
    });

    it('итога нет или он нулевой: суммы нет', () => {
        expect(salesDocumentSum([{}])).toBeUndefined();
        expect(salesDocumentSum([])).toBeUndefined();
        expect(
            salesDocumentSum([offerSource({ totalSum: 0 })]),
        ).toBeUndefined();
    });

    it('документ без итога в сумму не входит', () => {
        expect(
            salesDocumentSum([{}, offerSource({ totalSum: 700 })]),
        ).toBe(700);
    });
});

describe('describeSalesDocument: текст события', () => {
    it('КП: комплект, поставка, сумма', () => {
        const text = describeSalesDocument(
            ['offer'],
            [offerSource({ name: 'Гарант-Максимум', totalSum: 123456 })],
            123456,
        );

        expect(text).toBe('КП: Гарант-Максимум, Интернет 5 ОД, 123 456 ₽');
    });

    it('альтернативное название комплекта сильнее обычного', () => {
        const source = offerSource({
            name: 'Гарант-Максимум',
            alternativeName: 'Гарант-Максимум Плюс',
        });

        expect(describeSalesDocument(['offer'], [source], undefined)).toBe(
            'КП: Гарант-Максимум Плюс, Интернет 5 ОД',
        );
    });

    it('КП со счётом называется по КП', () => {
        expect(
            describeSalesDocument(['offer', 'invoice'], [offerSource()], 12000),
        ).toMatch(/^КП: /);
    });

    it('договор и поставка подписываются своим видом', () => {
        expect(describeSalesDocument(['contract'], [offerSource()], 5000)).toMatch(
            /^Договор: /,
        );
        expect(describeSalesDocument(['supply'], [offerSource()], 5000)).toMatch(
            /^Поставка: /,
        );
    });

    it('несколько документов: комплекты через «;», сумма общая', () => {
        const text = describeSalesDocument(
            ['offer'],
            [
                offerSource({ name: 'Максимум', supply: 'Интернет 5 ОД' }),
                offerSource({ name: 'Оптимум', supply: 'Интернет 1 ОД' }),
            ],
            24000,
        );

        expect(text).toBe(
            'КП: Максимум, Интернет 5 ОД; Оптимум, Интернет 1 ОД, 24 000 ₽',
        );
    });

    it('одинаковые комплекты не повторяются', () => {
        const text = describeSalesDocument(
            ['offer'],
            [offerSource(), offerSource()],
            undefined,
        );

        expect(text).toBe('КП: Гарант-Максимум, Интернет 5 ОД');
    });

    it('назвать нечем и суммы нет: только подпись документа', () => {
        expect(describeSalesDocument(['offer'], [], undefined)).toBe('КП');
        expect(describeSalesDocument(['invoice'], [], undefined)).toBe('Счёт');
    });

    it('название участника выручает, когда у строк названия нет', () => {
        const text = describeSalesDocument(
            ['supply'],
            [{ title: 'Юрист', supply: { name: 'Интернет 3 ОД' } }],
            undefined,
        );

        expect(text).toBe('Поставка: Юрист, Интернет 3 ОД');
    });

    it('formatRubles: тысячи пробелом, копейки запятой', () => {
        expect(formatRubles(0)).toBe('0');
        expect(formatRubles(999)).toBe('999');
        expect(formatRubles(1000)).toBe('1 000');
        expect(formatRubles(1234567)).toBe('1 234 567');
        expect(formatRubles(1234.5)).toBe('1 234,50');
    });
});

describe('toPositiveInt', () => {
    it.each([
        [5, 5],
        ['7', 7],
        [' 9 ', 9],
    ])('%p даёт %p', (value, expected) => {
        expect(toPositiveInt(value)).toBe(expected);
    });

    it.each([[0], [-1], [1.5], ['abc'], [''], [null], [undefined], [{}]])(
        '%p даёт null',
        value => {
            expect(toPositiveInt(value)).toBeNull();
        },
    );
});
