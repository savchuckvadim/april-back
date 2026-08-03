import {
    extractInnFromText,
    extractInnFromTitle,
    extractPhonesFromText,
    isValidInn,
    normalizeEmail,
    normalizeInn,
    normalizePhone,
    normalizeTitle,
    signalsCacheKey,
} from '../normalize.util';

/** Реальные валидные ИНН: 10 знаков — юрлицо, 12 — физлицо. */
const INN_10 = '7707083893';
const INN_12 = '500100732259';

describe('normalizePhone', () => {
    it('схлопывает все записи одного номера в последние 10 цифр', () => {
        const expected = '9991234567';
        expect(normalizePhone('+7 (999) 123-45-67')).toBe(expected);
        expect(normalizePhone('89991234567')).toBe(expected);
        expect(normalizePhone('9991234567')).toBe(expected);
        expect(normalizePhone('7-999-123-45-67')).toBe(expected);
    });

    it('отбрасывает внутренние номера и пустые значения', () => {
        expect(normalizePhone('101')).toBeNull();
        expect(normalizePhone('')).toBeNull();
        expect(normalizePhone(null)).toBeNull();
        expect(normalizePhone(undefined)).toBeNull();
    });
});

describe('normalizeEmail', () => {
    it('приводит к нижнему регистру и обрезает пробелы', () => {
        expect(normalizeEmail('  Test@Bitrix.COM ')).toBe('test@bitrix.com');
    });

    it('отбрасывает мусор без @', () => {
        expect(normalizeEmail('не почта')).toBeNull();
        expect(normalizeEmail('a@b')).toBeNull();
    });
});

describe('normalizeTitle', () => {
    it('снимает ОПФ, кавычки и пунктуацию', () => {
        expect(normalizeTitle('ООО "Ромашка-Плюс"')).toBe('ромашка плюс');
        expect(normalizeTitle('Ромашка Плюс')).toBe('ромашка плюс');
        expect(normalizeTitle('ЗАО «Ромашка   Плюс»')).toBe('ромашка плюс');
    });

    it('не отдаёт огрызки короче трёх символов', () => {
        expect(normalizeTitle('ООО')).toBeNull();
        expect(normalizeTitle('ИП "А"')).toBeNull();
    });
});

describe('isValidInn / normalizeInn', () => {
    it('принимает валидные 10- и 12-значные ИНН', () => {
        expect(isValidInn(INN_10)).toBe(true);
        expect(isValidInn(INN_12)).toBe(true);
    });

    it('отвергает битую контрольную сумму и неверную длину', () => {
        expect(isValidInn('7707083894')).toBe(false);
        expect(isValidInn('123456789')).toBe(false);
        expect(isValidInn('12345678901')).toBe(false);
        expect(isValidInn('абвгдеёжзи')).toBe(false);
    });

    it('нормализация чистит разделители и валидирует', () => {
        expect(normalizeInn(` ${INN_10} `)).toBe(INN_10);
        expect(normalizeInn('ИНН: 7707083893')).toBe(INN_10);
        expect(normalizeInn('9991234567')).toBeNull();
    });
});

describe('extractInnFromText', () => {
    it('достаёт ИНН из свободного текста', () => {
        expect(extractInnFromText(`ООО Ромашка, ИНН ${INN_10}`)).toEqual([
            INN_10,
        ]);
        expect(extractInnFromText(`оплата от ${INN_12} за услуги`)).toContain(
            INN_12,
        );
    });

    it('не принимает телефон за ИНН — контрольная сумма не сходится', () => {
        expect(extractInnFromText('звонил 9991234567')).toEqual([]);
    });

    it('пустой вход не ломает', () => {
        expect(extractInnFromText(null)).toEqual([]);
        expect(extractInnFromText('')).toEqual([]);
    });
});

describe('extractInnFromTitle', () => {
    it('берёт ИНН из названия компании', () => {
        expect(extractInnFromTitle(`ООО Ромашка ИНН ${INN_10}`)).toEqual([
            INN_10,
        ]);
    });

    it('игнорирует номер заявки в скобках — это не ИНН', () => {
        expect(extractInnFromTitle(`Заявка с сайта (${INN_10})`)).toEqual([]);
    });

    it('видит ИНН вне скобок, даже если скобки в названии есть', () => {
        expect(
            extractInnFromTitle(`Заявка (123123213) ООО Ромашка ${INN_10}`),
        ).toEqual([INN_10]);
    });
});

describe('extractPhonesFromText', () => {
    it('достаёт телефоны из комментария таймлайна', () => {
        expect(
            extractPhonesFromText('перезвонить на +7 (999) 123-45-67 в 12:00'),
        ).toContain('9991234567');
    });
});

describe('signalsCacheKey', () => {
    it('не зависит от порядка значений — иначе кэш промахивается', () => {
        const a = signalsCacheKey({
            phones: ['9991234567', '9007654321'],
            emails: [],
            inns: [INN_10],
            titles: [],
        });
        const b = signalsCacheKey({
            phones: ['9007654321', '9991234567'],
            emails: [],
            inns: [INN_10],
            titles: [],
        });
        expect(a).toBe(b);
    });
});
