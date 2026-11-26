import {
    PREPARE_USAGE,
    longCallInput,
    markerOf,
    prepareCompletion,
} from '../../__tests__/call-long-input.fake';
import {
    LONG_CALL_CONSUMERS,
    type LongCallConsumer,
} from '../long-call-consumers.const';
import { longTokens, longUserContent } from '../long-call-focus.util';

const FULL = 'ПОЛНАЯ-РАСШИФРОВКА';
const wrap = (text: string): string => `[${text}]`;

describe('longUserContent', () => {
    it('длинный путь: каждому потребителю — своя обёртка вокруг своего текста', () => {
        const contentOf = longUserContent(longCallInput(), FULL, wrap);

        const consumers = Object.keys(
            LONG_CALL_CONSUMERS,
        ) as LongCallConsumer[];
        expect(consumers).toHaveLength(7);
        for (const consumer of consumers) {
            expect(contentOf(consumer)).toBe(`[${markerOf(consumer)}]`);
        }
    });

    it('длинного пути нет — всем потребителям полная расшифровка в той же обёртке', () => {
        const contentOf = longUserContent(null, FULL, wrap);

        expect(contentOf('form')).toBe(`[${FULL}]`);
        expect(contentOf('synthesis')).toBe(`[${FULL}]`);
        expect(contentOf('whole')).toBe(`[${FULL}]`);
    });
});

describe('longTokens', () => {
    it('длинного пути нет — число вызова как есть, в том числе null', () => {
        expect(longTokens(9400, null)).toBe(9400);
        expect(longTokens(null, null)).toBeNull();
    });

    it('к числу вызова прибавляются токены ответов подготовки', () => {
        const input = longCallInput({
            completions: [prepareCompletion(), prepareCompletion()],
        });

        expect(longTokens(120, input)).toBe(
            120 + 2 * PREPARE_USAGE.totalTokens,
        );
    });

    it('неизвестное слагаемое в сумму не входит; все неизвестны — null', () => {
        const unknown = {
            ...prepareCompletion(),
            usage: {
                promptTokens: null,
                completionTokens: null,
                totalTokens: null,
            },
        };
        const input = longCallInput({
            completions: [prepareCompletion(), unknown],
        });

        expect(longTokens(null, input)).toBe(PREPARE_USAGE.totalTokens);
        expect(longTokens(100, input)).toBe(100 + PREPARE_USAGE.totalTokens);
        expect(
            longTokens(null, longCallInput({ completions: [unknown] })),
        ).toBeNull();
        expect(longTokens(null, longCallInput({ completions: [] }))).toBeNull();
        expect(longTokens(0, longCallInput({ completions: [] }))).toBe(0);
    });
});
