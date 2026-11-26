import { Logger } from '@nestjs/common';
import { LlmUnavailableError } from '@lib/llm-gateway';
import { CALL_LONG_PART_SCHEMA_NAME } from '../../contracts/call-long-part.contract';
import { CALL_LONG_SUMMARY_SCHEMA_NAME } from '../../contracts/call-long-summary.contract';
import { LongCallInputService } from '../long-call-input.service';
import {
    LONG_CALL_OVERLAP_CHARS,
    LONG_CALL_PART_CHARS,
} from '../long-call.const';
import { splitTranscript } from '../long-call-split.util';
import { generateTranscriptLines } from './long-call-transcript.fixture';

/**
 * Подставные шлюз модели и Redis для тестов LongCallInputService: настоящих
 * запросов нет. Шлюз считает одновременные вызовы, Redis — словарь.
 */

export const DOMAIN = 'test.bitrix24.ru';
export const USAGE = {
    promptTokens: 100,
    completionTokens: 20,
    totalTokens: 120,
};

/** Вызов подставного шлюза: что в него пришло. */
export interface ModelCall {
    system: string;
    user: string;
    schemaName: string;
    domain: string;
    options: { model?: string; deferExhaustedAlert?: boolean } | undefined;
}

/** Ответ шлюза или сбой (исключение); `index` — номер вызова по порядку, с 1. */
export type ModelHandler = (call: ModelCall, index: number) => unknown;

/** Номер части из текста запроса «ЧАСТЬ n ИЗ total:». */
export const partNumberOf = (call: ModelCall): number =>
    Number(/^ЧАСТЬ (\d+) ИЗ/.exec(call.user)?.[1]);

export const isPartCall = (call: ModelCall): boolean =>
    call.schemaName === CALL_LONG_PART_SCHEMA_NAME;

export const isSummaryCall = (call: ModelCall): boolean =>
    call.schemaName === CALL_LONG_SUMMARY_SCHEMA_NAME;

/** Конспект части, как его вернула бы модель: одно событие. */
export const rawDigest = (overrides: Record<string, unknown> = {}) => ({
    summary: 'Говорили о задаче клиента.',
    events: [
        {
            kind: 'need',
            startSec: null,
            quote: 'нужна учётная система',
            note: 'клиент назвал задачу',
        },
    ],
    managerQuestions: 2,
    endsWith: 'разговор продолжается',
    ...overrides,
});

/** Конспект без событий (для большой части — «подозрительно пуст»). */
export const rawEmptyDigest = () => rawDigest({ events: [] });

/** Сводка разговора, как её вернула бы модель. */
export const rawSummary = () => ({
    story: 'Менеджер выяснил задачу и показал систему.',
    threads: [],
    result: 'Договорились о показе.',
    endedAbruptly: false,
    windows: {
        form: [],
        content: [],
        movement: [],
        closing: [],
        methodology: [],
    },
});

/** Ответ по умолчанию: хороший конспект на часть, сводка на сводку. */
export const defaultAnswer: ModelHandler = call =>
    isSummaryCall(call) ? rawSummary() : rawDigest();

/** Временный сбой поставщика (isRetryableLlmError — истина). */
export const transientError = (): LlmUnavailableError =>
    new LlmUnavailableError(
        'сервер ответил 503',
        [{ provider: 'vibecode', transient: true }],
        'vibecode',
    );

/** Постоянный сбой (неверный ключ): повторять незачем. */
export const permanentError = (): LlmUnavailableError =>
    new LlmUnavailableError(
        'неверный ключ',
        [{ provider: 'vibecode', transient: false }],
        'vibecode',
    );

