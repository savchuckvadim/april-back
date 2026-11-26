import {
    renderTranscriptWithTimecodes,
    type TranscriptSegment,
} from '@lib/call-lib';
import { LONG_CALL_COMPACT_LIMITS } from '../long-call.const';
import { compactTranscript } from '../long-call-compact.util';

const { maxSpanSec, maxTextChars } = LONG_CALL_COMPACT_LIMITS;
const join = (...lines: string[]): string => lines.join('\n');

describe('compactTranscript — склейка коротких строк', () => {
    it('строки по два-три слова одного говорящего — одна строка: метка первой, подпись, тексты через пробел', () => {
        const source = join(
            '[00:00] Менеджер: добрый день',
            '[00:01] Менеджер: меня зовут',
            '[00:02] Менеджер: Вадим компания Апрель',
        );

        expect(compactTranscript(source)).toBe(
            '[00:00] Менеджер: добрый день меня зовут Вадим компания Апрель',
        );
    });

    it('без подписи говорящего: строки без подписи склеиваются между собой', () => {
        const source = join(
            '[00:00] алло',
            '[00:01] да слушаю',
            '[00:02] говорите',
        );

        expect(compactTranscript(source)).toBe(
            '[00:00] алло да слушаю говорите',
        );
    });

    it('смена говорящего начинает новую строку', () => {
        const source = join(
            '[00:00] Менеджер: добрый день',
            '[00:01] Менеджер: это Вадим',
            '[00:02] Клиент: здравствуйте',
            '[00:03] Клиент: слушаю',
            '[00:04] Менеджер: по заявке',
        );

        expect(compactTranscript(source)).toBe(
            join(
                '[00:00] Менеджер: добрый день это Вадим',
                '[00:02] Клиент: здравствуйте слушаю',
                '[00:04] Менеджер: по заявке',
            ),
        );
    });

    it('строка с подписью и без неё — разные говорящие', () => {
        const source = join(
            '[00:00] Менеджер: добрый день',
            '[00:01] продолжаю без подписи',
        );

        expect(compactTranscript(source)).toBe(source);
    });

    it('слово «Клиентский» в начале строки без подписи подписью не считается', () => {
        const source = join(
            '[00:00] Клиентский отдел: звоню',
            '[00:01] Клиентский отдел: снова',
        );

        expect(compactTranscript(source)).toBe(
            '[00:00] Клиентский отдел: звоню Клиентский отдел: снова',
        );
    });

    it('подписи говорящих те же, что печатает renderTranscriptWithTimecodes', () => {
        const segment = (
            startSec: number,
            speaker: TranscriptSegment['speaker'],
            text: string,
        ): TranscriptSegment => ({
            startSec,
            endSec: startSec + 1,
            speaker,
            text,
        });
        const source = renderTranscriptWithTimecodes([
            segment(0, 'manager', 'добрый день'),
            segment(1, 'manager', 'это Вадим'),
            segment(2, 'client', 'здравствуйте'),
            segment(3, 'client', 'слушаю'),
            segment(4, 'unknown', 'шум'),
            segment(5, 'unknown', 'ещё шум'),
        ]);

        expect(compactTranscript(source)).toBe(
            join(
                '[00:00] Менеджер: добрый день это Вадим',
                '[00:02] Клиент: здравствуйте слушаю',
                '[00:04] шум ещё шум',
            ),
        );
    });
});

