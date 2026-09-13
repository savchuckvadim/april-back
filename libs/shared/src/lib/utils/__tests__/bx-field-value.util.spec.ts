import {
    bxFieldBool,
    bxFieldFlag,
    bxFieldId,
    bxFieldText,
    isBxTrue,
} from '../bx-field-value.util';

describe('bxFieldBool — Bitrix отдаёт «да» пятью разными формами', () => {
    it.each([
        ['число 1', 1],
        ['строка «1»', '1'],
        ['строка «Y»', 'Y'],
        ['строка «y»', 'y'],
        ['boolean true', true],
        ['строка «true»', 'true'],
        ['строка «TRUE»', 'TRUE'],
        ['массив ["Y"] (multiple)', ['Y']],
    ])('%s → true', (_name, raw) => {
        expect(bxFieldBool(raw)).toBe(true);
    });

    it.each([
        ['число 0', 0],
        ['строка «0»', '0'],
        ['строка «N»', 'N'],
        ['boolean false', false],
        ['строка «false»', 'false'],
    ])('%s → false («заполнено и снято»)', (_name, raw) => {
        expect(bxFieldBool(raw)).toBe(false);
    });

    it.each([
        ['пустая строка', ''],
        ['пробелы', '  '],
        ['null', null],
        ['undefined', undefined],
        ['пустой массив', []],
        ['объект', { a: 1 }],
        ['мусор', 'ага'],
    ])('%s → null («не заполнено»)', (_name, raw) => {
        expect(bxFieldBool(raw)).toBeNull();
    });

    it('«не заполнено» отличается от «снято» — иначе не понять, брать ли дефолт', () => {
        expect(bxFieldBool('')).toBeNull();
        expect(bxFieldBool('N')).toBe(false);
    });
});

describe('isBxTrue — строгий флаг', () => {
    it('только явное «да»', () => {
        expect(isBxTrue('Y')).toBe(true);
        expect(isBxTrue('N')).toBe(false);
        expect(isBxTrue('')).toBe(false);
        expect(isBxTrue('мусор')).toBe(false);
    });
});

describe('bxFieldFlag — в формат флага хука', () => {
    it.each([
        ['1', 'Y'],
        ['0', 'N'],
        ['Y', 'Y'],
        ['N', 'N'],
    ])('%s → %s', (raw, expected) => {
        expect(bxFieldFlag(raw)).toBe(expected);
    });

    it('не заполнено → null (вызывающий применит свой дефолт)', () => {
        expect(bxFieldFlag('')).toBeNull();
    });
});

describe('bxFieldText', () => {
    it('обрезает пробелы', () => {
        expect(bxFieldText('  Тест  ')).toBe('Тест');
    });

    it('«0» — это пустое employee-поле, а не текст', () => {
        expect(bxFieldText('0')).toBeNull();
    });

    it('берёт первый элемент multiple-поля', () => {
        expect(bxFieldText(['Первый', 'Второй'])).toBe('Первый');
    });

    it('объект не превращается в «[object Object]»', () => {
        expect(bxFieldText({ a: 1 })).toBeNull();
    });

    it.each([
        ['пустая строка', ''],
        ['false', false],
        ['null', null],
        ['пустой массив', []],
    ])('%s → null', (_name, raw) => {
        expect(bxFieldText(raw)).toBeNull();
    });
});

describe('bxFieldId', () => {
    it('«user_447» не число — null (формат хука разбирается отдельно)', () => {
        expect(bxFieldId('user_447')).toBeNull();
    });

    it.each([
        ['строка', '447', 447],
        ['число', 447, 447],
        ['массив', ['447'], 447],
    ])('%s → %s', (_name, raw, expected) => {
        expect(bxFieldId(raw)).toBe(expected);
    });

    it.each([
        ['ноль', '0'],
        ['отрицательное', '-5'],
        ['пусто', ''],
    ])('%s → null', (_name, raw) => {
        expect(bxFieldId(raw)).toBeNull();
    });
});
