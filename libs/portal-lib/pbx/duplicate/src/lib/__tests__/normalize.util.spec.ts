import {
    corporateEmailDomain,
    isPlaceholderEmail,
    parseEmailDomainList,
    emailDomain,
    extractInnFromText,
    extractInnFromTitle,
    extractPhonesFromText,
    isValidInn,
    normalizeEmail,
    normalizeInn,
    normalizeInnList,
    normalizePhone,
    normalizeTitle,
    uniqueContacts,
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

describe('normalizeInnList', () => {
    it('одиночный ИНН — как раньше', () => {
        expect(normalizeInnList(`ИНН ${INN_10}`)).toEqual([INN_10]);
    });

    it('легаси-строка с несколькими ИНН больше не теряется', () => {
        expect(normalizeInnList(`${INN_10}, ${INN_12}`)).toEqual([
            INN_10,
            INN_12,
        ]);
        expect(normalizeInnList(`ИНН ${INN_10} / ИНН ${INN_12}`)).toEqual([
            INN_10,
            INN_12,
        ]);
    });

    it('мусор и пустота — пустой список', () => {
        expect(normalizeInnList('нет данных')).toEqual([]);
        expect(normalizeInnList(null)).toEqual([]);
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

describe('emailDomain / corporateEmailDomain', () => {
    it('домен в нижнем регистре, мусор — null', () => {
        expect(emailDomain('RyapolovaIN@AdmLR.Lipetsk.RU')).toBe(
            'admlr.lipetsk.ru',
        );
        expect(emailDomain('без собаки')).toBeNull();
        expect(emailDomain('a@localhost')).toBeNull();
    });

    it('бесплатные провайдеры не идентифицируют организацию', () => {
        expect(corporateEmailDomain('ac8508@mail.ru')).toBeNull();
        expect(corporateEmailDomain('x@gmail.com')).toBeNull();
        expect(corporateEmailDomain('x@yandex.ru')).toBeNull();
        expect(corporateEmailDomain('x@admlr.lipetsk.ru')).toBe(
            'admlr.lipetsk.ru',
        );
    });

    it('выдуманные адреса заявок из мессенджеров — не организация (garant 06.10)', () => {
        for (const email of [
            '79601159292.max.fict@garant.ru',
            '79111708635.telegram.fict@garant.ru',
            '79616026666.whatsapp.fict@garant.ru',
            '79616026666.fict@other.ru',
        ]) {
            expect(isPlaceholderEmail(email)).toBe(true);
            expect(corporateEmailDomain(email)).toBeNull();
        }
        expect(isPlaceholderEmail('fiction@studio.ru')).toBe(false);
        expect(isPlaceholderEmail('ivan.fictov@studio.ru')).toBe(false);
    });

    it('служебный домен Гаранта и его поддомены — не организация клиента', () => {
        expect(corporateEmailDomain('ivanov@garant.ru')).toBeNull();
        expect(corporateEmailDomain('ivanov@vrn.garant.ru')).toBeNull();
        expect(corporateEmailDomain('ivanov@garant-vrn.ru')).toBe(
            'garant-vrn.ru',
        );
    });

    it('домены из списка портала исключаются вместе с поддоменами', () => {
        const excluded = parseEmailDomainList(
            '@Garant-VRN.ru; govvrn.ru,  , без-точки',
        );
        expect([...excluded]).toEqual(['garant-vrn.ru', 'govvrn.ru']);
        expect(corporateEmailDomain('a@garant-vrn.ru', excluded)).toBeNull();
        expect(corporateEmailDomain('a@cit.govvrn.ru', excluded)).toBeNull();
        expect(corporateEmailDomain('a@romashka.ru', excluded)).toBe(
            'romashka.ru',
        );
    });
});

describe('uniqueContacts — множественные поля сделки без повторов по смыслу', () => {
    it('телефон в разных написаниях — один, остаётся первое', () => {
        expect(
            uniqueContacts(
                [
                    '+7 921 889-28-48',
                    '89218892848',
                    '9218892848',
                    '+79001112233',
                ],
                'phone',
            ),
        ).toEqual(['+7 921 889-28-48', '+79001112233']);
    });

    it('почта без учёта регистра и пробелов; пустые отбрасываются', () => {
        expect(
            uniqueContacts(
                [' Ivan@Mail.ru', 'ivan@mail.ru', '', 'b@x.ru'],
                'email',
            ),
        ).toEqual(['Ivan@Mail.ru', 'b@x.ru']);
    });

    it('короткий внутренний номер сравнивается как есть', () => {
        expect(uniqueContacts(['101', '101', '102'], 'phone')).toEqual([
            '101',
            '102',
        ]);
    });
});
