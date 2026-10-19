import { analysisUsageColumns } from '../services/agent-analysis-usage.util';

/**
 * Колонки расхода ais разбора: тот же расчёт, что у снапшота резюме —
 * цена = токены / 1000 × llm_price_per_1k, округление до 4 знаков.
 */
const usage = (tokens: number) => ({
    tokens,
    promptTokens: null,
    completionTokens: null,
    calls: 4,
    callsWithUsage: 4,
    model: null,
});

describe('analysisUsageColumns', () => {
    it('токены — в tokens_count, цена — токены/1000 × цена портала с округлением', () => {
        expect(analysisUsageColumns(usage(18420), 2)).toEqual({
            tokens_count: 18420,
            price: 36.84,
        });
        expect(analysisUsageColumns(usage(1234), 1.23456)).toEqual({
            tokens_count: 1234,
            price: 1.5234,
        });
    });

    it('цена портала 0 или отрицательная — токены есть, цена 0', () => {
        expect(analysisUsageColumns(usage(500), 0)).toEqual({
            tokens_count: 500,
            price: 0,
        });
        expect(analysisUsageColumns(usage(500), -3)).toEqual({
            tokens_count: 500,
            price: 0,
        });
    });

    it('без учёта или с нулём токенов колонки не трогаются', () => {
        expect(analysisUsageColumns(undefined, 2)).toEqual({});
        expect(analysisUsageColumns(usage(0), 2)).toEqual({});
    });
});
