import { CallRevisionService } from '../services/call-revision.service';
import { CallReportSmartWriterService } from '@lib/call-lib/call-report/services/call-report-smart-writer.service';

jest.mock(
    '@lib/call-lib/call-report/services/call-report-smart-writer.service',
);

const MockedWriter = CallReportSmartWriterService as jest.MockedClass<
    typeof CallReportSmartWriterService
>;

const DOMAIN = 'test.bitrix24.ru';

const row = (overrides: Record<string, unknown>) => ({
    id: '1',
    domain: DOMAIN,
    activityId: '101',
    callStartedAt: new Date('2026-08-01T10:00:00Z'),
    entityType: 'deal',
    entityId: '555',
    text: 'текст',
    status: 'done',
    // Владелец звонка из телефонии — источник истины для «Ответственного»
    // (у элемента прод-случая стоял чужой сотрудник 317).
    userId: '222',
    ...overrides,
});

const VERDICT = {
    entitySummary: 'Сделка движется к КП.',
    unkeptPromises: ['Обещали КП в среду — не отправлено'],
    dealRecommendations: ['Отправить КП до пятницы'],
    riskFlags: ['promise'],
    coachingPriority: 'planned',
    kpiItemId: null,
    kpiItemStatus: null,
    historyItemId: null,
    historyItemStatus: null,
};

const makeDeps = (options?: {
    rows?: Record<string, unknown>[];
    smartInstalled?: boolean;
    llmError?: boolean;
    /** Элементы списков отчётности (ответ listItem.get для обоих списков). */
    listItems?: Record<string, unknown>[];
    verdict?: Record<string, unknown>;
    /**
     * Текущее состояние смарт-элемента (ответ crm.item.list по xmlId) —
     * по нему ревизор считает, что реально изменилось. По умолчанию у
     * элемента связей нет вовсе (карточка-сирота).
     */
    smartItem?: Record<string, unknown> | null;
    /** Паспорт последнего звонка вместо сделки 555 по умолчанию. */
    passport?: Record<string, unknown>;
    /** Записи ais по строкам вместо набора по умолчанию. */
    records?: Record<string, unknown>[];
    /** Раскладка сделок вместо «владелец 555 — корневая сделка». */
    family?: Record<string, unknown>;
}) => {
    const timeline = { addTimelineComment: jest.fn().mockResolvedValue({}) };
    const listItemGet = jest
        .fn()
        .mockResolvedValue({ result: options?.listItems ?? [] });
    // Списки отчётности портала: у обоих есть CRM-поле (PROPERTY_77).
    const portalModel = {
        getListByCode: jest.fn((code: string) => ({
            group: 'sales',
            type: code === 'sales_kpi' ? 'kpi' : 'history',
            bitrixId: code === 'sales_kpi' ? '10' : '20',
            bitrixfields: [
                {
                    code: `${code}_comment`,
                    name: 'Комментарий',
                    bitrixId: 'PROPERTY_5',
                },
            ],
        })),
        getIdByCodeFieldList: jest.fn(() => ({ bitrixId: 'PROPERTY_77' })),
    };
    // Текущее состояние элемента для пересчёта связей (crm.item.list).
    const itemList = jest.fn().mockResolvedValue({
        result: {
            items:
                options?.smartItem === null
                    ? []
                    : [
                          options?.smartItem ?? {
                              id: '580',
                              xmlId: 'aicall_102',
                          },
                      ],
        },
    });
    const pbxService = {
        init: jest.fn().mockResolvedValue({
            bitrix: {
                timeline,
                listItem: { get: listItemGet },
                item: { list: itemList },
            },
            PortalModel: portalModel,
        }),
    };
    const transcriptionStore = {
        findDoneInPeriod: jest.fn().mockResolvedValue(
            options?.rows ?? [
                row({ id: '1', activityId: '101' }),
                row({
                    id: '2',
                    activityId: '102',
                    callStartedAt: new Date('2026-08-01T15:00:00Z'),
                }),
            ],
        ),
    };
    const aiService = {
        findByTranscriptionIds: jest.fn().mockResolvedValue(
            options?.records ?? [
                {
                    transcription_id: '2',
                    type: 'agent-analysis',
                    user_result: {
                        summary: 'Разбор второго звонка',
                        score: 7,
                        nextStep: { description: 'Отправить КП' },
                    },
                },
                {
                    transcription_id: '1',
                    type: 'call-resume',
                    result: 'Гигачат-резюме первого звонка',
                },
            ],
        ),
    };
    const contextBuilder = {
        build: jest.fn().mockResolvedValue(
            options?.passport ?? {
                certainty: 'rich',
                entityType: 'deal',
                entityId: 555,
                crmCompanyId: 33,
                crmContactId: 44,
                history: [
                    {
                        startedAt: '2026-07-30T09:00:00Z',
                        resume: 'Историческое резюме',
                    },
                ],
                identity: [],
            },
        ),
        renderForPrompt: jest.fn().mockReturnValue('ПАСПОРТ ЗВОНКА: тест'),
    };
    const smartResolver = {
        resolve: jest
            .fn()
            .mockResolvedValue(
                options?.smartInstalled === false
                    ? null
                    : { entityTypeId: 1056, typeId: 128 },
            ),
    };
    const vibeCodeClient = {
        structuredCompletion: options?.llmError
            ? jest.fn().mockRejectedValue(new Error('llm down'))
            : jest.fn().mockResolvedValue(options?.verdict ?? VERDICT),
    };
    const vibeKeyResolver = { resolve: jest.fn().mockResolvedValue('key-1') };
    const addItem = jest.fn().mockResolvedValue(7);
    // Ревизор ТОЛЬКО обновляет существующие элементы (updateExisting);
    // addItem в моке — для контроля, что создание не вызывается.
    const updateExisting = jest.fn().mockResolvedValue(7);
    MockedWriter.mockImplementation(
        () => ({ addItem, updateExisting }) as never,
    );

    // Раскладка сделок: владелец 555 — корневая сделка продажи.
    const dealFamily = {
        resolve: jest
            .fn()
            .mockResolvedValue(options?.family ?? { mainDealId: 555 }),
    };
    const service = new CallRevisionService(
        pbxService as never,
        transcriptionStore as never,
        aiService as never,
        contextBuilder as never,
        smartResolver as never,
        vibeCodeClient as never,
        vibeKeyResolver as never,
        dealFamily as never,
    );
    return {
        service,
        transcriptionStore,
        aiService,
        contextBuilder,
        vibeCodeClient,
        addItem,
        updateExisting,
        timeline,
        itemList,
        dealFamily,
    };
};

