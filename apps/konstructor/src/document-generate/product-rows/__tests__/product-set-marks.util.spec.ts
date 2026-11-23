import {
    getProductSetMarks,
    productSetTitle,
    type ProductSetRowSource,
} from '../product-set-marks.util';

const general: ProductSetRowSource = { type: 'general', setId: 0 };
const alternative = (setId: number): ProductSetRowSource => ({
    type: 'alternative',
    setId,
});

describe('getProductSetMarks: признаки набора у строк таблицы цен', () => {
    it('общий набор: номер 0, заголовка нет, первой строки набора нет', () => {
        expect(getProductSetMarks([general, general])).toEqual([
            { kind: 'general', number: 0, title: '', isFirstRow: false },
            { kind: 'general', number: 0, title: '', isFirstRow: false },
        ]);
    });

    it('наборы для сравнения: номер из setId, заголовок «Набор N», первая строка набора отмечена', () => {
        const marks = getProductSetMarks([
            general,
            general,
            alternative(1),
            alternative(1),
            alternative(2),
            alternative(2),
        ]);

        expect(marks.map(mark => mark.kind)).toEqual([
            'general',
            'general',
            'alternative',
            'alternative',
            'alternative',
            'alternative',
        ]);
        expect(marks.map(mark => mark.number)).toEqual([0, 0, 1, 1, 2, 2]);
        expect(marks.map(mark => mark.title)).toEqual([
            '',
            '',
            'Набор 1',
            'Набор 1',
            'Набор 2',
            'Набор 2',
        ]);
        expect(marks.map(mark => mark.isFirstRow)).toEqual([
            false,
            false,
            true,
            false,
            true,
            false,
        ]);
    });

    it('семь наборов по одной строке: у каждой строки свой заголовок и она первая в наборе', () => {
        const rows = [
            general,
            ...Array.from({ length: 7 }, (_, index) => alternative(index + 1)),
        ];
        const marks = getProductSetMarks(rows);

        expect(marks.slice(1).map(mark => mark.title)).toEqual(
            Array.from({ length: 7 }, (_, index) => `Набор ${index + 1}`),
        );
        expect(marks.slice(1).every(mark => mark.isFirstRow)).toBe(true);
        expect(marks[0].isFirstRow).toBe(false);
    });

    it('строка без type (старый клиент) — строка общего набора', () => {
        expect(getProductSetMarks([{}, { setId: 3 }])).toEqual([
            { kind: 'general', number: 0, title: '', isFirstRow: false },
            { kind: 'general', number: 0, title: '', isFirstRow: false },
        ]);
    });

    it('type не из списка тоже относится к общему набору', () => {
        expect(getProductSetMarks([{ type: 'other', setId: 1 }])).toEqual([
            { kind: 'general', number: 0, title: '', isFirstRow: false },
        ]);
    });

    it('набор для сравнения без номера продолжает предыдущий, а в начале — первый', () => {
        const marks = getProductSetMarks([
            { type: 'alternative' },
            { type: 'alternative', setId: 0 },
            alternative(2),
            { type: 'alternative' },
        ]);

        expect(marks.map(mark => mark.number)).toEqual([1, 1, 2, 2]);
        expect(marks.map(mark => mark.isFirstRow)).toEqual([
            true,
            false,
            true,
            false,
        ]);
    });

    it('нет строк — нет и признаков', () => {
        expect(getProductSetMarks([])).toEqual([]);
    });

    it('productSetTitle: «Набор N»', () => {
        expect(productSetTitle(3)).toBe('Набор 3');
    });
});
