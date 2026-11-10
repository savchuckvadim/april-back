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

/**
 * Цены портала за 1 000 токенов: общая (`llm_price_per_1k`) и по
 * поставщикам шлюза (`llm_price_per_1k_<provider>`, B3); у поставщика без
 * своей цены (0 или нет) действует общая.
 */
export interface LlmPricing {
    perThousand: number;
    byProvider: Readonly<Record<string, number>>;
}

const priceFor = (pricing: LlmPricing, provider: string): number => {
    const own = pricing.byProvider[provider];
    return own !== undefined && own > 0
        ? own
        : Math.max(pricing.perThousand, 0);
};

/** Стоимость по разбивке на поставщиков; токены без поставщика — по общей цене. */
function priceByProvider(
    usage: AgentAnalysisUsageDto,
    pricing: LlmPricing,
): number {
    const byProvider = usage.byProvider ?? [];
    const attributed = byProvider.reduce(
        (sum, entry) =>
            sum +
            (entry.tokens / TOKENS_PER_PRICE_UNIT) *
                priceFor(pricing, entry.provider),
        0,
    );
    const attributedTokens = byProvider.reduce(
        (sum, entry) => sum + entry.tokens,
        0,
    );
    const rest = Math.max(usage.tokens - attributedTokens, 0);
    return (
        attributed +
        (rest / TOKENS_PER_PRICE_UNIT) * Math.max(pricing.perThousand, 0)
    );
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
    pricing: number | LlmPricing,
): AnalysisUsageColumns {
    if (!usage || usage.tokens <= 0) return {};
    const price =
        typeof pricing === 'number'
            ? (usage.tokens / TOKENS_PER_PRICE_UNIT) * Math.max(pricing, 0)
            : priceByProvider(usage, pricing);
    return {
        tokens_count: usage.tokens,
        price: round(price, ANALYSIS_PRICE_DECIMALS),
    };
}
