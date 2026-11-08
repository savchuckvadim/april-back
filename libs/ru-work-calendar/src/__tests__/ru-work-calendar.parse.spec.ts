import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
    fallbackRuCalendar,
    parseIsDayOff,
    parseXmlCalendarJson,
} from '../ru-work-calendar.parse';

const fixture = (year: number): unknown =>
    JSON.parse(
        readFileSync(
            join(__dirname, 'fixtures', `xmlcalendar-${year}.json`),
            'utf8',
        ),
    ) as unknown;

describe('производственный календарь РФ: разбор xmlcalendar.ru', () => {
    it('2026: январские каникулы с переносом 9 января, майские, 4 ноября, 31 декабря', () => {
        const calendar = parseXmlCalendarJson(2026, fixture(2026));
        expect(calendar?.source).toBe('live');
        // 1–2, 5–9 января — будни нерабочие (9-е — перенос с 3 января).
        expect(calendar?.holidays).toEqual(
            expect.arrayContaining([
                '2026-01-01',
                '2026-01-02',
                '2026-01-05',
                '2026-01-09',
                '2026-02-23',
                '2026-03-09',
                '2026-05-01',
                '2026-05-11',
                '2026-06-12',
                '2026-11-04',
                '2026-12-31',
            ]),
        );
        // Сокращённые предпраздничные — рабочие, в праздники не попадают.
        expect(calendar?.shortDays).toEqual([
            '2026-04-30',
            '2026-05-08',
            '2026-06-11',
            '2026-11-03',
        ]);
        expect(calendar?.holidays).not.toContain('2026-04-30');
        // Выходные в праздники не дублируются.
        expect(calendar?.holidays).not.toContain('2026-01-03');
    });

    it('2025: рабочая суббота 1 ноября — в workingWeekends', () => {
        const calendar = parseXmlCalendarJson(2025, fixture(2025));
        expect(calendar?.workingWeekends).toContain('2025-11-01');
    });

    it('чужая форма, не тот год, битый день — null, а не исключение', () => {
        expect(parseXmlCalendarJson(2026, { year: 2026 })).toBeNull();
        expect(parseXmlCalendarJson(2027, fixture(2026))).toBeNull();
        expect(parseXmlCalendarJson(2026, 'строка')).toBeNull();
        expect(
            parseXmlCalendarJson(2026, {
                year: 2026,
                months: Array.from({ length: 12 }, (_, index) => ({
                    month: index + 1,
                    days: 'x,y',
                })),
            }),
        ).toBeNull();
    });
});

describe('производственный календарь РФ: isdayoff.ru и запасной список', () => {
    it('строка кодов по дням: 1 — нерабочий, 2 — сокращённый; длина не та — null', () => {
        const days = 365;
        const codes = Array.from({ length: days }, (_, index) =>
            index === 0 ? '1' : index === 2 ? '2' : '0',
        ).join('');
        const calendar = parseIsDayOff(2026, codes);
        expect(calendar?.holidays).toEqual(['2026-01-01']);
        expect(calendar?.shortDays).toEqual(['2026-01-03']);
        // Все сб/вс помечены рабочими — значит, это рабочие выходные.
        expect(calendar?.workingWeekends).toContain('2026-01-03');
        expect(parseIsDayOff(2026, '0101')).toBeNull();
    });

    it('запасной: праздники ТК РФ, выпавшие на будни, без переносов', () => {
        const calendar = fallbackRuCalendar(2026);
        expect(calendar.source).toBe('fallback');
        expect(calendar.workingWeekends).toEqual([]);
        // 3–4 января 2026 — суббота и воскресенье: в будни не попадают.
        expect(calendar.holidays).not.toContain('2026-01-03');
        expect(calendar.holidays).toContain('2026-11-04');
        expect(calendar.holidays).not.toContain('2026-01-09');
    });
});
