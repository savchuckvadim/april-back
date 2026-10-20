import {
    BadRequestException,
    ConflictException,
    NotFoundException,
} from '@nestjs/common';
import { EnumPortalAppCode } from '@lib/portal-lib/store/app-settings';
import { MODEL_PARAMS_MESSAGES } from '../launch-model-params';
import { AiAnalyticsLaunchCacheService } from '../services/ai-analytics-launch-cache.service';
import {
    AiAnalyticsLaunchStageFlagsService,
    STAGE_FLAGS_MESSAGES,
} from '../services/ai-analytics-launch-stage-flags.service';
import { backtest, DOMAIN } from './launch-status.fixture';

/**
 * Сервисы кнопок панели запуска: сброс кэша витрины тем же адресом, что у
 * kpi-report-sales, и безопасный мёрж флагов ступеней с гейтом прогноза.
 */
describe('AiAnalyticsLaunchCacheService', () => {
    it('all — сброс без keyPrefix; секция — keyPrefix; итог словами', async () => {
        const appCache = {
            reset: jest
                .fn()
                .mockResolvedValueOnce({ deletedDb: 3, deletedRedis: 5 })
                .mockResolvedValueOnce({ deletedDb: 0, deletedRedis: 0 }),
        };
        const service = new AiAnalyticsLaunchCacheService(appCache as never);

        const all = await service.reset(DOMAIN);
        expect(appCache.reset).toHaveBeenNthCalledWith(1, {
            app: 'sales-ai-analytics:v1',
            domain: DOMAIN,
        });
        expect(all).toMatchObject({
            domain: DOMAIN,
            scope: 'all',
            deletedDb: 3,
            deletedRedis: 5,
        });
        expect(all.message).toContain('Кэш витрины сброшен');

        const pulse = await service.reset(DOMAIN, 'pulse');
        expect(appCache.reset).toHaveBeenNthCalledWith(2, {
            app: 'sales-ai-analytics:v1',
            domain: DOMAIN,
            keyPrefix: 'pulse',
        });
        expect(pulse.message).toContain('уже был пуст');
    });
});

function stageFlagsSetup(options: {
    stored?: unknown;
    status?: 'pass' | 'fail' | 'insufficient' | null;
    portal?: { id: string } | null;
    cacheError?: Error;
}) {
    const portals = {
        getPortalByDomain: jest
            .fn()
            .mockResolvedValue(
                options.portal === undefined ? { id: '7' } : options.portal,
            ),
    };
    const settings =
        options.stored === undefined
            ? {}
            : { ai_analytics_model_params: options.stored };
    const appSettings = {
        listByPortal: jest.fn().mockResolvedValue([
            {
                portalId: 7,
                appCode: EnumPortalAppCode.eventSales,
                settings: {},
            },
            { portalId: 7, appCode: EnumPortalAppCode.kpiSales, settings },
        ]),
        save: jest.fn().mockResolvedValue({}),
    };
    const items =
        options.status === null || options.status === undefined
            ? []
            : [
                  backtest({
                      status: options.status,
                      reasons: ['coverage-below'],
                  }),
              ];
    const phase4 = {
        forecastBacktest: jest
            .fn()
            .mockResolvedValue({ domain: DOMAIN, months: 1, items }),
    };
    const cache = {
        reset: options.cacheError
            ? jest.fn().mockRejectedValue(options.cacheError)
            : jest.fn().mockResolvedValue({}),
    };
    const service = new AiAnalyticsLaunchStageFlagsService(
        portals as never,
        appSettings as never,
        phase4 as never,
        cache as never,
    );
    return { service, appSettings, phase4, cache };
}

