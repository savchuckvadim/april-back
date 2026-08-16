import { PresentationAuditService } from '../services/presentation-audit.service';

const DOMAIN = 'gsr.bitrix24.ru';

const analysisRecord = (overrides?: Record<string, unknown>) => ({
    transcription_id: '42',
    type: 'agent-analysis',
    report_item_id: '173',
    user_result: {
        callType: 'presentation',
        summary: 'Показали Искру и Сутяжник',
        hvostDone: false,
        hvostAnalysis: '1. Вопросы ценности — ✗ не прозвучали',
        fiveKDone: false,
        priceDiscussed: false,
        nextStep: { set: false, description: null, date: null },
        relatedDeals: { mainDealId: 555, presentationDealId: 601 },
        ...overrides,
    },
});

const makeDeps = (options?: {
    records?: Record<string, unknown>[];
    verdict?: Record<string, unknown>;
    dealFields?: Record<string, unknown>;
}) => {
    const timeline = { addTimelineComment: jest.fn().mockResolvedValue({}) };
    const api = {
        call: jest.fn().mockResolvedValue({
            result: { ID: '601', ...(options?.dealFields ?? {}) },
        }),
    };
    const portal = {
        getEntityFieldByCode: jest.fn((entity: string, code: string) => ({
            code,
        })),
        getFieldBitrixId: jest.fn(
            (field: { code: string }) => `UF_${field.code.toUpperCase()}`,
        ),
    };
    const pbxService = {
        init: jest.fn().mockResolvedValue({
            bitrix: { timeline, api },
            PortalModel: portal,
        }),
    };
    const transcriptionStore = {
        findDoneInPeriod: jest
            .fn()
            .mockResolvedValue([{ id: '42', domain: DOMAIN }]),
    };
    const aiService = {
        findByTranscriptionIds: jest
            .fn()
            .mockResolvedValue(options?.records ?? [analysisRecord()]),
        create: jest.fn().mockResolvedValue({ id: '99' }),
    };
    const smartResolver = {
        resolve: jest.fn().mockResolvedValue({ entityTypeId: 1064 }),
    };
    const vibeCodeClient = {
        structuredCompletion: jest.fn().mockResolvedValue(
            options?.verdict ?? {
                comparison: 'Отчёт менеджера не заполнен, а звонок состоялся',
                mismatch: true,
                mismatchPoints: ['отчёт пуст'],
            },
        ),
    };
    const vibeKeyResolver = { resolve: jest.fn().mockResolvedValue('key') };
    const service = new PresentationAuditService(
        pbxService as never,
        transcriptionStore as never,
        aiService as never,
        smartResolver as never,
        vibeCodeClient as never,
        vibeKeyResolver as never,
    );
    return { service, timeline, api, aiService, vibeCodeClient };
};

describe('PresentationAuditService (сверка отчёта менеджера с разбором)', () => {
    afterEach(() => jest.clearAllMocks());

    it('сверяет разбор презентации: ais-запись + таймлайн элемента + сделки при mismatch', async () => {
        const { service, timeline, aiService, vibeCodeClient } = makeDeps();

        const result = await service.runForDomain(
            DOMAIN,
            new Date(0),
            new Date(),
        );

        expect(result.candidates).toBe(1);
        expect(result.audited).toBe(1);
        expect(result.mismatched).toBe(1);
        // Выжимка разбора и отчёт менеджера уходят в LLM.
        const userContent = (
            vibeCodeClient.structuredCompletion.mock.calls[0] as string[]
        )[1];
        expect(userContent).toContain('Хвост пройден: нет');
        expect(userContent).toContain('ОТЧЁТ МЕНЕДЖЕРА');
        // Маркер идемпотентности.
        expect(aiService.create).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'presentation-audit',
                transcription_id: '42',
            }),
        );
        // Таймлайн элемента (DYNAMIC) + таймлайн сделки (mismatch).
        expect(timeline.addTimelineComment).toHaveBeenCalledWith(
            expect.objectContaining({
                ENTITY_ID: 173,
                ENTITY_TYPE: 'DYNAMIC_1064',
            }),
        );
        expect(timeline.addTimelineComment).toHaveBeenCalledWith(
            expect.objectContaining({ ENTITY_ID: 601, ENTITY_TYPE: 'deal' }),
        );
    });

    it('без расхождений — в сделку не постит', async () => {
        const { service, timeline } = makeDeps({
            verdict: {
                comparison: 'Отчёт соответствует разбору',
                mismatch: false,
                mismatchPoints: [],
            },
        });
        const result = await service.runForDomain(
            DOMAIN,
            new Date(0),
            new Date(),
        );
        expect(result.mismatched).toBe(0);
        const dealPosts = timeline.addTimelineComment.mock.calls.filter(
            call =>
                (call as { ENTITY_TYPE: string }[])[0].ENTITY_TYPE === 'deal',
        );
        expect(dealPosts).toHaveLength(0);
    });

    it('уже сверенная транскрипция пропускается (идемпотентность)', async () => {
        const { service, vibeCodeClient } = makeDeps({
            records: [
                analysisRecord(),
                { transcription_id: '42', type: 'presentation-audit' },
            ],
        });
        const result = await service.runForDomain(
            DOMAIN,
            new Date(0),
            new Date(),
        );
        expect(result.skippedDone).toBe(1);
        expect(result.candidates).toBe(0);
        expect(vibeCodeClient.structuredCompletion).not.toHaveBeenCalled();
    });

    it('не-презентационные разборы не сверяются', async () => {
        const { service, vibeCodeClient } = makeDeps({
            records: [
                analysisRecord({ callType: 'cold', relatedDeals: undefined }),
            ],
        });
        const result = await service.runForDomain(
            DOMAIN,
            new Date(0),
            new Date(),
        );
        expect(result.candidates).toBe(0);
        expect(vibeCodeClient.structuredCompletion).not.toHaveBeenCalled();
    });

    it('ошибка одной сверки не роняет прогон', async () => {
        const { service, vibeCodeClient } = makeDeps();
        vibeCodeClient.structuredCompletion.mockRejectedValue(
            new Error('llm down'),
        );
        const result = await service.runForDomain(
            DOMAIN,
            new Date(0),
            new Date(),
        );
        expect(result.failed).toBe(1);
        expect(result.audited).toBe(0);
    });
});
