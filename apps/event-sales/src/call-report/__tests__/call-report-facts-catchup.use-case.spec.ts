import { CallReportFactsCatchupStatusService } from '../services/call-report-facts-catchup-status.service';
import { CallReportReanalysisReportService } from '../services/call-report-reanalysis-report.service';
import { CallReportFactsCatchupUseCase } from '../use-cases/call-report-facts-catchup.use-case';

/**
 * Догон фактов, ход прогона на памяти вместо БД: dryRun считает и
 * оценивает без модели; боевой прогон дописывает факты в ту же запись
 * разбора, пишет запись расхода и статус; сбой модели — в счётчик, без
 * продолжения; квота ставит продолжение той же нагрузкой.
 */
const DOMAIN = 'gsr.bitrix24.ru';
const PERIOD = { domain: DOMAIN, from: '2026-10-01', to: '2026-10-31' };
const NOW = new Date('2026-11-10T06:00:00Z');

const containing = (value: Record<string, unknown>): unknown =>
    expect.objectContaining(value) as unknown;

const liteRow = (id: string) => ({
    id,
    domain: DOMAIN,
    callStartedAt: new Date('2026-10-10T10:00:00Z'),
    durationSec: '600',
    entityType: 'deal',
    entityId: '5',
    userId: '317',
    createdAt: new Date('2026-10-10T10:30:00Z'),
});

const oldRecord = (
    id: string,
    transcriptionId: string,
    userResult: Record<string, unknown>,
) => ({
    id,
    type: 'agent-analysis',
    status: 'done',
    transcription_id: transcriptionId,
    user_result: userResult,
    activity_id: 'a-old',
    user_id: 317,
    tokens_count: 0,
    price: 0,
});

const FACTS = {
    outcome: 'refused',
    issues: [],
    prices: [],
    upsell: { attempted: false, kind: null, what: null },
    selfIntro: { introduced: true, companyNamed: true, offerQuestion: 'none' },
    nextStepKind: null,
    objectionTopics: [],
};

interface KeyFilter {
    transcriptionIds?: string[];
    activityIds?: string[];
}

function makeUseCase(
    options: {
        rows?: ReturnType<typeof liteRow>[];
        records?: Record<string, unknown>[];
        recentAnalyses?: { tokens_count: number; price: number }[];
        facts?: 'ok' | 'null' | 'throw';
    } = {},
) {
    const db: Record<string, unknown>[] = [...(options.records ?? [])];
    let nextId = 100;
    const aiService = {
        findByDomainTypeKeys: jest.fn(
            (_domain: string, type: string, keys: KeyFilter) =>
                Promise.resolve(
                    db.filter(
                        record =>
                            record.type === type &&
                            ((keys.transcriptionIds?.includes(
                                String(record.transcription_id),
                            ) ??
                                false) ||
                                (keys.activityIds?.includes(
                                    String(record.activity_id),
                                ) ??
                                    false)),
                    ),
                ),
        ),
        findByDomainTypesInPeriod: jest.fn((_domain: string, types: string[]) =>
            Promise.resolve(
                types.includes('agent-analysis')
                    ? (options.recentAnalyses ?? [])
                    : db.filter(record => types.includes(String(record.type))),
            ),
        ),
        create: jest.fn((dto: Record<string, unknown>) => {
            const record = { id: String(nextId++), ...dto };
            db.push(record);
            return Promise.resolve({ id: record.id });
        }),
        update: jest.fn((id: string, patch: Record<string, unknown>) => {
            const record = db.find(item => item.id === id);
            if (record) Object.assign(record, patch);
            return Promise.resolve({});
        }),
    };
    const facts = {
        run: jest.fn(() => {
            if (options.facts === 'throw') {
                return Promise.reject(new Error('модель лежит'));
            }
            if (options.facts === 'null') return Promise.resolve(null);
            return Promise.resolve({
                row: {},
                facts: FACTS,
                usage: { tokens_count: 700, price: 0.35 },
                model: 'gpt-x',
                provider: 'vibecode',
            });
        }),
    };
    const queueDispatcher = {
        dispatch: jest.fn().mockResolvedValue({ id: null }),
    };
    const useCase = new CallReportFactsCatchupUseCase(
        aiService as never,
        {
            findDoneInPeriodLite: jest
                .fn()
                .mockResolvedValue(options.rows ?? []),
        } as never,
        facts as never,
        new CallReportFactsCatchupStatusService(aiService as never),
        new CallReportReanalysisReportService(aiService as never),
        {
            resolve: jest.fn().mockResolvedValue({ deepAnalysisModel: null }),
        } as never,
        queueDispatcher as never,
    );
    const ofType = (type: string) => db.filter(record => record.type === type);
    return { useCase, db, facts, queueDispatcher, ofType };
}

