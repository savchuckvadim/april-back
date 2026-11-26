import {
    LONG_CALL_CONSUMERS,
    type LongCallConsumer,
} from '../long-call-consumers.const';
import {
    LONG_CALL_DIGEST_TITLE,
    LONG_CALL_DIRECTIONS,
    LONG_CALL_OVERLAP_CHARS,
    LONG_CALL_PART_CHARS,
    type LongCallEventKind,
} from '../long-call.const';
import {
    LONG_CALL_ABRUPT_LINE,
    LONG_CALL_EXCERPTS_TITLE,
    LONG_CALL_HEAD_HEADING,
    LONG_CALL_HEADER_TITLE,
    LONG_CALL_SUMMARY_TITLE,
    LONG_CALL_TAIL_HEADING,
} from '../long-call-input.const';
import { buildLongCallInputs } from '../long-call-input.util';
import type {
    DigestedPart,
    PartDigest,
    SummaryWindows,
} from '../long-call.types';
import {
    digestOf,
    emptyWindows,
    eventOf,
    excerptHeadings,
    excerptLines,
    makeParts,
    summaryOf,
    uniformLines,
} from './long-call-input.fixture';
import { generateTranscriptLines } from './long-call-transcript.fixture';

/**
 * Главная функция сборки: тексты всем потребителям из расшифровки, частей с
 * конспектами и сводки. Проверяется состав блоков, дословность отрывков и
 * размер текстов на записи «живого» размера.
 */

const CONSUMERS = Object.keys(LONG_CALL_CONSUMERS) as LongCallConsumer[];
/** Проходы разбора, которым положен блок дословных отрывков. */
const PASSES: LongCallConsumer[] = [
    'form',
    'content',
    'movement',
    'closing',
    'methodology',
];

/** Небольшая запись: 90 строк по 100 знаков, метка каждые 10 секунд. */
const LINES = uniformLines(90);
const TEXT = LINES.join('\n');
const PARTS_COUNT = makeParts(TEXT).length;

/** Конспект каждой части; without — номера частей (с 1) без конспекта. */
const digestsFor = (without: readonly number[] = []): (PartDigest | null)[] =>
    Array.from({ length: PARTS_COUNT }, (_, index) =>
        without.includes(index + 1)
            ? null
            : digestOf({
                  summary: `Конспект части ${index + 1}.`,
                  events: [],
              }),
    );

describe('buildLongCallInputs — состав текстов', () => {
    it('запись режется на несколько частей (иначе проверки ниже ничего не значат)', () => {
        expect(PARTS_COUNT).toBeGreaterThan(2);
    });

    it('у каждого потребителя шапка, сводка и конспект — в этом порядке', () => {
        const { texts } = buildLongCallInputs(
            TEXT,
            makeParts(TEXT, digestsFor()),
            summaryOf(),
        );

        for (const consumer of CONSUMERS) {
            const text = texts[consumer];
            const header = text.indexOf(LONG_CALL_HEADER_TITLE);
            const summary = text.indexOf(LONG_CALL_SUMMARY_TITLE);
            const digest = text.indexOf(LONG_CALL_DIGEST_TITLE);

            expect(header).toBe(0);
            expect(summary).toBeGreaterThan(header);
            expect(digest).toBeGreaterThan(summary);
        }
    });

    it('синтез отрывков не получает; форма — начало и конец; закрытие — конец', () => {
        const { texts } = buildLongCallInputs(
            TEXT,
            makeParts(TEXT, digestsFor()),
            summaryOf(),
        );

        expect(texts.synthesis).not.toContain(LONG_CALL_EXCERPTS_TITLE);
        expect(excerptHeadings(texts.form)).toEqual(
            expect.arrayContaining([
                LONG_CALL_HEAD_HEADING,
                LONG_CALL_TAIL_HEADING,
            ]),
        );
        expect(excerptHeadings(texts.closing)).toContain(
            LONG_CALL_TAIL_HEADING,
        );
        // Отрывки идут после конспекта.
        expect(texts.form.indexOf(LONG_CALL_EXCERPTS_TITLE)).toBeGreaterThan(
            texts.form.indexOf(LONG_CALL_DIGEST_TITLE),
        );
    });

    it('сводки нет — блока сводки нет, остальное собирается', () => {
        const { texts, report } = buildLongCallInputs(
            TEXT,
            makeParts(TEXT, digestsFor()),
            null,
        );

        for (const consumer of CONSUMERS) {
            expect(texts[consumer]).not.toContain(LONG_CALL_SUMMARY_TITLE);
            expect(texts[consumer]).toContain(LONG_CALL_DIGEST_TITLE);
        }
        expect(report.hasSummary).toBe(false);
        expect(report.threadsCount).toBe(0);
        expect(excerptHeadings(texts.form)).toContain(LONG_CALL_HEAD_HEADING);
    });

    it('строка про обрыв записи — только когда сводка говорит об обрыве', () => {
        const parts = makeParts(TEXT, digestsFor());

        expect(
            buildLongCallInputs(TEXT, parts, summaryOf({ endedAbruptly: true }))
                .texts.closing,
        ).toContain(LONG_CALL_ABRUPT_LINE);
        expect(
            buildLongCallInputs(TEXT, parts, summaryOf()).texts.closing,
        ).not.toContain(LONG_CALL_ABRUPT_LINE);
    });
});

