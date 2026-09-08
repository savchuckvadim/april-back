import {
    MANAGER_HVOST_REPORT_MISSING,
    PresentationAuditService,
} from '../services/presentation-audit.service';

// Writer смарта — реальный класс ходит в crm.item по xmlId; здесь важен
// только вызов updateExisting с полями сверки.
const mockUpdateExisting = jest.fn().mockResolvedValue(undefined);
jest.mock(
    '@lib/call-lib/call-report/services/call-report-smart-writer.service',
    () => ({
        CallReportSmartWriterService: jest.fn().mockImplementation(() => ({
            updateExisting: (...args: unknown[]): Promise<void> =>
                mockUpdateExisting(...args) as Promise<void>,
        })),
    }),
);

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
    /** Записи списков отчётности (ответ listItem.get). */
    listItems?: Record<string, unknown>[];
    /** Раскладка связей звонка — источник сделки-отчёта. */
    family?: Record<string, number | undefined>;
}) => {
    const timeline = { addTimelineComment: jest.fn().mockResolvedValue({}) };
    const api = {
        call: jest.fn().mockResolvedValue({
            result: { ID: '601', ...(options?.dealFields ?? {}) },
        }),
    };
    const listItemGet = jest
        .fn()
        .mockResolvedValue({ result: options?.listItems ?? [] });
    // Список отчётности: комментарий менеджера + выпадающий тип события.
    const salesList = {
        group: 'sales',
        type: 'kpi',
        bitrixId: '10',
        bitrixfields: [
            {
                code: 'sales_kpi_manager_comment',
                name: 'Комментарий менеджера',
                bitrixId: 'PROPERTY_6',
                items: [],
            },
        ],
    };
    const eventTypeField = {
        code: 'sales_kpi_event_type',
        name: 'Тип события',
        bitrixId: 'PROPERTY_2',
        items: [
            {
                code: 'sales_kpi_presentation',
                name: 'Презентация',
                bitrixId: 201,
            },
        ],
    };
    const portal = {
        getEntityFieldByCode: jest.fn((entity: string, code: string) => ({
            code,
        })),
        getFieldBitrixId: jest.fn(
            (field: { code: string }) => `UF_${field.code.toUpperCase()}`,
        ),
        getListByCode: jest.fn(() => salesList),
        getIdByCodeFieldList: jest.fn((list: unknown, code: string): unknown =>
            code === 'event_type' ? eventTypeField : undefined,
        ),
    };
    const pbxService = {
        init: jest.fn().mockResolvedValue({
            bitrix: { timeline, api, listItem: { get: listItemGet } },
            PortalModel: portal,
        }),
    };
    const transcriptionStore = {
        findDoneInPeriod: jest.fn().mockResolvedValue([
            {
                id: '42',
                domain: DOMAIN,
                callStartedAt: new Date('2026-08-14T10:00:00Z'),
                userId: '187',
                activityId: '901',
            },
        ]),
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
    // Сделка-отчёт берётся из раскладки связей (проверена по воронке),
    // а не из сырого ответа агента: комментарий о расхождении уходит в
    // таймлайн этой сделки.
    const dealFamily = {
        resolve: jest
            .fn()
            .mockResolvedValue(options?.family ?? { presentationDealId: 601 }),
    };
    const dealVerify = {
        filterAgentDeals: jest.fn().mockResolvedValue({}),
    };
    const service = new PresentationAuditService(
        pbxService as never,
        transcriptionStore as never,
        aiService as never,
        smartResolver as never,
        vibeCodeClient as never,
        vibeKeyResolver as never,
        dealFamily as never,
        dealVerify as never,
    );
    return { service, timeline, api, aiService, vibeCodeClient, dealVerify };
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

    it('сверка пишется в поля элемента: отчёт менеджера (или «не отчитался»), флаг, пункты, объяснение', async () => {
        mockUpdateExisting.mockClear();
        const { service } = makeDeps({
            dealFields: { UF_OP_PRESENTATION_5K: 'клиент хочет практику' },
        });
        await service.runForDomain(DOMAIN, new Date(0), new Date());
        expect(mockUpdateExisting).toHaveBeenCalledWith(
            expect.objectContaining({
                activityId: '901',
                // Хвост менеджер не заполнил — явный текст вместо пустоты.
                hvostManager: MANAGER_HVOST_REPORT_MISSING,
                fiveKManager: expect.stringContaining('практику') as string,
                auditMismatch: true,
                auditPoints: 'отчёт пуст',
                auditSummary: expect.stringContaining('не заполнен') as string,
            }),
        );
    });

    it('второй источник отчёта: запись списка «Презентация» уходит в промпт сверки', async () => {
        const { service, vibeCodeClient } = makeDeps({
            listItems: [
                {
                    ID: 7001,
                    NAME: 'Презентация Проведено. ООО Ромашка',
                    DATE_CREATE: '2026-08-14T12:00:00Z',
                    PROPERTY_2: { 1: 201 },
                    PROPERTY_6: {
                        2: 'Провёл презентацию, хвост прошли, ждут КП',
                    },
                },
            ],
        });

        await service.runForDomain(DOMAIN, new Date(0), new Date());

        const userContent = (
            vibeCodeClient.structuredCompletion.mock.calls[0] as string[]
        )[1];
        expect(userContent).toContain('СПИСКАХ ОТЧЁТНОСТИ');
        expect(userContent).toContain('id=7001');
        expect(userContent).toContain('тип: Презентация');
        expect(userContent).toContain(
            'Провёл презентацию, хвост прошли, ждут КП',
        );
    });

    it('записей в списках нет — в промпте честное «записей не найдено»', async () => {
        const { service, vibeCodeClient } = makeDeps();
        await service.runForDomain(DOMAIN, new Date(0), new Date());
        const userContent = (
            vibeCodeClient.structuredCompletion.mock.calls[0] as string[]
        )[1];
        expect(userContent).toContain('записей не найдено');
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

    /**
     * Прод-баг 08.09.2026: сделка-отчёт бралась из СЫРОГО ответа агента
     * (DTO проверяет только «целое > 0»), и обвинительный комментарий
     * «есть расхождения» мог уйти в таймлайн чужой сделки.
     */
    it('раскладка и проверка воронки ничего не подтвердили — в сделку не постим', async () => {
        const { service, timeline, dealVerify } = makeDeps({ family: {} });

        await service.runForDomain(DOMAIN, new Date(0), new Date());

        expect(dealVerify.filterAgentDeals).toHaveBeenCalled();
        const dealPosts = timeline.addTimelineComment.mock.calls.filter(
            call =>
                (call as { ENTITY_TYPE: string }[])[0].ENTITY_TYPE === 'deal',
        );
        expect(dealPosts).toHaveLength(0);
    });

    it('сделка-отчёт берётся из раскладки связей, а не из ответа агента', async () => {
        const { service, timeline } = makeDeps({
            family: { presentationDealId: 601 },
        });

        await service.runForDomain(DOMAIN, new Date(0), new Date());

        expect(timeline.addTimelineComment).toHaveBeenCalledWith(
            expect.objectContaining({ ENTITY_ID: 601, ENTITY_TYPE: 'deal' }),
        );
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
