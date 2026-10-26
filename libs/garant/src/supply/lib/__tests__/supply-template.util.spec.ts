import {
    numberToWords,
    pluralize,
    renderSupplyTemplate,
    renderSupplyTexts,
} from '../supply-template.util';

describe('supply-template.util', () => {
    it('число прописью: род и падеж', () => {
        expect(numberToWords(2)).toBe('два');
        expect(numberToWords(2, 'gen')).toBe('двух');
        expect(numberToWords(1, 'gen')).toBe('одного');
        expect(numberToWords(1, 'nom', 'f')).toBe('одна');
        expect(numberToWords(21, 'gen')).toBe('двадцати одного');
    });

    it('форма слова по числу (1 / 2–4 / 5+, с учётом 11–14)', () => {
        const form = (n: number) =>
            pluralize(n, 'доступ', 'доступа', 'доступов');
        expect(form(1)).toBe('доступ');
        expect(form(3)).toBe('доступа');
        expect(form(5)).toBe('доступов');
        expect(form(11)).toBe('доступов');
        expect(form(21)).toBe('доступ');
        expect(form(22)).toBe('доступа');
    });

    it('рендер шаблона КП — легаси-текст 1:1', () => {
        const template =
            'Установочная версия на {n} {plural:одновременный доступ|одновременных доступа|одновременных доступов} к системе';
        expect(renderSupplyTemplate(template, 1)).toBe(
            'Установочная версия на 1 одновременный доступ к системе',
        );
        expect(renderSupplyTemplate(template, 2)).toBe(
            'Установочная версия на 2 одновременных доступа к системе',
        );
        expect(renderSupplyTemplate(template, 50)).toBe(
            'Установочная версия на 50 одновременных доступов к системе',
        );
    });

    it('число прописью в тексте договора', () => {
        const template =
            'Неограниченно с возможностью одновременной работы {words:gen} {plural:Пользователя|Пользователей|Пользователей}';
        expect(renderSupplyTemplate(template, 1)).toBe(
            'Неограниченно с возможностью одновременной работы одного Пользователя',
        );
        expect(renderSupplyTemplate(template, 10)).toBe(
            'Неограниченно с возможностью одновременной работы десяти Пользователей',
        );
        expect(renderSupplyTemplate('{Words} ОД', 3)).toBe('Три ОД');
    });

    it('строка без плейсхолдеров и null проходят как есть', () => {
        expect(renderSupplyTemplate('На переносном флэш-накопителе', 7)).toBe(
            'На переносном флэш-накопителе',
        );
        expect(renderSupplyTemplate(null, 7)).toBeNull();
        expect(renderSupplyTemplate(undefined, 7)).toBeNull();
    });

    it('renderSupplyTexts покрывает все поля, незаданные остаются null', () => {
        const texts = renderSupplyTexts(
            { quantityForKp: 'на {n} ОД', contractPropSuppliesQuantity: '{n}' },
            5,
        );
        expect(texts.quantityForKp).toBe('на 5 ОД');
        expect(texts.contractPropSuppliesQuantity).toBe('5');
        expect(texts.contractName).toBeNull();
        expect(texts.acontractPropComment).toBeNull();
    });
});
