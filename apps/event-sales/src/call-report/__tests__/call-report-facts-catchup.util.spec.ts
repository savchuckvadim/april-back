import {
    estimateFactsCatchupCost,
    initialFactsCatchupStatus,
    selectFactsCatchupCandidates,
    toFactsCatchupResult,
} from '../use-cases/call-report-facts-catchup.util';

/**
 * Чистые помощники догона: отбор по недостающим группам фактов, статус
 * части с продолжением счётчиков, оценка стоимости с откатом на полные
 * разборы, итог части.
 */
const DOMAIN = 'gsr.bitrix24.ru';
const PERIOD = { domain: DOMAIN, from: '2026-10-01', to: '2026-10-31' };
const NOW = new Date('2026-11-10T06:00:00Z');

const row = (id: string) => ({
    id,
    userId: '317',
    callStartedAt: new Date('2026-10-10T10:00:00Z'),
    createdAt: new Date('2026-10-10T10:30:00Z'),
});

const record = (
    id: string,
    transcriptionId: string,
    userResult: Record<string, unknown>,
    status = 'done',
) => ({
    id,
    type: 'agent-analysis',
    status,
    transcription_id: transcriptionId,
    user_result: userResult,
});

describe('selectFactsCatchupCandidates', () => {
    it('берёт активные разборы без фактов, считает пропуски по причинам', () => {
        const selection = selectFactsCatchupCandidates({
            transcriptions: [row('t-1'), row('t-2'), row('t-3'), row('t-4')],
            records: [
                record('1', 't-1', { weightedScore: 70 }),
                record('2', 't-2', { outcome: null, selfIntro: {} }),
                record('3', 't-3', { weightedScore: 50 }, 'superseded'),
                record('4', 't-4', { outcome: 'refused' }),
            ],
        });

        expect(
            selection.candidates.map(c => [c.transcriptionId, c.gaps]),
        ).toEqual([
            ['t-1', ['movement', 'form']],
            ['t-4', ['form']],
        ]);
        expect(selection.skippedBy).toEqual({
            hasFacts: 1,
            noAnalysis: 0,
            noActive: 1,
        });
    });

    it('звонок без разбора — noAnalysis', () => {
        const selection = selectFactsCatchupCandidates({
            transcriptions: [row('t-9')],
            records: [],
        });

        expect(selection.candidates).toEqual([]);
        expect(selection.skippedBy.noAnalysis).toBe(1);
    });
});

describe('initialFactsCatchupStatus', () => {
    const selection = {
        candidates: [
            {
                transcriptionId: 't-1',
                userId: '317',
                old: record('1', 't-1', {}),
                gaps: ['movement' as const],
            },
        ],
        skippedBy: { hasFacts: 2, noAnalysis: 1, noActive: 0 },
    };

    it('первая часть: счётчики с нуля, total = кандидаты', () => {
        const status = initialFactsCatchupStatus({
            data: PERIOD,
            selection,
            previous: null,
            now: NOW,
        });

        expect(status).toMatchObject({
            ...PERIOD,
            dryRun: false,
            promptVersion: 'facts-v1-2026-11-10',
            part: 1,
            candidates: 1,
            done: 0,
            skipped: 3,
            total: 1,
            concurrency: 3,
            startedAt: NOW.toISOString(),
        });
    });

    it('незаконченный прогон той же версии продолжается: часть + 1, счётчики и startedAt прежние', () => {
        const previous = initialFactsCatchupStatus({
            data: PERIOD,
            selection,
            previous: null,
            now: new Date('2026-11-10T05:00:00Z'),
        });
        previous.done = 5;
        previous.tokens = 500;
        previous.processingMs = 60_000;

        const status = initialFactsCatchupStatus({
            data: PERIOD,
            selection,
            previous,
            now: NOW,
        });

        expect(status).toMatchObject({
            part: 2,
            done: 5,
            tokens: 500,
            processingMs: 60_000,
            total: 6,
            startedAt: '2026-11-10T05:00:00.000Z',
        });
    });

    it('dryRun и законченный прогон не продолжаются', () => {
        const finished = {
            ...initialFactsCatchupStatus({
                data: PERIOD,
                selection,
                previous: null,
                now: NOW,
            }),
            done: 5,
            finished: true,
        };

        expect(
            initialFactsCatchupStatus({
                data: PERIOD,
                selection,
                previous: finished,
                now: NOW,
            }).done,
        ).toBe(0);
        expect(
            initialFactsCatchupStatus({
                data: { ...PERIOD, dryRun: true },
                selection,
                previous: { ...finished, finished: false },
                now: NOW,
            }),
        ).toMatchObject({ part: 1, done: 0, dryRun: true });
    });
});

describe('estimateFactsCatchupCost', () => {
    it('свои записи догона важнее: среднее по ним', () => {
        const estimate = estimateFactsCatchupCost(
            [{ tokens_count: 800, price: 0.4 }],
            [{ tokens_count: 8000, price: 4 }],
            10,
        );

        expect(estimate).toMatchObject({
            basedOnRecords: 1,
            avgTokens: 800,
            estimatedTokens: 8000,
            estimatedPrice: 4,
        });
        expect(estimate.message).toContain('догонам фактов');
    });

    it('без своих записей — четверть полного разбора с пометкой «приблизительно»', () => {
        const estimate = estimateFactsCatchupCost(
            [],
            [{ tokens_count: 8000, price: 4 }],
            10,
        );

        expect(estimate).toMatchObject({
            basedOnRecords: 1,
            avgTokens: 2000,
            avgPrice: 1,
            estimatedTokens: 20000,
            estimatedPrice: 10,
        });
        expect(estimate.message).toContain('Приблизительно');
    });

    it('нет ни того, ни другого — честно «оценки нет»', () => {
        const estimate = estimateFactsCatchupCost([], [], 10);

        expect(estimate.estimatedTokens).toBeNull();
        expect(estimate.message).toContain('Оценки нет');
    });
});

describe('toFactsCatchupResult', () => {
    it('собирает итог части из статуса и времени', () => {
        const status = initialFactsCatchupStatus({
            data: PERIOD,
            selection: {
                candidates: [],
                skippedBy: { hasFacts: 0, noAnalysis: 0, noActive: 0 },
            },
            previous: null,
            now: NOW,
        });

        expect(
            toFactsCatchupResult(status, 0, '42', 1_000, 4_000),
        ).toMatchObject({
            ...PERIOD,
            part: 1,
            processed: 0,
            statusId: '42',
            elapsedMs: 3_000,
        });
    });
});
