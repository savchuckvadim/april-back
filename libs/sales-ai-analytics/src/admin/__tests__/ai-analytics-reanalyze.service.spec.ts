import {
    AiAnalyticsReanalyzeService,
    REANALYZE_MESSAGES,
} from '../services/ai-analytics-reanalyze.service';

/**
 * Админ-сервис переразбора: постановка джобы части 1 (dryRun — тоже
 * через джобу), честный отказ без очереди и при пустом периоде, статус
 * прогона с отчётами согласия версий из сырых записей ais.
 */
const DOMAIN = 'gsr.bitrix24.ru';
const PERIOD = { domain: DOMAIN, from: '2026-09-01', to: '2026-10-19' };

const runStatus = {
    ...PERIOD,
    userIds: [317],
    dryRun: false,
    promptVersion: 'focus-v2.4-2026-10-20',
    series: '2026-09-25',
    part: 1,
    candidates: 10,
    done: 10,
    failed: 0,
    skipped: 3,
    skippedBy: { upToDate: 3, noAnalysis: 0, notInRoster: 0, noActive: 0 },
    tokens: 12000,
    price: 18,
    startedAt: '2026-10-20T01:00:00.000Z',
    updatedAt: '2026-10-20T01:40:00.000Z',
    finished: true,
    lastError: null,
    timeBudgetHit: false,
    continuedWith: null,
    estimate: null,
};

const agreementReport = {
    key: '2026-09-08->focus-v2.4-2026-10-20',
    fromSeries: '2026-09-08',
    toPromptVersion: 'focus-v2.4-2026-10-20',
    pairs: 10,
    overall: {
        promptVersion: 'x',
        pairs: 10,
        budget: { quota: 300, withinQuota: true },
        categories: [],
        scales: [
            {
                code: 'score',
                n: 10,
                icc: { icc21: 0.7, icc31: 0.8 },
                tost: null,
                sigma: 0.5,
            },
        ],
        objections: { pairsWithObjections: 0, micro: {}, byCode: [] },
        sigmaLlm: {
            scale: 'score',
            measured: 0.5,
            n: 10,
            minPairs: 300,
            configured: 0.8,
            source: 'configured',
            value: 0.8,
        },
    },
    byOldPromptVersion: [
        {
            promptVersion: 'focus-v2.2-2026-09-08',
            pairs: 10,
            icc: { icc21: 0.7, icc31: 0.8 },
            sigma: 0.5,
            meanShift: -0.3,
            sectionShifts: [{ code: 'section_NEEDS', n: 9, meanShift: -0.4 }],
        },
    ],
};

const raw = (over: Record<string, unknown>) => ({
    id: '1',
    type: 'call-report-reanalysis-run',
    domain: DOMAIN,
    periodKey: '2026-09-01..2026-10-19',
    managerId: null,
    status: 'done',
    createdAt: new Date('2026-10-20T01:40:00.000Z'),
    tokensCount: 0,
    price: 0,
    userResult: runStatus,
    ...over,
});

describe('AiAnalyticsReanalyzeService.run', () => {
    it('без очереди — отказ с причиной; перевёрнутый или битый период — reanalyze-empty-range', async () => {
        const service = new AiAnalyticsReanalyzeService({} as never);
        await expect(service.run(PERIOD)).resolves.toMatchObject({
            dispatched: false,
            jobId: null,
            reason: REANALYZE_MESSAGES.runNotWired,
            quota: 300,
        });
        const dispatch = jest.fn();
        const wired = new AiAnalyticsReanalyzeService(
            {} as never,
            { dispatch } as never,
        );
        await expect(
            wired.run({ ...PERIOD, from: '2026-11-01' }),
        ).resolves.toMatchObject({
            dispatched: false,
            reason: REANALYZE_MESSAGES.emptyRange,
        });
        await expect(
            wired.run({ ...PERIOD, to: 'вчера' }),
        ).resolves.toMatchObject({
            dispatched: false,
            reason: REANALYZE_MESSAGES.emptyRange,
        });
        expect(dispatch).not.toHaveBeenCalled();
    });

    it('с очередью — джоба CALL_REPORT_REANALYZE части 1 в очереди CALL_REPORT, dryRun в jobId', async () => {
        const dispatch = jest.fn().mockResolvedValue({ id: undefined });
        const service = new AiAnalyticsReanalyzeService(
            {} as never,
            { dispatch } as never,
        );
        const result = await service.run({
            ...PERIOD,
            userIds: [317],
            quota: 50,
            dryRun: true,
            requestedBy: 'admin',
        });

        const jobId = `call-report-reanalyze:${DOMAIN}:2026-09-01:2026-10-19:dry-run:part-1`;
        expect(dispatch).toHaveBeenCalledWith(
            'call-report',
            'call-report-reanalyze',
            {
                ...PERIOD,
                quota: 50,
                dryRun: true,
                part: 1,
                userIds: [317],
                requestedBy: 'admin',
            },
            jobId,
            expect.objectContaining({
                attempts: 1,
                removeOnComplete: true,
                removeOnFail: true,
            }),
        );
        expect(result).toEqual({
            ...PERIOD,
            dryRun: true,
            dispatched: true,
            jobId,
            reason: null,
            quota: 50,
        });
    });
});

