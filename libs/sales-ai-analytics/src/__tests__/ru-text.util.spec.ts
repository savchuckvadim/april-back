import {
    RU_FORMS,
    callTypeCountForms,
    ruAmount,
    ruCount,
    ruDecimal,
    ruInt,
    ruPluralForm,
} from '../model/ru-text.util';

describe('ruPluralForm — формы слова при числе', () => {
    it('1 / 2–4 / 5–20 и исключения 11–14', () => {
        const forms = RU_FORMS.reviews;
        expect(ruPluralForm(1, forms)).toBe('разбор');
        expect(ruPluralForm(2, forms)).toBe('разбора');
        expect(ruPluralForm(4, forms)).toBe('разбора');
        expect(ruPluralForm(5, forms)).toBe('разборов');
        expect(ruPluralForm(11, forms)).toBe('разборов');
        expect(ruPluralForm(14, forms)).toBe('разборов');
        expect(ruPluralForm(21, forms)).toBe('разбор');
        expect(ruPluralForm(22, forms)).toBe('разбора');
        expect(ruPluralForm(111, forms)).toBe('разборов');
        expect(ruPluralForm(0, forms)).toBe('разборов');
    });

    it('дробное — родительный единственного («1,5 продажи»), NaN — форма «много»', () => {
        expect(ruPluralForm(1.5, RU_FORMS.sales)).toBe('продажи');
        expect(ruPluralForm(Number.NaN, RU_FORMS.sales)).toBe('продаж');
    });
});

describe('ruCount / ruInt / ruDecimal / ruAmount', () => {
    it('число и слово через пробел, дробное — с запятой', () => {
        expect(ruCount(12, RU_FORMS.calls)).toBe('12 звонков');
        expect(ruCount(1, RU_FORMS.deals)).toBe('1 сделка');
        expect(ruCount(2.5, RU_FORMS.sales)).toBe('2,5 продажи');
    });

    it('ruInt округляет до целого без «−0»', () => {
        expect(ruInt(2.4)).toBe(2);
        expect(ruInt(2.5)).toBe(3);
        expect(ruInt(-0.2)).toBe(0);
        expect(Object.is(ruInt(-0.2), -0)).toBe(false);
    });

    it('ruDecimal — один знак и запятая', () => {
        expect(ruDecimal(6.44)).toBe('6,4');
        expect(ruDecimal(0.125, 2)).toBe('0,13');
    });

    it('ruAmount: целое, а малую дробь не прячет за нулём', () => {
        expect(ruAmount(12.4, RU_FORMS.calls)).toBe('12 звонков');
        expect(ruAmount(0.3, RU_FORMS.calls)).toBe('0,3 звонка');
        expect(ruAmount(0, RU_FORMS.calls)).toBe('0 звонков');
    });
});

describe('callTypeCountForms — активность типа звонка словами', () => {
    it('известные типы — свои формы, чужой код — «активность»', () => {
        expect(ruCount(43, callTypeCountForms('call'))).toBe('43 звонка');
        expect(ruCount(3, callTypeCountForms('cold'))).toBe(
            '3 холодных звонка',
        );
        expect(ruCount(7, callTypeCountForms('presentation'))).toBe(
            '7 презентаций',
        );
        expect(ruCount(5, callTypeCountForms('unknown'))).toBe('5 активностей');
    });
});
