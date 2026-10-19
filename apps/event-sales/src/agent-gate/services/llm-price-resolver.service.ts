import { Injectable, Logger } from '@nestjs/common';
import {
    EnumPortalAppCode,
    PortalAppSettingsService,
} from '@lib/portal-lib/store/app-settings';
import {
    buildRegistryContext,
    parseAiModelParams,
    resolveNumberParam,
} from '@lib/sales-ai-analytics';

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

    /** Цена за 1 000 токенов, ₽; настройки недоступны — 0 (fail-open). */
    async resolvePerThousand(domain: string): Promise<number> {
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
            return resolveNumberParam('llm_price_per_1k', ctx) ?? 0;
        } catch (error) {
            this.logger.warn(
                `Цена токенов портала ${domain} не прочитана: ${(error as Error).message} — стоимость не считается`,
            );
            return 0;
        }
    }

    constructor(private readonly appSettings: PortalAppSettingsService) {}
}