describe('AiAnalyticsReanalyzeService.status', () => {
    it('статус периода — активная запись ключа; отчёты согласия — активные записи конверта, в плоском виде', async () => {
        const store = {
            readRaw: jest
                .fn()
                .mockResolvedValueOnce([
                    raw({ id: '3', periodKey: '2026-08-01..2026-08-31' }),
                    raw({ id: '2', status: 'superseded' }),
                    raw({ id: '1' }),
                ])
                .mockResolvedValueOnce([
                    {
                        ...raw({
                            id: '9',
                            type: 'ai-analytics-version-agreement',
                            periodKey: agreementReport.key,
                        }),
                        userResult: {
                            managerId: null,
                            paramsVersion: 'focus-v2.4-2026-10-20',
                            inputsHash: 'h',
                            generatedAt: '2026-10-20T01:40:00.000Z',
                            payload: agreementReport,
                        },
                    },
                    raw({
                        id: '8',
                        type: 'ai-analytics-version-agreement',
                        status: 'superseded',
                    }),
                    raw({
                        id: '7',
                        type: 'ai-analytics-version-agreement',
                        userResult: { что: 'угодно' },
                    }),
                ]),
        };
        const service = new AiAnalyticsReanalyzeService(
            store as never,
            { dispatch: jest.fn() } as never,
        );

        const result = await service.status(DOMAIN, '2026-09-01', '2026-10-19');

        expect(result.run).toEqual(runStatus);
        expect(result.runRecordId).toBe('1');
        expect(result.agreement).toEqual([
            {
                id: '9',
                key: agreementReport.key,
                fromSeries: '2026-09-08',
                toPromptVersion: 'focus-v2.4-2026-10-20',
                pairs: 10,
                sigmaLlm: 0.8,
                sigmaSource: 'configured',
                icc21: 0.7,
                byOldPromptVersion: [
                    {
                        promptVersion: 'focus-v2.2-2026-09-08',
                        pairs: 10,
                        icc21: 0.7,
                        icc31: 0.8,
                        sigma: 0.5,
                        meanShift: -0.3,
                        sectionShifts: [
                            { code: 'section_NEEDS', n: 9, meanShift: -0.4 },
                        ],
                    },
                ],
                generatedAt: '2026-10-20T01:40:00.000Z',
            },
        ]);
        expect(result.runAvailable).toBe(true);
        expect(result.hint).toBe(REANALYZE_MESSAGES.hint);
    });

    it('прогона не было — run null, отчётов нет', async () => {
        const store = { readRaw: jest.fn().mockResolvedValue([]) };
        const service = new AiAnalyticsReanalyzeService(store as never);
        const result = await service.status(DOMAIN, '2026-09-01', '2026-10-19');
        expect(result).toMatchObject({
            run: null,
            runRecordId: null,
            agreement: [],
            runAvailable: false,
        });
    });
});

describe('AiAnalyticsReanalyzeService.latest', () => {
    it('последний прогон по любому периоду — по свежему updatedAt; замещённые и чужая форма пропускаются', async () => {
        const older = { ...runStatus, updatedAt: '2026-10-19T10:00:00.000Z' };
        const newer = {
            ...runStatus,
            from: '2026-07-21',
            updatedAt: '2026-10-20T09:00:00.000Z',
        };
        const store = {
            readRaw: jest.fn().mockResolvedValue([
                raw({ id: '1', userResult: older }),
                raw({
                    id: '2',
                    status: 'superseded',
                    userResult: {
                        ...runStatus,
                        updatedAt: '2026-10-21T00:00:00.000Z',
                    },
                }),
                raw({ id: '3', userResult: { что: 'угодно' } }),
                raw({ id: '4', userResult: newer }),
            ]),
        };
        const service = new AiAnalyticsReanalyzeService(store as never);

        await expect(service.latest(DOMAIN)).resolves.toEqual(newer);
        expect(store.readRaw).toHaveBeenCalledWith(DOMAIN, [
            'call-report-reanalysis-run',
        ]);
    });

    it('прогонов не было — null', async () => {
        const store = { readRaw: jest.fn().mockResolvedValue([]) };
        const service = new AiAnalyticsReanalyzeService(store as never);
        await expect(service.latest(DOMAIN)).resolves.toBeNull();
    });
});
