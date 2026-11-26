import { prepareTranscript } from '../long-call-input-lines.util';
import { buildSummaryText } from '../long-call-input-summary-text.util';
import {
    buildExcerptsText,
    buildLongCallHeader,
    joinBlocks,
} from '../long-call-input-text.util';
import { uniformLines, summaryOf } from './long-call-input.fixture';

/** Шапка дословно, как в задании: на месте длительности — {minutes}. */
const HEADER_TAIL =
    ', ниже не полный текст, а сводка, конспект по частям и дословные отрывки. Оценивай по ним. Цитаты и секунды бери только из отрывков и из цитат конспекта: они дословные, метки [мм:сс] — от начала записи. Чего нет ни в сводке, ни в конспекте, ни в отрывках — считай, что не знаешь, а не что этого не было.';

describe('buildLongCallHeader — шапка', () => {
    it('длительность — по последней метке, округлённая до минут', () => {
        expect(buildLongCallHeader(2_990)).toBe(
            `РАЗГОВОР ДЛИННЫЙ (50 мин)${HEADER_TAIL}`,
        );
        expect(buildLongCallHeader(2_970)).toBe(
            `РАЗГОВОР ДЛИННЫЙ (50 мин)${HEADER_TAIL}`,
        );
        expect(buildLongCallHeader(2_969)).toBe(
            `РАЗГОВОР ДЛИННЫЙ (49 мин)${HEADER_TAIL}`,
        );
    });

    it('минуты больше часа не переводятся в часы', () => {
        expect(buildLongCallHeader(4_500)).toContain('(75 мин)');
    });

    it('меток нет — без скобок', () => {
        expect(buildLongCallHeader(null)).toBe(
            `РАЗГОВОР ДЛИННЫЙ${HEADER_TAIL}`,
        );
    });
});

describe('buildSummaryText — сводка разговора', () => {
    const threads = [
        {
            kind: 'objection' as const,
            topic: 'дорого',
            status: 'resolved' as const,
            moments: [725, 2_380],
            note: 'сняли рассрочкой',
        },
        {
            kind: 'agreement' as const,
            topic: 'показ в среду',
            status: 'open' as const,
            moments: [2_410],
            note: 'время не названо',
        },
    ];

    it('печатает ход разговора, линии, итог — дословный формат', () => {
        const text = buildSummaryText(
            summaryOf({
                story: 'Менеджер выяснил задачу.',
                threads,
                result: 'Договорились о показе.',
            }),
        );

        expect(text).toBe(
            [
                'СВОДКА РАЗГОВОРА',
                'Менеджер выяснил задачу.',
                'Сквозные линии:',
                '- возражение, «дорого» — закрыто (12:05, 39:40): сняли рассрочкой',
                '- договорённость, «показ в среду» — открыто (40:10): время не названо',
                'Чем кончился разговор: Договорились о показе.',
            ].join('\n'),
        );
    });

    it('строка про обрыв — только при endedAbruptly', () => {
        const abrupt = buildSummaryText(summaryOf({ endedAbruptly: true }));
        const normal = buildSummaryText(summaryOf({ endedAbruptly: false }));

        expect(abrupt.split('\n').pop()).toBe(
            'Запись обрывается на полуслове — это обрыв связи.',
        );
        expect(normal).not.toContain('обрыв');
    });

    it('линия без моментов — без скобок; без пояснения — без двоеточия', () => {
        const text = buildSummaryText(
            summaryOf({
                threads: [
                    {
                        kind: 'price',
                        topic: 'тариф',
                        status: 'dropped',
                        moments: [],
                        note: '',
                    },
                ],
            }),
        );

        expect(text).toContain('- цена, «тариф» — без ответа\n');
    });

    it('линий нет — подзаголовка линий тоже нет', () => {
        const text = buildSummaryText(summaryOf({ threads: [] }));

        expect(text).not.toContain('Сквозные линии');
    });

    it('итога нет — строки про итог нет', () => {
        expect(buildSummaryText(summaryOf({ result: '' }))).not.toContain(
            'Чем кончился разговор',
        );
    });
});

describe('buildExcerptsText — блок дословных отрывков', () => {
    const prepared = prepareTranscript(uniformLines(30).join('\n'));
    const lines = uniformLines(30);

    it('начало, отрывки по порядку, конец, подзаголовки через тире', () => {
        const text = buildExcerptsText(prepared, {
            head: { from: 0, to: 1 },
            groups: [
                { range: { from: 5, to: 6 }, heading: '00:50–01:00: торг' },
                { range: { from: 10, to: 10 }, heading: '01:40, цена' },
            ],
            tail: { from: 28, to: 29 },
            dropped: 0,
        });

        expect(text).toBe(
            [
                'ДОСЛОВНЫЕ ОТРЫВКИ',
                '— начало разговора —',
                lines[0],
                lines[1],
                '— 00:50–01:00: торг —',
                lines[5],
                lines[6],
                '— 01:40, цена —',
                lines[10],
                '— конец разговора —',
                lines[28],
                lines[29],
            ].join('\n'),
        );
    });

    it('если что-то отброшено — последняя строка «Не вошло отрывков: N.»', () => {
        const text = buildExcerptsText(prepared, {
            head: { from: 0, to: 0 },
            groups: [],
            tail: null,
            dropped: 3,
        });

        expect(text?.split('\n').pop()).toBe('Не вошло отрывков: 3.');
    });

    it('отброшено, а взять нечего — блок из заголовка и строки «Не вошло»', () => {
        expect(
            buildExcerptsText(prepared, {
                head: null,
                groups: [],
                tail: null,
                dropped: 2,
            }),
        ).toBe('ДОСЛОВНЫЕ ОТРЫВКИ\nНе вошло отрывков: 2.');
    });

    it('нечего печатать — блока нет', () => {
        expect(
            buildExcerptsText(prepared, {
                head: null,
                groups: [],
                tail: null,
                dropped: 0,
            }),
        ).toBeNull();
    });
});

describe('joinBlocks', () => {
    it('блоки идут через пустую строку, отсутствующие пропускаются', () => {
        expect(joinBlocks(['a', null, 'b\nc', null])).toBe('a\n\nb\nc');
    });
});
