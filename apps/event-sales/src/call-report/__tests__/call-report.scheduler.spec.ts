import { CallReportScheduler } from '../cron/call-report.scheduler';
import { CallReportDomainRosterService } from '../cron/call-report-domain-roster.service';

/** Эффективные настройки «всё по умолчанию» — как отдаёт settings-сервис. */
const effectiveSettings = (overrides?: Record<string, unknown>) => ({
    enabled: null,
    deepAnalysisEnabled: true,
    createSmartEnabled: true,
    classifyEnabled: true,
    salesOnly: true,
    minDurationSec: 300,
    windowHours: 25,
    maxPerRun: 10,
    staleMinutes: 90,
    llmModel: 'gigachat',
    deepAnalysisModel: null,
    scanIntervalMinutes: null,
    nightScanIntervalMinutes: null,
    nightStartHour: null,
    nightEndHour: null,
    lastScanAt: null,
    allowedUserIds: null,
    source: 'global',
    ...overrides,
});

const makeDeps = (options: {
    enabled?: string;
    domains?: string;
    lockTaken?: boolean;
    scanError?: string[];
    /** Порталы из БД (findEnabled). */
    dbPortals?: { portalId: number; domain: string }[];
    /** Настройки по домену (resolve). */
    settingsByDomain?: Record<string, Record<string, unknown>>;
}) => {
    const config = {
        get: jest.fn((key: string) => {
            if (key === 'CALL_REPORT_CRON_ENABLED') return options.enabled;
            if (key === 'CALL_REPORT_DOMAINS') return options.domains;
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
    const portalAiSettings = {
        findEnabled: jest.fn().mockResolvedValue(options.dbPortals ?? []),
        markScanned: jest.fn().mockResolvedValue(undefined),
    };
    // Настоящий ростер: тестируем и merge env ∪ БД, а не только тик.
    const roster = new CallReportDomainRosterService(
        config as never,
        portalAiSettings as never,
    );
    const settingsService = {
        resolve: jest.fn((domain: string) =>
            Promise.resolve(
                effectiveSettings(options.settingsByDomain?.[domain]),
            ),
        ),
        globals: jest.fn().mockReturnValue(effectiveSettings()),
    };
    const scheduler = new CallReportScheduler(
        config as never,
        redisService as never,
        store as never,
        scan as never,
        roster,
        settingsService as never,
        portalAiSettings as never,
    );
    return {
        scheduler,
        scan,
        store,
        redisClient,
        portalAiSettings,
        settingsService,
    };
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
        expect(scan.execute).toHaveBeenCalledWith(
            'b.bitrix24.ru',
            expect.objectContaining({
                allowedUserIds: undefined,
                createSmartItem: true,
            }),
        );
        expect(redisClient.del).toHaveBeenCalled();
    });

    it('демо-режим: суффикс domain:222|323 передаёт allowedUserIds в скан', async () => {
        const { scheduler, scan } = makeDeps({
            enabled: '1',
            domains: 'a.bitrix24.ru:222|323, b.bitrix24.ru',
        });
        await scheduler.tick();
        expect(scan.execute).toHaveBeenCalledWith(
            'a.bitrix24.ru',
            expect.objectContaining({ allowedUserIds: [222, 323] }),
        );
        expect(scan.execute).toHaveBeenCalledWith(
            'b.bitrix24.ru',
            expect.objectContaining({ allowedUserIds: undefined }),
        );
    });

    it('демо-список из настроек портала главнее env-суффикса', async () => {
        const { scheduler, scan } = makeDeps({
            enabled: '1',
            domains: 'a.bitrix24.ru:222',
            settingsByDomain: {
                'a.bitrix24.ru': { allowedUserIds: [999] },
            },
        });
        await scheduler.tick();
        expect(scan.execute).toHaveBeenCalledWith(
            'a.bitrix24.ru',
            expect.objectContaining({ allowedUserIds: [999] }),
        );
    });

    it('портал с enabled=true в БД сканируется даже без env-списка', async () => {
        const { scheduler, scan, portalAiSettings } = makeDeps({
            enabled: '1',
            domains: '',
            dbPortals: [{ portalId: 5, domain: 'db.bitrix24.ru' }],
        });
        await scheduler.tick();
        expect(scan.execute).toHaveBeenCalledWith(
            'db.bitrix24.ru',
            expect.anything(),
        );
        // После успешного скана планировщик отмечает lastScanAt портала.
        expect(portalAiSettings.markScanned).toHaveBeenCalledWith(5);
    });

    it('enabled=false в настройках портала выключает его скан', async () => {
        const { scheduler, scan } = makeDeps({
            enabled: '1',
            domains: 'a.bitrix24.ru, b.bitrix24.ru',
            settingsByDomain: { 'a.bitrix24.ru': { enabled: false } },
        });
        await scheduler.tick();
        expect(scan.execute).toHaveBeenCalledTimes(1);
        expect(scan.execute).toHaveBeenCalledWith(
            'b.bitrix24.ru',
            expect.anything(),
        );
    });

    it('scanIntervalMinutes: свежий lastScanAt пропускает портал, старый — нет', async () => {
        const { scheduler, scan } = makeDeps({
            enabled: '1',
            domains: 'fresh.bitrix24.ru, stale.bitrix24.ru',
            settingsByDomain: {
                'fresh.bitrix24.ru': {
                    scanIntervalMinutes: 120,
                    lastScanAt: new Date(Date.now() - 10 * 60_000),
                },
                'stale.bitrix24.ru': {
                    scanIntervalMinutes: 120,
                    lastScanAt: new Date(Date.now() - 180 * 60_000),
                },
            },
        });
        await scheduler.tick();
        expect(scan.execute).toHaveBeenCalledTimes(1);
        expect(scan.execute).toHaveBeenCalledWith(
            'stale.bitrix24.ru',
            expect.anything(),
        );
    });

    it('пороги портала (длительность/окно/лимит) уезжают в скан', async () => {
        const { scheduler, scan } = makeDeps({
            enabled: '1',
            domains: 'a.bitrix24.ru',
            settingsByDomain: {
                'a.bitrix24.ru': {
                    minDurationSec: 60,
                    windowHours: 48,
                    maxPerRun: 3,
                    createSmartEnabled: false,
                },
            },
        });
        await scheduler.tick();
        expect(scan.execute).toHaveBeenCalledWith('a.bitrix24.ru', {
            minDurationSec: 60,
            windowHours: 48,
            maxPerRun: 3,
            allowedUserIds: undefined,
            createSmartItem: false,
            salesOnly: true,
        });
    });

    it('недоступная БД настроек не срывает тик — обходятся env-домены', async () => {
        const { scheduler, scan, portalAiSettings } = makeDeps({
            enabled: '1',
            domains: 'a.bitrix24.ru',
        });
        portalAiSettings.findEnabled.mockRejectedValue(new Error('db down'));
        await scheduler.tick();
        expect(scan.execute).toHaveBeenCalledWith(
            'a.bitrix24.ru',
            expect.anything(),
        );
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