describe('compactTranscript — пределы группы', () => {
    it('разрыв по времени отсчитывается от первой строки группы: 10 секунд — внутри, 11 — новая строка', () => {
        const source = join(
            '[00:00] Менеджер: раз',
            '[00:05] Менеджер: два',
            '[00:10] Менеджер: три',
            '[00:11] Менеджер: четыре',
        );

        expect(maxSpanSec).toBe(10);
        expect(compactTranscript(source)).toBe(
            join('[00:00] Менеджер: раз два три', '[00:11] Менеджер: четыре'),
        );
    });

    it('считается от первой строки, а не от предыдущей: шаги по 6 секунд — две строки в группе', () => {
        const source = join(
            '[00:00] Клиент: раз',
            '[00:06] Клиент: два',
            '[00:12] Клиент: три',
        );

        expect(compactTranscript(source)).toBe(
            join('[00:00] Клиент: раз два', '[00:12] Клиент: три'),
        );
    });

    it('текст группы до 240 знаков включительно; 241 — новая строка', () => {
        const first = 'а'.repeat(119);
        const fits = 'б'.repeat(120);
        const over = 'б'.repeat(121);

        expect(maxTextChars).toBe(240);
        expect(
            compactTranscript(
                join(`[00:00] Менеджер: ${first}`, `[00:01] Менеджер: ${fits}`),
            ),
        ).toBe(`[00:00] Менеджер: ${first} ${fits}`);
        expect(
            compactTranscript(
                join(`[00:00] Менеджер: ${first}`, `[00:01] Менеджер: ${over}`),
            ),
        ).toBe(join(`[00:00] Менеджер: ${first}`, `[00:01] Менеджер: ${over}`));
    });

    it('строка, которая сама длиннее 240 знаков, остаётся как есть и ничего не приклеивает', () => {
        const long = 'в'.repeat(300);
        const source = join(
            `[00:00] Менеджер: ${long}`,
            '[00:01] Менеджер: коротко',
        );

        expect(compactTranscript(source)).toBe(source);
    });

    it('метки идут не по возрастанию — новая группа', () => {
        const source = join(
            '[00:08] Менеджер: а',
            '[00:05] Менеджер: б',
            '[00:06] Менеджер: в',
        );

        expect(compactTranscript(source)).toBe(
            join('[00:08] Менеджер: а', '[00:05] Менеджер: б в'),
        );
    });

    it('метки больше 59 минут: [65:03] и [125:03] читаются как есть', () => {
        const source = join(
            '[65:03] Клиент: да',
            '[65:09] Клиент: хорошо',
            '[65:14] Клиент: договорились',
            '[125:03] Менеджер: ещё',
            '[125:04] Менеджер: слово',
        );

        expect(compactTranscript(source)).toBe(
            join(
                '[65:03] Клиент: да хорошо',
                '[65:14] Клиент: договорились',
                '[125:03] Менеджер: ещё слово',
            ),
        );
    });
});

describe('compactTranscript — строки без метки и особые случаи', () => {
    it('строка без метки не трогается и рвёт группу', () => {
        const source = join(
            '[00:00] Менеджер: раз',
            'служебная строка без метки',
            '[00:01] Менеджер: два',
            '[00:02] Менеджер: три',
        );

        expect(compactTranscript(source)).toBe(
            join(
                '[00:00] Менеджер: раз',
                'служебная строка без метки',
                '[00:01] Менеджер: два три',
            ),
        );
    });

    it('секунды не меньше 60 — это не метка: строка не склеивается', () => {
        const source = join(
            '[00:00] Менеджер: раз',
            '[00:75] Менеджер: два',
            '[00:76] Менеджер: три',
        );

        expect(compactTranscript(source)).toBe(source);
    });

    it('расшифровка без единой метки возвращается как есть', () => {
        const oldRecord =
            'Здравствуйте. Меня зовут Вадим.\n\nМы звоним по поводу заявки.';

        expect(compactTranscript(oldRecord)).toBe(oldRecord);
        expect(compactTranscript('Один абзац без переводов строк.')).toBe(
            'Один абзац без переводов строк.',
        );
        expect(compactTranscript('')).toBe('');
    });

    it('одиночная строка остаётся такой, как была', () => {
        const source = join('[5:03] Клиент:   да  ', '[01:00] Менеджер: ну');

        expect(compactTranscript(source)).toBe(source);
    });

    it('пустые строки отбрасываются, перевод строки на выходе — \\n', () => {
        const source =
            '\r\n[00:00] Менеджер: раз\r\n   \r\n[00:01] Менеджер: два\r\n' +
            '[00:30] Клиент: да\r\n\r\n';

        const result = compactTranscript(source);

        expect(result).toBe(
            join('[00:00] Менеджер: раз два', '[00:30] Клиент: да'),
        );
        expect(result).not.toContain('\r');
    });
});
