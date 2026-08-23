import { CallReportCatchUpScheduler } from '../cron/call-report-catch-up.scheduler';

const DOMAIN = 'a.bitrix24.ru';

/** Эффективные настройки портала (только то, что читает догон). */
const settings = (overrides?: Record<string, unknown>) => ({
    enabled: true,
    minDurationSec: 60,
    createSmartEnabled: true,
    salesOnly: true,
    allowedUserIds: [622],
    ...overrides,
});

const makeDeps = (options?: {
    lockTaken?: boolean;
    /** Результаты последовательных проходов скана. */
    passes?: { enqueued: number; truncated?: boolean }[];
    portals?: { portalId: number; domain: string }[];
    disabled?: boolean;
}) => {
    const redisClient = {
        set: jest.fn().mockResolvedValue(options?.lockTaken ? null : 'OK'),
        del: jest.fn().mockResolvedValue(1),
    };
    const redisService = { getClient: () => redisClient };
    const roster = {
        resolve: jest
            .fn()
            .mockResolvedValue(
                options?.portals ?? [{ portalId: 1, domain: DOMAIN }],
            ),
    };
    const settingsService = {
        resolve: jest
            .fn()
            .mockResolvedValue(
                settings(options?.disabled ? { enabled: false } : undefined),
            ),
    };
    const passes = options?.passes ?? [{ enqueued: 0 }];
    let call = 0;
    const scanUseCase = {
        execute: jest.fn(() => {
            const pass = passes[Math.min(call, passes.length - 1)];
            call++;
            return Promise.resolve({
                domain: DOMAIN,
                found: 10,
                alreadyProcessed: 0,
                skippedNonDeal: 0,
                skippedNoAudio: 0,
                skippedNotSales: 0,
                enqueued: pass.enqueued,
                truncated: pass.truncated ?? false,
            });
        }),
    };
    const scheduler = new CallReportCatchUpScheduler(
        redisService as never,
        roster as never,
        settingsService as never,
        scanUseCase as never,
    );
    return { scheduler, scanUseCase, redisClient, settingsService };
};

describe('CallReportCatchUpScheduler (вечерний догон)', () => {
    afterEach(() => jest.clearAllMocks());

    it('идёт широким окном и большим лимитом, с фильтрами портала', async () => {
        const { scheduler, scanUseCase } = makeDeps({
            passes: [{ enqueued: 3 }],
        });
        await scheduler.tick();
        expect(scanUseCase.execute).toHaveBeenCalledWith(
            DOMAIN,
            expect.objectContaining({
                windowHours: 72,
                maxPerRun: 200,
                minDurationSec: 60,
                allowedUserIds: [622],
                salesOnly: true,
            }),
        );
    });

    it('проход без новых звонков завершает догон домена', async () => {
        const { scheduler, scanUseCase } = makeDeps({
            passes: [{ enqueued: 0 }],
        });
        await scheduler.tick();
        expect(scanUseCase.execute).toHaveBeenCalledTimes(1);
    });

    it('проход упёрся в лимит — идёт следующий, до трёх', async () => {
        const { scheduler, scanUseCase } = makeDeps({
            passes: [{ enqueued: 200 }],
        });
        await scheduler.tick();
        expect(scanUseCase.execute).toHaveBeenCalledTimes(3);
    });

    it('частичный проход завершает догон (хвоста больше нет)', async () => {
        const { scheduler, scanUseCase } = makeDeps({
            passes: [{ enqueued: 200 }, { enqueued: 7 }],
        });
        await scheduler.tick();
        expect(scanUseCase.execute).toHaveBeenCalledTimes(2);
    });

    it('выключенный портал пропускается', async () => {
        const { scheduler, scanUseCase } = makeDeps({ disabled: true });
        await scheduler.tick();
        expect(scanUseCase.execute).not.toHaveBeenCalled();
    });

    it('лок занят — догон не запускается', async () => {
        const { scheduler, scanUseCase } = makeDeps({ lockTaken: true });
        await scheduler.tick();
        expect(scanUseCase.execute).not.toHaveBeenCalled();
    });

    it('падение одного домена не останавливает остальные, лок снимается', async () => {
        const { scheduler, scanUseCase, redisClient } = makeDeps({
            portals: [
                { portalId: 1, domain: 'a.bitrix24.ru' },
                { portalId: 2, domain: 'b.bitrix24.ru' },
            ],
        });
        scanUseCase.execute
            .mockRejectedValueOnce(new Error('bitrix down'))
            .mockResolvedValue({
                domain: 'b.bitrix24.ru',
                found: 0,
                alreadyProcessed: 0,
                skippedNonDeal: 0,
                skippedNoAudio: 0,
                skippedNotSales: 0,
                enqueued: 0,
                truncated: false,
            });
        await scheduler.tick();
        expect(scanUseCase.execute).toHaveBeenCalledTimes(2);
        expect(redisClient.del).toHaveBeenCalled();
    });
});
