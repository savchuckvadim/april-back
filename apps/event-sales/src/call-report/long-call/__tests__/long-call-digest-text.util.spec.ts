import type {
    DigestedPart,
    PartDigest,
    PartDigestEvent,
    TranscriptPart,
} from '../long-call.types';
import {
    collectDigestEvents,
    dedupeEventsByPart,
} from '../long-call-digest-events.util';
import { buildDigestText } from '../long-call-digest-text.util';

const part = (
    number: number,
    total: number,
    fromSec: number | null,
    toSec: number | null,
): TranscriptPart => ({
    number,
    total,
    text: `текст части ${number}`,
    fromSec,
    toSec,
});

const event = (
    overrides: Partial<PartDigestEvent> & Pick<PartDigestEvent, 'quote'>,
): PartDigestEvent => ({
    kind: 'need',
    startSec: null,
    note: '',
    ...overrides,
});

const digest = (overrides: Partial<PartDigest> = {}): PartDigest => ({
    summary: 'Говорили о задаче.',
    events: [],
    managerQuestions: 0,
    endsWith: 'разговор продолжается',
    ...overrides,
});

describe('buildDigestText — печать конспекта по частям', () => {
    const parts: DigestedPart[] = [
        {
            part: part(1, 2, 0, 580),
            digest: digest({
                summary: 'Клиент рассказал о задаче.',
                events: [
                    event({
                        kind: 'need',
                        startSec: 135,
                        quote: 'нужен учёт заявок',
                        note: 'клиент назвал задачу',
                    }),
                    event({
                        kind: 'objection',
                        startSec: 302,
                        quote: 'дорого для нас',
                        note: 'менеджер назвал рассрочку',
                    }),
                ],
                managerQuestions: 4,
                endsWith: 'разговор продолжается',
            }),
        },
        {
            part: part(2, 2, 530, 1100),
            digest: digest({
                summary: 'Договорились о показе.',
                events: [
                    event({
                        kind: 'agreement',
                        startSec: 1010,
                        quote: 'давайте в среду',
                        note: 'показ назначен',
                    }),
                ],
                managerQuestions: 3,
                endsWith: 'стороны попрощались.',
            }),
        },
    ];

    it('заголовок, части по порядку с временем, события с меткой, видом, цитатой и пояснением', () => {
        expect(buildDigestText(parts)).toBe(
            [
                'КОНСПЕКТ ПО ЧАСТЯМ',
                'Часть 1 (00:00–09:40). Клиент рассказал о задаче.',
                '  [02:15] потребность: «нужен учёт заявок» — клиент назвал задачу',
                '  [05:02] возражение: «дорого для нас» — менеджер назвал рассрочку',
                'Часть 2 (08:50–18:20). Договорились о показе.',
                '  [16:50] договорённость: «давайте в среду» — показ назначен',
                'Вопросов менеджера всего: 7. Конец записи: стороны попрощались.',
            ].join('\n'),
        );
    });

    it('минуты больше 59 печатаются как есть: 65:03', () => {
        const text = buildDigestText([
            {
                part: part(1, 1, 3600, 4000),
                digest: digest({
                    events: [event({ startSec: 3903, quote: 'через час' })],
                }),
            },
        ]);

        expect(text).toContain('Часть 1 (60:00–66:40).');
        expect(text).toContain('[65:03] потребность: «через час»');
    });

    it('часть без конспекта — строка «конспекта нет», остальные части на месте', () => {
        const text = buildDigestText([
            parts[0],
            { part: part(2, 3, 530, 1100), digest: null },
            { ...parts[1], part: part(3, 3, 1000, 1500) },
        ]);

        expect(text).toContain('Часть 2 (08:50–18:20): конспекта нет.');
        expect(text.indexOf('Часть 1')).toBeLessThan(text.indexOf('Часть 2'));
        expect(text.indexOf('Часть 2')).toBeLessThan(text.indexOf('Часть 3'));
    });

    it('событие без времени печатается без метки; без пояснения — без тире', () => {
        const text = buildDigestText([
            {
                part: part(1, 1, 0, 100),
                digest: digest({
                    events: [
                        event({
                            kind: 'price',
                            quote: 'сорок тысяч',
                            note: 'цена названа',
                        }),
                        event({ kind: 'other', startSec: 65, quote: 'алло' }),
                    ],
                }),
            },
        ]);

        expect(text).toContain('\n  цена: «сорок тысяч» — цена названа\n');
        expect(text).toContain('\n  [01:05] важное: «алло»\n');
    });

    it('у записи без меток времени в скобках части ничего нет', () => {
        const text = buildDigestText([
            {
                part: part(1, 2, null, null),
                digest: digest({ summary: 'Первое.' }),
            },
            { part: part(2, 2, null, null), digest: null },
        ]);

        expect(text).toContain('\nЧасть 1. Первое.\n');
        expect(text).toContain('\nЧасть 2: конспекта нет.\n');
    });

    it('события из перекрытий не дублируются: одинаковая цитата (регистр и пробелы не в счёт) остаётся в более ранней части', () => {
        const text = buildDigestText([
            {
                part: part(1, 2, 0, 600),
                digest: digest({
                    summary: 'Раз.',
                    events: [
                        event({ startSec: 590, quote: 'Нам  нужен   учёт' }),
                    ],
                }),
            },
            {
                part: part(2, 2, 540, 1100),
                digest: digest({
                    summary: 'Два.',
                    events: [
                        event({ startSec: 592, quote: 'нам нужен учёт' }),
                        event({ startSec: 700, quote: 'другая фраза' }),
                    ],
                }),
            },
        ]);

        expect(text.match(/учёт/g)).toHaveLength(1);
        expect(text.indexOf('Нам  нужен   учёт')).toBeLessThan(
            text.indexOf('Часть 2'),
        );
        expect(text).toContain('другая фраза');
    });

    it('одна и та же цитата в несоседних частях остаётся в обеих', () => {
        const same = event({ startSec: null, quote: 'договорились' });
        const text = buildDigestText([
            { part: part(1, 3, 0, 100), digest: digest({ events: [same] }) },
            { part: part(2, 3, 90, 200), digest: digest({ events: [] }) },
            { part: part(3, 3, 190, 300), digest: digest({ events: [same] }) },
        ]);

        expect(text.match(/договорились/g)).toHaveLength(2);
    });

    it('конец записи — по последней части с конспектом, лишняя точка в конце не удваивается', () => {
        const text = buildDigestText([
            parts[0],
            parts[1],
            { part: part(3, 3, 1000, 1500), digest: null },
        ]);

        expect(text.endsWith('Конец записи: стороны попрощались.')).toBe(true);
    });

    it('нет ни одного конспекта — вопросов 0, конец записи неизвестен', () => {
        const text = buildDigestText([
            { part: part(1, 1, 0, 100), digest: null },
        ]);

        expect(
            text.endsWith(
                'Вопросов менеджера всего: 0. Конец записи: неизвестно.',
            ),
        ).toBe(true);
    });
});

