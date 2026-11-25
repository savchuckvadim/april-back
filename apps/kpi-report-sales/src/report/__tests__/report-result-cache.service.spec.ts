import type { AppCacheService } from '@lib/app-cache';
import { ReportResultCacheService } from '../cache/report-result-cache.service';

const createAppCache = () => ({
    get: jest.fn(() => Promise.resolve(null)),
    set: jest.fn(() => Promise.resolve(undefined)),
    delete: jest.fn(() => Promise.resolve(true)),
});

const createService = (appCache: ReturnType<typeof createAppCache>) =>
    new ReportResultCacheService(appCache as unknown as AppCacheService);

describe('ReportResultCacheService', () => {
    it('drop удаляет конверт по адресу app + domain + key', async () => {
        const appCache = createAppCache();

        await createService(appCache).drop(
            'kpi-report',
            'example.bitrix24.ru',
            'v1:result:2026-10-01_2026-10-31:1_2',
        );

        expect(appCache.delete).toHaveBeenCalledWith({
            app: 'kpi-report',
            domain: 'example.bitrix24.ru',
            key: 'v1:result:2026-10-01_2026-10-31:1_2',
        });
    });

    it('setReady пишет ready-конверт с датой расчёта и переданным сроком хранения', async () => {
        const appCache = createAppCache();
        jest.useFakeTimers().setSystemTime(
            new Date('2026-11-25T09:00:00.000Z'),
        );

        try {
            await createService(appCache).setReady(
                'calling-stat',
                'example.bitrix24.ru',
                'key',
                [{ id: 1 }],
                180,
            );
        } finally {
            jest.useRealTimers();
        }

        expect(appCache.set).toHaveBeenCalledWith({
            app: 'calling-stat',
            domain: 'example.bitrix24.ru',
            key: 'key',
            group: 'result',
            data: {
                status: 'ready',
                data: [{ id: 1 }],
                generatedAt: '2026-11-25T09:00:00.000Z',
            },
            ttlSeconds: 180,
        });
    });

    it('setError пишет error-конверт с текстом ошибки', async () => {
        const appCache = createAppCache();

        await createService(appCache).setError(
            'kpi-report',
            'example.bitrix24.ru',
            'key',
            'Битрикс не ответил',
            120,
        );

        expect(appCache.set).toHaveBeenCalledWith(
            expect.objectContaining({
                app: 'kpi-report',
                key: 'key',
                ttlSeconds: 120,
                data: expect.objectContaining({
                    status: 'error',
                    message: 'Битрикс не ответил',
                }) as Record<string, unknown>,
            }),
        );
    });
});
