import { CallReportPipelineUseCase } from '../use-cases/call-report-pipeline.use-case';

const PAYLOAD = {
    domain: 'test.bitrix24.ru',
    activityId: 101,
    dealId: 555,
    durationSec: 700,
};

const CLASSIFICATION = {
    callType: 'cold',
    interlocutorRole: 'secretary',
    confidence: 0.9,
    reason: 'Проход секретаря',
};

const makeDeps = (overrides?: {
    routerError?: boolean;
    llmError?: boolean;
    noAudio?: boolean;
    classifyFailed?: boolean;
    /** llmModel из настроек портала (портал → дефолт кода). */
    portalLlmModel?: string;
    /** Ответ классификатора вместо дефолтного CLASSIFICATION. */
    classification?: Record<string, unknown>;
    /** Карта порогов портала; нет — гейт порога типа не применяется. */
    minDurationSecByType?: Record<string, number>;
}) => {
    const bitrix = {
        activity: {
            getAllFresh: jest.fn().mockResolvedValue({
                activities: [
                    {
                        ID: '101',
                        OWNER_ID: '555',
                        OWNER_TYPE_ID: '2',
                        FILES: overrides?.noAudio
                            ? []
                            : [{ id: 9, url: 'http://f' }],
                    },
                ],
            }),
        },
        batch: { file: { get: jest.fn() } },
        api: {
            callBatchWithConcurrency: jest
                .fn()
                .mockResolvedValue([
                    { result: { 9: { DOWNLOAD_URL: 'http://download' } } },
                ]),
        },
        deal: {
            getList: jest.fn().mockResolvedValue({
                result: [{ ID: '555', ASSIGNED_BY_ID: '7' }],
            }),
        },
        timeline: { addTimelineComment: jest.fn().mockResolvedValue({}) },
    };
    const pbxService = { init: jest.fn().mockResolvedValue({ bitrix }) };
    const router = {
        transcribe: overrides?.routerError
            ? jest.fn().mockRejectedValue(new Error('transcribe failed'))
            : jest
                  .fn()
                  .mockResolvedValue({ text: 'текст', provider: 'yandex' }),
    };
    const store = {
        startPipeline: jest.fn().mockResolvedValue({ id: '42' }),
        finishPipeline: jest.fn().mockResolvedValue({ id: '42' }),
        // Стадия ANALYZE перечитывает текст из БД по transcriptionId.
        findPipelineById: jest.fn().mockResolvedValue({
            id: '42',
            text: 'текст',
            provider: 'yandex',
        }),
    };
    const aiService = { create: jest.fn().mockResolvedValue({ id: '1' }) };
    const llm = {
        analyzeCall: overrides?.llmError
            ? jest.fn().mockRejectedValue(new Error('llm down'))
            : jest.fn().mockResolvedValue({
                  resume: 'резюме',
                  recomendation: 'рекомендации',
              }),
        resume: overrides?.llmError
            ? jest.fn().mockRejectedValue(new Error('llm down'))
            : jest.fn().mockResolvedValue('резюме'),
        recomendation: overrides?.llmError
            ? jest.fn().mockRejectedValue(new Error('llm down'))
            : jest.fn().mockResolvedValue('рекомендации'),
    };
    // Шаг классификации мокается целиком (свой спек —
    // call-classify-step.service.spec); при ошибке шаг возвращает null.
    const classifyStep = {
        run: jest
            .fn()
            .mockResolvedValue(
                overrides?.classifyFailed
                    ? null
                    : (overrides?.classification ?? CLASSIFICATION),
            ),
    };
    // Паспорт звонка (слой 0) для первичного анализа — свой спек у
    // call-context-builder; здесь только префикс к тексту LLM.
    const contextBuilder = {
        build: jest.fn().mockResolvedValue({ certainty: 'rich' }),
        renderForPrompt: jest.fn().mockReturnValue('ПАСПОРТ: тест'),
        renderClassifyHint: jest.fn().mockReturnValue(null),
    };
    // Настройки портала (единственный источник конфигурации — БД).
    const settingsService = {
        resolve: jest.fn().mockResolvedValue({
            classifyEnabled: true,
            llmModel: overrides?.portalLlmModel ?? 'gigachat',
            irrelevantConfidence: 0.7,
            ...(overrides?.minDurationSecByType
                ? { minDurationSecByType: overrides.minDurationSecByType }
                : {}),
        }),
    };
    global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(4)),
    }) as never;

    const useCase = new CallReportPipelineUseCase(
        pbxService as never,
        router as never,
        store as never,
        aiService as never,
        llm as never,
        classifyStep as never,
        contextBuilder as never,
        settingsService as never,
    );
    return {
        useCase,
        store,
        aiService,
        bitrix,
        router,
        llm,
        classifyStep,
        contextBuilder,
        settingsService,
    };
};

