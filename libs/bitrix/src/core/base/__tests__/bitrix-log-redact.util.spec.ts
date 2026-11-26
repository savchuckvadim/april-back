import { base64ByteSize, redactBitrixPayload } from '../bitrix-log-redact.util';

const BYTES = 50_000;
const FILE_BASE64 = Buffer.alloc(BYTES, 'office').toString('base64');

const asText = (value: unknown): string => JSON.stringify(value);

describe('base64ByteSize', () => {
    it.each([
        ['', 0],
        ['YQ==', 1],
        ['YWI=', 2],
        ['YWJj', 3],
        ['YWJjZA==', 4],
    ])('«%s» — %i байт', (base64, bytes) => {
        expect(base64ByteSize(base64)).toBe(bytes);
    });

    it('url-кодированный base64 считается как обычный', () => {
        expect(base64ByteSize('YQ%3D%3D')).toBe(1);
        expect(base64ByteSize('a%2Bb%2F')).toBe(3);
    });
});

describe('redactBitrixPayload — лог ошибки вызова Битрикса', () => {
    it('disk.folder.uploadfile: имя файла остаётся, содержимое уходит в «<N байт>»', () => {
        const request = {
            id: 12,
            data: { NAME: 'КП.docx' },
            fileContent: ['КП.docx', FILE_BASE64],
            generateUniqueName: true,
        };

        const text = asText(redactBitrixPayload(request));

        expect(text).toContain(`"fileContent":["КП.docx","<${BYTES} байт>"]`);
        expect(text).toContain('"id":12');
        expect(text).toContain('"NAME":"КП.docx"');
        expect(text).not.toContain(FILE_BASE64.slice(0, 40));
    });

    it('исходный запрос не меняется: по нему уходит настоящий файл', () => {
        const request = { fileContent: ['a.pdf', FILE_BASE64] };

        redactBitrixPayload(request);

        expect(request.fileContent[1]).toBe(FILE_BASE64);
    });

    it('короткое содержимое под ключом fileContent тоже скрыто', () => {
        const text = asText(
            redactBitrixPayload({ fileContent: ['мини.txt', 'YWJj'] }),
        );

        expect(text).toBe('{"fileContent":["мини.txt","<3 байт>"]}');
    });

    it('файл в поле CRM (длинный base64 без ключа fileContent) тоже скрыт', () => {
        const request = {
            fields: {
                TITLE: 'Сделка',
                UF_CRM_SCAN: { fileData: ['scan.png', FILE_BASE64] },
                UF_CRM_RAW: ['scan.png', FILE_BASE64],
            },
        };

        const text = asText(redactBitrixPayload(request));

        expect(text).toContain('"TITLE":"Сделка"');
        expect(text).toContain(`"fileData":["scan.png","<${BYTES} байт>"]`);
        expect(text).toContain(`"UF_CRM_RAW":["scan.png","<${BYTES} байт>"]`);
        expect(text).not.toMatch(/[A-Za-z0-9+/]{100,}/);
    });

    it('команда пачки: base64 внутри строки cmd, в том числе url-кодированный', () => {
        const encoded = FILE_BASE64.replace(/\+/g, '%2B')
            .replace(/\//g, '%2F')
            .replace(/=/g, '%3D');
        const request = {
            halt: 0,
            cmd: {
                up: `disk.folder.uploadfile?id=12&fileContent[0]=a.pdf&fileContent[1]=${encoded}`,
            },
        };

        const text = asText(redactBitrixPayload(request));

        expect(text).toContain(
            'disk.folder.uploadfile?id=12&fileContent[0]=a.pdf',
        );
        expect(text).toContain(`<${BYTES} байт>`);
        expect(text).not.toMatch(/[A-Za-z0-9]{100,}/);
    });

    it('обычные значения не трогает: длинный текст, ссылки, числа, даты', () => {
        const longText = 'Коммерческое предложение для клиента. '.repeat(40);
        const request = {
            comment: longText,
            url: 'https://garant.bitrix24.ru/crm/deal/details/281275/',
            amount: 150000,
            flag: true,
            nothing: null,
            at: new Date('2026-11-26T10:00:00.000Z'),
        };

        const text = asText(redactBitrixPayload(request));

        expect(text).toBe(asText(request));
    });

    it('Buffer в теле заменяется размером', () => {
        const text = asText(
            redactBitrixPayload({ file: Buffer.from('pdf-bytes') }),
        );

        expect(text).toBe('{"file":"<9 байт>"}');
    });

    it('слишком глубокое тело и циклы не вешают и не роняют отчёт', () => {
        const cyclic: Record<string, unknown> = { name: 'loop' };
        cyclic.self = cyclic;

        expect(() => asText(redactBitrixPayload(cyclic))).not.toThrow();
    });

    it('строка и пустое значение возвращаются как есть', () => {
        expect(redactBitrixPayload('boom')).toBe('boom');
        expect(redactBitrixPayload(undefined)).toBeUndefined();
    });
});
