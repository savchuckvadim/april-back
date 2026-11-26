import {
    LONG_CALL_CONSUMERS,
    type LongCallConsumerInput,
} from '../long-call-consumers.const';
import { selectExcerpts } from '../long-call-input-excerpts.util';
import { prepareTranscript } from '../long-call-input-lines.util';
import type { ExcerptCandidate, LineRange } from '../long-call-input.types';
import type {
    ConversationSummary,
    FlatDigestEvent,
    SummaryWindow,
} from '../long-call.types';
import {
    emptyWindows,
    flatEventOf,
    summaryOf,
    uniformLines,
} from './long-call-input.fixture';
import type { LongCallDirection } from '../long-call.const';

/** 100 строк по 100 знаков (101 в бюджете), строка i звучит на секунде 10·i. */
const prepared = prepareTranscript(uniformLines(100).join('\n'));
const NO_PARTS: ReadonlyMap<number, LineRange> = new Map();

const consumerOf = (
    overrides: Partial<LongCallConsumerInput>,
): LongCallConsumerInput => ({
    headChars: 0,
    tailChars: 0,
    eventKinds: [],
    directions: [],
    budgetChars: 1_000,
    keep: 'earliest',
    ...overrides,
});

const summaryWith = (
    direction: LongCallDirection,
    windows: SummaryWindow[],
): ConversationSummary => {
    const all = emptyWindows();
    all[direction] = windows;

    return summaryOf({ windows: all });
};

const select = (
    consumer: LongCallConsumerInput,
    summary: ConversationSummary | null,
    events: FlatDigestEvent[] = [],
    partCandidates: ExcerptCandidate[] = [],
) =>
    selectExcerpts({
        transcript: prepared,
        consumer,
        summary,
        events,
        partCandidates,
        partRanges: NO_PARTS,
    });

const objectionAt = (sec: number): FlatDigestEvent =>
    flatEventOf({ kind: 'objection', startSec: sec, quote: `q${sec}` });

const movement = (overrides: Partial<LongCallConsumerInput> = {}) =>
    consumerOf({
        eventKinds: ['objection'],
        directions: ['movement'],
        ...overrides,
    });

describe('selectExcerpts — начало и конец', () => {
    it('начало и конец берутся по длине из таблицы и не пересекаются', () => {
        const selected = select(
            consumerOf({ headChars: 2_500, tailChars: 1_500 }),
            null,
        );

        expect(selected.head).toEqual({ from: 0, to: 23 });
        expect(selected.tail).toEqual({ from: 86, to: 99 });
        expect(selected.groups).toEqual([]);
        expect(selected.dropped).toBe(0);
    });

    it('синтез: ни начала, ни конца, ни отрывков', () => {
        const selected = select(
            LONG_CALL_CONSUMERS.synthesis,
            summaryWith('movement', [{ fromSec: 0, toSec: 100, why: 'x' }]),
            [objectionAt(100)],
        );

        expect(selected).toEqual({
            head: null,
            tail: null,
            groups: [],
            dropped: 0,
        });
    });

    it('отрывки не повторяют строки начала и конца', () => {
        const selected = select(
            movement({
                headChars: 2_500,
                tailChars: 1_500,
                budgetChars: 5_000,
            }),
            summaryWith('movement', [
                { fromSec: 0, toSec: 400, why: 'длинный' },
                { fromSec: 0, toSec: 100, why: 'внутри начала' },
                { fromSec: 800, toSec: 990, why: 'у конца' },
            ]),
            [],
        );

        expect(selected.groups).toEqual([
            { range: { from: 24, to: 40 }, heading: '00:00–06:40: длинный' },
            { range: { from: 80, to: 85 }, heading: '13:20–16:30: у конца' },
        ]);
        expect(selected.dropped).toBe(0);
    });
});

describe('selectExcerpts — отрезки сводки идут раньше окон событий', () => {
    const windowAt500 = summaryWith('movement', [
        { fromSec: 500, toSec: 540, why: 'торг' },
    ]);

    it('место делится: сначала отрезок, окно события сужается до укладки в остаток', () => {
        // отрезок — 5 строк (505 знаков), остаток 495; окно на 45 с — 909, на 30 с — 707, на 15 с — 303
        const selected = select(movement(), windowAt500, [objectionAt(100)]);

        expect(selected.groups).toEqual([
            { range: { from: 9, to: 11 }, heading: '01:40, возражение' },
            { range: { from: 50, to: 54 }, heading: '08:20–09:00: торг' },
        ]);
        expect(selected.dropped).toBe(0);
    });

    it('окно останавливается на первой ступени, на которой укладывается', () => {
        // остаток 1300 − 505 = 795: на 45 с окно 909 не влезает, на 30 с — 707 влезает
        const selected = select(movement({ budgetChars: 1_300 }), windowAt500, [
            objectionAt(100),
        ]);

        expect(selected.groups[0].range).toEqual({ from: 7, to: 13 });
        expect(selected.dropped).toBe(0);
    });

    it('хватает места на самое широкое окно — оно не сужается', () => {
        const selected = select(movement({ budgetChars: 1_500 }), windowAt500, [
            objectionAt(100),
        ]);

        expect(selected.groups[0].range).toEqual({ from: 6, to: 14 });
    });

    it('и на узкое окно места нет — окно события отброшено, отрезок остался', () => {
        const selected = select(movement({ budgetChars: 700 }), windowAt500, [
            objectionAt(100),
        ]);

        expect(selected.groups.map(group => group.heading)).toEqual([
            '08:20–09:00: торг',
        ]);
        expect(selected.dropped).toBe(1);
    });
});

