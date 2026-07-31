import { CallReportScheduler } from '../cron/call-report.scheduler';

const makeDeps = (options: {
    enabled?: string;
    domains?: string;
    lockTaken?: boolean;
    scanError?: string[];
    /** '0' — выключить создание смарт-элементов кроном. */
    createSmart?: string;
}) => {
    const config = {
        get: jest.fn((key: string) => {
            if (key === 'CALL_REPORT_CRON_ENABLED') return options.enabled;
            if (key === 'CALL_REPORT_DOMAINS') return options.domains;
            if (key === 'CALL_REPORT_CRON_CREATE_SMART')
                return options.createSmart;
            return undefined;
        }),
    };
    const redisClient = {
        set: jest.fn().mockResolvedValue(options.lockTaken ? null : 'OK'),
        del: jest.fn().mockResolvedValue(1),
    };
    const redisService = { getClient: () => redisClient };
    const store = { reanimateStaleProcessing: jest.fn().mockResolvedValue(0) };
    const scan = {
        execute: jest.fn((domain: string) =>
            options.scanError?.includes(domain)
                ? Promise.reject(new Error(`fail ${domain}`))
                : Promise.resolve({ domain, enqueued: 1 }),
        ),
    };
    const scheduler = new CallReportScheduler(
        config as never,
        redisService as never,
        store as never,
        scan as never,
    );
    return { scheduler, scan, store, redisClient };
};

describe('CallReportScheduler', () => {
    afterEach(() => jest.clearAllMocks());

    it('kill-switch: без CALL_REPORT_CRON_ENABLED=1 тик ничего не делает', async () => {
        const { scheduler, scan, store } = makeDeps({
            enabled: '0',
            domains: 'a.bitrix24.ru',
        });
        await scheduler.tick();
        expect(scan.execute).not.toHaveBeenCalled();
        expect(store.reanimateStaleProcessing).not.toHaveBeenCalled();
    });

    it('занятый Redis-лок пропускает тик (наложение прогонов)', async () => {
        const { scheduler, scan } = makeDeps({
            enabled: '1',
            domains: 'a.bitrix24.ru',
            lockTaken: true,
        });
        await scheduler.tick();
        expect(scan.execute).not.toHaveBeenCalled();
    });

    it('ошибка одного домена не роняет обход остальных', async () => {
        const { scheduler, scan, redisClient } = makeDeps({
            enabled: '1',
            domains: 'a.bitrix24.ru, b.bitrix24.ru',
            scanError: ['a.bitrix24.ru'],
        });
        await scheduler.tick();
        expect(scan.execute).toHaveBeenCalledTimes(2);
        expect(scan.execute).toHaveBeenCalledWith('b.bitrix24.ru', {
            allowedUserIds: undefined,
            createSmartItem: true,
        });
        expect(redisClient.del).toHaveBeenCalled();
    });

    it('демо-режим: суффикс domain:222|323 передаёт allowedUserIds в скан', async () => {
        const { scheduler, scan } = makeDeps({
            enabled: '1',
            domains: 'a.bitrix24.ru:222|323, b.bitrix24.ru',
        });
        await scheduler.tick();
        expect(scan.execute).toHaveBeenCalledWith('a.bitrix24.ru', {
            allowedUserIds: [222, 323],
            createSmartItem: true,
        });
        expect(scan.execute).toHaveBeenCalledWith('b.bitrix24.ru', {
            allowedUserIds: undefined,
            createSmartItem: true,
        });
    });

    it('CALL_REPORT_CRON_CREATE_SMART=0 выключает создание смарт-элементов', async () => {
        const { scheduler, scan } = makeDeps({
            enabled: '1',
            domains: 'a.bitrix24.ru',
            createSmart: '0',
        });
        await scheduler.tick();
        expect(scan.execute).toHaveBeenCalledWith('a.bitrix24.ru', {
            allowedUserIds: undefined,
            createSmartItem: false,
        });
    });

    it('перед сканом выполняется реанимация зависших processing', async () => {
        const { scheduler, store } = makeDeps({
            enabled: '1',
            domains: 'a.bitrix24.ru',
        });
        await scheduler.tick();
        expect(store.reanimateStaleProcessing).toHaveBeenCalledWith(
            expect.any(Date),
        );
    });
});
