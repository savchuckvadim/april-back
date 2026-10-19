import { registryDefault } from '@lib/sales-ai-analytics';
import { LlmPriceResolverService } from '../services/llm-price-resolver.service';

/**
 * Цена 1 000 токенов портала: тем же путём, что резюме отчёта ОП —
 * настройки kpiSales (ai_analytics_model_params) → контекст реестра →
 * resolveNumberParam('llm_price_per_1k'); дефолт реестра — 0.
 */
const makeService = (modelParams: string | null) => {
    const appSettings = {
        resolve: jest
            .fn()
            .mockResolvedValue({ aiAnalyticsModelParams: modelParams }),
    };
    return {
        service: new LlmPriceResolverService(appSettings as never),
        appSettings,
    };
};

describe('LlmPriceResolverService', () => {
    it('читает цену из настроек портала kpiSales', async () => {
        const { service, appSettings } = makeService(
            JSON.stringify({ llm_price_per_1k: 2.5 }),
        );
        await expect(
            service.resolvePerThousand('april.bitrix24.ru'),
        ).resolves.toBe(2.5);
        expect(appSettings.resolve).toHaveBeenCalledWith(
            'april.bitrix24.ru',
            'kpi-sales',
        );
    });

    it('портал цену не задал (пусто или битый JSON) — дефолт реестра', async () => {
        expect(registryDefault('llm_price_per_1k')).toBe(0);
        await expect(
            makeService(null).service.resolvePerThousand('a.bitrix24.ru'),
        ).resolves.toBe(0);
        await expect(
            makeService('{oops').service.resolvePerThousand('a.bitrix24.ru'),
        ).resolves.toBe(0);
    });

    it('значение вне диапазона реестра не применяется — дефолт', async () => {
        await expect(
            makeService(
                JSON.stringify({ llm_price_per_1k: 5000 }),
            ).service.resolvePerThousand('a.bitrix24.ru'),
        ).resolves.toBe(0);
    });

    it('настройки недоступны — 0 без исключения (fail-open)', async () => {
        const { service, appSettings } = makeService(null);
        appSettings.resolve.mockRejectedValue(new Error('redis down'));
        await expect(service.resolvePerThousand('a.bitrix24.ru')).resolves.toBe(
            0,
        );
    });
});