describe('AiAnalyticsLaunchStageFlagsService', () => {
    it('pass — флаг ложится в JSON, остальные ключи сохраняются, сохранение — сервисом настроек, кэш витрины сброшен', async () => {
        const { service, appSettings, phase4, cache } = stageFlagsSetup({
            stored: '{"forget_lambda":0.85}',
            status: 'pass',
        });

        const result = await service.apply({ domain: DOMAIN, forecast: true });

        expect(phase4.forecastBacktest).toHaveBeenCalledWith(DOMAIN, 1);
        expect(appSettings.save).toHaveBeenCalledWith(
            7,
            EnumPortalAppCode.kpiSales,
            {
                aiAnalyticsModelParams:
                    '{"forget_lambda":0.85,"forecast_stage_enabled":true}',
            },
        );
        expect(result).toMatchObject({
            domain: DOMAIN,
            forecastStageEnabled: true,
            recommendationsStageEnabled: false,
            changed: ['forecast_stage_enabled'],
            forced: false,
            forecastUrl: '/ai-analytics/model',
        });
        expect(result.message).toContain('Прогноз показывается');
        expect(cache.reset).toHaveBeenCalledWith(DOMAIN, 'all');
    });

    it('сбой сброса кэша не отменяет сохранённый флаг — подсказка в тексте', async () => {
        const { service, appSettings } = stageFlagsSetup({
            status: 'pass',
            cacheError: new Error('Redis недоступен'),
        });
        const result = await service.apply({ domain: DOMAIN, forecast: true });
        expect(appSettings.save).toHaveBeenCalledTimes(1);
        expect(result.forecastStageEnabled).toBe(true);
        expect(result.message).toContain(STAGE_FLAGS_MESSAGES.cacheNotReset);
    });

    it('проверка не пройдена или её не было — 409 с причинами, ничего не сохраняется', async () => {
        for (const status of ['fail', 'insufficient', null] as const) {
            const { service, appSettings } = stageFlagsSetup({ status });
            const call = service.apply({ domain: DOMAIN, forecast: true });
            await expect(call).rejects.toBeInstanceOf(ConflictException);
            expect(appSettings.save).not.toHaveBeenCalled();
        }
        const { service } = stageFlagsSetup({ status: 'fail' });
        await expect(
            service.apply({ domain: DOMAIN, forecast: true }),
        ).rejects.toThrow('реже цели');
    });

    it('force — включение без проверки, гейт не читается', async () => {
        const { service, appSettings, phase4 } = stageFlagsSetup({
            status: 'fail',
        });
        const result = await service.apply({
            domain: DOMAIN,
            forecast: true,
            force: true,
        });
        expect(phase4.forecastBacktest).not.toHaveBeenCalled();
        expect(appSettings.save).toHaveBeenCalledTimes(1);
        expect(result.forced).toBe(true);
        expect(result.message).toContain('принудительно');
    });

    it('битый JSON — 400 с понятным текстом, ничего не перезаписывается', async () => {
        const { service, appSettings } = stageFlagsSetup({
            stored: '{"forget_lambda":',
            status: 'pass',
        });
        const call = service.apply({ domain: DOMAIN, forecast: true });
        await expect(call).rejects.toBeInstanceOf(BadRequestException);
        await expect(
            service.apply({ domain: DOMAIN, forecast: true }),
        ).rejects.toThrow(MODEL_PARAMS_MESSAGES.invalid);
        expect(appSettings.save).not.toHaveBeenCalled();
    });

    it('выключение не проверяет гейт; значение уже такое — без сохранения', async () => {
        const { service, appSettings, phase4, cache } = stageFlagsSetup({
            stored: '{"forecast_stage_enabled":false}',
        });
        const result = await service.apply({ domain: DOMAIN, forecast: false });
        expect(phase4.forecastBacktest).not.toHaveBeenCalled();
        expect(appSettings.save).not.toHaveBeenCalled();
        expect(cache.reset).not.toHaveBeenCalled();
        expect(result.changed).toEqual([]);
        expect(result.message).toContain('ничего не меняли');
    });

    it('флагов нет — 400; портала нет — 404', async () => {
        const { service } = stageFlagsSetup({});
        await expect(service.apply({ domain: DOMAIN })).rejects.toThrow(
            STAGE_FLAGS_MESSAGES.noFlags,
        );
        const missing = stageFlagsSetup({ portal: null });
        await expect(
            missing.service.apply({ domain: DOMAIN, recommendations: true }),
        ).rejects.toBeInstanceOf(NotFoundException);
    });
});
