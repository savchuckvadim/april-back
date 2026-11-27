import {
    contractFileName,
    contractTimelineComment,
} from '../lib/contract-timeline.util';

/** Адрес из href комментария */
const hrefOf = (comment: string): string =>
    /href="([^"]*)"/.exec(comment)?.[1] ?? '';

const DISK_URL =
    'https://april-garant.bitrix24.ru/workgroups/group/28/disk/file/38050/Договоры/Договор Юрист   СТАР-11.docx';

describe('ссылка на договор в таймлайне', () => {
    it('адрес Диска с пробелами и кириллицей кодируется целиком: пробелы не обрывают ссылку', () => {
        const href = hrefOf(contractTimelineComment(DISK_URL, 'Договор'));
        expect(href).not.toMatch(/\s/);
        expect(href).toContain('%20%20%20');
        expect(decodeURI(href)).toBe(DISK_URL);
    });

    it('уже закодированный адрес не кодируется второй раз', () => {
        const encoded = encodeURI(DISK_URL);
        expect(hrefOf(contractTimelineComment(encoded, 'Договор'))).toBe(
            encoded,
        );
    });

    it('подпись — имя документа, иконка договора, разметка HTML', () => {
        const comment = contractTimelineComment(
            'https://portal/file/1',
            'Договор Юрист-11.docx',
        );
        expect(comment).toBe(
            '📝 <a href="https://portal/file/1" target="_blank">Договор Юрист-11.docx</a>',
        );
    });

    it('угловые скобки из имени документа не ломают разметку', () => {
        expect(
            contractTimelineComment('https://portal/file/1', 'Договор <Юрист>'),
        ).toContain('>Договор Юрист</a>');
    });
});

describe('имя файла договора', () => {
    it('повторные пробелы в названии схлопываются', () => {
        expect(contractFileName('Юрист   СТАР', '11', 2)).toBe(
            'Договор Юрист СТАР-11-2.docx',
        );
    });

    it('без номера — название и счётчик', () => {
        expect(contractFileName(' Юрист ', undefined, 3)).toBe(
            'Договор Юрист-3.docx',
        );
    });
});
