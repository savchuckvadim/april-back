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

/**
 * B3: цена по поставщику шлюза — кто реально отвечал (откат на запасного
 * внутри одного разбора), у поставщика без своей цены действует общая.
 */
describe('analysisUsageColumns по поставщикам (B3)', () => {
    const pricing = {
        perThousand: 2,
        byProvider: { vibecode: 1, 'ai-rag': 4 },
    };
    const share = (provider: string, tokens: number) => ({
        provider,
        tokens,
        calls: 1,
    });

    it('цена по поставщику; токены без поставщика — по общей', () => {
        expect(
            analysisUsageColumns(
                {
                    ...usage(3000),
                    provider: 'vibecode',
                    byProvider: [
                        share('vibecode', 1000),
                        share('ai-rag', 1000),
                    ],
                },
                pricing,
            ),
        ).toEqual({ tokens_count: 3000, price: 1 + 4 + 2 });
    });

    it('у поставщика нет своей цены (не задана или 0) — общая', () => {
        expect(
            analysisUsageColumns(
                {
                    ...usage(1000),
                    byProvider: [share('openai-compatible', 1000)],
                },
                pricing,
            ),
        ).toEqual({ tokens_count: 1000, price: 2 });
        expect(
            analysisUsageColumns(
                { ...usage(1000), byProvider: [share('vibecode', 1000)] },
                { perThousand: 2, byProvider: { vibecode: 0 } },
            ),
        ).toEqual({ tokens_count: 1000, price: 2 });
    });

    it('без разбивки — как по числу: токены/1000 × общая цена', () => {
        expect(analysisUsageColumns(usage(18420), pricing)).toEqual({
            tokens_count: 18420,
            price: 36.84,
        });
    });
});
