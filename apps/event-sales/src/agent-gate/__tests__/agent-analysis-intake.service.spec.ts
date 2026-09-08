import { AgentAnalysisIntakeService } from '../services/agent-analysis-intake.service';
import { AgentCallAnalysisDto } from '../dto/agent-analysis-request.dto';
import { CallReportSmartWriterService } from '@lib/call-lib/call-report/services/call-report-smart-writer.service';

jest.mock(
    '@lib/call-lib/call-report/services/call-report-smart-writer.service',
);

const MockedWriter = CallReportSmartWriterService as jest.MockedClass<
    typeof CallReportSmartWriterService
>;

const ROW = {
    id: '42',
    dedupKey: 'test.bitrix24.ru:101',
    domain: 'test.bitrix24.ru',
    activityId: '101',
    callId: 'ext_1',
    callStartedAt: new Date('2026-07-21T10:00:00Z'),
    provider: 'yandex',
    status: 'done',
    text: 'текст',
    durationSec: '700',
    entityType: 'deal',
    entityId: '555',
    userId: '7',
    createdAt: new Date(),
    updatedAt: new Date(),
};

const DTO: AgentCallAnalysisDto = {
    callType: 'presentation',
    summary: 'Итог анализа агента',
    needsFound: true,
    needs: ['практика 44-ФЗ'],
    presentationDone: true,
    score: 8,
};

interface Options {
    smartInstalled?: boolean;
    /** PORTAL_USER_ID телефонии в строке транскрибации (владелец звонка). */
    userId?: string | null;
    /** ASSIGNED_BY_ID сделки-владельца звонка — намеренно ЧУЖОЙ. */
    assignedById?: string;
    /** Раскладка связей: ownerCategoryCode задаёт «своя ли воронка». */
    family?: Record<string, unknown>;
    /** Что осталось от догадок агента после проверки воронок. */
    verified?: Record<string, number | undefined>;
}

const makeDeps = (options?: Options) => {
    // null — «телефония владельца не дала», отличаем от «опция не задана».
    const row = {
        ...ROW,
        userId: options?.userId === undefined ? ROW.userId : options.userId,
    };
    const store = { findPipelineById: jest.fn().mockResolvedValue(row) };
    const aiService = {
        create: jest.fn().mockResolvedValue({ id: '18' }),
        update: jest.fn().mockResolvedValue({ id: '18' }),
        findByTranscriptionIds: jest.fn().mockResolvedValue([
            { type: 'call-resume', result: 'резюме gigachat' },
            { type: 'call-recomendation', result: 'советы gigachat' },
        ]),
    };
    const timeline = { addTimelineComment: jest.fn().mockResolvedValue({}) };
    const pbxService = {
        init: jest.fn().mockResolvedValue({
            bitrix: {
                api: {
                    call: jest.fn().mockResolvedValue({
                        result: {
                            COMPANY_ID: '33',
                            CONTACT_ID: '44',
                            // Ответственный сделки НЕ равен владельцу звонка:
                            // иначе тест зелёный при любом из двух источников
                            // и прод-баг 08.09.2026 остаётся незаметным.
                            ASSIGNED_BY_ID: options?.assignedById ?? '317',
                        },
                    }),
                },
                timeline,
            },
        }),
    };
    const resolver = {
        resolve: jest.fn().mockResolvedValue(
            options?.smartInstalled === false
                ? null
                : {
                      entityTypeId: 1056,
                      typeId: 128,
                      ufKeyByCode: {},
                      enumItems: {},
                  },
        ),
    };
    const addItem = jest.fn().mockResolvedValue(7);
    MockedWriter.mockImplementation(() => ({ addItem }) as never);
    // Раскладка сделок по воронкам: владелец звонка — основная сделка.
    const dealFamily = {
        resolve: jest
            .fn()
            .mockResolvedValue(options?.family ?? { mainDealId: 555 }),
    };
    // Проверка догадок агента по воронкам: по умолчанию пропускает всё,
    // отдельные кейсы подменяют результат.
    const dealVerify = {
        filterAgentDeals: jest.fn(
            (
                _domain: string,
                guess: Record<string, number | undefined>,
            ): Promise<Record<string, number | undefined>> =>
                Promise.resolve(options?.verified ?? guess),
        ),
    };

    const service = new AgentAnalysisIntakeService(
        store as never,
        aiService as never,
        pbxService as never,
        resolver as never,
        dealFamily as never,
        dealVerify as never,
    );
    return { service, aiService, addItem, timeline, dealFamily, dealVerify };
};

