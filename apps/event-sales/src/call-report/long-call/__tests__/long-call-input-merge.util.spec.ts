import {
    eventHeading,
    mergedHeading,
    spanText,
    windowHeading,
} from '../long-call-input-heading.util';
import {
    mergeCandidates,
    trimCandidate,
    uniqueCandidates,
} from '../long-call-input-merge.util';
import type { ExcerptCandidate, TimeSpan } from '../long-call-input.types';
import { flatEventOf } from './long-call-input.fixture';

const windowOf = (
    from: number,
    to: number,
    why: string,
    span: TimeSpan | null = null,
): ExcerptCandidate => ({
    source: 'window',
    range: { from, to },
    reason: why,
    heading: windowHeading(span ?? { fromSec: 0, toSec: 0 }, why),
    span,
});

const eventOfKind = (
    from: number,
    to: number,
    reason: string,
    sec: number | null,
): ExcerptCandidate => ({
    source: 'event',
    range: { from, to },
    reason,
    heading: eventHeading(flatEventOf({ kind: 'objection', startSec: sec })),
    span: sec === null ? null : { fromSec: sec, toSec: sec },
});

describe('заголовки отрывков', () => {
    it('отрезок сводки: границы и why', () => {
        expect(
            windowHeading({ fromSec: 725, toSec: 820 }, 'возражение по цене'),
        ).toBe('12:05–13:40: возражение по цене');
    });

    it('границы совпали — одна метка; why пусто — только границы', () => {
        expect(spanText({ fromSec: 725, toSec: 725 })).toBe('12:05');
        expect(windowHeading({ fromSec: 725, toSec: 820 }, '')).toBe(
            '12:05–13:40',
        );
    });

    it('событие: время и вид; без времени — только вид', () => {
        expect(
            eventHeading(flatEventOf({ kind: 'objection', startSec: 1290 })),
        ).toBe('21:30, возражение');
        expect(
            eventHeading(flatEventOf({ kind: 'price', startSec: null })),
        ).toBe('цена');
    });

    it('минуты больше 59 печатаются как есть', () => {
        expect(spanText({ fromSec: 3_900, toSec: 4_000 })).toBe('65:00–66:40');
    });
});

describe('mergedHeading — слитый отрывок', () => {
    it('один кандидат — его собственный заголовок', () => {
        const single = windowOf(3, 9, 'почему', { fromSec: 30, toSec: 90 });

        expect(mergedHeading([single])).toBe('00:30–01:30: почему');
    });

    it('границы по времени и причины через «; »: сначала why, затем виды без повторов', () => {
        const merged = mergedHeading([
            eventOfKind(2, 6, 'возражение', 700),
            windowOf(4, 12, 'торг по цене', { fromSec: 725, toSec: 820 }),
            eventOfKind(8, 10, 'возражение', 790),
            eventOfKind(9, 11, 'цена', 800),
            windowOf(5, 7, 'торг по цене', { fromSec: 740, toSec: 760 }),
        ]);

        expect(merged).toBe('11:40–13:40: торг по цене; возражение; цена');
    });

    it('у части без конспекта причина идёт последней', () => {
        const part: ExcerptCandidate = {
            source: 'part',
            range: { from: 0, to: 50 },
            reason: 'часть 2, конспекта нет',
            heading: 'часть 2, конспекта нет',
            span: { fromSec: 0, toSec: 580 },
        };

        expect(mergedHeading([part, eventOfKind(5, 8, 'цена', 600)])).toBe(
            '00:00–10:00: цена; часть 2, конспекта нет',
        );
    });

    it('времени ни у кого нет — только причины', () => {
        expect(
            mergedHeading([
                eventOfKind(1, 4, 'возражение', null),
                eventOfKind(3, 7, 'цена', null),
            ]),
        ).toBe('возражение; цена');
    });

    it('единственное время — одна метка', () => {
        expect(
            mergedHeading([
                eventOfKind(1, 4, 'возражение', 1290),
                eventOfKind(2, 5, 'цена', 1290),
            ]),
        ).toBe('21:30: возражение; цена');
    });
});

describe('trimCandidate — без строк начала и конца', () => {
    const candidate = windowOf(10, 30, 'x', { fromSec: 100, toSec: 300 });

    it('пересечение с началом и концом обрезается', () => {
        expect(
            trimCandidate(candidate, { from: 0, to: 14 }, { from: 26, to: 99 })
                ?.range,
        ).toEqual({ from: 15, to: 25 });
    });

    it('без блоков начала и конца отрывок как был', () => {
        expect(trimCandidate(candidate, null, null)).toEqual(candidate);
    });

    it('целиком внутри блока начала или конца — отрывка нет', () => {
        expect(trimCandidate(candidate, { from: 0, to: 30 }, null)).toBeNull();
        expect(trimCandidate(candidate, null, { from: 5, to: 99 })).toBeNull();
    });

    it('не трогает исходного кандидата', () => {
        trimCandidate(candidate, { from: 0, to: 14 }, null);

        expect(candidate.range).toEqual({ from: 10, to: 30 });
    });
});

describe('uniqueCandidates', () => {
    it('одинаковые вид, строки и причина — один; разные причины остаются', () => {
        const unique = uniqueCandidates([
            windowOf(1, 5, 'a'),
            windowOf(1, 5, 'a'),
            windowOf(1, 5, 'b'),
            windowOf(1, 6, 'a'),
        ]);

        expect(unique).toHaveLength(3);
    });
});

describe('mergeCandidates — слияние пересекающихся и соприкасающихся', () => {
    it('пересекающиеся сливаются в один диапазон', () => {
        const groups = mergeCandidates([
            windowOf(1, 10, 'a', { fromSec: 10, toSec: 100 }),
            windowOf(8, 20, 'b', { fromSec: 80, toSec: 200 }),
        ]);

        expect(groups).toEqual([
            { range: { from: 1, to: 20 }, heading: '00:10–03:20: a; b' },
        ]);
    });

    it('соприкасающиеся (следующая строка сразу за предыдущей) сливаются', () => {
        const groups = mergeCandidates([
            windowOf(1, 10, 'a', { fromSec: 10, toSec: 100 }),
            windowOf(11, 20, 'b', { fromSec: 110, toSec: 200 }),
        ]);

        expect(groups.map(group => group.range)).toEqual([{ from: 1, to: 20 }]);
    });

    it('между отрывками есть строка — они остаются отдельными, по порядку записи', () => {
        const groups = mergeCandidates([
            windowOf(12, 20, 'b', { fromSec: 120, toSec: 200 }),
            windowOf(1, 10, 'a', { fromSec: 10, toSec: 100 }),
        ]);

        expect(groups.map(group => group.range)).toEqual([
            { from: 1, to: 10 },
            { from: 12, to: 20 },
        ]);
        expect(groups.map(group => group.heading)).toEqual([
            '00:10–01:40: a',
            '02:00–03:20: b',
        ]);
    });

    it('вложенный отрывок не укорачивает слитый', () => {
        const groups = mergeCandidates([
            windowOf(1, 30, 'a'),
            windowOf(5, 8, 'b'),
            windowOf(31, 40, 'c'),
        ]);

        expect(groups.map(group => group.range)).toEqual([{ from: 1, to: 40 }]);
    });

    it('пустой список — пустой результат', () => {
        expect(mergeCandidates([])).toEqual([]);
    });
});
