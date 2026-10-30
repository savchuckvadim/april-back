import {
    AiAnalyticsSmartBackfillService,
    SMART_BACKFILL_MESSAGES,
} from '../services/ai-analytics-smart-backfill.service';

/**
 * Админ-сервис дописывания полей карточек: постановка джобы части 1 с
 * окном по умолчанию, честный отказ без очереди и при пустом периоде,
 * статус с последним прогоном и числом ожидающих карточек.
 */
const DOMAIN = 'garantservisvoronezh.bitrix24.ru';
const NOW = new Date('2026-10-30T09:00:00.000Z');

const runStatus = (over: Record<string, unknown> = {}) => ({
    domain: DOMAIN,
    mode: 'period',
    from: '2026-10-13',
    to: '2026-10-30',
    dryRun: false,
    source: 'admin',
    part: 1,
    candidates: 430,
    done: 410,
    failed: 2,
    missing: 1,
    skipped: 17,
    skippedBy: { noSmartItem: 12, superseded: 5, noPayload: 0 },
    startedAt: '2026-10-30T08:00:00.000Z',
    updatedAt: '2026-10-30T08:40:00.000Z',
    finished: true,
    lastError: null,
    timeBudgetHit: false,
    continuedWith: null,
    ...over,
});

const raw = (over: Record<string, unknown>) => ({
    id: '1',
    type: 'call-report-smart-backfill-run',
    domain: DOMAIN,
    periodKey: 'period:2026-10-13..2026-10-30',
    managerId: null,
    status: 'done',
    createdAt: NOW,
    tokensCount: 0,
    price: 0,
    userResult: runStatus(),
    ...over,
});

const makeService = (options?: {
    dispatcher?: boolean;
    records?: unknown[];
    pending?: number;
}) => {
    const store = {
        readRaw: jest.fn().mockResolvedValue(options?.records ?? []),
    };
    const aiService = {
        findSmartWriteCandidates: jest.fn().mockResolvedValue(
            Array.from({ length: options?.pending ?? 0 }, (_, i) => ({
                id: String(i + 1),
            })),
        ),
    };
    const dispatch = jest.fn().mockResolvedValue({ id: undefined });
    const service = new AiAnalyticsSmartBackfillService(
        store as never,
        aiService as never,
        options?.dispatcher === false ? undefined : ({ dispatch } as never),
    );
    return { service, dispatch, aiService, store };
};

describe('AiAnalyticsSmartBackfillService.run', () => {
    it('без очереди — отказ с причиной; перевёрнутый период — smart-backfill-empty-range', async () => {
        const { service } = makeService({ dispatcher: false });
        await expect(
            service.run({
                domain: DOMAIN,
                from: '2026-10-13',
                to: '2026-10-30',
            }),
        ).resolves.toMatchObject({
            dispatched: false,
            jobId: null,
            reason: SMART_BACKFILL_MESSAGES.runNotWired,
            quota: 150,
        });
        const wired = makeService();
        await expect(
            wired.service.run({
                domain: DOMAIN,
                from: '2026-11-01',
                to: '2026-10-30',
            }),
        ).resolves.toMatchObject({
            dispatched: false,
            reason: SMART_BACKFILL_MESSAGES.emptyRange,
        });
        expect(wired.dispatch).not.toHaveBeenCalled();
    });

    it('период не задан — последние 30 дней по сегодня в поясе Москвы; джоба части 1 от админки', async () => {
        const { service, dispatch } = makeService();
        const result = await service.run({ domain: DOMAIN, dryRun: true }, NOW);

        const jobId = `call-report-smart-backfill:${DOMAIN}:period:2026-09-30:2026-10-30:dry-run:part-1`;
        expect(dispatch).toHaveBeenCalledWith(
            'call-report',
            'call-report-smart-backfill',
            {
                domain: DOMAIN,
                mode: 'period',
                from: '2026-09-30',
                to: '2026-10-30',
                quota: 150,
                dryRun: true,
                part: 1,
                source: 'admin',
            },
            jobId,
            expect.objectContaining({ attempts: 1 }),
        );
        expect(result).toMatchObject({
            mode: 'period',
            from: '2026-09-30',
            to: '2026-10-30',
            dispatched: true,
            jobId,
            reason: null,
        });
    });

    it('режим pending и явные квота/период уходят в нагрузку как есть', async () => {
        const { service, dispatch } = makeService();
        await service.run(
            {
                domain: DOMAIN,
                mode: 'pending',
                from: '2026-10-01',
                to: '2026-10-31',
                quota: 20,
                requestedBy: 'admin',
            },
            NOW,
        );
        expect(dispatch).toHaveBeenCalledWith(
            'call-report',
            'call-report-smart-backfill',
            expect.objectContaining({
                mode: 'pending',
                from: '2026-10-01',
                to: '2026-10-31',
                quota: 20,
                dryRun: false,
                requestedBy: 'admin',
            }),
            expect.stringContaining(
                ':pending:2026-10-01:2026-10-31:run:part-1',
            ),
            expect.anything(),
        );
    });
});

describe('AiAnalyticsSmartBackfillService.status', () => {
    it('прогон по ключу, самый свежий прогон домена, замещённые и чужая форма мимо, ожидающие — из ais', async () => {
        const fresher = runStatus({
            mode: 'pending',
            from: '2026-10-01',
            to: '2026-10-31',
            source: 'cron',
            updatedAt: '2026-10-31T19:35:00.000Z',
        });
        const { service, aiService } = makeService({
            pending: 3,
            records: [
                raw({ id: '1' }),
                raw({
                    id: '2',
                    periodKey: 'pending:2026-10-01..2026-10-31',
                    userResult: fresher,
                }),
                raw({
                    id: '3',
                    status: 'superseded',
                    userResult: runStatus({ done: 1 }),
                }),
                raw({ id: '4', periodKey: 'x', userResult: { foo: 1 } }),
            ],
        });

        const result = await service.status(
            DOMAIN,
            { mode: 'period', from: '2026-10-13', to: '2026-10-30' },
            NOW,
        );

        expect(result.run).toMatchObject({ mode: 'period', done: 410 });
        expect(result.latest).toMatchObject({
            mode: 'pending',
            source: 'cron',
        });
        expect(result.pending).toBe(3);
        expect(result.pendingLookbackDays).toBe(30);
        expect(result.runAvailable).toBe(true);
        expect(aiService.findSmartWriteCandidates).toHaveBeenCalledWith(
            DOMAIN,
            'agent-analysis',
            expect.any(Date),
            expect.any(Date),
            { pendingOnly: true },
        );
    });

    it('без ключа — run null, прогонов не было — latest null, без очереди runAvailable false', async () => {
        const { service } = makeService({ dispatcher: false });
        const result = await service.status(DOMAIN, undefined, NOW);
        expect(result).toMatchObject({
            run: null,
            latest: null,
            pending: 0,
            runAvailable: false,
            hint: SMART_BACKFILL_MESSAGES.hint,
        });
    });
});
