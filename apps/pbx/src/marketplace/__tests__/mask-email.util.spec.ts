import { maskEmail } from '../lib/mask-email.util';

describe('maskEmail (маскирование адреса для кабинета)', () => {
    it('оставляет первый и последний символ имени и домен целиком', () => {
        expect(maskEmail('director@romashka.ru')).toBe('d***r@romashka.ru');
    });

    it('короткое имя (1–2 символа) скрывает полностью: иначе адрес восстанавливается', () => {
        expect(maskEmail('ab@romashka.ru')).toBe('***@romashka.ru');
        expect(maskEmail('a@romashka.ru')).toBe('***@romashka.ru');
    });

    it('имя из трёх символов уже маскируется по общему правилу', () => {
        expect(maskEmail('abc@romashka.ru')).toBe('a***c@romashka.ru');
    });

    it('пустое значение → пустая строка (нечего показывать)', () => {
        expect(maskEmail(null)).toBe('');
        expect(maskEmail(undefined)).toBe('');
        expect(maskEmail('')).toBe('');
    });

    it('строка без @ не раскрывается', () => {
        expect(maskEmail('не-email')).toBe('***');
    });

    it('адрес с @ в начале не раскрывается', () => {
        expect(maskEmail('@romashka.ru')).toBe('***');
    });

    it('несколько @: разделителем считается последний', () => {
        expect(maskEmail('weird@name@romashka.ru')).toBe('w***e@romashka.ru');
    });
});
