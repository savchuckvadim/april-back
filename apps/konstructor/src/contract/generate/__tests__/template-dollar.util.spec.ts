import {
    stripPhpTagDollars,
    TEMPLATE_TEXT_PARTS,
} from '../lib/template-dollar.util';

describe('stripPhpTagDollars: поля ${name} из Laravel-шаблонов', () => {
    it('убирает $ перед полем, в том числе разнесённый по фрагментам Word', () => {
        expect(
            stripPhpTagDollars(
                '<w:t>Итого цена за ${total_prepayment_quantity_string}:</w:t>',
            ),
        ).toBe('<w:t>Итого цена за {total_prepayment_quantity_string}:</w:t>');
        expect(
            stripPhpTagDollars(
                '<w:t>$</w:t></w:r><w:r><w:t>{total_prepayment_sum}</w:t>',
            ),
        ).toBe('<w:t></w:t></w:r><w:r><w:t>{total_prepayment_sum}</w:t>');
    });

    it('$ без поля и поле без $ не трогает', () => {
        expect(
            stripPhpTagDollars('<w:t>Цена 100 $ и {contract_number}</w:t>'),
        ).toBe('<w:t>Цена 100 $ и {contract_number}</w:t>');
    });

    it('части с текстом: документ, колонтитулы', () => {
        expect(TEMPLATE_TEXT_PARTS.test('word/document.xml')).toBe(true);
        expect(TEMPLATE_TEXT_PARTS.test('word/footer2.xml')).toBe(true);
        expect(TEMPLATE_TEXT_PARTS.test('word/styles.xml')).toBe(false);
    });
});
