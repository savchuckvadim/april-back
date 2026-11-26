import type { StructuredLlmResponse } from '@lib/llm-gateway';
import {
    LONG_CALL_CONSUMERS,
    type LongCallConsumer,
} from '../long-call/long-call-consumers.const';
import type {
    LongCallInput,
    LongCallPrepareOptions,
} from '../long-call/long-call-input.service.types';

/**
 * Подставной LongCallInputService для тестов проходов разбора (этап 4г):
 * настоящей подготовки (резка, конспекты, сводка, Redis) нет.
 */

/** Подставной сервис: `prepare` — jest-функция с типом метода сервиса. */
export interface FakeLongCall {
    prepare: jest.Mock<
        Promise<LongCallInput | null>,
        [string, string, LongCallPrepareOptions?]
    >;
}

/** Подставной `prepare`, который всегда возвращает `value`. */
const prepareReturning = (
    value: LongCallInput | null,
): FakeLongCall['prepare'] =>
    jest
        .fn<
            Promise<LongCallInput | null>,
            [string, string, LongCallPrepareOptions?]
        >()
        .mockResolvedValue(value);

/** Длинный путь не применяется — разбор идёт как раньше. */
export const noLongCall = (): FakeLongCall => ({
    prepare: prepareReturning(null),
});

/** Расход одного ответа подготовки: 50 токенов промпта, 10 — ответа. */
export const PREPARE_USAGE = {
    promptTokens: 50,
    completionTokens: 10,
    totalTokens: 60,
};

/** Текст-маркер потребителя: его легко найти в запросе и не спутать с полным. */
export const markerOf = (consumer: LongCallConsumer): string =>
    `ТЕКСТ-ДЛЯ-${consumer.toUpperCase()}`;

/** Ответ модели при подготовке (конспект части или сводка). */
export const prepareCompletion = (): StructuredLlmResponse => ({
    result: {},
    usage: PREPARE_USAGE,
    model: 'bitrix/bitrixgpt-5.5',
    provider: 'vibecode',
});

/** Результат подготовки: каждому потребителю — свой маркер, два ответа модели. */
export const longCallInput = (
    overrides: Partial<LongCallInput> = {},
): LongCallInput => {
    const consumers = Object.keys(LONG_CALL_CONSUMERS) as LongCallConsumer[];

    return {
        texts: Object.fromEntries(
            consumers.map(consumer => [consumer, markerOf(consumer)]),
        ) as Record<LongCallConsumer, string>,
        report: {
            partsCount: 7,
            partsWithoutDigest: 1,
            eventsCount: 12,
            threadsCount: 4,
            hasSummary: true,
            consumers: Object.fromEntries(
                consumers.map(consumer => [
                    consumer,
                    { textChars: 100, droppedExcerpts: 0 },
                ]),
            ) as LongCallInput['report']['consumers'],
        },
        sourceChars: 140_200,
        transcriptChars: 58_400,
        partChars: 9_000,
        completions: [prepareCompletion(), prepareCompletion()],
        ...overrides,
    };
};

/** Подставной сервис, который возвращает готовый результат подготовки. */
export const withLongCall = (
    input: LongCallInput = longCallInput(),
): FakeLongCall => ({
    prepare: prepareReturning(input),
});