describe('buildLongCallInputs — дословные отрывки', () => {
    const known = new Set(LINES);

    it('окно вокруг события и отрезок сводки — строки расшифровки символ в символ', () => {
        const digests = digestsFor();
        digests[0] = digestOf({
            events: [eventOf({ kind: 'need', startSec: 100, quote: 'р10' })],
        });
        const windows: SummaryWindows = {
            ...emptyWindows(),
            content: [{ fromSec: 400, toSec: 430, why: 'показ продукта' }],
        };
        const { texts } = buildLongCallInputs(
            TEXT,
            makeParts(TEXT, digests),
            summaryOf({ windows }),
        );

        for (const consumer of CONSUMERS) {
            for (const line of excerptLines(texts[consumer])) {
                expect(known.has(line)).toBe(true);
            }
        }
        // Событие на 100-й секунде — строка № 10; отрезок 400–430 — строки 40–43.
        expect(excerptLines(texts.content)).toEqual(
            expect.arrayContaining([LINES[10], LINES[40], LINES[43]]),
        );
        expect(
            excerptHeadings(texts.content).some(heading =>
                heading.includes('показ продукта'),
            ),
        ).toBe(true);
    });

    it('часть без конспекта входит в отрывки целиком у проходов с отрывками', () => {
        const parts = makeParts(TEXT, digestsFor([2]));
        const { texts, report } = buildLongCallInputs(TEXT, parts, summaryOf());
        const middle = parts[1].part.text.split('\n');
        const sample = middle[Math.floor(middle.length / 2)];

        expect(report.partsWithoutDigest).toBe(1);
        for (const consumer of PASSES) {
            expect(excerptLines(texts[consumer])).toContain(sample);
            expect(
                excerptHeadings(texts[consumer]).some(heading =>
                    heading.includes('часть 2, конспекта нет'),
                ),
            ).toBe(true);
        }
        expect(texts.synthesis).not.toContain(sample);
    });

    it('сводка для журнала: части, события, линии и длины текстов', () => {
        const digests = digestsFor();
        digests[0] = digestOf({
            events: [
                eventOf({ kind: 'need', startSec: 50, quote: 'р5' }),
                eventOf({ kind: 'price', startSec: 120, quote: 'р12' }),
            ],
        });
        const { texts, report } = buildLongCallInputs(
            TEXT,
            makeParts(TEXT, digests),
            summaryOf({
                threads: [
                    {
                        kind: 'price',
                        topic: 'цена лицензии',
                        status: 'open',
                        moments: [120],
                        note: 'клиент просил скидку',
                    },
                ],
            }),
        );

        expect(report.partsCount).toBe(PARTS_COUNT);
        expect(report.partsWithoutDigest).toBe(0);
        expect(report.eventsCount).toBe(2);
        expect(report.threadsCount).toBe(1);
        expect(report.hasSummary).toBe(true);
        for (const consumer of CONSUMERS) {
            expect(report.consumers[consumer].textChars).toBe(
                texts[consumer].length,
            );
        }
    });
});