describe('dedupeEventsByPart и collectDigestEvents — события без повторов из перекрытий', () => {
    const early = event({ startSec: 300, quote: 'Первое событие' });
    const overlapped = event({ startSec: 590, quote: 'Событие на стыке' });
    const parts: DigestedPart[] = [
        {
            part: part(1, 2, 0, 600),
            digest: digest({ events: [early, overlapped] }),
        },
        {
            part: part(2, 2, 540, 1100),
            digest: digest({
                events: [
                    {
                        ...overlapped,
                        startSec: 592,
                        quote: 'событие  на СТЫКЕ',
                    },
                    event({ startSec: 800, quote: 'Позднее событие' }),
                ],
            }),
        },
    ];

    it('по частям: повтор убран из более поздней части', () => {
        const byPart = dedupeEventsByPart(parts);

        expect(byPart[0].map(item => item.quote)).toEqual([
            'Первое событие',
            'Событие на стыке',
        ]);
        expect(byPart[1].map(item => item.quote)).toEqual(['Позднее событие']);
    });

    it('плоский список — по времени, с номером части, без повторов', () => {
        const flat = collectDigestEvents(parts);

        expect(flat.map(item => [item.partNumber, item.startSec])).toEqual([
            [1, 300],
            [1, 590],
            [2, 800],
        ]);
    });

    it('события идут по времени, даже если модель назвала их не по порядку; без времени — рядом с предыдущим', () => {
        const flat = collectDigestEvents([
            {
                part: part(1, 1, 0, 1000),
                digest: digest({
                    events: [
                        event({ startSec: 500, quote: 'позже' }),
                        event({ startSec: null, quote: 'без времени' }),
                        event({ startSec: 100, quote: 'раньше' }),
                    ],
                }),
            },
        ]);

        expect(flat.map(item => item.quote)).toEqual([
            'раньше',
            'позже',
            'без времени',
        ]);
    });

    it('части без конспектов дают пустой список', () => {
        expect(
            collectDigestEvents([{ part: part(1, 1, 0, 10), digest: null }]),
        ).toEqual([]);
        expect(collectDigestEvents([])).toEqual([]);
    });
});