describe('CallReportPipelineUseCase', () => {
    afterEach(() => jest.clearAllMocks());

    it('happy path: транскрипт done, классификация + две ais-записи, коммент в таймлайн', async () => {
        const { useCase, store, aiService, bitrix, llm, classifyStep } =
            makeDeps();
        const result = await useCase.execute(PAYLOAD);

        expect(store.startPipeline).toHaveBeenCalledWith(
            expect.objectContaining({
                dedupKey: 'test.bitrix24.ru:101',
                entityType: 'deal',
                entityId: '555',
            }),
        );
        expect(store.finishPipeline).toHaveBeenCalledWith(
            '42',
            expect.objectContaining({ status: 'done', provider: 'yandex' }),
        );
        // 4-й аргумент — classifyEnabled из настроек портала,
        // 5-й — CRM-подсказка из паспорта (в моке подсказки нет).
        expect(classifyStep.run).toHaveBeenCalledWith(
            'текст',
            expect.objectContaining(PAYLOAD),
            '42',
            true,
            null,
            null,
        );
        // Резюме+рекомендации — ОДНИМ объединённым вызовом.
        expect(llm.analyzeCall).toHaveBeenCalledTimes(1);
        expect(llm.resume).not.toHaveBeenCalled();
        expect(aiService.create).toHaveBeenCalledTimes(2);
        expect(aiService.create).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'call-resume' }),
        );
        expect(aiService.create).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'call-recomendation' }),
        );
        expect(bitrix.timeline.addTimelineComment).toHaveBeenCalled();
        expect(result).toEqual({
            transcriptionId: '42',
            provider: 'yandex',
            resumeSaved: true,
            recomendationSaved: true,
            callType: 'cold',
            classifyConfidence: 0.9,
        });
    });

    it('звонок числится за ТЕМ, КТО ЗВОНИЛ, а не за владельцем сделки', async () => {
        const { useCase, store, bitrix } = makeDeps();
        // Ответственный сделки — 7 (мок bitrix), звонила — 622.
        await useCase.execute({ ...PAYLOAD, callerUserId: 622 });
        expect(store.finishPipeline).toHaveBeenCalledWith(
            '42',
            expect.objectContaining({ userId: '622' }),
        );
        // И AI-резюме в таймлайне подписано ею же, а не ответственным сделки.
        expect(bitrix.timeline.addTimelineComment).toHaveBeenCalledWith(
            expect.objectContaining({ AUTHOR_ID: '622' }),
        );
    });

    it('стадия транскрибации сохраняет менеджера (ответственного сделки)', async () => {
        const { useCase, store } = makeDeps();
        await useCase.execute(PAYLOAD);
        expect(store.finishPipeline).toHaveBeenCalledWith(
            '42',
            expect.objectContaining({ userId: '7' }),
        );
    });

    it('гейт нерелевантности: уверенный irrelevant останавливает анализ до LLM', async () => {
        const { useCase, llm, aiService, bitrix } = makeDeps({
            classification: {
                callType: 'irrelevant',
                interlocutorRole: 'other',
                confidence: 0.92,
                reason: 'Сотрудник звонил в транспортную компанию как клиент',
            },
        });
        const result = await useCase.execute(PAYLOAD);

        expect(result.irrelevant).toBe(true);
        expect(result.callType).toBe('irrelevant');
        expect(result.resumeSaved).toBe(false);
        expect(llm.analyzeCall).not.toHaveBeenCalled();
        expect(llm.resume).not.toHaveBeenCalled();
        // ais-записи resume/recomendation не создаются, таймлайн молчит.
        expect(aiService.create).not.toHaveBeenCalled();
        expect(bitrix.timeline.addTimelineComment).not.toHaveBeenCalled();
    });

    it('неуверенный irrelevant (ниже порога) идёт полным путём', async () => {
        const { useCase, llm } = makeDeps({
            classification: {
                callType: 'irrelevant',
                interlocutorRole: 'other',
                confidence: 0.5,
                reason: 'Похоже на посторонний разговор, но не уверен',
            },
        });
        const result = await useCase.execute(PAYLOAD);

        expect(result.irrelevant).toBeUndefined();
        expect(llm.analyzeCall).toHaveBeenCalledTimes(1);
    });

    // Долг 7 волны C (решение владельца А.1): скан режет по МИНИМУМУ карты
    // (тип ещё неизвестен), а порог СВОЕГО типа применяется здесь — после
    // классификации, штатной остановкой как у гейта нерелевантности.
    const PILOT_MAP = { cold: 60, presentation: 300, default: 300 };

    it('порог типа: 120 с холодного при карте {cold: 60, presentation: 300} проходит', async () => {
        const { useCase, llm, aiService } = makeDeps({
            minDurationSecByType: PILOT_MAP,
        });
        const result = await useCase.execute({ ...PAYLOAD, durationSec: 120 });
        expect(result.shortCall).toBeUndefined();
        expect(result.resumeSaved).toBe(true);
        expect(llm.analyzeCall).toHaveBeenCalledTimes(1);
        expect(aiService.create).toHaveBeenCalledTimes(2);
    });

    it('порог типа: 120 с презентации останавливает разбор после классификации с причиной', async () => {
        const { useCase, llm, aiService, bitrix, classifyStep } = makeDeps({
            minDurationSecByType: PILOT_MAP,
            classification: { ...CLASSIFICATION, callType: 'presentation' },
        });
        const result = await useCase.execute({ ...PAYLOAD, durationSec: 120 });
        // Классификация была (тип нужен, чтобы знать порог), дальше — стоп.
        expect(classifyStep.run).toHaveBeenCalledTimes(1);
        expect(result).toEqual({
            transcriptionId: '42',
            provider: 'yandex',
            resumeSaved: false,
            recomendationSaved: false,
            callType: 'presentation',
            classifyConfidence: 0.9,
            shortCall: true,
        });
        expect(llm.analyzeCall).not.toHaveBeenCalled();
        expect(aiService.create).not.toHaveBeenCalled();
        expect(bitrix.timeline.addTimelineComment).not.toHaveBeenCalled();
    });

    it('равномерная карта — поведение прежнее: 700 с идёт полным путём, 120 с — нет', async () => {
        const full = makeDeps({ minDurationSecByType: { default: 300 } });
        await expect(full.useCase.execute(PAYLOAD)).resolves.toMatchObject({
            resumeSaved: true,
        });
        expect(full.llm.analyzeCall).toHaveBeenCalledTimes(1);

        const short = makeDeps({ minDurationSecByType: { default: 300 } });
        await expect(
            short.useCase.execute({ ...PAYLOAD, durationSec: 120 }),
        ).resolves.toMatchObject({ shortCall: true });
        expect(short.llm.analyzeCall).not.toHaveBeenCalled();
    });

    it('длительность берётся из строки конвейера, если в задаче её нет; неизвестна — гейт не применяется', async () => {
        const fromRow = makeDeps({ minDurationSecByType: { default: 300 } });
        fromRow.store.findPipelineById.mockResolvedValue({
            id: '42',
            text: 'текст',
            provider: 'yandex',
            durationSec: '120',
        });
        await expect(
            fromRow.useCase.execute({ ...PAYLOAD, durationSec: undefined }),
        ).resolves.toMatchObject({ shortCall: true });

        const unknown = makeDeps({ minDurationSecByType: { default: 300 } });
        unknown.store.findPipelineById.mockResolvedValue({
            id: '42',
            text: 'текст',
            provider: 'yandex',
            durationSec: null,
        });
        await expect(
            unknown.useCase.execute({ ...PAYLOAD, durationSec: undefined }),
        ).resolves.toMatchObject({ resumeSaved: true });
    });

    it('llmModel из настроек портала уезжает в объединённый вызов', async () => {
        const { useCase, llm } = makeDeps({ portalLlmModel: 'cloudru' });
        await useCase.execute(PAYLOAD);
        expect(llm.analyzeCall).toHaveBeenCalledWith(
            'cloudru',
            expect.any(String),
            'test.bitrix24.ru',
        );
    });

    it('мусорная llmModel портала откатывается на глобальную', async () => {
        const { useCase, llm } = makeDeps({ portalLlmModel: 'нейросеть' });
        await useCase.execute(PAYLOAD);
        expect(llm.analyzeCall).toHaveBeenCalledWith(
            'gigachat',
            expect.any(String),
            'test.bitrix24.ru',
        );
    });

    it('паспорт звонка префиксуется к тексту первичного LLM-анализа', async () => {
        const { useCase, llm } = makeDeps();
        await useCase.execute(PAYLOAD);
        const sentText = (llm.analyzeCall.mock.calls[0] as string[])[1];
        expect(sentText).toContain('ПАСПОРТ: тест');
        expect(sentText).toContain('текст');
    });

    it('паспорт не собрался — первичный анализ идёт по голому тексту', async () => {
        const { useCase, llm, contextBuilder } = makeDeps();
        contextBuilder.build.mockRejectedValue(new Error('crm down'));
        const result = await useCase.execute(PAYLOAD);
        expect(result.resumeSaved).toBe(true);
        expect((llm.analyzeCall.mock.calls[0] as string[])[1]).toBe('текст');
    });

    it('CRM-подсказка паспорта (лид-заявка) уезжает в классификатор', async () => {
        const { useCase, classifyStep, contextBuilder } = makeDeps();
        contextBuilder.renderClassifyHint.mockReturnValue(
            'КОНТЕКСТ ИЗ CRM: лид создан заявкой',
        );
        await useCase.execute(PAYLOAD);
        expect(classifyStep.run).toHaveBeenCalledWith(
            'текст',
            expect.objectContaining(PAYLOAD),
            '42',
            true,
            'КОНТЕКСТ ИЗ CRM: лид создан заявкой',
            null,
        );
    });

    it('провал классификации (null от шага) не роняет конвейер', async () => {
        const { useCase } = makeDeps({ classifyFailed: true });
        const result = await useCase.execute(PAYLOAD);
        expect(result.callType).toBeNull();
        expect(result.resumeSaved).toBe(true);
    });

    it('ошибка транскрибации ставит status=error и пробрасывается', async () => {
        const { useCase, store, aiService } = makeDeps({ routerError: true });
        await expect(useCase.execute(PAYLOAD)).rejects.toThrow(
            'transcribe failed',
        );
        expect(store.finishPipeline).toHaveBeenCalledWith('42', {
            status: 'error',
        });
        expect(aiService.create).not.toHaveBeenCalled();
    });

    it('падение LLM не роняет конвейер — транскрипт сохранён', async () => {
        const { useCase, store, aiService, bitrix } = makeDeps({
            llmError: true,
        });
        const result = await useCase.execute(PAYLOAD);
        expect(store.finishPipeline).toHaveBeenCalledWith(
            '42',
            expect.objectContaining({ status: 'done' }),
        );
        expect(aiService.create).not.toHaveBeenCalled();
        expect(bitrix.timeline.addTimelineComment).not.toHaveBeenCalled();
        expect(result.resumeSaved).toBe(false);
        expect(result.recomendationSaved).toBe(false);
    });

    it('отсутствие аудиофайла в активности — ошибка со status=error', async () => {
        const { useCase, store } = makeDeps({ noAudio: true });
        await expect(useCase.execute(PAYLOAD)).rejects.toThrow(
            'No audio files',
        );
        expect(store.finishPipeline).toHaveBeenCalledWith('42', {
            status: 'error',
        });
    });
});