describe('buildLongCallInputs — запись «живого» размера', () => {
    const LIVE_CHARS = 60_000;
    const PASS_TEXT_MAX_CHARS = 30_000;
    const SYNTHESIS_TEXT_MAX_CHARS = 12_000;
    const WINDOW_SEC = 90;
    const EVENT_KINDS: LongCallEventKind[] = ['need', 'objection', 'agreement'];

    const lines = generateTranscriptLines(LIVE_CHARS);
    const text = lines.join('\n');
    const bare = makeParts(text, [], {
        partChars: LONG_CALL_PART_CHARS,
        overlapChars: LONG_CALL_OVERLAP_CHARS,
    });
    /** Три события на часть: на четверти, середине и трёх четвертях её времени. */
    const parts: DigestedPart[] = bare.map(({ part }, index) => {
        const from = part.fromSec ?? 0;
        const span = (part.toSec ?? from) - from;

        return {
            part,
            digest: digestOf({
                summary: `Часть ${index + 1}: обсуждали задачу клиента и условия.`,
                events: EVENT_KINDS.map((kind, order) =>
                    eventOf({
                        kind,
                        startSec: Math.round(from + (span * (order + 1)) / 4),
                        quote: `цитата ${index}-${order}`,
                        note: 'клиент ответил',
                    }),
                ),
                managerQuestions: 4,
            }),
        };
    });
    const durationSec = bare[bare.length - 1].part.toSec ?? 0;
    /** Три отрезка на каждое направление, разнесённые по записи. */
    const windows = emptyWindows();
    for (const direction of LONG_CALL_DIRECTIONS) {
        windows[direction] = [1, 2, 3].map(step => {
            const fromSec = Math.round((durationSec * step) / 5);

            return {
                fromSec,
                toSec: fromSec + WINDOW_SEC,
                why: `место ${step}`,
            };
        });
    }
    const { texts, report } = buildLongCallInputs(
        text,
        parts,
        summaryOf({ windows }),
    );

    it('запись режется на 6–8 частей, у каждой конспект', () => {
        expect(report.partsCount).toBeGreaterThanOrEqual(6);
        expect(report.partsCount).toBeLessThanOrEqual(8);
        expect(report.partsWithoutDigest).toBe(0);
        expect(report.eventsCount).toBe(parts.length * EVENT_KINDS.length);
    });

    it('текст каждого прохода заметно короче расшифровки, синтез — ещё короче', () => {
        for (const consumer of PASSES) {
            expect(texts[consumer].length).toBeLessThanOrEqual(
                PASS_TEXT_MAX_CHARS,
            );
            expect(texts[consumer].length).toBeLessThan(text.length);
        }
        expect(texts.synthesis.length).toBeLessThanOrEqual(
            SYNTHESIS_TEXT_MAX_CHARS,
        );
        expect(texts.whole.length).toBeLessThan(text.length);
    });

    it('все отрывки — дословные строки расшифровки', () => {
        const known = new Set(lines);

        for (const consumer of CONSUMERS) {
            const excerpts = excerptLines(texts[consumer]);
            for (const line of excerpts) {
                expect(known.has(line)).toBe(true);
            }
        }
        expect(excerptLines(texts.content).length).toBeGreaterThan(0);
        expect(excerptLines(texts.closing)).toContain(lines[lines.length - 1]);
    });
});