describe('CallRevisionService (ночной ревизор, Фаза 3)', () => {
    afterEach(() => jest.clearAllMocks());

    it('сущность с двумя звонками ревизуется одним LLM-запросом и пишется в смарт + таймлайн', async () => {
        const { service, vibeCodeClient, addItem, updateExisting, timeline } =
            makeDeps();

        const result = await service.runForDomain(
            DOMAIN,
            new Date('2026-08-01T00:00:00Z'),
            new Date('2026-08-02T00:00:00Z'),
        );

        expect(result).toEqual({
            domain: DOMAIN,
            entitiesTotal: 1,
            entitiesRevised: 1,
            entitiesFailed: 0,
        });
        expect(vibeCodeClient.structuredCompletion).toHaveBeenCalledTimes(1);
        // Только ОБНОВЛЕНИЕ существующего элемента (создание запрещено),
        // носитель — ПОСЛЕДНИЙ звонок сущности (activityId 102).
        expect(addItem).not.toHaveBeenCalled();
        expect(updateExisting).toHaveBeenCalledWith(
            expect.objectContaining({
                activityId: '102',
                riskFlags: ['promise'],
                coachingPriority: 'planned',
                // Пересчёт связей и ОТВЕТСТВЕННОГО у существующего
                // элемента: родитель-сделка ставится из «ОП Основная»
                // (mainDealId), сделка-владелец звонка сюда не идёт, а
                // ответственный берётся от владельца звонка (222).
                mainDealId: 555,
                companyId: 33,
                contactId: 44,
                managerId: 222,
            }),
        );
        const written = (
            updateExisting.mock.calls[0] as [{ recommendations: string }]
        )[0];
        expect(written.recommendations).toContain('Отправить КП до пятницы');
        expect(written.recommendations).toContain(
            'Невыполненное обещание: Обещали КП в среду',
        );
        expect(timeline.addTimelineComment).toHaveBeenCalledWith(
            expect.objectContaining({
                ENTITY_ID: 555,
                ENTITY_TYPE: 'deal',
                COMMENT: expect.stringContaining('Ночная ревизия') as string,
            }),
        );
    });

    // Долг 29 волны C: без лида-владельца, владельца звонка и типа шаг 0
    // раскладки («ОП История» этого звонка) для звонков по лиду недостижим —
    // семья дотягивалась догадкой по клиенту, которого у лида часто нет.
    it('звонок по лиду: раскладка получает лид, владельца, момент и тип; семья — из записи списка', async () => {
        const startedAt = new Date('2026-08-01T15:00:00Z');
        const { service, dealFamily, updateExisting } = makeDeps({
            rows: [
                row({
                    id: '1',
                    activityId: '101',
                    entityType: 'lead',
                    entityId: '77',
                }),
                row({
                    id: '2',
                    activityId: '102',
                    entityType: 'lead',
                    entityId: '77',
                    callStartedAt: startedAt,
                }),
            ],
            passport: {
                certainty: 'lead',
                entityType: 'lead',
                entityId: 77,
                crmCompanyId: null,
                crmContactId: null,
                history: [],
                identity: [],
            },
            records: [
                {
                    transcription_id: '2',
                    type: 'agent-analysis',
                    user_result: {
                        summary: 'Показ системы',
                        callType: 'presentation',
                    },
                },
            ],
            family: {
                mainDealId: 900,
                mainConfidence: 'exact',
                source: 'list',
                listRecordId: '15',
            },
        });

        await service.runForDomain(
            DOMAIN,
            new Date('2026-08-01T00:00:00Z'),
            new Date('2026-08-02T00:00:00Z'),
        );

        // Сделки-владельца нет; в контексте — лид, владелец звонка из
        // телефонии, тип из разбора и момент ПОСЛЕДНЕГО звонка. Клиента у
        // лида нет — дотягивать по нему нечего, семья приходит из записи.
        expect(dealFamily.resolve).toHaveBeenCalledWith(DOMAIN, undefined, {
            companyId: undefined,
            contactId: undefined,
            callStartedAt: startedAt,
            leadId: 77,
            callerId: '222',
            callType: 'presentation',
        });
        expect(updateExisting).toHaveBeenCalledWith(
            expect.objectContaining({ mainDealId: 900, leadId: 77 }),
        );
    });

    /**
     * РЕМОНТ УЖЕ СОЗДАННЫХ КАРТОЧЕК (решение владельца 08.09.2026): у
     * элемента прод-случая стоял чужой ответственный (317). Ревизор обязан
     * пересчитать его на владельца звонка из телефонии — раньше managerId
     * в обновление не передавался вовсе.
     */
    it('пересчитывает ОТВЕТСТВЕННОГО существующего элемента на владельца звонка', async () => {
        const { service, updateExisting } = makeDeps({
            smartItem: {
                id: '580',
                xmlId: 'aicall_102',
                // Связи уже верные — трогать их не за чем.
                parentId2: '555',
                companyId: '33',
                contactId: '44',
                ufCrm128DealMain: '555',
                // …а ответственный чужой (из сделки, а не от телефонии).
                assignedById: '317',
                ufCrm128Manager: '317',
            },
        });

        await service.runForDomain(DOMAIN, new Date(0), new Date());

        const input = (
            updateExisting.mock.calls[0] as [Record<string, unknown>]
        )[0];
        expect(input.managerId).toBe(222);
        // Неизменившиеся поля в update не уходят: лишняя запись пишет
        // историю элемента и перетирает правки руками.
        expect(input).not.toHaveProperty('mainDealId');
        expect(input).not.toHaveProperty('companyId');
        expect(input).not.toHaveProperty('contactId');
    });

    it('связи и ответственный актуальны — в update уходит только вердикт', async () => {
        const { service, updateExisting } = makeDeps({
            smartItem: {
                id: '580',
                xmlId: 'aicall_102',
                parentId2: '555',
                companyId: '33',
                contactId: '44',
                assignedById: '222',
                ufCrm128DealMain: ['D_555'],
                ufCrm128Manager: '222',
            },
        });

        await service.runForDomain(DOMAIN, new Date(0), new Date());

        const input = (
            updateExisting.mock.calls[0] as [Record<string, unknown>]
        )[0];
        expect(input).not.toHaveProperty('managerId');
        expect(input).not.toHaveProperty('mainDealId');
        expect(input.recommendations).toContain('Отправить КП до пятницы');
    });

    it('смарт-элемента у звонков нет — обновлять нечего, вердикт в таймлайне', async () => {
        const { service, updateExisting, addItem, timeline } = makeDeps({
            smartItem: null,
        });

        await service.runForDomain(DOMAIN, new Date(0), new Date());

        expect(updateExisting).not.toHaveBeenCalled();
        expect(addItem).not.toHaveBeenCalled();
        expect(timeline.addTimelineComment).toHaveBeenCalled();
    });

    it('кандидаты списков уходят в LLM, валидная привязка пишется в смарт и таймлайн', async () => {
        const { service, vibeCodeClient, updateExisting, timeline } = makeDeps({
            listItems: [
                {
                    ID: 9001,
                    NAME: 'Презентация ООО Ромашка',
                    DATE_CREATE: '2026-08-01T12:00:00Z',
                    PROPERTY_5: { 101: 'Показал Искру, просили КП' },
                },
            ],
            verdict: {
                ...VERDICT,
                kpiItemId: '9001',
                kpiItemStatus: 'confirmed',
                // Выдуманный моделью id не из кандидатов — должен отсечься.
                historyItemId: '777777',
                historyItemStatus: 'suspected',
            },
        });

        await service.runForDomain(DOMAIN, new Date(0), new Date());

        // Кандидаты (id + комментарий записи) видны модели.
        const userContent = (
            vibeCodeClient.structuredCompletion.mock.calls[0] as string[]
        )[1];
        expect(userContent).toContain('id=9001');
        expect(userContent).toContain('Показал Искру, просили КП');

        expect(updateExisting).toHaveBeenCalledWith(
            expect.objectContaining({
                kpiItem: { itemId: '9001', status: 'confirmed' },
                historyItem: undefined,
            }),
        );
        expect(timeline.addTimelineComment).toHaveBeenCalledWith(
            expect.objectContaining({
                COMMENT: expect.stringContaining('запись КПИ №9001') as string,
            }),
        );
    });

    it('элемента у последнего звонка нет — обновляется более ранний; нет нигде — ничего не создаётся', async () => {
        const { service, addItem, updateExisting, timeline } = makeDeps();
        // Последний звонок (102) без элемента → берётся элемент звонка 101.
        updateExisting
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce(5)
            // Второй прогон (вторая сущность ниже): элементов нет совсем.
            .mockResolvedValue(null);

        await service.runForDomain(DOMAIN, new Date(0), new Date());
        expect(updateExisting).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({ activityId: '102' }),
        );
        expect(updateExisting).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({ activityId: '101' }),
        );

        // Нет ни одного элемента — карточка-пустышка НЕ создаётся,
        // результат остаётся в таймлайне сущности.
        jest.clearAllMocks();
        updateExisting.mockResolvedValue(null);
        await service.runForDomain(DOMAIN, new Date(0), new Date());
        expect(updateExisting).toHaveBeenCalledTimes(2);
        expect(addItem).not.toHaveBeenCalled();
        expect(timeline.addTimelineComment).toHaveBeenCalled();
    });

    it('в LLM уходят паспорт, свежие разборы (agent-analysis либо gigachat) и история', async () => {
        const { service, vibeCodeClient, contextBuilder } = makeDeps();

        await service.runForDomain(DOMAIN, new Date(0), new Date());

        expect(contextBuilder.renderForPrompt).toHaveBeenCalled();
        const userContent = (
            vibeCodeClient.structuredCompletion.mock.calls[0] as string[]
        )[1];
        expect(userContent).toContain('ПАСПОРТ ЗВОНКА: тест');
        expect(userContent).toContain('Разбор второго звонка');
        expect(userContent).toContain('Гигачат-резюме первого звонка');
        expect(userContent).toContain('Историческое резюме');
    });

    it('строки без привязки к сущности не ревизуются', async () => {
        const { service, vibeCodeClient } = makeDeps({
            rows: [row({ entityType: null, entityId: null })],
        });

        const result = await service.runForDomain(
            DOMAIN,
            new Date(0),
            new Date(),
        );

        expect(result.entitiesTotal).toBe(0);
        expect(vibeCodeClient.structuredCompletion).not.toHaveBeenCalled();
    });

    it('лимит maxEntities режет прогон, но entitiesTotal показывает всё', async () => {
        const { service, vibeCodeClient } = makeDeps({
            rows: [
                row({ id: '1', entityId: '1' }),
                row({ id: '2', entityId: '2' }),
                row({ id: '3', entityId: '3' }),
            ],
        });

        const result = await service.runForDomain(
            DOMAIN,
            new Date(0),
            new Date(),
            2,
        );

        expect(result.entitiesTotal).toBe(3);
        expect(result.entitiesRevised).toBe(2);
        expect(vibeCodeClient.structuredCompletion).toHaveBeenCalledTimes(2);
    });

    it('ошибка LLM по сущности не роняет прогон — она уходит в entitiesFailed', async () => {
        const { service } = makeDeps({ llmError: true });

        const result = await service.runForDomain(
            DOMAIN,
            new Date(0),
            new Date(),
        );

        expect(result.entitiesRevised).toBe(0);
        expect(result.entitiesFailed).toBe(1);
    });

    it('смарт не установлен — элемент пропускается, таймлайн всё равно пишется', async () => {
        const { service, addItem, timeline } = makeDeps({
            smartInstalled: false,
        });

        const result = await service.runForDomain(
            DOMAIN,
            new Date(0),
            new Date(),
        );

        expect(result.entitiesRevised).toBe(1);
        expect(addItem).not.toHaveBeenCalled();
        expect(timeline.addTimelineComment).toHaveBeenCalled();
    });
});
