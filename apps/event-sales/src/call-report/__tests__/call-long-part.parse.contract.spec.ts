import {
    isDigestSuspiciouslyEmpty,
    parseCallLongPartResponse,
} from '../contracts/call-long-part.contract';
import {
    LONG_CALL_PART_CHARS,
    PART_DIGEST_LIMITS,
} from '../long-call/long-call.const';
import type { PartDigest } from '../long-call/long-call.types';

/** Часть с временем 10:00–19:00 (600–1140 секунд). */
const PART = { fromSec: 600, toSec: 1140 };

const rawEvent = (overrides: Record<string, unknown> = {}) => ({
    kind: 'need',
    startSec: 700,
    quote: 'нам нужен учёт заявок',
    note: 'клиент назвал задачу',
    ...overrides,
});

const rawDigest = (overrides: Record<string, unknown> = {}) => ({
    summary: 'Клиент рассказал о задаче.',
    events: [rawEvent()],
    managerQuestions: 3,
    endsWith: 'разговор продолжается',
    ...overrides,
});

describe('parseCallLongPartResponse — разбор и чистка ответа', () => {
    it('хороший ответ разбирается без изменений', () => {
        expect(parseCallLongPartResponse(rawDigest(), PART)).toEqual({
            summary: 'Клиент рассказал о задаче.',
            events: [
                {
                    kind: 'need',
                    startSec: 700,
                    quote: 'нам нужен учёт заявок',
                    note: 'клиент назвал задачу',
                },
            ],
            managerQuestions: 3,
            endsWith: 'разговор продолжается',
        });
    });

    it.each([[null], [undefined], ['текст'], [42], [[]], [true]])(
        'ответ не объект (%p) — null',
        raw => {
            expect(parseCallLongPartResponse(raw, PART)).toBeNull();
        },
    );

    it('нет summary (или он пустой, или не строка) — null', () => {
        expect(
            parseCallLongPartResponse(rawDigest({ summary: undefined }), PART),
        ).toBeNull();
        expect(
            parseCallLongPartResponse(rawDigest({ summary: '   ' }), PART),
        ).toBeNull();
        expect(
            parseCallLongPartResponse(rawDigest({ summary: 5 }), PART),
        ).toBeNull();
    });

    it('неизвестный вид события отбрасывается, остальные остаются', () => {
        const digest = parseCallLongPartResponse(
            rawDigest({
                events: [
                    rawEvent({ kind: 'weather' }),
                    rawEvent({ kind: 'price', quote: 'сорок тысяч' }),
                    rawEvent({ kind: 5 }),
                    'не событие',
                    null,
                ],
            }),
            PART,
        );

        expect(digest?.events.map(event => event.kind)).toEqual(['price']);
    });

    it('цитата и пояснение обрезаются до пределов, крайние пробелы снимаются', () => {
        const digest = parseCallLongPartResponse(
            rawDigest({
                events: [
                    rawEvent({
                        quote: `  ${'ц'.repeat(500)}  `,
                        note: `${'п'.repeat(500)}`,
                    }),
                ],
                summary: `  ${'с'.repeat(2000)}  `,
                endsWith: `  ${'к'.repeat(500)} `,
            }),
            PART,
        );

        expect(digest?.events[0].quote).toBe(
            'ц'.repeat(PART_DIGEST_LIMITS.quoteChars),
        );
        expect(digest?.events[0].note).toBe(
            'п'.repeat(PART_DIGEST_LIMITS.noteChars),
        );
        expect(digest?.summary).toBe(
            'с'.repeat(PART_DIGEST_LIMITS.summaryChars),
        );
        expect(digest?.endsWith).toBe(
            'к'.repeat(PART_DIGEST_LIMITS.endsWithChars),
        );
    });

    it('пустая цитата — событие отбрасывается', () => {
        const digest = parseCallLongPartResponse(
            rawDigest({
                events: [
                    rawEvent({ quote: '' }),
                    rawEvent({ quote: '   ' }),
                    rawEvent({ quote: undefined }),
                    rawEvent({ quote: 7 }),
                    rawEvent({ quote: 'живая цитата' }),
                ],
            }),
            PART,
        );

        expect(digest?.events.map(event => event.quote)).toEqual([
            'живая цитата',
        ]);
    });

    it('событий больше предела — лишние с конца отбрасываются', () => {
        const events = Array.from({ length: 15 }, (_, index) =>
            rawEvent({ quote: `цитата ${index}` }),
        );
        const digest = parseCallLongPartResponse(rawDigest({ events }), PART);

        expect(digest?.events).toHaveLength(PART_DIGEST_LIMITS.maxEvents);
        expect(digest?.events[0].quote).toBe('цитата 0');
        expect(digest?.events[9].quote).toBe('цитата 9');
    });

    it('нет массива events — пустой список событий', () => {
        expect(
            parseCallLongPartResponse(rawDigest({ events: 'нет' }), PART)
                ?.events,
        ).toEqual([]);
    });

    it('startSec вне времени части (запас 90 секунд в обе стороны) или не число — null', () => {
        const startSecOf = (startSec: unknown): number | null | undefined =>
            parseCallLongPartResponse(
                rawDigest({ events: [rawEvent({ startSec })] }),
                PART,
            )?.events[0].startSec;

        expect(startSecOf(700)).toBe(700);
        expect(startSecOf(600 - 90)).toBe(510);
        expect(startSecOf(1140 + 90)).toBe(1230);
        expect(startSecOf(600 - 91)).toBeNull();
        expect(startSecOf(1140 + 91)).toBeNull();
        expect(startSecOf(-5)).toBeNull();
        expect(startSecOf('700')).toBeNull();
        expect(startSecOf(NaN)).toBeNull();
        expect(startSecOf(Infinity)).toBeNull();
        expect(startSecOf(null)).toBeNull();
        expect(startSecOf(undefined)).toBeNull();
    });

    it('у части в начале записи нижняя граница — ноль, не отрицательное число', () => {
        const digest = parseCallLongPartResponse(
            rawDigest({ events: [rawEvent({ startSec: -10 })] }),
            { fromSec: 0, toSec: 300 },
        );

        expect(digest?.events[0].startSec).toBeNull();
    });

    it('у части без меток времени startSec всегда null', () => {
        const digest = parseCallLongPartResponse(
            rawDigest({ events: [rawEvent({ startSec: 700 })] }),
            { fromSec: null, toSec: null },
        );

        expect(digest?.events[0].startSec).toBeNull();
    });

    it('managerQuestions — неотрицательное целое, иначе 0', () => {
        const questionsOf = (managerQuestions: unknown): number | undefined =>
            parseCallLongPartResponse(rawDigest({ managerQuestions }), PART)
                ?.managerQuestions;

        expect(questionsOf(0)).toBe(0);
        expect(questionsOf(12)).toBe(12);
        expect(questionsOf(-1)).toBe(0);
        expect(questionsOf(2.5)).toBe(0);
        expect(questionsOf('4')).toBe(0);
        expect(questionsOf(NaN)).toBe(0);
        expect(questionsOf(null)).toBe(0);
        expect(questionsOf(undefined)).toBe(0);
    });

    it('endsWith не строка — пустая строка', () => {
        expect(
            parseCallLongPartResponse(rawDigest({ endsWith: 5 }), PART)
                ?.endsWith,
        ).toBe('');
    });
});

