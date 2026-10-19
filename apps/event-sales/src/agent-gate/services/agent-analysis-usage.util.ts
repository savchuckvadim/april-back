import type { AgentAnalysisUsageDto } from '../dto/agent-analysis-request.dto';

/**
 * Колонки расхода ais-записи разбора (tokens_count, price) по учёту
 * токенов разбора и цене портала — те же колонки и та же формула, что у
 * снапшота резюме (`цена = токены / 1000 × llm_price_per_1k`), поэтому
 * `GET admin/ai-analytics/cost` считает разборы одним чтением с резюме.
 */

/** Знаков после запятой в стоимости (как у резюме отчёта ОП). */
export const ANALYSIS_PRICE_DECIMALS = 4;
const TOKENS_PER_PRICE_UNIT = 1000;

export interface AnalysisUsageColumns {
    tokens_count?: number;
    price?: number;
}

/** Округление до знаков после запятой без плавающего хвоста. */
function round(value: number, decimals: number): number {
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
}

/**
 * Без учёта токенов (внешний агент, старый разбор) или с нулём токенов —
 * колонки не трогаются (NULL: модель с учётом не звали). Нулевая цена
 * портала даёт price = 0 при заполненных токенах.
 */
export function analysisUsageColumns(
    usage: AgentAnalysisUsageDto | undefined,
    pricePerThousand: number,
): AnalysisUsageColumns {
    if (!usage || usage.tokens <= 0) return {};
    return {
        tokens_count: usage.tokens,
        price: round(
            (usage.tokens / TOKENS_PER_PRICE_UNIT) *
                Math.max(pricePerThousand, 0),
            ANALYSIS_PRICE_DECIMALS,
        ),
    };
}