describe('AgentAnalysisIntakeService', () => {
    afterEach(() => jest.clearAllMocks());

    it('сохраняет анализ в ais, создаёт смарт-элемент со связями и дублирует в таймлайн', async () => {
        const { service, aiService, addItem, timeline } = makeDeps();
        const result = await service.intake('42', 'claw-main', {
            ...DTO,
            sections: [
                { section: 'NEEDS', relevance: 100, score: 8 },
                { section: 'PRICE', relevance: 0 },
            ],
            relatedDeals: { presentationDealId: 601 },
            kpiItem: { itemId: '9001', status: 'confirmed' },
        } as never);

        expect(aiService.create).toHaveBeenCalledWith(
            expect.objectContaining({
                provider: 'claw-main',
                type: 'agent-analysis',
                result: DTO.summary,
                transcription_id: '42',
                domain: 'test.bitrix24.ru',
            }),
        );
        expect(addItem).toHaveBeenCalledWith(
            expect.objectContaining({
                activityId: '101',
                companyId: 33,
                contactId: 44,
                managerId: 7,
                callType: 'presentation',
                transcript: 'текст',
                mainDealId: 555,
                presentationDealId: 601,
                kpiItem: { itemId: '9001', status: 'confirmed' },
                resumeGigachat: 'резюме gigachat',
                recomendationGigachat: 'советы gigachat',
                agentName: 'claw-main',
            }),
        );
        expect(aiService.update).toHaveBeenCalledWith('18', {
            report_item_id: '7',
            in_report: true,
        });
        expect(timeline.addTimelineComment).toHaveBeenCalledWith(
            expect.objectContaining({
                ENTITY_ID: 555,
                ENTITY_TYPE: 'deal',
                AUTHOR_ID: '7',
            }),
        );
        expect(result).toEqual({
            aiId: '18',
            smartItemId: 7,
            smartInstalled: true,
        });
    });

    /**
     * Прод-баг 08.09.2026 (alfacentr): аналитика включена на одного
     * сотрудника, звонки разбирались реально его, а «Ответственный» карточки
     * и автор записей таймлайна прилетали из ASSIGNED_BY_ID чужой сделки.
     */
    it('ответственный — владелец звонка из телефонии, а не ответственный сделки', async () => {
        const { service, addItem, timeline } = makeDeps({
            userId: '222',
            assignedById: '317',
        });

        await service.intake('42', 'claw-main', DTO);

        expect(addItem).toHaveBeenCalledWith(
            expect.objectContaining({ managerId: 222 }),
        );
        expect(timeline.addTimelineComment).toHaveBeenCalledWith(
            expect.objectContaining({ AUTHOR_ID: '222' }),
        );
    });

    it('владельца звонка нет, сделка СВОЕЙ воронки — берём её ответственного', async () => {
        const { service, addItem } = makeDeps({
            userId: null,
            assignedById: '317',
            family: { mainDealId: 555, ownerCategoryCode: 'sales_base' },
        });

        await service.intake('42', 'claw-main', DTO);

        expect(addItem).toHaveBeenCalledWith(
            expect.objectContaining({ managerId: 317 }),
        );
    });

    it('владельца звонка нет, сделка ЧУЖОЙ воронки — ответственный не подставляется', async () => {
        const { service, addItem } = makeDeps({
            userId: null,
            assignedById: '317',
            // ownerCategoryCode пуст — воронка сделки не из воронок ОП.
            family: {},
        });

        await service.intake('42', 'claw-main', DTO);

        expect(addItem).toHaveBeenCalledWith(
            expect.objectContaining({ managerId: undefined }),
        );
    });

    /**
     * Дубль разбора уходит в таймлайн сущности-владельца звонка. Автор этой
     * записи раньше брался вторым чтением сделки (ASSIGNED_BY_ID) — у чужой
     * воронки это чужой сотрудник. Теперь автор один и тот же для всех
     * записей: сведённый ответственный разбора, иначе администратор.
     */
    it('владельца нет и сделка чужая — дубль в таймлайн НЕ подписывается ответственным сделки', async () => {
        const { service, timeline } = makeDeps({
            userId: null,
            assignedById: '317',
            family: {},
        });

        await service.intake('42', 'claw-main', DTO);

        expect(timeline.addTimelineComment).toHaveBeenCalledWith(
            expect.objectContaining({
                ENTITY_ID: 555,
                ENTITY_TYPE: 'deal',
                AUTHOR_ID: '1',
            }),
        );
        expect(timeline.addTimelineComment).not.toHaveBeenCalledWith(
            expect.objectContaining({ AUTHOR_ID: '317' }),
        );
    });

    /**
     * Решение владельца 08.09.2026: родитель элемента — только сделка
     * воронки «ОП Основная» (writer строит parentId2 из mainDealId).
     * Сделка-владелец звонка чужой воронки в writer не уходит вовсе.
     */
    it('сделка-владелец звонка в writer не передаётся: родителя даёт раскладка', async () => {
        const { service, addItem } = makeDeps({
            family: { mainDealId: 232, mainConfidence: 'likely' },
        });

        await service.intake('42', 'claw-main', DTO);

        const input = (addItem.mock.calls[0] as [Record<string, unknown>])[0];
        expect(input).not.toHaveProperty('dealId');
        expect(input.mainDealId).toBe(232);
    });

    it('ни раскладки, ни догадки — связи со сделкой нет, разбор доходит до конца', async () => {
        const { service, addItem } = makeDeps({ family: {}, verified: {} });

        const result = await service.intake('42', 'claw-main', {
            ...DTO,
            relatedDeals: { mainDealId: 777 },
        } as never);

        const input = (addItem.mock.calls[0] as [Record<string, unknown>])[0];
        expect(input).not.toHaveProperty('dealId');
        expect(input.mainDealId).toBeUndefined();
        expect(result.smartItemId).toBe(7);
    });

    it('клиент звонка передаётся в раскладку сделок — вход для дотяжки', async () => {
        const { service, dealFamily } = makeDeps();

        await service.intake('42', 'claw-main', DTO);

        expect(dealFamily.resolve).toHaveBeenCalledWith(
            'test.bitrix24.ru',
            555,
            expect.objectContaining({ companyId: 33, contactId: 44 }),
        );
    });

    /**
     * ЖИВОЙ СЛУЧАЙ alfacentr 08.09.2026 (смарт 1040, элемент 580) целиком:
     * звонок сделан из сделки ЧУЖОЙ воронки, у компании есть сделка «ОП
     * Основная» в стадии «Не состоялась» (её и вернула раскладка дотяжкой
     * по клиенту), а владелец звонка (222) не равен ответственному чужой
     * сделки (317). В карточку должны попасть сделка клиента и владелец
     * звонка — ни одного значения из чужой сделки.
     */
    it('живой случай: связь — сделка клиента из раскладки, ответственный — владелец звонка', async () => {
        const { service, addItem, timeline } = makeDeps({
            userId: '222',
            assignedById: '317',
            family: { mainDealId: 232, mainConfidence: 'likely' },
        });

        await service.intake('42', 'claw-main', DTO);

        expect(addItem).toHaveBeenCalledWith(
            expect.objectContaining({ mainDealId: 232, managerId: 222 }),
        );
        expect(timeline.addTimelineComment).not.toHaveBeenCalledWith(
            expect.objectContaining({ AUTHOR_ID: '317' }),
        );
    });

    it('weightedScore считается по формуле Σ(score×relevance)/Σrelevance×10, если агент не прислал', async () => {
        const { service, addItem } = makeDeps();
        await service.intake('42', 'claw-main', {
            ...DTO,
            sections: [
                { section: 'NEEDS', relevance: 100, score: 8 },
                { section: 'PRESENTATION', relevance: 50, score: 4 },
                { section: 'PRICE', relevance: 0 },
            ],
        } as never);

        // (8×100 + 4×50) / 150 × 10 = 66.7 → 67; PRICE (relevance 0) исключён
        expect(addItem).toHaveBeenCalledWith(
            expect.objectContaining({ weightedScore: 67 }),
        );
    });

    it('гранулярный чеклист главнее итога модели: все пункты true → hvostDone=true, один false в 5К → fiveKDone=false', async () => {
        const { service, addItem } = makeDeps();
        await service.intake('42', 'claw-main', {
            ...DTO,
            hvostDone: false,
            hvostSteps: {
                offer: true,
                complect: true,
                price: true,
                decisionDate: true,
                dateAgreed: true,
            },
            fiveKDone: true,
            fiveKItems: {
                clientWhat: true,
                clientReady: true,
                clientPrice: false,
                companyWho: true,
                companyHow: true,
                companyRight: true,
                colleagues: true,
                competitor: true,
                criteria: true,
            },
        } as never);

        expect(addItem).toHaveBeenCalledWith(
            expect.objectContaining({
                hvostDone: true,
                fiveKDone: false,
                hvostSteps: expect.objectContaining({ offer: true }) as unknown,
                fiveKItems: expect.objectContaining({
                    clientPrice: false,
                }) as unknown,
            }),
        );
    });

    it('чеклист из одних null итоги не трогает (тип звонка не презентация)', async () => {
        const { service, addItem } = makeDeps();
        await service.intake('42', 'claw-main', {
            ...DTO,
            hvostDone: true,
            hvostSteps: {
                offer: null,
                complect: null,
                price: null,
                decisionDate: null,
                dateAgreed: null,
            },
        } as never);

        expect(addItem).toHaveBeenCalledWith(
            expect.objectContaining({ hvostDone: true }),
        );
    });

    it('модель не прислала текст разбора 5К — он собирается кодом из чеклиста', async () => {
        const { service, addItem } = makeDeps();
        await service.intake('42', 'claw-main', {
            ...DTO,
            hvostDone: false,
            hvostAnalysis: '1. Вопросы ценности — ✗ не выявлены задачи',
            // Итог и чеклист есть, а текста нет — прод 28.08.2026:
            // «5К: разбор AI — не заполнено» при заполненном хвосте.
            fiveKDone: false,
            fiveKAnalysis: null,
            fiveKItems: {
                client: true,
                company: false,
                colleagues: false,
                competitor: null,
                criteria: null,
            },
        } as never);

        const written = (
            addItem.mock.calls[0] as [
                { fiveKAnalysis?: string; hvostAnalysis?: string },
            ]
        )[0];
        expect(written.fiveKAnalysis).toContain('✓ КЛИЕНТ');
        expect(written.fiveKAnalysis).toContain('✗ КОМПАНИЯ');
        expect(written.fiveKAnalysis).toContain('— КРИТЕРИИ ВЫБОРА');
        // Текст модели не перезаписывается, когда он есть.
        expect(written.hvostAnalysis).toBe(
            '1. Вопросы ценности — ✗ не выявлены задачи',
        );
    });

    it('без чеклиста и без текста разбор не выдумывается', async () => {
        const { service, addItem } = makeDeps();
        await service.intake('42', 'claw-main', {
            ...DTO,
            fiveKDone: null,
            fiveKAnalysis: null,
        } as never);

        const written = (
            addItem.mock.calls[0] as [{ fiveKAnalysis?: string }]
        )[0];
        expect(written.fiveKAnalysis).toBeUndefined();
    });

    it('звонок из сделки-презентации: «основная» — корневая из CRM, а не владелец звонка', async () => {
        const { service, addItem, dealFamily } = makeDeps();
        // Владелец звонка 601 — презентация; корневая продажа 555.
        dealFamily.resolve.mockResolvedValue({
            mainDealId: 555,
            presentationDealId: 601,
        });
        await service.intake('42', 'claw-main', {
            ...DTO,
            // Модель «угадала» другую основную — CRM главнее догадок.
            relatedDeals: { mainDealId: 999 },
        } as never);

        expect(addItem).toHaveBeenCalledWith(
            expect.objectContaining({
                mainDealId: 555,
                presentationDealId: 601,
            }),
        );
    });

    it('раскладка ничего не знает — берётся подсказка модели, владелец в «основную» не подставляется', async () => {
        const { service, addItem, dealFamily } = makeDeps();
        dealFamily.resolve.mockResolvedValue({ presentationDealId: 555 });

        await service.intake('42', 'claw-main', {
            ...DTO,
            relatedDeals: { mainDealId: 777 },
        } as never);

        expect(addItem).toHaveBeenCalledWith(
            expect.objectContaining({
                mainDealId: 777,
                presentationDealId: 555,
            }),
        );
    });

    it('догадка агента проверяется по воронке: сделка чужой воронки в связь не идёт', async () => {
        const { service, addItem, dealVerify } = makeDeps({
            family: {},
            verified: {},
        });

        await service.intake('42', 'claw-main', {
            ...DTO,
            relatedDeals: { mainDealId: 777 },
        } as never);

        // Проверять отдали ровно то, чего раскладка не дала.
        expect(dealVerify.filterAgentDeals).toHaveBeenCalledWith(
            'test.bitrix24.ru',
            expect.objectContaining({ mainDealId: 777 }),
            // Клиент звонка — вход для сверки догадки по компании/контакту.
            { companyId: 33, contactId: 44 },
        );
        expect(addItem).toHaveBeenCalledWith(
            expect.objectContaining({ mainDealId: undefined }),
        );
    });

    it('раскладка нашла сделку — догадку агента о ней даже не проверяем', async () => {
        const { service, dealVerify } = makeDeps();

        await service.intake('42', 'claw-main', {
            ...DTO,
            relatedDeals: { mainDealId: 777 },
        } as never);

        expect(dealVerify.filterAgentDeals).toHaveBeenCalledWith(
            'test.bitrix24.ru',
            expect.objectContaining({ mainDealId: undefined }),
            { companyId: 33, contactId: 44 },
        );
    });

    it('черновик flow (plan+report) сохраняется в ais.report_result', async () => {
        const { service, aiService } = makeDeps();
        await service.intake('42', 'claw-main', {
            ...DTO,
            flow: {
                report: { resultStatus: 'result' },
                plan: { isPlanned: true, typeCode: 'presentation' },
            },
        } as never);

        expect(aiService.create).toHaveBeenCalledWith(
            expect.objectContaining({
                report_result: JSON.stringify({
                    report: { resultStatus: 'result' },
                    plan: { isPlanned: true, typeCode: 'presentation' },
                }),
            }),
        );
    });

    it('повторный push-back идемпотентен — возвращает существующий анализ без дубликатов', async () => {
        const { service, aiService, addItem } = makeDeps();
        aiService.findByTranscriptionIds.mockResolvedValue([
            { id: '18', type: 'agent-analysis', report_item_id: '7' },
        ]);
        const result = await service.intake('42', 'claw-main', DTO);

        expect(aiService.create).not.toHaveBeenCalled();
        expect(addItem).not.toHaveBeenCalled();
        expect(result).toEqual({
            aiId: '18',
            smartItemId: 7,
            smartInstalled: true,
        });
    });

    it('ретрай после установки смарта доливает элемент к существующей ais-записи', async () => {
        const { service, aiService, addItem } = makeDeps();
        aiService.findByTranscriptionIds
            .mockResolvedValueOnce([
                { id: '18', type: 'agent-analysis', report_item_id: null },
            ])
            .mockResolvedValue([
                { type: 'call-resume', result: 'резюме gigachat' },
            ]);
        const result = await service.intake('42', 'claw-main', DTO);

        expect(aiService.create).not.toHaveBeenCalled();
        expect(addItem).toHaveBeenCalled();
        expect(aiService.update).toHaveBeenCalledWith('18', {
            report_item_id: '7',
            in_report: true,
        });
        expect(result).toEqual({
            aiId: '18',
            smartItemId: 7,
            smartInstalled: true,
        });
    });

    it('без установленного смарта анализ сохраняется только в БД (graceful)', async () => {
        const { service, aiService, addItem } = makeDeps({
            smartInstalled: false,
        });
        const result = await service.intake('42', 'claw-main', DTO);

        expect(aiService.create).toHaveBeenCalled();
        expect(addItem).not.toHaveBeenCalled();
        expect(aiService.update).not.toHaveBeenCalled();
        expect(result).toEqual({
            aiId: '18',
            smartItemId: null,
            smartInstalled: false,
        });
    });
});
