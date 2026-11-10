import {
    completionTokensOf,
    sumCompletionUsage,
} from '../services/call-analysis-usage.util';

/**
 * Учёт токенов глубокого разбора: сумма по удавшимся вызовам, честная
 * разбивка prompt/completion и число вызовов с учётом.
 */
const response = (
    promptTokens: number | null,
    completionTokens: number | null,
    totalTokens: number | null,
    model: string | null = 'bitrix/bitrixgpt-5.5',
) => ({
    result: {},
    usage: { promptTokens, completionTokens, totalTokens },
    model,
});

describe('completionTokensOf', () => {
    it('prompt + completion; без разбивки — total; ничего — null', () => {
        expect(
            completionTokensOf({
                promptTokens: 100,
                completionTokens: 20,
                totalTokens: 999,
            }),
        ).toBe(120);
        expect(
            completionTokensOf({
                promptTokens: null,
                completionTokens: null,
                totalTokens: 300,
            }),
        ).toBe(300);
        expect(
            completionTokensOf({
                promptTokens: null,
                completionTokens: null,
                totalTokens: null,
            }),
        ).toBeNull();
    });
});

describe('sumCompletionUsage', () => {
    it('суммирует три фокуса и синтез, модель — первая названная провайдером', () => {
        const usage = sumCompletionUsage([
            response(100, 20, 120, null),
            response(200, 30, 230),
            response(300, 40, 340),
            response(50, 10, 60, 'bitrix/other'),
        ]);

        expect(usage).toEqual({
            tokens: 750,
            promptTokens: 650,
            completionTokens: 100,
            calls: 4,
            callsWithUsage: 4,
            model: 'bitrix/bitrixgpt-5.5',
        });
    });

    it('вызов без учёта в сумму не входит, но считается вызовом; разбивка null, если её не было ни разу', () => {
        const usage = sumCompletionUsage([
            response(null, null, 500),
            response(null, null, null, null),
        ]);

        expect(usage).toEqual({
            tokens: 500,
            promptTokens: null,
            completionTokens: null,
            calls: 2,
            callsWithUsage: 1,
            model: 'bitrix/bitrixgpt-5.5',
        });
    });

    it('без вызовов — нули и null', () => {
        expect(sumCompletionUsage([])).toEqual({
            tokens: 0,
            promptTokens: null,
            completionTokens: null,
            calls: 0,
            callsWithUsage: 0,
            model: null,
        });
    });
});

/** B3: ответы шлюза несут код поставщика — разбивка расхода по нему. */
describe('sumCompletionUsage по поставщикам (B3)', () => {
    it('поставщик первого вызова и разбивка; ответы без кода в разбивку не входят', () => {
        const usage = sumCompletionUsage([
            { ...response(100, 20, 120), provider: 'vibecode' },
            { ...response(200, 30, 230), provider: 'ai-rag' },
            { ...response(null, null, null), provider: 'vibecode' },
            response(50, 10, 60),
        ]);

        expect(usage.tokens).toBe(120 + 230 + 60);
        expect(usage.provider).toBe('vibecode');
        expect(usage.byProvider).toEqual([
            { provider: 'vibecode', tokens: 120, calls: 2 },
            { provider: 'ai-rag', tokens: 230, calls: 1 },
        ]);
    });

    it('ни один ответ не назвал поставщика — полей provider/byProvider нет', () => {
        const usage = sumCompletionUsage([response(100, 20, 120)]);
        expect(usage).not.toHaveProperty('provider');
        expect(usage).not.toHaveProperty('byProvider');
    });
});
