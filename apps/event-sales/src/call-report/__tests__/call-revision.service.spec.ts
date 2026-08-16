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
    ...overrides,
});

const VERDICT = {
    entitySummary: 'Сделка движется к КП.',
    unkeptPromises: ['Обещали КП в среду — не отправлено'],
    dealRecommendations: ['Отправить КП до пятницы'],
    riskFlags: ['promise'],
    coachingPriority: 'planned',
};

const makeDeps = (options?: {
    rows?: Record<string, unknown>[];
    smartInstalled?: boolean;
    llmError?: boolean;
}) => {
    const timeline = { addTimelineComment: jest.fn().mockResolvedValue({}) };
    const pbxService = {
        init: jest.fn().mockResolvedValue({ bitrix: { timeline } }),
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
        findByTranscriptionIds: jest.fn().mockResolvedValue([
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
        ]),
    };
    const contextBuilder = {
        build: jest.fn().mockResolvedValue({
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
        }),
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
            : jest.fn().mockResolvedValue(VERDICT),
    };
    const vibeKeyResolver = { resolve: jest.fn().mockResolvedValue('key-1') };
    const addItem = jest.fn().mockResolvedValue(7);
    MockedWriter.mockImplementation(() => ({ addItem }) as never);

    const service = new CallRevisionService(
        pbxService as never,
        transcriptionStore as never,
        aiService as never,
        contextBuilder as never,
        smartResolver as never,
        vibeCodeClient as never,
        vibeKeyResolver as never,
    );
    return {
        service,
        transcriptionStore,
        aiService,
        contextBuilder,
        vibeCodeClient,
        addItem,
        timeline,
    };
};

describe('CallRevisionService (ночной ревизор, Фаза 3)', () => {
    afterEach(() => jest.clearAllMocks());

    it('сущность с двумя звонками ревизуется одним LLM-запросом и пишется в смарт + таймлайн', async () => {
        const { service, vibeCodeClient, addItem, timeline } = makeDeps();

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
        // Носитель ревизии — ПОСЛЕДНИЙ звонок сущности (activityId 102).
        expect(addItem).toHaveBeenCalledWith(
            expect.objectContaining({
                activityId: '102',
                riskFlags: ['promise'],
                coachingPriority: 'planned',
                // Долив CRM-связей из паспорта владельца звонка.
                mainDealId: 555,
                companyId: 33,
                contactId: 44,
            }),
        );
        const written = (
            addItem.mock.calls[0] as [{ recommendations: string }]
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
