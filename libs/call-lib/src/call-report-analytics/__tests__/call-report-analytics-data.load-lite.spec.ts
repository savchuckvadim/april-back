import { CallReportAnalyticsDataService } from '../services/call-report-analytics-data.service';
import { CallReportAnalyticsQueryDto } from '../dto/call-report-analytics-query.dto';
import {
    AGENT_ANALYSIS_TYPE,
    CALL_CLASSIFY_TYPE,
} from '../../ai/ai-record-types.const';

const QUERY: CallReportAnalyticsQueryDto = {
    domain: 'test.bitrix24.ru',
    from: '2026-08-01T00:00:00.000Z',
    to: '2026-08-31T23:59:59.000Z',
};

/** Лёгкая строка транскрипции — как отдаёт TranscriptionStoreService.findDoneInPeriodLite. */
const liteRow = (id: string, userId: string | null, durationSec = '600') => ({
    id,
    domain: QUERY.domain,
    callStartedAt: new Date('2026-08-10T10:00:00Z'),
    durationSec,
    entityType: 'deal',
    entityId: '1',
    userId,
    createdAt: new Date('2026-08-10T10:30:00Z'),
});

/** Полная строка транскрипции (с текстом) — для load. */
const fullRow = (id: string, userId: string | null) => ({
    ...liteRow(id, userId),
    text: 'очень длинный текст транскрипта',
});

const aiRecord = (
    transcriptionId: string,
    type: string,
    userResult: unknown,
    result = '',
) => ({
    transcription_id: transcriptionId,
    type,
    result,
    user_result: userResult,
});

/** user_result разбора со всеми полями, которые читает лёгкая строка. */
const FULL_ANALYSIS = {
    callType: 'presentation',
    weightedScore: 62,
    score: 7,
    nextStep: { set: true, description: 'Демо по Zoom', date: '2026-08-12' },
    riskFlags: ['promise', 'conflict'],
    coachingPriority: 'urgent',
    sections: [
        {
            section: 'NEEDS',
            relevance: 2,
            score: 4,
            asWas: 'Вам это вообще надо?',
            alternatives: ['Какие задачи решаете сейчас?', 'Что важнее всего?'],
        },
        { section: 'PRICE', relevance: 0 },
        // Раздел без кода — пропускается.
        { relevance: 1, score: 5 },
    ],
    objections: [
        {
            objection: 'Дорого',
            category: 'price',
            quote: 'Дорого у вас',
            handled: false,
            outcome: 'disengaged',
        },
        { objection: 'Подумаю' },
    ],
    versions: {
        prompt: 'focus-v2.1-2026-09-05',
        rubric: 'sections-7-v1',
        registry: 'abc',
        attribution: '2026-08-24',
        classifier: '2026-09-05',
        junk: 5,
    },
};

const makeService = (options?: {
    lite?: unknown[];
    full?: unknown[];
    ai?: unknown[];
}) => {
    const transcriptionStore = {
        findDoneInPeriod: jest.fn().mockResolvedValue(options?.full ?? []),
        findDoneInPeriodLite: jest.fn().mockResolvedValue(options?.lite ?? []),
    };
    const aiService = {
        findByTranscriptionIds: jest.fn().mockResolvedValue(options?.ai ?? []),
    };
    const service = new CallReportAnalyticsDataService(
        transcriptionStore as never,
        aiService as never,
    );
    return { service, transcriptionStore, aiService };
};

