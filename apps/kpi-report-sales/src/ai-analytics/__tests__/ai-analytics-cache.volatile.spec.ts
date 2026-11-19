import type { AppCacheService } from '@lib/app-cache';
import { AiAnalyticsCacheService } from '../cache/ai-analytics-cache.service';

/**
 * remember с volatile: промах пишет только в Redis (setVolatile), без
 * строки в app_cache; без volatile — как раньше (set, Redis + БД).
 */
describe('AiAnalyticsCacheService.remember — только Redis', () => {
    const KEY =
        'sales-ai-analytics:v1:gsr.bitrix24.ru:call-list:v1:2026-11-01_2026-11-19';

    function harness(cached: unknown = null) {
        const appCache = {
            get: jest.fn().mockResolvedValue(cached),
            set: jest.fn().mockResolvedValue(undefined),
            setVolatile: jest.fn().mockResolvedValue(undefined),
        };
        const service = new AiAnalyticsCacheService(
            appCache as unknown as AppCacheService,
        );
        return { service, appCache };
    }

    it('промах с volatile — вычисляет и пишет только в Redis', async () => {
        const { service, appCache } = harness();
        const result = await service.remember(
            KEY,
            300,
            () => Promise.resolve([1, 2]),
            {
                volatile: true,
            },
        );
        expect(result).toEqual({ value: [1, 2], fromCache: false });
        expect(appCache.setVolatile).toHaveBeenCalledWith({
            app: 'sales-ai-analytics:v1',
            domain: 'gsr.bitrix24.ru',
            key: 'call-list:v1:2026-11-01_2026-11-19',
            data: [1, 2],
            ttlSeconds: 300,
        });
        expect(appCache.set).not.toHaveBeenCalled();
    });

    it('промах без volatile — прежняя запись (Redis + БД)', async () => {
        const { service, appCache } = harness();
        await service.remember(KEY, 300, () => Promise.resolve('x'));
        expect(appCache.set).toHaveBeenCalled();
        expect(appCache.setVolatile).not.toHaveBeenCalled();
    });

    it('попадание — без вычисления и без записи', async () => {
        const { service, appCache } = harness({ cached: true });
        const compute = jest.fn();
        const result = await service.remember(KEY, 300, compute, {
            volatile: true,
        });
        expect(result).toEqual({ value: { cached: true }, fromCache: true });
        expect(compute).not.toHaveBeenCalled();
        expect(appCache.setVolatile).not.toHaveBeenCalled();
    });

    it('ошибка записи в Redis не роняет ответ', async () => {
        const { service, appCache } = harness();
        appCache.setVolatile.mockRejectedValueOnce(new Error('redis down'));
        const result = await service.remember(
            KEY,
            300,
            () => Promise.resolve(5),
            {
                volatile: true,
            },
        );
        expect(result).toEqual({ value: 5, fromCache: false });
    });
});