describe('isDigestSuspiciouslyEmpty — «конспект подозрительно пуст»', () => {
    const digestWith = (eventCount: number): PartDigest => ({
        summary: 'Содержания нет.',
        events: Array.from({ length: eventCount }, () => ({
            kind: 'other' as const,
            startSec: null,
            quote: 'цитата',
            note: '',
        })),
        managerQuestions: 0,
        endsWith: '',
    });

    it('событий нет, а текст части длиннее половины размера части — да', () => {
        const text = 'x'.repeat(LONG_CALL_PART_CHARS / 2 + 1);

        expect(isDigestSuspiciouslyEmpty(digestWith(0), { text })).toBe(true);
    });

    it('событий нет, но текст короткий (ожидание, «алло») — нет', () => {
        expect(
            isDigestSuspiciouslyEmpty(digestWith(0), {
                text: 'x'.repeat(500),
            }),
        ).toBe(false);
    });

    it('ровно половина размера части — ещё не подозрительно', () => {
        const text = 'x'.repeat(LONG_CALL_PART_CHARS / 2);

        expect(isDigestSuspiciouslyEmpty(digestWith(0), { text })).toBe(false);
    });

    it('события есть — нет, каким бы длинным ни был текст', () => {
        const text = 'x'.repeat(LONG_CALL_PART_CHARS * 2);

        expect(isDigestSuspiciouslyEmpty(digestWith(1), { text })).toBe(false);
    });

    it('размер части можно передать: у частей другого размера другая половина', () => {
        const text = 'x'.repeat(600);

        expect(isDigestSuspiciouslyEmpty(digestWith(0), { text }, 1000)).toBe(
            true,
        );
        expect(isDigestSuspiciouslyEmpty(digestWith(0), { text }, 1200)).toBe(
            false,
        );
    });
});
