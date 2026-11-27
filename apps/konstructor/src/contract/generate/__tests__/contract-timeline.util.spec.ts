import {
    contractFileName,
    contractLinkText,
    contractTimelineComment,
} from '../lib/contract-timeline.util';

/** Адрес из href комментария */
const hrefOf = (comment: string): string =>
    /href="([^"]*)"/.exec(comment)?.[1] ?? '';

/** Текст ссылки комментария */
const textOf = (comment: string): string =>
    />([^<]*)<\/a>/.exec(comment)?.[1] ?? '';

const DISK_URL =
    'https://april-garant.bitrix24.ru/workgroups/group/28/disk/file/38050/Договоры/Договор_Юрист_СТАР-11-2.docx';

describe('имя файла договора', () => {
    it('без пробелов: пробелы названия, и повторные тоже, — одно подчёркивание', () => {
        expect(contractFileName('Юрист   СТАР', '11', 2)).toBe(
            'Договор_Юрист_СТАР-11-2.docx',
        );
    });

    it('без номера — название и счётчик', () => {
        expect(contractFileName(' Юрист ', undefined, 3)).toBe(
            'Договор_Юрист-3.docx',
        );
    });
});

describe('текст ссылки на договор', () => {
    it('читаемый: подчёркивания — пробелы, без расширения', () => {
        expect(contractLinkText('Договор_Юрист_СТАР-11-2.docx')).toBe(
            'Договор Юрист СТАР-11-2',
        );
    });
});

describe('ссылка на договор в таймлайне', () => {
    it('адрес без пробелов, кириллица закодирована; текст ссылки читаемый', () => {
        const comment = contractTimelineComment(
            DISK_URL,
            'Договор_Юрист_СТАР-11-2.docx',
        );
        const href = hrefOf(comment);
        expect(href).not.toMatch(/\s/);
        expect(href).not.toMatch(/[А-Яа-яЁё]/);
        expect(decodeURI(href)).toBe(DISK_URL);
        expect(textOf(comment)).toBe('Договор Юрист СТАР-11-2');
    });

    it('старое имя с пробелами в адресе тоже кодируется: пробелы ссылку не рвут', () => {
        const withSpaces =
            'https://portal/disk/file/1/Договоры/Договор Юрист   СТАР-11.docx';
        const href = hrefOf(contractTimelineComment(withSpaces, 'Договор'));
        expect(href).not.toMatch(/\s/);
        expect(decodeURI(href)).toBe(withSpaces);
    });

    it('уже закодированный адрес не кодируется второй раз', () => {
        const encoded = encodeURI(DISK_URL);
        expect(hrefOf(contractTimelineComment(encoded, 'Договор'))).toBe(
            encoded,
        );
    });

    it('разметка: иконка договора и HTML-ссылка', () => {
        expect(
            contractTimelineComment(
                'https://portal/file/1',
                'Договор_Юрист-11.docx',
            ),
        ).toBe(
            '📝 <a href="https://portal/file/1" target="_blank">Договор Юрист-11</a>',
        );
    });

    it('угловые скобки из имени не ломают разметку', () => {
        expect(
            contractTimelineComment('https://portal/file/1', 'Договор_<Юрист>'),
        ).toContain('>Договор Юрист</a>');
    });
});
