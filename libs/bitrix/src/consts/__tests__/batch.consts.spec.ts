import {
    BATCH_LINE_BREAK_SYMBOL,
    toBatchSafeText,
    toBatchText,
} from '../batch.consts';

/**
 * Экранирование текста для batch-команд: значения вклеиваются в query-строку
 * `cmd` и url-декодируются на стороне Битрикс, поэтому сырые `%`, `+`, `&`
 * и переносы строк обязаны уезжать escape-последовательностями.
 */
describe('toBatchText', () => {
    it('заменяет все виды переносов на %0A, остальное не трогает', () => {
        expect(toBatchText('a\r\nb\rc\nd')).toBe(
            ['a', 'b', 'c', 'd'].join(BATCH_LINE_BREAK_SYMBOL),
        );
        // Контракт легаси-формата истории: %, + и & НЕ экранируются.
        expect(toBatchText('50% + 1 & 2')).toBe('50% + 1 & 2');
    });
});

describe('toBatchSafeText', () => {
    it('экранирует % первым — иначе %0A/%2B/%26 задвоились бы', () => {
        expect(toBatchSafeText('скидка 50%')).toBe('скидка 50%25');
        // Уже-экранированный текст не «умнеет»: %0A честно дважды кодируется.
        expect(toBatchSafeText('a%0Ab')).toBe('a%250Ab');
    });

    it("экранирует '+' — в query-строке он декодируется пробелом", () => {
        // Телефон в DESCRIPTION задачи: '+' обязан доехать плюсом, не пробелом.
        expect(toBatchSafeText('+7 900 123-45-67')).toBe('%2B7 900 123-45-67');
        expect(toBatchSafeText('a+b+c')).toBe('a%2Bb%2Bc');
    });

    it('экранирует & и переносы строк', () => {
        expect(toBatchSafeText('Иванов & Партнёры')).toBe(
            'Иванов %26 Партнёры',
        );
        expect(toBatchSafeText('a\r\nb\nc')).toBe('a%0Ab%0Ac');
    });

    it('комбинация: порядок замен не двоит escape-последовательности', () => {
        // % → %25, + → %2B, & → %26, \n → %0A — каждая ровно по разу.
        expect(toBatchSafeText('100% + бонус & тел. +7\nконец')).toBe(
            '100%25 %2B бонус %26 тел. %2B7%0Aконец',
        );
    });
});
