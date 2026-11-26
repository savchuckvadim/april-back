import { FOCUS_KEYS } from '../../contracts/call-focus-sections.contract';
import {
    CONVERSATION_SUMMARY_LIMITS,
    EVENT_WINDOW_RADIUS_CHARS_STEPS,
    EVENT_WINDOW_RADIUS_SEC_STEPS,
    LONG_CALL_COMPACT_LIMITS,
    LONG_CALL_DIRECTIONS,
    LONG_CALL_EVENT_KIND_LABELS,
    LONG_CALL_EVENT_KINDS,
    LONG_CALL_OVERLAP_CHARS,
    LONG_CALL_PART_CHARS,
    LONG_CALL_SEC_TOLERANCE,
    LONG_CALL_THREAD_STATUS_LABELS,
    LONG_CALL_THREAD_STATUSES,
    LONG_CALL_THRESHOLD_CHARS,
    PART_DIGEST_LIMITS,
} from '../long-call.const';
import {
    LONG_CALL_CONSUMERS,
    type LongCallConsumer,
} from '../long-call-consumers.const';

describe('константы длинного разговора', () => {
    it('числа совпадают с постановкой', () => {
        expect(LONG_CALL_THRESHOLD_CHARS).toBe(25_000);
        expect(LONG_CALL_PART_CHARS).toBe(9_000);
        expect(LONG_CALL_OVERLAP_CHARS).toBe(900);
        expect(LONG_CALL_SEC_TOLERANCE).toBe(90);
        expect(PART_DIGEST_LIMITS).toMatchObject({
            maxEvents: 10,
            quoteChars: 200,
            noteChars: 160,
            summaryChars: 700,
        });
        expect(CONVERSATION_SUMMARY_LIMITS).toMatchObject({
            maxThreads: 12,
            maxWindowsPerDirection: 6,
            windowMaxSec: 120,
            storyChars: 1_500,
            topicChars: 80,
            threadNoteChars: 300,
            windowWhyChars: 160,
        });
        expect([...EVENT_WINDOW_RADIUS_SEC_STEPS]).toEqual([45, 30, 15]);
        expect([...EVENT_WINDOW_RADIUS_CHARS_STEPS]).toEqual([600, 400, 200]);
    });

    it('уплотнение расшифровки: 10 секунд от первой строки и 240 знаков текста', () => {
        expect(LONG_CALL_COMPACT_LIMITS).toEqual({
            maxSpanSec: 10,
            maxTextChars: 240,
        });
    });

    it('девять видов событий, у каждого русская подпись', () => {
        expect([...LONG_CALL_EVENT_KINDS]).toEqual([
            'need',
            'presentation',
            'objection',
            'price',
            'competitor',
            'agreement',
            'refusal',
            'issue',
            'other',
        ]);
        expect(Object.keys(LONG_CALL_EVENT_KIND_LABELS).sort()).toEqual(
            [...LONG_CALL_EVENT_KINDS].sort(),
        );
        for (const label of Object.values(LONG_CALL_EVENT_KIND_LABELS)) {
            expect(label).toMatch(/^[а-яё]+$/);
        }
        expect(LONG_CALL_EVENT_KIND_LABELS.need).toBe('потребность');
        expect(LONG_CALL_EVENT_KIND_LABELS.other).toBe('важное');
    });

    it('три статуса линии с русскими подписями', () => {
        expect([...LONG_CALL_THREAD_STATUSES]).toEqual([
            'resolved',
            'open',
            'dropped',
        ]);
        expect(LONG_CALL_THREAD_STATUS_LABELS).toEqual({
            resolved: 'закрыто',
            open: 'открыто',
            dropped: 'без ответа',
        });
    });

    it('направления — четыре фокус-прохода из FOCUS_KEYS и методика', () => {
        expect([...LONG_CALL_DIRECTIONS]).toEqual([
            ...FOCUS_KEYS,
            'methodology',
        ]);
    });
});

describe('LONG_CALL_CONSUMERS — что получает каждый потребитель', () => {
    const EXPECTED_CONSUMERS: LongCallConsumer[] = [
        ...FOCUS_KEYS,
        'methodology',
        'synthesis',
        'whole',
    ];

    it('строка есть у каждого фокус-прохода, у методики, синтеза и «целиком»', () => {
        expect(Object.keys(LONG_CALL_CONSUMERS).sort()).toEqual(
            [...EXPECTED_CONSUMERS].sort(),
        );
    });

    it('виды событий и направления — только из констант', () => {
        for (const consumer of Object.values(LONG_CALL_CONSUMERS)) {
            for (const kind of consumer.eventKinds) {
                expect(LONG_CALL_EVENT_KINDS).toContain(kind);
            }
            for (const direction of consumer.directions) {
                expect(LONG_CALL_DIRECTIONS).toContain(direction);
            }
        }
    });

    it('числа и виды совпадают с постановкой', () => {
        const row = (key: LongCallConsumer) => {
            const { headChars, tailChars, budgetChars, keep } =
                LONG_CALL_CONSUMERS[key];

            return [headChars, tailChars, budgetChars, keep];
        };

        expect(row('form')).toEqual([2_500, 1_500, 4_000, 'earliest']);
        expect(row('content')).toEqual([800, 0, 12_000, 'earliest']);
        expect(row('movement')).toEqual([0, 0, 12_000, 'earliest']);
        expect(row('closing')).toEqual([0, 4_000, 8_000, 'latest']);
        expect(row('methodology')).toEqual([2_500, 4_000, 10_000, 'earliest']);
        expect(row('synthesis')).toEqual([0, 0, 0, null]);
        expect(row('whole')).toEqual([2_500, 4_000, 16_000, 'earliest']);

        expect(LONG_CALL_CONSUMERS.form.eventKinds).toEqual([]);
        expect(LONG_CALL_CONSUMERS.content.eventKinds).toEqual([
            'need',
            'presentation',
        ]);
        expect(LONG_CALL_CONSUMERS.movement.eventKinds).toEqual([
            'objection',
            'price',
            'competitor',
            'issue',
        ]);
        expect(LONG_CALL_CONSUMERS.closing.eventKinds).toEqual([
            'agreement',
            'refusal',
        ]);
        expect(LONG_CALL_CONSUMERS.methodology.eventKinds).toEqual([
            'need',
            'presentation',
            'agreement',
        ]);
    });

    it('у каждого прохода и у методики отрезки сводки только своего направления', () => {
        for (const key of [...FOCUS_KEYS, 'methodology'] as const) {
            expect(LONG_CALL_CONSUMERS[key].directions).toEqual([key]);
        }
    });

    it('синтез окон не получает, «целиком» — все виды и все направления', () => {
        expect(LONG_CALL_CONSUMERS.synthesis.eventKinds).toEqual([]);
        expect(LONG_CALL_CONSUMERS.synthesis.directions).toEqual([]);
        expect([...LONG_CALL_CONSUMERS.whole.eventKinds]).toEqual([
            ...LONG_CALL_EVENT_KINDS,
        ]);
        expect([...LONG_CALL_CONSUMERS.whole.directions]).toEqual([
            ...LONG_CALL_DIRECTIONS,
        ]);
    });

    it('бюджет нулевой только там, где окон нет; «что оставляем» задано там, где бюджет есть', () => {
        for (const consumer of Object.values(LONG_CALL_CONSUMERS)) {
            expect(consumer.budgetChars === 0).toBe(consumer.keep === null);
        }
    });
});
