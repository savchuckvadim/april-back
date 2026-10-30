import { CallReportSmartBackfillScheduler } from '../cron/call-report-smart-backfill.scheduler';

const DOMAIN = 'g.bitrix24.ru';
/** 19:30 UTC 30.10 — 22:30 по Москве того же дня. */
const NOW = new Date('2026-10-30T19:30:00.000Z');

const makeDeps = (options?: {
    portals?: { portalId: number; domain: string }[];
    disabled?: boolean;
    pending?: number;
}) => {
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
            .mockResolvedValue({ enabled: options?.disabled !== true }),
    };
    const aiService = {
        findSmartWriteCandidates: jest.fn().mockResolvedValue(
            Array.from({ length: options?.pending ?? 0 }, (_, i) => ({
                id: String(i + 1),
            })),
        ),
    };
    const dispatcher = { dispatch: jest.fn().mockResolvedValue({ id: 'j' }) };
    const scheduler = new CallReportSmartBackfillScheduler(
        roster as never,
        settingsService as never,
        aiService as never,
        dispatcher as never,
    );
    return { scheduler, aiService, dispatcher, settingsService };
};

/**
 * Ночной крон дописывания: джоба режима pending ставится только для
 * включённых порталов, у которых есть карточки с неудавшейся записью полей.
 */
describe('CallReportSmartBackfillScheduler', () => {
    afterEach(() => jest.clearAllMocks());

    it('есть ожидающие карточки — одна джоба pending за последние 30 дней по Москве', async () => {
        const { scheduler, aiService, dispatcher } = makeDeps({ pending: 4 });
        await scheduler.tick(NOW);

        expect(aiService.findSmartWriteCandidates).toHaveBeenCalledWith(
            DOMAIN,
            'agent-analysis',
            expect.any(Date),
            expect.any(Date),
            { pendingOnly: true },
        );
        expect(dispatcher.dispatch).toHaveBeenCalledWith(
            'call-report',
            'call-report-smart-backfill',
            {
                domain: DOMAIN,
                mode: 'pending',
                from: '2026-09-30',
                to: '2026-10-30',
                part: 1,
                source: 'cron',
            },
            `call-report-smart-backfill:${DOMAIN}:pending:2026-09-30:2026-10-30:run:part-1`,
            expect.objectContaining({ attempts: 1 }),
        );
    });

    it('ожидающих нет — джоба не ставится (пустых статусов не плодим)', async () => {
        const { scheduler, dispatcher } = makeDeps({ pending: 0 });
        await scheduler.tick(NOW);
        expect(dispatcher.dispatch).not.toHaveBeenCalled();
    });

    it('выключенный портал не опрашивается', async () => {
        const { scheduler, aiService, dispatcher } = makeDeps({
            disabled: true,
            pending: 2,
        });
        await scheduler.tick(NOW);
        expect(aiService.findSmartWriteCandidates).not.toHaveBeenCalled();
        expect(dispatcher.dispatch).not.toHaveBeenCalled();
    });

    it('сбой одного портала не останавливает остальные', async () => {
        const { scheduler, settingsService, dispatcher } = makeDeps({
            portals: [
                { portalId: 1, domain: 'a.bitrix24.ru' },
                { portalId: 2, domain: 'b.bitrix24.ru' },
            ],
            pending: 1,
        });
        settingsService.resolve
            .mockRejectedValueOnce(new Error('settings down'))
            .mockResolvedValueOnce({ enabled: true });
        await scheduler.tick(NOW);
        expect(dispatcher.dispatch).toHaveBeenCalledTimes(1);
        expect(dispatcher.dispatch).toHaveBeenCalledWith(
            expect.anything(),
            expect.anything(),
            expect.objectContaining({ domain: 'b.bitrix24.ru' }),
            expect.anything(),
            expect.anything(),
        );
    });
});
