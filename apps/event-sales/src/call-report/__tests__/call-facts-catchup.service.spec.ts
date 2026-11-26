import { buildFactsCatchupUserContent } from '../contracts/call-report-facts-catchup.contract';
import { CallFactsCatchupService } from '../services/call-facts-catchup.service';
import {
    type FakeLongCall,
    markerOf,
    noLongCall,
    withLongCall,
} from './call-long-input.fake';

/**
 * Этап 4г: догон признаков на длинном разговоре получает текст «целиком»
 * вместо расшифровки, расход подготовки входит в расход догона; на коротком
 * — как раньше.
 */
const DOMAIN = 'test.bitrix24.ru';
const FULL = 'ПОЛНАЯ-РАСШИФРОВКА: алло, добрый день';
const SOURCE = { callType: 'presentation' };

const FACTS = {
    outcome: null,
    issues: [],
    prices: [],
    upsell: {},
    selfIntro: {},
    nextStepKind: null,
    objectionTopics: [],
};

const makeDeps = (longCall: FakeLongCall) => {
    const llm = {
        structuredCompletionWithUsage: jest.fn().mockResolvedValue({
            result: FACTS,
            usage: {
                promptTokens: 400,
                completionTokens: 100,
                totalTokens: 500,
            },
            model: 'bitrix/bitrixgpt-5.5',
            provider: 'vibecode',
        }),
    };
    const transcriptionStore = {
        findPipelineById: jest.fn().mockResolvedValue({
            id: '1',
            domain: DOMAIN,
            segments: [],
            text: FULL,
        }),
    };
    const contextBuilder = {
        build: jest.fn().mockResolvedValue({}),
        renderForPrompt: jest.fn().mockReturnValue('ПАСПОРТ'),
    };
    const llmPrice = { resolvePricing: jest.fn().mockResolvedValue(1) };
    const service = new CallFactsCatchupService(
        transcriptionStore as never,
        llm as never,
        contextBuilder as never,
        llmPrice as never,
        longCall as never,
    );
    /** User-часть единственного запроса к модели. */
    const userOf = (): string =>
        (llm.structuredCompletionWithUsage.mock.calls[0] as string[])[1];

    return { service, llm, longCall, userOf };
};

describe('CallFactsCatchupService: длинный разговор', () => {
    it('длинный путь: вместо расшифровки — текст «целиком», расход с подготовкой', async () => {
        const { service, userOf, longCall } = makeDeps(withLongCall());

        const outcome = await service.run({
            transcriptionId: '1',
            source: SOURCE,
            model: 'bitrix/own',
        });

        expect(longCall.prepare).toHaveBeenCalledWith(DOMAIN, FULL, {
            model: 'bitrix/own',
        });
        expect(userOf()).toBe(
            buildFactsCatchupUserContent(
                markerOf('whole'),
                'presentation',
                SOURCE,
                'ПАСПОРТ',
            ),
        );
        expect(userOf()).not.toContain(FULL);
        // Запрос 500 токенов (400 + 100) и два ответа подготовки по 60.
        expect(outcome?.usage.tokens_count).toBe(620);
    });

    it('короткий разговор (prepare → null): запрос и расход как раньше', async () => {
        const { service, userOf, llm } = makeDeps(noLongCall());

        const outcome = await service.run({
            transcriptionId: '1',
            source: SOURCE,
            model: null,
        });

        expect(userOf()).toBe(
            buildFactsCatchupUserContent(
                FULL,
                'presentation',
                SOURCE,
                'ПАСПОРТ',
            ),
        );
        // Модель портала не задана — опции вызова не передаются.
        expect(
            (llm.structuredCompletionWithUsage.mock.calls[0] as unknown[])[5],
        ).toBeUndefined();
        expect(outcome?.usage.tokens_count).toBe(500);
    });
});