describe('CallReportFactsCatchupUseCase', () => {
    afterEach(() => jest.restoreAllMocks());

    it('dryRun: кандидаты без фактов и оценка по полным разборам, модель не зовётся', async () => {
        const { useCase, facts, ofType } = makeUseCase({
            rows: [liteRow('t-1'), liteRow('t-2')],
            records: [
                oldRecord('1', 't-1', { weightedScore: 70 }),
                oldRecord('2', 't-2', { outcome: null, selfIntro: {} }),
            ],
            recentAnalyses: [{ tokens_count: 4000, price: 2 }],
        });

        const result = await useCase.execute({ ...PERIOD, dryRun: true }, NOW);

        expect(facts.run).not.toHaveBeenCalled();
        expect(result).toMatchObject({
            dryRun: true,
            candidates: 1,
            skipped: 1,
            done: 0,
        });
        const [status] = ofType('call-report-facts-catchup-run');
        expect(status.user_result).toMatchObject({
            finished: true,
            candidates: 1,
            skippedBy: { hasFacts: 1 },
            estimate: containing({ avgTokens: 1000, estimatedPrice: 0.5 }),
        });
    });

    it('боевой прогон: факты в той же записи, запись расхода, статус и итог', async () => {
        const { useCase, db, facts, queueDispatcher, ofType } = makeUseCase({
            rows: [liteRow('t-1')],
            records: [
                oldRecord('1', 't-1', {
                    weightedScore: 70,
                    versions: { prompt: 'focus-v2.4-2026-10-20' },
                }),
            ],
        });

        const result = await useCase.execute(PERIOD, NOW);

        expect(facts.run).toHaveBeenCalledWith(
            containing({ transcriptionId: 't-1', model: null }),
        );
        const analysis = db.find(record => record.id === '1');
        expect(analysis?.status).toBe('done');
        expect(analysis?.user_result).toMatchObject({
            weightedScore: 70,
            versions: { prompt: 'focus-v2.4-2026-10-20' },
            outcome: 'refused',
            selfIntro: FACTS.selfIntro,
            factsCatchup: containing({
                version: 'facts-v1-2026-11-10',
                model: 'gpt-x',
            }),
        });
        expect(ofType('agent-analysis-facts')).toEqual([
            containing({
                transcription_id: 't-1',
                tokens_count: 700,
                price: 0.35,
                user_id: 317,
                user_result: containing({
                    sourceRecordId: '1',
                    groups: ['movement', 'form'],
                }),
            }),
        ]);
        expect(result).toMatchObject({
            done: 1,
            failed: 0,
            tokens: 700,
            price: 0.35,
            continuedWith: null,
        });
        expect(
            ofType('call-report-facts-catchup-run')[0].user_result,
        ).toMatchObject({
            finished: true,
            done: 1,
            total: 1,
        });
        expect(queueDispatcher.dispatch).not.toHaveBeenCalled();
    });

    it('сбой модели: запись разбора не тронута, сбой в счётчике, продолжения нет', async () => {
        const { useCase, db, queueDispatcher, ofType } = makeUseCase({
            rows: [liteRow('t-1'), liteRow('t-2')],
            records: [
                oldRecord('1', 't-1', { weightedScore: 70 }),
                oldRecord('2', 't-2', { weightedScore: 60 }),
            ],
            facts: 'throw',
        });

        const result = await useCase.execute({ ...PERIOD, quota: 1 }, NOW);

        expect(db.find(record => record.id === '1')?.user_result).toEqual({
            weightedScore: 70,
        });
        expect(result).toMatchObject({
            done: 0,
            failed: 1,
            continuedWith: null,
        });
        expect(
            ofType('call-report-facts-catchup-run')[0].user_result,
        ).toMatchObject({
            lastError: 'модель лежит',
            finished: true,
        });
        expect(queueDispatcher.dispatch).not.toHaveBeenCalled();
    });

    it('ответ модели не той формы — сбой с понятной причиной', async () => {
        const { useCase } = makeUseCase({
            rows: [liteRow('t-1')],
            records: [oldRecord('1', 't-1', { weightedScore: 70 })],
            facts: 'null',
        });

        const result = await useCase.execute(PERIOD, NOW);

        expect(result).toMatchObject({ done: 0, failed: 1 });
    });

    it('квота исчерпана при оставшихся кандидатах — продолжение той же нагрузкой', async () => {
        const { useCase, queueDispatcher, ofType } = makeUseCase({
            rows: [liteRow('t-1'), liteRow('t-2')],
            records: [
                oldRecord('1', 't-1', { weightedScore: 70 }),
                oldRecord('2', 't-2', { weightedScore: 60 }),
            ],
        });

        const result = await useCase.execute({ ...PERIOD, quota: 1 }, NOW);

        const jobId = `call-report-facts-catchup:${DOMAIN}:2026-10-01:2026-10-31:run:part-2`;
        expect(queueDispatcher.dispatch).toHaveBeenCalledWith(
            'call-report',
            'call-report-facts-catchup',
            { ...PERIOD, quota: 1, part: 2 },
            jobId,
            containing({ attempts: 1, removeOnComplete: true }),
        );
        expect(result).toMatchObject({
            processed: 1,
            done: 1,
            continuedWith: jobId,
        });
        expect(
            ofType('call-report-facts-catchup-run')[0].user_result,
        ).toMatchObject({
            finished: false,
            continuedWith: jobId,
        });
    });
});
