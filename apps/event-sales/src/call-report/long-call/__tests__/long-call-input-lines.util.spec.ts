import {
    headRange,
    lineSize,
    linesAroundQuote,
    linesInTimeRange,
    prepareTranscript,
    rangeTexts,
    tailRange,
} from '../long-call-input-lines.util';
import { FIXED_LINE_SIZE, uniformLines } from './long-call-input.fixture';

describe('prepareTranscript — расшифровка по строкам', () => {
    it('строка без метки звучит во время предыдущей строки с меткой', () => {
        const prepared = prepareTranscript(
            [
                '[00:10] привет',
                'продолжение реплики',
                '[00:30] ответ',
                '',
                '[00:40] конец',
            ].join('\n'),
        );

        expect(prepared.lines.map(line => line.text)).toEqual([
            '[00:10] привет',
            'продолжение реплики',
            '[00:30] ответ',
            '[00:40] конец',
        ]);
        expect(prepared.secs).toEqual([10, 10, 30, 40]);
        expect(prepared.lastSec).toBe(40);
    });

    it('до первой метки время неизвестно', () => {
        const prepared = prepareTranscript('вступление\n[00:05] привет');

        expect(prepared.secs).toEqual([null, 5]);
    });

    it('запись без меток: времени нет нигде', () => {
        const prepared = prepareTranscript('Алло. Здравствуйте.');

        expect(prepared.secs).toEqual([null]);
        expect(prepared.lastSec).toBeNull();
    });

    it('запись без переводов строк делится на предложения, текст не теряется', () => {
        const sentences = Array.from(
            { length: 400 },
            (_, index) => `Предложение ${index} про слова и дела.`,
        );
        const prepared = prepareTranscript(sentences.join(' '));

        expect(prepared.lines.length).toBe(400);
        expect(prepared.lines.map(line => line.text)).toEqual(sentences);
    });

    it('строки для поиска цитат приведены к нижнему регистру и одному пробелу', () => {
        const prepared = prepareTranscript('[00:01] Клиент:   ДА,   Давайте');

        expect(prepared.normalized).toEqual(['[00:01] клиент: да, давайте']);
    });
});

describe('headRange / tailRange — начало и конец целыми строками', () => {
    const prepared = prepareTranscript(uniformLines(50).join('\n'));

    it('начало: 24 строки по 100 знаков вместе с переводами строк — 2 423 знака', () => {
        expect(headRange(prepared, 2_500)).toEqual({ from: 0, to: 23 });
    });

    it('конец: 14 строк с конца — 1 413 знаков', () => {
        expect(tailRange(prepared, 1_500, null)).toEqual({ from: 36, to: 49 });
    });

    it('ноль знаков или первая строка длиннее значения — блока нет', () => {
        expect(headRange(prepared, 0)).toBeNull();
        expect(headRange(prepared, 99)).toBeNull();
        expect(tailRange(prepared, 0, null)).toBeNull();
    });

    it('конец не заходит в начало', () => {
        const small = prepareTranscript(uniformLines(30).join('\n'));

        expect(tailRange(small, 4_000, { from: 0, to: 23 })).toEqual({
            from: 24,
            to: 29,
        });
        expect(tailRange(small, 4_000, { from: 0, to: 29 })).toBeNull();
    });

    it('строки диапазона возвращаются дословно', () => {
        const texts = rangeTexts(prepared, { from: 2, to: 3 });

        expect(texts).toEqual(uniformLines(50).slice(2, 4));
        expect(lineSize(prepared, 0)).toBe(FIXED_LINE_SIZE);
    });
});

describe('linesInTimeRange — строки отрезка по времени', () => {
    const prepared = prepareTranscript(uniformLines(30).join('\n'));

    it('границы отрезка включены', () => {
        expect(linesInTimeRange(prepared, 20, 40)).toEqual({ from: 2, to: 4 });
    });

    it('продолжение реплики входит вместе со строкой с меткой', () => {
        const text = ['[00:00] а', '[00:10] б', 'продолжение б', '[00:20] в'];

        expect(
            linesInTimeRange(prepareTranscript(text.join('\n')), 10, 10),
        ).toEqual({ from: 1, to: 2 });
    });

    it('в отрезке нет строк — null', () => {
        expect(linesInTimeRange(prepared, 1_000, 2_000)).toBeNull();
        expect(linesInTimeRange(prepared, 21, 29)).toBeNull();
    });

    it('запись без меток — null', () => {
        expect(
            linesInTimeRange(prepareTranscript('Алло.\nДа.'), 0, 100),
        ).toBeNull();
    });
});

describe('linesAroundQuote — строка с цитатой и соседи по радиусу в знаках', () => {
    const prepared = prepareTranscript(uniformLines(40).join('\n'));

    it('цитата ищется без учёта регистра и повторных пробелов', () => {
        const range = linesAroundQuote(prepared, 'КЛИЕНТ:    Р20', 0, null);

        expect(range).toEqual({ from: 20, to: 20 });
    });

    it('радиус 200 знаков — по строке с каждой стороны, 600 — по пять', () => {
        expect(linesAroundQuote(prepared, 'р20', 200, null)).toEqual({
            from: 19,
            to: 21,
        });
        expect(linesAroundQuote(prepared, 'р20', 600, null)).toEqual({
            from: 15,
            to: 25,
        });
    });

    it('у края записи окно обрезается краем', () => {
        expect(linesAroundQuote(prepared, 'р0 ', 600, null)).toEqual({
            from: 0,
            to: 5,
        });
        expect(linesAroundQuote(prepared, 'р39', 600, null)).toEqual({
            from: 34,
            to: 39,
        });
    });

    it('цитата не найдена или пустая — окна нет', () => {
        expect(linesAroundQuote(prepared, 'такого нет', 600, null)).toBeNull();
        expect(linesAroundQuote(prepared, '   ', 600, null)).toBeNull();
    });

    it('одинаковая цитата: сначала ищем в строках своей части', () => {
        const repeated = prepareTranscript(
            ['[00:00] привет', 'да', '[00:20] привет', 'да'].join('\n'),
        );

        expect(linesAroundQuote(repeated, 'да', 0, null)).toEqual({
            from: 1,
            to: 1,
        });
        expect(linesAroundQuote(repeated, 'да', 0, { from: 2, to: 3 })).toEqual(
            { from: 3, to: 3 },
        );
        expect(linesAroundQuote(repeated, 'да', 0, { from: 0, to: 0 })).toEqual(
            { from: 1, to: 1 },
        );
    });
});
