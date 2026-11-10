import { Injectable, Logger } from '@nestjs/common';
import {
    EnumPortalAppCode,
    PortalAppSettingsService,
} from '@lib/portal-lib/store/app-settings';
import {
    buildRegistryContext,
    parseAiModelParams,
    resolveNumberParam,
    type AiAnalyticsParamCode,
} from '@lib/sales-ai-analytics';
import type { LlmPricing } from './agent-analysis-usage.util';

/** Код реестра цены поставщика шлюза (B3); поставщик без кода — общая цена. */
export const LLM_PRICE_PARAM_BY_PROVIDER: Readonly<
    Record<string, AiAnalyticsParamCode>
> = {
    vibecode: 'llm_price_per_1k_vibecode',
    'openai-compatible': 'llm_price_per_1k_openai_compatible',
    'ai-rag': 'llm_price_per_1k_ai_rag',
};

/**
 * Цена 1 000 токенов модели для портала — код реестра `llm_price_per_1k`
 * (решение владельца А.6). Тот же путь, что у резюме отчёта ОП
 * (apps/kpi-report-sales, params.loader → brief-job): настройки kpiSales
 * `ai_analytics_model_params` → контекст реестра → resolveNumberParam.
 * Ноль означает «цена не задана»: стоимость тогда ноль, а токены видны.
 *
 * `@Injectable` без bitrix-состояния: только настройки портала.
 */
@Injectable()
export class LlmPriceResolverService {
    private readonly logger = new Logger(LlmPriceResolverService.name);

    /** Общая цена за 1 000 токенов, ₽; настройки недоступны — 0 (fail-open). */
    async resolvePerThousand(domain: string): Promise<number> {
        return (await this.resolvePricing(domain)).perThousand;
    }

    /**
     * Цены портала: общая и по поставщикам шлюза (B3). Поставщик без
     * своей цены считается по общей; настройки недоступны — всё по нулям.
     */
    async resolvePricing(domain: string): Promise<LlmPricing> {
        try {
            const settings = await this.appSettings.resolve(
                domain,
                EnumPortalAppCode.kpiSales,
            );
            const ctx = buildRegistryContext({
                modelParams: parseAiModelParams(
                    settings.aiAnalyticsModelParams,
                ),
            });
            const byProvider: Record<string, number> = {};
            for (const [provider, code] of Object.entries(
                LLM_PRICE_PARAM_BY_PROVIDER,
            )) {
                const price = resolveNumberParam(code, ctx) ?? 0;
                if (price > 0) byProvider[provider] = price;
            }
            return {
                perThousand: resolveNumberParam('llm_price_per_1k', ctx) ?? 0,
                byProvider,
            };
        } catch (error) {
            this.logger.warn(
                `Цена токенов портала ${domain} не прочитана: ${(error as Error).message} — стоимость не считается`,
            );
            return { perThousand: 0, byProvider: {} };
        }
    }

    constructor(private readonly appSettings: PortalAppSettingsService) {}
}
