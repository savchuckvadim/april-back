import {
    OBJECTION_NO_CATEGORY_TITLE,
    callTypeTitleOf,
    lowerFirst,
    objectionTitleOf,
    riskTitleOf,
    sectionTitleOf,
} from '../model/dictionary-titles.util';

describe('dictionary-titles — названия кодов справочников смарта', () => {
    it('разделы — с большой буквы, чужой код — как есть', () => {
        expect(sectionTitleOf('PRICE')).toBe('Работа по цене');
        expect(sectionTitleOf('closing')).toBe('closing');
    });

    it('возражения — название категории, null и чужой код — «Без категории»', () => {
        expect(objectionTitleOf('price')).toBe('Цена');
        expect(objectionTitleOf('timing')).toBe('Сроки / не сейчас');
        expect(objectionTitleOf(null)).toBe(OBJECTION_NO_CATEGORY_TITLE);
        expect(objectionTitleOf('weird')).toBe('Без категории');
    });

    it('сигналы риска строчными, включая срочный разбор из приоритетов коучинга', () => {
        expect(riskTitleOf('conflict')).toBe('конфликт / грубость');
        expect(riskTitleOf('promise')).toBe('необоснованное обещание клиенту');
        expect(riskTitleOf('urgent')).toBe('срочно на разбор');
        expect(riskTitleOf('other-kind')).toBe('other-kind');
    });

    it('тип звонка и lowerFirst', () => {
        expect(callTypeTitleOf('presentation')).toBe('Презентация');
        expect(callTypeTitleOf('x')).toBe('x');
        expect(lowerFirst('Звонок → презентация')).toBe('звонок → презентация');
        expect(lowerFirst('')).toBe('');
    });
});
