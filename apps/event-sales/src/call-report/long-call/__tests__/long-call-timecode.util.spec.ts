import { parseTimecodeSec, transcriptLines } from '../long-call-timecode.util';

describe('parseTimecodeSec — метка [мм:сс] в начале строки', () => {
    it.each([
        ['[00:00] Алло', 0],
        ['[00:05] Менеджер: Здравствуйте', 5],
        ['[12:05] Клиент: Да', 725],
        ['[59:59] Клиент: Да', 3599],
        ['[65:03] Менеджер: час прошёл', 3903],
        ['[125:03] Клиент: три часа без малого', 7503],
        ['  [01:30] с пробелами перед меткой', 90],
    ])('«%s» → %s', (line, expected) => {
        expect(parseTimecodeSec(line)).toBe(expected);
    });

    it.each([
        ['Менеджер: без метки'],
        ['текст [00:05] метка не в начале'],
        ['[00:75] секунды не меньше 60'],
        ['[5:7] не по формату'],
        ['[мм:сс] буквы'],
        [''],
    ])('«%s» → null', line => {
        expect(parseTimecodeSec(line)).toBeNull();
    });
});

describe('transcriptLines — строки расшифровки с секундами', () => {
    it('каждая строка с секундами своей метки, строка без метки — null', () => {
        expect(
            transcriptLines(
                '[00:05] Менеджер: Алло\nбез метки\n[01:10] Клиент: Да',
            ),
        ).toEqual([
            { text: '[00:05] Менеджер: Алло', sec: 5 },
            { text: 'без метки', sec: null },
            { text: '[01:10] Клиент: Да', sec: 70 },
        ]);
    });

    it('пустые строки отбрасываются, \\r\\n читается как перевод строки', () => {
        expect(transcriptLines('a\r\n\r\n  \r\nb')).toEqual([
            { text: 'a', sec: null },
            { text: 'b', sec: null },
        ]);
    });

    it('старая запись без переводов строк — одна строка без метки', () => {
        expect(transcriptLines('Один абзац. Без меток.')).toEqual([
            { text: 'Один абзац. Без меток.', sec: null },
        ]);
    });

    it('пустой текст — пустой список', () => {
        expect(transcriptLines('')).toEqual([]);
    });
});
