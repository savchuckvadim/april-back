import {
    AiAnalyticsFactsCatchupService,
    FACTS_CATCHUP_MESSAGES,
} from '../services/ai-analytics-facts-catchup.service';

/**
 * Админ-сервис догона фактов: постановка джобы части 1 (dryRun — тоже
 * через джобу), честный отказ без очереди и при пустом периоде, статус
 * прогона из сырых записей ais, последний прогон домена.
 */
const DOMAIN = 'gsr.bitrix24.ru';
const PERIOD = { domain: DOMAIN, from: '2026-10-01', to: '2026-10-31' };

const runStatus = {
    ...PERIOD,
    dryRun: false,
    promptVersion: 'facts-v1-2026-11-10',
    part: 1,
    candidates: 10,
    done: 10,
    failed: 0,
    skipped: 3,
    skippedBy: { hasFacts: 3, noAnalysis: 0, noActive: 0 },
    tokens: 7000,
    price: 3.5,
    startedAt: '2026-11-10T06:00:00.000Z',
    updatedAt: '2026-11-10T06:20:00.000Z',
    finished: true,
    lastError: null,
    timeBudgetHit: false,
    continuedWith: null,
    estimate: null,
    total: 10,
    processingMs: 60000,
    etaMinutes: null,
    concurrency: 3,
    stopped: false,
};

const rawRecord = (
    id: string,
    periodKey: string,
    userResult: unknown,
    status = 'done',
) => ({
    id,
    type: 'call-report-facts-catchup-run',
    periodKey,
    status,
    userResult,
});

const makeService = (records: unknown[] = [], withQueue = true) => {
    const store = { readRaw: jest.fn().mockResolvedValue(records) };
    const dispatcher = {
        dispatch: jest.fn().mockResolvedValue({ id: 'bull-1' }),
    };
    const service = new AiAnalyticsFactsCatchupService(
        store as never,
        withQueue ? (dispatcher as never) : undefined,
    );
    return { service, store, dispatcher };
};

describe('AiAnalyticsFactsCatchupService.run', () => {
    it('ставит джобу части 1 в очередь CALL_REPORT с квотой по умолчанию', async () => {
        const { service, dispatcher } = makeService();

        const result = await service.run({ ...PERIOD, dryRun: true });

        expect(dispatcher.dispatch).toHaveBeenCalledWith(
            'call-report',
            'call-report-facts-catchup',
            { ...PERIOD, quota: 500, dryRun: true, part: 1 },
            `call-report-facts-catchup:${DOMAIN}:2026-10-01:2026-10-31:dry-run:part-1`,
            expect.objectContaining({ attempts: 1 }) as unknown,
        );
        expect(result).toMatchObject({
            dispatched: true,
            jobId: 'bull-1',
            quota: 500,
            dryRun: true,
        });
    });

    it('без очереди и при перевёрнутом периоде — отказ с причиной', async () => {
        const { service: noQueue } = makeService([], false);
        const { service, dispatcher } = makeService();

        expect(await noQueue.run(PERIOD)).toMatchObject({
            dispatched: false,
            reason: FACTS_CATCHUP_MESSAGES.runNotWired,
        });
        expect(
            await service.run({
                domain: DOMAIN,
                from: '2026-10-31',
                to: '2026-10-01',
            }),
        ).toMatchObject({
            dispatched: false,
            reason: FACTS_CATCHUP_MESSAGES.emptyRange,
        });
        expect(dispatcher.dispatch).not.toHaveBeenCalled();
    });
});

describe('AiAnalyticsFactsCatchupService.status / latest', () => {
    it('статус периода — активная запись нужной формы; замещённые и чужие пропускаются', async () => {
        const { service } = makeService([
            rawRecord('1', '2026-10-01..2026-10-31', runStatus, 'superseded'),
            rawRecord('2', '2026-10-01..2026-10-31', { broken: true }),
            rawRecord('3', '2026-10-01..2026-10-31', { ...runStatus, done: 7 }),
        ]);

        const status = await service.status(DOMAIN, '2026-10-01', '2026-10-31');

        expect(status).toMatchObject({
            ...PERIOD,
            run: expect.objectContaining({ done: 7 }) as unknown,
            runRecordId: '3',
            runAvailable: true,
            hint: FACTS_CATCHUP_MESSAGES.hint,
        });
    });

    it('прогона не было — run null; latest — самая свежая запись домена', async () => {
        const { service } = makeService([
            rawRecord('1', '2026-09-01..2026-09-30', {
                ...runStatus,
                updatedAt: '2026-10-01T00:00:00.000Z',
            }),
            rawRecord('2', '2026-10-01..2026-10-31', {
                ...runStatus,
                updatedAt: '2026-11-10T06:20:00.000Z',
            }),
        ]);

        expect(
            (await service.status(DOMAIN, '2026-08-01', '2026-08-31')).run,
        ).toBeNull();
        expect((await service.latest(DOMAIN))?.updatedAt).toBe(
            '2026-11-10T06:20:00.000Z',
        );
    });
});