describe('CallReportAnalyticsDataService.loadLite', () => {
    afterEach(() => jest.clearAllMocks());

    it('берёт транскрипции лёгкой выборкой (без текста) и ais по их id', async () => {
        const { service, transcriptionStore, aiService } = makeService({
            lite: [liteRow('1', '7'), liteRow('2', '12')],
        });
        const dataset = await service.loadLite(QUERY);

        expect(transcriptionStore.findDoneInPeriodLite).toHaveBeenCalledWith(
            QUERY.domain,
            new Date(QUERY.from),
            new Date(QUERY.to),
        );
        expect(transcriptionStore.findDoneInPeriod).not.toHaveBeenCalled();
        expect(aiService.findByTranscriptionIds).toHaveBeenCalledWith([
            '1',
            '2',
        ]);
        expect(dataset.totalCalls).toBe(2);
        expect(dataset.rows).toHaveLength(2);
        for (const row of dataset.rows) {
            expect(row).not.toHaveProperty('text');
            expect(row).not.toHaveProperty('analysis');
        }
    });

    it('маппит поля user_result разбора в лёгкую строку', async () => {
        const { service } = makeService({
            lite: [liteRow('1', '7', '720')],
            ai: [aiRecord('1', AGENT_ANALYSIS_TYPE, FULL_ANALYSIS)],
        });
        const { rows } = await service.loadLite(QUERY);

        expect(rows).toEqual([
            {
                transcriptionId: '1',
                managerId: '7',
                callStartedAt: new Date('2026-08-10T10:00:00Z'),
                durationSec: 720,
                callType: 'presentation',
                analysisPresent: true,
                score: 62,
                nextStep: { set: true, date: '2026-08-12' },
                riskFlags: ['promise', 'conflict'],
                coachingPriority: 'urgent',
                sections: [
                    {
                        section: 'NEEDS',
                        relevance: 2,
                        score: 4,
                        asWas: 'Вам это вообще надо?',
                        alternatives: [
                            'Какие задачи решаете сейчас?',
                            'Что важнее всего?',
                        ],
                    },
                    {
                        section: 'PRICE',
                        relevance: 0,
                        score: null,
                        asWas: null,
                        alternatives: [],
                    },
                ],
                objections: [
                    {
                        category: 'price',
                        quote: 'Дорого у вас',
                        handled: false,
                        outcome: 'disengaged',
                    },
                    {
                        category: null,
                        quote: null,
                        handled: null,
                        outcome: null,
                    },
                ],
                versions: {
                    prompt: 'focus-v2.1-2026-09-05',
                    rubric: 'sections-7-v1',
                    registry: 'abc',
                    attribution: '2026-08-24',
                    classifier: '2026-09-05',
                },
                // Маркеры стиля: в этом разборе их нет — все null, а не 0.
                style: {
                    talkRatioPct: null,
                    questionsCount: null,
                    needsFound: null,
                    needsCount: null,
                    presentationDone: null,
                    productsOfferedCount: null,
                    priceDiscussed: null,
                    competitorsCount: null,
                    refusalCategory: null,
                    interlocutorRole: null,
                    productive: null,
                    scriptCompliance: null,
                    callDirection: null,
                },
            },
        ]);
    });

    it('маркеры стиля разбора попадают в лёгкую строку (оси 1, 2, 6)', async () => {
        const { service } = makeService({
            lite: [liteRow('1', '7', '720')],
            ai: [
                aiRecord('1', AGENT_ANALYSIS_TYPE, {
                    ...FULL_ANALYSIS,
                    talkRatioPct: 58,
                    questionsCount: 12,
                    needsFound: true,
                    needs: ['срок', 'бюджет'],
                    presentationDone: false,
                    productsOffered: [],
                    priceDiscussed: true,
                    competitors: ['consultant'],
                    interlocutorRole: 'decision_maker',
                    productive: true,
                }),
            ],
        });

        const { rows } = await service.loadLite(QUERY);

        expect(rows[0].style).toEqual(
            expect.objectContaining({
                talkRatioPct: 58,
                questionsCount: 12,
                needsFound: true,
                needsCount: 2,
                presentationDone: false,
                productsOfferedCount: 0,
                priceDiscussed: true,
                competitorsCount: 1,
                interlocutorRole: 'decision_maker',
                productive: true,
            }),
        );
    });

    it('без разбора: analysisPresent=false, null/[] и тип из классификатора', async () => {
        const { service } = makeService({
            lite: [liteRow('1', '7'), liteRow('2', '7'), liteRow('3', '7', '')],
            ai: [
                aiRecord('1', CALL_CLASSIFY_TYPE, { callType: 'cold' }, 'cold'),
                // Классификатор без user_result — тип из result.
                aiRecord('2', CALL_CLASSIFY_TYPE, null, 'call'),
            ],
        });
        const { rows } = await service.loadLite(QUERY);

        expect(rows.map(row => row.callType)).toEqual(['cold', 'call', null]);
        expect(rows[2].durationSec).toBeNull();
        for (const row of rows) {
            expect(row).toEqual(
                expect.objectContaining({
                    analysisPresent: false,
                    score: null,
                    nextStep: null,
                    riskFlags: [],
                    coachingPriority: null,
                    sections: [],
                    objections: [],
                    versions: null,
                }),
            );
        }
        // Пустые списки — свои у каждой строки, а не общий экземпляр.
        expect(rows[0].riskFlags).not.toBe(rows[1].riskFlags);
    });

    it('старый разбор: score 1–10 приводится к 0–100, nextStep без set → set=false', async () => {
        const { service } = makeService({
            lite: [liteRow('1', '7')],
            ai: [
                aiRecord('1', AGENT_ANALYSIS_TYPE, {
                    callType: 'call',
                    score: 8,
                    nextStep: { description: 'перезвонить' },
                    sections: 'не массив',
                    objections: [null, 'строка'],
                    versions: 'не объект',
                }),
            ],
        });
        const { rows } = await service.loadLite(QUERY);

        expect(rows[0]).toEqual(
            expect.objectContaining({
                analysisPresent: true,
                score: 80,
                nextStep: { set: false, date: null },
                sections: [],
                objections: [],
                versions: null,
            }),
        );
    });

    it('managerIds: строка проходит, если менеджер входит в managerId ИЛИ managerIds', async () => {
        const rows = [
            liteRow('1', '7'),
            liteRow('2', '12'),
            liteRow('3', '99'),
            liteRow('4', null),
        ];
        const ids = (query: CallReportAnalyticsQueryDto) =>
            makeService({ lite: rows })
                .service.loadLite(query)
                .then(dataset => ({
                    ids: dataset.rows.map(row => row.transcriptionId),
                    skipped: dataset.skippedNoManager,
                    total: dataset.totalCalls,
                }));

        await expect(ids({ ...QUERY, managerIds: ['12'] })).resolves.toEqual({
            ids: ['2'],
            skipped: 1,
            total: 4,
        });
        await expect(
            ids({ ...QUERY, managerId: '7', managerIds: ['12'] }),
        ).resolves.toEqual({ ids: ['1', '2'], skipped: 1, total: 4 });
        await expect(ids({ ...QUERY, managerId: '99' })).resolves.toEqual({
            ids: ['3'],
            skipped: 1,
            total: 4,
        });
        // Пустой список — фильтр «никто»: отчёт пуст, а не по всему отделу.
        await expect(ids({ ...QUERY, managerIds: [] })).resolves.toEqual({
            ids: [],
            skipped: 1,
            total: 4,
        });
        // Без фильтра по менеджеру строки без менеджера не отбрасываются.
        await expect(ids(QUERY)).resolves.toEqual({
            ids: ['1', '2', '3', '4'],
            skipped: 0,
            total: 4,
        });
    });

    it('фильтры длительности и типа звонка работают и в лёгкой выборке', async () => {
        const { service } = makeService({
            lite: [liteRow('1', '7', '100'), liteRow('2', '7', '900')],
            ai: [
                aiRecord('1', CALL_CLASSIFY_TYPE, { callType: 'cold' }, 'cold'),
                aiRecord('2', CALL_CLASSIFY_TYPE, { callType: 'call' }, 'call'),
            ],
        });

        const byDuration = await service.loadLite({
            ...QUERY,
            minDurationSec: 300,
        });
        expect(byDuration.rows.map(row => row.transcriptionId)).toEqual(['2']);

        const byType = await service.loadLite({ ...QUERY, callType: 'cold' });
        expect(byType.rows.map(row => row.transcriptionId)).toEqual(['1']);
    });

    it('ais грузятся порциями по 500 id', async () => {
        const many = Array.from({ length: 1200 }, (_, i) =>
            liteRow(String(i + 1), '7'),
        );
        const { service, aiService } = makeService({ lite: many });
        await service.loadLite(QUERY);
        expect(aiService.findByTranscriptionIds).toHaveBeenCalledTimes(3);
        // Третья порция — хвост 1001..1200.
        expect(aiService.findByTranscriptionIds).toHaveBeenNthCalledWith(
            3,
            Array.from({ length: 200 }, (_, i) => String(1001 + i)),
        );
    });
});

describe('CallReportAnalyticsDataService.load (общий фильтр менеджеров)', () => {
    it('полная выборка тоже учитывает managerIds', async () => {
        const { service, transcriptionStore } = makeService({
            full: [fullRow('1', '7'), fullRow('2', '12'), fullRow('3', null)],
            ai: [aiRecord('2', AGENT_ANALYSIS_TYPE, { callType: 'call' })],
        });
        const dataset = await service.load({ ...QUERY, managerIds: ['12'] });

        expect(transcriptionStore.findDoneInPeriodLite).not.toHaveBeenCalled();
        expect(dataset.rows.map(row => row.transcriptionId)).toEqual(['2']);
        expect(dataset.rows[0].analysis).toEqual({ callType: 'call' });
        expect(dataset.skippedNoManager).toBe(1);
        expect(dataset.totalCalls).toBe(3);
    });
});