describe('selectExcerpts — что остаётся при нехватке бюджета', () => {
    const events = [objectionAt(100), objectionAt(400), objectionAt(800)];

    it('ранние: окна событий сужены до 15 секунд, поздние отброшены', () => {
        const selected = select(movement({ budgetChars: 700 }), null, events);

        expect(selected.groups.map(group => group.range)).toEqual([
            { from: 9, to: 11 },
            { from: 39, to: 41 },
        ]);
        expect(selected.dropped).toBe(1);
    });

    it('поздние: остаются последние по времени, ранние отброшены', () => {
        const selected = select(
            movement({ budgetChars: 700, keep: 'latest' }),
            null,
            events,
        );

        expect(selected.groups.map(group => group.heading)).toEqual([
            '06:40, возражение',
            '13:20, возражение',
        ]);
        expect(selected.dropped).toBe(1);
    });

    it('отрезки сводки не помещаются сами — отбрасываются по тому же правилу', () => {
        const windows = [
            { fromSec: 100, toSec: 140, why: 'первый' },
            { fromSec: 300, toSec: 340, why: 'второй' },
            { fromSec: 500, toSec: 540, why: 'третий' },
        ];
        const earliest = select(
            movement({ budgetChars: 1_200 }),
            summaryWith('movement', windows),
        );
        const latest = select(
            movement({ budgetChars: 1_200, keep: 'latest' }),
            summaryWith('movement', windows),
        );

        expect(earliest.groups.map(group => group.heading)).toEqual([
            '01:40–02:20: первый',
            '05:00–05:40: второй',
        ]);
        expect(latest.groups.map(group => group.heading)).toEqual([
            '05:00–05:40: второй',
            '08:20–09:00: третий',
        ]);
        expect(earliest.dropped).toBe(1);
        expect(latest.dropped).toBe(1);
    });

    it('«Не вошло» не считает окна, которых нет: цитата не найдена, отрезок вне записи', () => {
        const selected = select(
            movement(),
            summaryWith('movement', [
                { fromSec: 9_000, toSec: 9_100, why: 'x' },
            ]),
            [
                flatEventOf({
                    kind: 'objection',
                    startSec: null,
                    quote: 'нет такой',
                }),
            ],
        );

        expect(selected.groups).toEqual([]);
        expect(selected.dropped).toBe(0);
    });
});

describe('selectExcerpts — слияние и части без конспекта', () => {
    it('пересекающиеся отрезок и окно события сливаются: границы и причины в заголовке', () => {
        const selected = select(
            consumerOf({
                eventKinds: ['need'],
                directions: ['form'],
                budgetChars: 1_500,
            }),
            summaryWith('form', [{ fromSec: 300, toSec: 340, why: 'вход' }]),
            [flatEventOf({ kind: 'need', startSec: 350, quote: 'q' })],
        );

        expect(selected.groups).toEqual([
            {
                range: { from: 30, to: 39 },
                heading: '05:00–05:50: вход; потребность',
            },
        ]);
    });

    const partWithoutDigest: ExcerptCandidate = {
        source: 'part',
        range: { from: 20, to: 60 },
        reason: 'часть 2, конспекта нет',
        heading: 'часть 2, конспекта нет',
        span: { fromSec: 200, toSec: 600 },
    };

    it('часть без конспекта входит целиком сверх бюджета и не съедает его', () => {
        // часть — 41 строка, 4 141 знак при бюджете 1 000; отрезок вне части ещё помещается
        const selected = select(
            movement(),
            summaryWith('movement', [
                { fromSec: 800, toSec: 840, why: 'торг' },
            ]),
            [],
            [partWithoutDigest],
        );

        expect(selected.groups).toEqual([
            { range: { from: 20, to: 60 }, heading: 'часть 2, конспекта нет' },
            { range: { from: 80, to: 84 }, heading: '13:20–14:00: торг' },
        ]);
        expect(selected.dropped).toBe(0);
    });

    it('отрезок внутри части не стоит бюджета, а сливается с ней', () => {
        const selected = select(
            movement({ budgetChars: 400 }),
            summaryWith('movement', [
                { fromSec: 300, toSec: 340, why: 'торг' },
            ]),
            [],
            [partWithoutDigest],
        );

        expect(selected.groups).toEqual([
            {
                range: { from: 20, to: 60 },
                heading: '03:20–10:00: торг; часть 2, конспекта нет',
            },
        ]);
        expect(selected.dropped).toBe(0);
    });

    it('часть без конспекта не повторяет строки начала и конца', () => {
        const selected = select(
            movement({ headChars: 2_500 }),
            null,
            [],
            [{ ...partWithoutDigest, range: { from: 10, to: 60 } }],
        );

        expect(selected.groups[0].range).toEqual({ from: 24, to: 60 });
    });

    it('нулевой бюджет — частей без конспекта тоже нет', () => {
        const selected = select(
            consumerOf({ headChars: 800, budgetChars: 0, keep: null }),
            null,
            [],
            [partWithoutDigest],
        );

        expect(selected.groups).toEqual([]);
        expect(selected.head).not.toBeNull();
    });
});