/** Подставной шлюз: журнал вызовов и наибольшее число одновременных. */
export function fakeGateway(handler: ModelHandler = defaultAnswer) {
    const calls: ModelCall[] = [];
    let active = 0;
    let maxActive = 0;
    const structuredCompletionWithUsage = jest.fn(
        async (
            system: string,
            user: string,
            schemaName: string,
            _schema: Record<string, unknown>,
            domain: string,
            options?: ModelCall['options'],
        ): Promise<unknown> => {
            calls.push({ system, user, schemaName, domain, options });
            const index = calls.length;
            active += 1;
            maxActive = Math.max(maxActive, active);
            try {
                // Даём другим запросам стартовать: так видно одновременность.
                await new Promise<void>(resolve => setImmediate(resolve));
                const result = handler(calls[index - 1], index);

                return {
                    result,
                    usage: USAGE,
                    model: 'bitrix/test',
                    provider: 'vibecode',
                };
            } finally {
                active -= 1;
            }
        },
    );
    const reportExhausted = jest.fn().mockResolvedValue(undefined);

    return {
        gateway: { structuredCompletionWithUsage, reportExhausted },
        calls,
        maxActive: () => maxActive,
    };
}

/** Подставной Redis: словарь; `failing` — каждое обращение падает. */
export function fakeRedis(failing = false) {
    const store = new Map<string, { value: string; ttlSec: number }>();
    const client = {
        get: jest.fn((key: string): Promise<string | null> => {
            if (failing) return Promise.reject(new Error('Redis недоступен'));

            return Promise.resolve(store.get(key)?.value ?? null);
        }),
        set: jest.fn(
            (
                key: string,
                value: string,
                _mode: string,
                ttlSec: number,
            ): Promise<'OK'> => {
                if (failing)
                    return Promise.reject(new Error('Redis недоступен'));
                store.set(key, { value, ttlSec });

                return Promise.resolve('OK');
            },
        ),
        del: jest.fn().mockResolvedValue(1),
    };

    return { redis: { getClient: () => client }, client, store };
}

export interface ServiceFixtureOptions {
    /** Значения трёх настроек вендора по ключам. */
    settings?: Record<string, string | null>;
    handler?: ModelHandler;
    redis?: ReturnType<typeof fakeRedis>;
    /** Читатель настроек падает. */
    readerFails?: boolean;
}

/** Режим «включён». */
export const MODE_ON = { CALL_LONG_PARTS_MODE: 'on' } as const;

/** Служба и всё, что в неё подставлено. */
export function makeLongCallService(options: ServiceFixtureOptions = {}) {
    const model = fakeGateway(options.handler);
    const reader = {
        get: jest.fn(),
        getMany: jest.fn((keys: readonly string[]) =>
            options.readerFails
                ? Promise.reject(new Error('база недоступна'))
                : Promise.resolve(
                      Object.fromEntries(
                          keys.map(key => [
                              key,
                              options.settings?.[key] ?? null,
                          ]),
                      ),
                  ),
        ),
    };
    const service = new LongCallInputService(
        model.gateway as never,
        { get: jest.fn() } as never,
        reader,
        options.redis?.redis as never,
    );

    return { service, reader, ...model };
}

/** Журнал сервиса: предупреждения и строки подготовки (вывод в консоль подавлен). */
export function spyOnServiceLog() {
    return {
        warn: jest.spyOn(Logger.prototype, 'warn').mockImplementation(),
        log: jest.spyOn(Logger.prototype, 'log').mockImplementation(),
    };
}

/** Расшифровка живого вида примерно на chars знаков. */
export const transcriptOf = (chars: number): string =>
    generateTranscriptLines(chars).join('\n');

/** Длинная расшифровка выше порога по умолчанию (25 000). */
export const LONG_TRANSCRIPT = transcriptOf(30_000);

/** Части, как их режет сервис при настройках по умолчанию. */
export const defaultParts = (text: string) =>
    splitTranscript(text, {
        partChars: LONG_CALL_PART_CHARS,
        overlapChars: LONG_CALL_OVERLAP_CHARS,
    });

/**
 * Расшифровка, которая при настройках по умолчанию режется ровно на count
 * частей (размер подбирается шагом в тысячу знаков).
 */
export function transcriptWithParts(count: number): string {
    const STEP_CHARS = 1_000;
    const FIRST_CHARS = 26_000;
    const LAST_CHARS = 120_000;
    for (let chars = FIRST_CHARS; chars <= LAST_CHARS; chars += STEP_CHARS) {
        const text = transcriptOf(chars);
        if (defaultParts(text).length === count) return text;
    }
    throw new Error(`Не нашлось расшифровки на ${count} частей`);
}
