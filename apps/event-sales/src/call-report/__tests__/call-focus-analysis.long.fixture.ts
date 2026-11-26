import type { ResolvedMethodology } from '@lib/call-lib';
import { CallFocusAnalysisService } from '../services/call-focus-analysis.service';
import { type FakeLongCall, noLongCall } from './call-long-input.fake';

/**
 * Сборка CallFocusAnalysisService для тестов длинного пути (этап 4г): шлюз
 * модели записывает запросы, подготовка длинного разговора подставная.
 */

export const DOMAIN = 'test.bitrix24.ru';

/** Расход одного вызова прохода: 100 токенов промпта, 20 — ответа. */
export const PASS_USAGE = {
    promptTokens: 100,
    completionTokens: 20,
    totalTokens: 120,
};

/** Ответ модели на вызов или ошибка прохода. */
export type PassAnswer = Record<string, unknown> | Error;

const emptyAnswer = (): Record<string, unknown> => ({ sections: [] });

export function makeFocusService(options?: {
    longCall?: FakeLongCall;
    responses?: Record<string, PassAnswer>;
    methodology?: ResolvedMethodology | null;
}) {
    const responses = options?.responses ?? {};
    const longCall = options?.longCall ?? noLongCall();
    const llm = {
        structuredCompletionWithUsage: jest.fn(
            (
                _system: string,
                _user: string,
                schemaName: string,
            ): Promise<unknown> => {
                const answer = responses[schemaName];
                if (answer instanceof Error) return Promise.reject(answer);
                return Promise.resolve({
                    result: answer ?? emptyAnswer(),
                    usage: PASS_USAGE,
                    model: 'bitrix/bitrixgpt-5.5',
                });
            },
        ),
        reportExhausted: jest.fn().mockResolvedValue(undefined),
    };
    const materials = {
        collect: jest.fn((_domain: string, requests: { kind: string }[]) =>
            Promise.resolve(
                requests.map(request => ({
                    kind: request.kind,
                    text: '',
                    chars: 0,
                    truncated: false,
                })),
            ),
        ),
    };
    const service = new CallFocusAnalysisService(
        llm as never,
        materials as never,
        { resolve: jest.fn().mockResolvedValue({ types: {} }) } as never,
        {
            resolve: jest
                .fn()
                .mockResolvedValue({ withCheckPresentation: false }),
        } as never,
        {
            resolve: jest
                .fn()
                .mockResolvedValue({ presentationStrictness: 'strict' }),
        } as never,
        {
            resolve: jest.fn().mockResolvedValue(options?.methodology ?? null),
        } as never,
        longCall as never,
    );
    const calls = (): unknown[][] =>
        llm.structuredCompletionWithUsage.mock.calls as unknown[][];

    return {
        service,
        llm,
        longCall,
        /** Имена схем вызовов модели по порядку. */
        schemas: (): unknown[] => calls().map(call => call[2]),
        /** User-часть запроса с этой схемой. */
        userOf: (schemaName: string): string =>
            String(calls().find(call => call[2] === schemaName)?.[1]),
    };
}
