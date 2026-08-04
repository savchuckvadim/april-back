import { CallReportScheduler } from '../cron/call-report.scheduler';
import { CallReportDomainRosterService } from '../cron/call-report-domain-roster.service';

/** Эффективные настройки: дефолты кода + включённый портал. */
const effectiveSettings = (overrides?: Record<string, unknown>) => ({
    enabled: true,
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
    irrelevantConfidence: 0.7,
    revisorEnabled: false,
    source: 'portal',
    ...overrides,
});

const makeDeps = (options: {
    lockTaken?: boolean;
    scanError?: string[];
    /** Включённые порталы из БД (findEnabled). */
    dbPortals?: { portalId: number; domain: string }[];
    /** Настройки по домену (resolve). */
    settingsByDomain?: Record<string, Record<string, unknown>>;
    dbError?: boolean;
}) => {
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
        findEnabled: options.dbError
            ? jest.fn().mockRejectedValue(new Error('db down'))
            : jest.fn().mockResolvedValue(options.dbPortals ?? []),
        markScanned: jest.fn().mockResolvedValue(undefined),
    };
    // Настоящий ростер: проверяем и его (только БД, fail-open в пустой список).
    const roster = new CallReportDomainRosterService(portalAiSettings as never);
    const settingsService = {
        resolve: jest.fn((domain: string) =>
            Promise.resolve(
                effectiveSettings(options.settingsByDomain?.[domain]),
            ),
        ),
        globals: jest.fn().mockReturnValue(effectiveSettings()),
    };
    const scheduler = new CallReportScheduler(
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

describe('CallReportScheduler (конфигурация — только БД)', () => {
    afterEach(() => jest.clearAllMocks());

    it('включённый в БД портал сканируется с его настройками, lastScanAt отмечается', async () => {
        const { scheduler, scan, portalAiSettings } = makeDeps({
            dbPortals: [{ portalId: 5, domain: 'db.bitrix24.ru' }],
            settingsByDomain: {
                'db.bitrix24.ru': {
                    minDurationSec: 60,
                    windowHours: 48,
                    maxPerRun: 3,
                    createSmartEnabled: false,
                    salesOnly: false,
                    allowedUserIds: [222],
                },
            },
        });
        await scheduler.tick();
        expect(scan.execute).toHaveBeenCalledWith('db.bitrix24.ru', {
            minDurationSec: 60,
            windowHours: 48,
            maxPerRun: 3,
            allowedUserIds: [222],
            createSmartItem: false,
            salesOnly: false,
        });
        expect(portalAiSettings.markScanned).toHaveBeenCalledWith(5);
    });

    it('нет включённых порталов — тик no-op (но реанимация выполняется)', async () => {
        const { scheduler, scan, store } = makeDeps({});
        await scheduler.tick();
        expect(scan.execute).not.toHaveBeenCalled();
        expect(store.reanimateStaleProcessing).toHaveBeenCalled();
    });

    it('недоступная БД — пустой ростер, тик не падает', async () => {
        const { scheduler, scan } = makeDeps({ dbError: true });
        await expect(scheduler.tick()).resolves.toBeUndefined();
        expect(scan.execute).not.toHaveBeenCalled();
    });

    it('занятый Redis-лок пропускает тик (наложение прогонов)', async () => {
        const { scheduler, scan } = makeDeps({
            dbPortals: [{ portalId: 1, domain: 'a.bitrix24.ru' }],
            lockTaken: true,
        });
        await scheduler.tick();
        expect(scan.execute).not.toHaveBeenCalled();
    });

    it('ошибка одного домена не роняет обход остальных', async () => {
        const { scheduler, scan, redisClient } = makeDeps({
            dbPortals: [
                { portalId: 1, domain: 'a.bitrix24.ru' },
                { portalId: 2, domain: 'b.bitrix24.ru' },
            ],
            scanError: ['a.bitrix24.ru'],
        });
        await scheduler.tick();
        expect(scan.execute).toHaveBeenCalledTimes(2);
        expect(redisClient.del).toHaveBeenCalled();
    });

    it('портал, выключенный между выборкой и сканом, пропускается', async () => {
        const { scheduler, scan } = makeDeps({
            dbPortals: [{ portalId: 1, domain: 'a.bitrix24.ru' }],
            settingsByDomain: { 'a.bitrix24.ru': { enabled: false } },
        });
        await scheduler.tick();
        expect(scan.execute).not.toHaveBeenCalled();
    });

    it('scanIntervalMinutes: свежий lastScanAt пропускает портал, старый — нет', async () => {
        const { scheduler, scan } = makeDeps({
            dbPortals: [
                { portalId: 1, domain: 'fresh.bitrix24.ru' },
                { portalId: 2, domain: 'stale.bitrix24.ru' },
            ],
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

    it('перед сканом выполняется реанимация зависших processing', async () => {
        const { scheduler, store } = makeDeps({
            dbPortals: [{ portalId: 1, domain: 'a.bitrix24.ru' }],
        });
        await scheduler.tick();
        expect(store.reanimateStaleProcessing).toHaveBeenCalledWith(
            expect.any(Date),
        );
    });
});
